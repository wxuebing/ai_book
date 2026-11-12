/**
 * Vault 层：文件系统 ↔ 笔记
 *
 * 依据：docs/05-任务清单.md 3.3 节（任务 1.12 ~ 1.16）
 * 铁律：.md 文件是唯一真相；索引是可重建的派生数据。
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import type { ParsedNote } from './types.ts';
import { parseNote, normalizePath, basenameOf, dirOf } from './note.ts';

/** 扫描时忽略的目录（docs/05 任务 1.12） */
const IGNORED_DIRS = new Set(['.obsidian', '.git', '.trash', 'node_modules', '.loom', '.dsh-meow']);

/** 忽略的文件 */
function isIgnoredFile(name: string): boolean {
  return name.startsWith('.') && name !== '.project.json';
}

/**
 * vault 根目录的 README.md 是给人看的项目说明，不是知识条目。
 * 不纳入索引，否则它会以「未归类」身份污染统计与图谱。
 */
function isRootReadme(relPath: string): boolean {
  return relPath.toLowerCase() === 'readme.md';
}

export interface ScanResult {
  notes: ParsedNote[];
  /** 解析失败的笔记 */
  errors: Array<{ path: string; message: string }>;
}

export interface VaultOptions {
  /** vault 根目录绝对路径 */
  root: string;
}

/**
 * 一个 vault = 一本小说（docs/02 第 14 章：一本一 vault）
 */
export class Vault {
  readonly root: string;

  constructor(opts: VaultOptions) {
    this.root = path.resolve(opts.root);
  }

  /** 把相对路径解析为绝对路径，并防止 `..` 逃逸（任务 1.15） */
  resolve(relPath: string): string {
    if (relPath.includes('\0')) {
      throw new PathEscapeError('路径包含非法字符');
    }
    const norm = normalizePath(relPath);
    if (norm.startsWith('/') || /^[A-Za-z]:/.test(norm)) {
      throw new PathEscapeError(`不允许绝对路径：${relPath}`);
    }
    const abs = path.resolve(this.root, norm);
    const rel = path.relative(this.root, abs);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      throw new PathEscapeError(`路径逃逸出 vault：${relPath}`);
    }
    return abs;
  }

  /** 相对路径（POSIX） */
  rel(absPath: string): string {
    return normalizePath(path.relative(this.root, absPath));
  }

  /** 递归扫描所有 .md */
  async scan(): Promise<ScanResult> {
    const notes: ParsedNote[] = [];
    const errors: Array<{ path: string; message: string }> = [];
    const files = await this.walk(this.root, '');
    for (const rel of files) {
      try {
        const abs = this.resolve(rel);
        const [stat, source] = await Promise.all([
          fs.stat(abs),
          fs.readFile(abs, 'utf8'),
        ]);
        notes.push(
          parseNote(source, { path: rel, mtime: stat.mtimeMs, size: stat.size }),
        );
      } catch (err) {
        errors.push({ path: rel, message: (err as Error).message });
      }
    }
    notes.sort((a, b) => a.path.localeCompare(b.path, 'zh'));
    return { notes, errors };
  }

  private async walk(absDir: string, relDir: string): Promise<string[]> {
    const out: string[] = [];
    let entries: Array<{ name: string; isDirectory(): boolean; isFile(): boolean }>;
    try {
      entries = await fs.readdir(absDir, { withFileTypes: true });
    } catch {
      return out;
    }
    for (const entry of entries) {
      const name = entry.name;
      if (entry.isDirectory()) {
        if (IGNORED_DIRS.has(name)) continue;
        if (name.startsWith('.')) continue;
        const childRel = relDir ? `${relDir}/${name}` : name;
        out.push(...(await this.walk(path.join(absDir, name), childRel)));
      } else if (entry.isFile()) {
        if (!name.toLowerCase().endsWith('.md')) continue;
        if (isIgnoredFile(name)) continue;
        const childRel = relDir ? `${relDir}/${name}` : name;
        if (isRootReadme(childRel)) continue;
        out.push(childRel);
      }
    }
    return out;
  }

  /** 读单篇 */
  async readNote(relPath: string): Promise<ParsedNote> {
    const abs = this.resolve(relPath);
    const [stat, source] = await Promise.all([fs.stat(abs), fs.readFile(abs, 'utf8')]);
    return parseNote(source, {
      path: normalizePath(relPath),
      mtime: stat.mtimeMs,
      size: stat.size,
    });
  }

  /**
   * 原子写入（任务 1.14）：临时文件 + rename，不撕裂。
   */
  async writeAtomic(relPath: string, content: string): Promise<void> {
    const abs = this.resolve(relPath);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    const tmp = `${abs}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;
    await fs.writeFile(tmp, content, 'utf8');
    try {
      await fs.rename(tmp, abs);
    } catch (err) {
      await fs.rm(tmp, { force: true });
      throw err;
    }
  }

  async remove(relPath: string): Promise<void> {
    const abs = this.resolve(relPath);
    await fs.rm(abs, { force: true });
  }

  async exists(relPath: string): Promise<boolean> {
    try {
      await fs.access(this.resolve(relPath));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 生成不冲突的文件名（任务 1.16）。
   * 「沈砚.md」已存在 → 「沈砚 2.md」→「沈砚 3.md」
   */
  async uniqueName(folder: string, title: string): Promise<string> {
    const safe = sanitizeFileName(title);
    const base = folder ? `${normalizePath(folder)}/${safe}` : safe;
    if (!(await this.exists(`${base}.md`))) return `${base}.md`;
    for (let i = 2; i < 1000; i++) {
      const candidate = `${base} ${i}.md`;
      if (!(await this.exists(candidate))) return candidate;
    }
    throw new Error(`无法为「${title}」生成唯一文件名`);
  }

  async listDirs(): Promise<string[]> {
    const out: string[] = [];
    const walk = async (absDir: string, relDir: string) => {
      const entries = await fs.readdir(absDir, { withFileTypes: true }).catch(() => []);
      for (const e of entries) {
        if (!e.isDirectory() || IGNORED_DIRS.has(e.name) || e.name.startsWith('.')) continue;
        const childRel = relDir ? `${relDir}/${e.name}` : e.name;
        out.push(childRel);
        await walk(path.join(absDir, e.name), childRel);
      }
    };
    await walk(this.root, '');
    return out.sort();
  }
}

export class PathEscapeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PathEscapeError';
  }
}

/**
 * 文件名净化：去掉 Windows/Linux 非法字符，并消除 `..` 序列。
 *
 * `..` 在文件名里没有任何正当用途，却是路径逃逸的构造材料，
 * 因此一律抹平，而不是只依赖调用方保证。
 */
export function sanitizeFileName(name: string): string {
  let out = name
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/[\x00-\x1f]/g, '')
    .replace(/\.{2,}/g, '-') // 任何连续点都降级为连字符
    .replace(/^\.+/, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .trim()
    .replace(/[. ]+$/g, '') // Windows 不允许文件名以点或空格结尾
    .slice(0, 120);
  // Windows 设备名（CON/NUL/COM1…）不能作为文件名
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(out)) out = `_${out}`;
  return out || '未命名';
}

// ─────────────────────────────────────────────────────────────
// 链接解析（任务 1.13，与 Obsidian 一致）
// ─────────────────────────────────────────────────────────────

/**
 * Obsidian 的链接解析顺序：
 *   1. 全路径精确匹配（"05-人物/沈砚.md"）
 *   2. 文件名精确匹配（"沈砚"）—— 若唯一，成功
 *   3. 若同名多篇，取路径最短的（层级最浅），与 Obsidian 行为一致
 *   4. 无匹配 → 断链
 */
export class LinkResolver {
  /** basename（小写） → 路径列表 */
  private byBase = new Map<string, string[]>();
  /** 全路径（小写，去 .md）→ 路径 */
  private byPath = new Map<string, string>();
  /** 标题名（小写）→ 路径列表（frontmatter.title 或首个 H1） */
  private byTitle = new Map<string, string[]>();

  constructor(notes: ParsedNote[]) {
    for (const n of notes) {
      this.add(n);
    }
  }

  add(note: ParsedNote): void {
    const lowerPath = note.path.toLowerCase().replace(/\.md$/i, '');
    this.byPath.set(lowerPath, note.path);

    const base = basenameOf(note.path).toLowerCase();
    pushMap(this.byBase, base, note.path);

    const title = note.title.toLowerCase();
    if (title && title !== base) pushMap(this.byTitle, title, note.path);
  }

  /** 解析一个链接目标为笔记路径；null = 断链 */
  resolve(target: string, fromPath: string): string | null {
    const raw = target.trim();
    if (!raw) return null;

    const cleaned = raw.replace(/\.md$/i, '');
    const lower = cleaned.toLowerCase();

    // 1. 全路径精确
    const direct = this.byPath.get(lower);
    if (direct) return direct;

    // 2. 相对当前笔记所在目录
    if (lower.includes('/')) {
      const fromDir = dirOf(fromPath);
      const relCandidate = fromDir ? `${fromDir}/${lower}` : lower;
      const hit = this.byPath.get(relCandidate);
      if (hit) return hit;
    }

    // 3. 文件名精确
    const byBase = this.byBase.get(lower.split('/').pop() ?? lower);
    if (byBase && byBase.length > 0) {
      return byBase.length === 1 ? byBase[0]! : shortest(byBase);
    }

    // 4. 标题名
    const byTitle = this.byTitle.get(lower);
    if (byTitle && byTitle.length > 0) {
      return byTitle.length === 1 ? byTitle[0]! : shortest(byTitle);
    }

    return null;
  }
}

function pushMap(map: Map<string, string[]>, key: string, value: string): void {
  const arr = map.get(key);
  if (arr) {
    if (!arr.includes(value)) arr.push(value);
  } else {
    map.set(key, [value]);
  }
}

/** 层级最浅（路径最短）者优先，其次字典序，保证结果稳定 */
function shortest(paths: string[]): string {
  return [...paths].sort((a, b) => {
    const da = a.split('/').length;
    const db = b.split('/').length;
    if (da !== db) return da - db;
    const la = a.length;
    const lb = b.length;
    if (la !== lb) return la - lb;
    return a.localeCompare(b);
  })[0]!;
}

// ─────────────────────────────────────────────────────────────
// 杂项
// ─────────────────────────────────────────────────────────────

export function hashContent(s: string): string {
  return createHash('sha1').update(s, 'utf8').digest('hex').slice(0, 16);
}
