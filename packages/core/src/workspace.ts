/**
 * 工作区：管理多本小说（多个 vault）
 *
 * 依据：docs/02-数据模型.md 第 11 / 12 / 13 章，docs/05 任务 1.31 ~ 1.36
 *
 * 目录结构：
 *   工作区根/
 *   ├── .workspace.json
 *   ├── 小说/<书名>/            ← 一个 vault
 *   │   ├── .project.json
 *   │   ├── README.md
 *   │   ├── 01-大纲/ … 08-共享/
 *   └── .trash/
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import type { ProjectMeta, ProjectSummary, WorkspaceMeta } from './types.ts';
import { NovelEngine } from './engine.ts';
import { sanitizeFileName } from './vault.ts';
import { PACKS, packById } from './packs.ts';

export const NOVEL_DIR = '小说';
export const TRASH_DIR = '.trash';

/** 归档记录（docs/01 第 3.5 节） */
export interface ArchivedProject {
  id: string;
  name: string;
  dirName: string;
  description: string;
  packs: string[];
  /** 归档时间（ISO） */
  archivedAt: string;
  /** 在 .trash 下的目录名 */
  storedAs: string;
}

/** 标准目录（docs/02 第 11.1 节） */
/**
 * 标准目录（docs/02 第 11.1 节）
 *
 * 注意：目录编号只影响**文件系统排序**，不影响导航顺序
 * （导航顺序由 PROJECT_ENTRIES 控制）。
 * 「灵感」用追加编号 09，避免重排 01~08 破坏已有数据与引用。
 */
export const STANDARD_DIRS = [
  '01-大纲',
  '02-章纲',
  '03-章节',
  '04-线索',
  '05-人物',
  '06-设定',
  '07-类型',
  '08-共享',
  '09-灵感', // 灵感宝库（导航里排在大纲之后）
];

export class Workspace {
  readonly root: string;
  private meta: WorkspaceMeta | null = null;
  private engines = new Map<string, NovelEngine>();

  constructor(root: string) {
    this.root = path.resolve(root);
  }

  private get metaPath(): string {
    return path.join(this.root, '.workspace.json');
  }

  /** 初始化工作区（任务 1.31） */
  async init(name = '我的小说工作区'): Promise<WorkspaceMeta> {
    await fs.mkdir(this.root, { recursive: true });
    await fs.mkdir(path.join(this.root, NOVEL_DIR), { recursive: true });
    await fs.mkdir(path.join(this.root, TRASH_DIR), { recursive: true });
    let meta: WorkspaceMeta;
    try {
      const raw = await fs.readFile(this.metaPath, 'utf8');
      meta = JSON.parse(raw) as WorkspaceMeta;
    } catch {
      meta = {
        version: 1,
        name,
        created: new Date().toISOString(),
        activeProject: null,
      };
      await this.writeMeta(meta);
    }
    this.meta = meta;
    return meta;
  }

  private async writeMeta(meta: WorkspaceMeta): Promise<void> {
    await fs.mkdir(this.root, { recursive: true });
    const tmp = `${this.metaPath}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(meta, null, 2), 'utf8');
    await fs.rename(tmp, this.metaPath);
    this.meta = meta;
  }

  async getMeta(): Promise<WorkspaceMeta> {
    if (this.meta) return this.meta;
    try {
      const raw = await fs.readFile(this.metaPath, 'utf8');
      this.meta = JSON.parse(raw) as WorkspaceMeta;
    } catch {
      this.meta = await this.init();
    }
    return this.meta;
  }

  /** 小说的绝对目录 */
  projectDir(dirName: string): string {
    return path.join(this.root, NOVEL_DIR, dirName);
  }

  // ───────────────────────────────────────────────────────────
  // 列出（任务 1.34：含字数/章节/笔记数）
  // ───────────────────────────────────────────────────────────

  async list(): Promise<ProjectSummary[]> {
    await this.getMeta();
    const novelRoot = path.join(this.root, NOVEL_DIR);
    let entries: Array<{ name: string; isDirectory(): boolean }> = [];
    try {
      entries = await fs.readdir(novelRoot, { withFileTypes: true });
    } catch {
      return [];
    }

    const out: ProjectSummary[] = [];
    for (const e of entries) {
      if (!e.isDirectory() || e.name.startsWith('.')) continue;
      const dir = path.join(novelRoot, e.name);
      const meta = await this.readProjectMeta(dir, e.name);
      let notes = 0;
      let words = 0;
      let chapters = 0;
      let updated = meta.createdAt;
      try {
        const engine = this.engineFor(meta.id, dir, meta);
        const st = await engine.stats();
        notes = st.notes;
        words = st.words;
        chapters = st.chapters;
        const state = await engine.load();
        for (const n of state.notes) {
          if (n.mtime > Date.parse(updated)) updated = new Date(n.mtime).toISOString();
        }
      } catch {
        /* 单本读取失败不影响整个列表 */
      }
      out.push({
        id: meta.id,
        name: meta.name,
        dirName: e.name,
        path: dir,
        description: meta.description,
        packs: meta.packs,
        notes,
        chapters,
        words,
        createdAt: meta.createdAt,
        updated,
      });
    }

    out.sort((a, b) => (a.updated < b.updated ? 1 : -1));
    return out;
  }

  private async readProjectMeta(dir: string, fallbackName: string): Promise<ProjectMeta> {
    const p = path.join(dir, '.project.json');
    try {
      const raw = await fs.readFile(p, 'utf8');
      const m = JSON.parse(raw) as ProjectMeta;
      if (!m.id) throw new Error('缺少 id');
      return m;
    } catch {
      // 目录存在但无元信息 → 补一个（兼容手工放进来的 vault）
      const m: ProjectMeta = {
        id: randomId(),
        name: fallbackName,
        description: '',
        packs: [],
        createdAt: new Date().toISOString(),
        version: 1,
      };
      await fs.writeFile(p, JSON.stringify(m, null, 2), 'utf8');
      return m;
    }
  }

  async project(id: string): Promise<ProjectSummary | null> {
    const all = await this.list();
    return all.find((p) => p.id === id) ?? null;
  }

  /** 取某本的引擎（带缓存） */
  engineFor(id: string, dir: string, meta: ProjectMeta): NovelEngine {
    const cached = this.engines.get(id);
    if (cached) return cached;
    const e = new NovelEngine(dir, meta);
    this.engines.set(id, e);
    return e;
  }

  /** 按 id 取引擎 */
  async engine(id: string): Promise<NovelEngine | null> {
    const all = await this.list();
    const p = all.find((x) => x.id === id);
    if (!p) return null;
    const meta: ProjectMeta = {
      id: p.id,
      name: p.name,
      description: p.description,
      packs: p.packs,
      createdAt: p.createdAt,
      version: 1,
    };
    return this.engineFor(p.id, p.path, meta);
  }

  // ───────────────────────────────────────────────────────────
  // 创建（任务 1.32 / 1.33）
  // ───────────────────────────────────────────────────────────

  async create(opts: {
    name: string;
    description?: string;
    packs?: string[];
  }): Promise<ProjectSummary> {
    await this.getMeta();
    const name = opts.name.trim();
    if (!name) throw new Error('书名不能为空');

    const novelRoot = path.join(this.root, NOVEL_DIR);
    await fs.mkdir(novelRoot, { recursive: true });

    // 目录名冲突时加序号
    let dirName = sanitizeFileName(name);
    let n = 2;
    while (true) {
      try {
        await fs.access(path.join(novelRoot, dirName));
        dirName = `${sanitizeFileName(name)} ${n++}`;
      } catch {
        break;
      }
    }

    const dir = path.join(novelRoot, dirName);
    await fs.mkdir(dir, { recursive: true });
    for (const d of STANDARD_DIRS) {
      await fs.mkdir(path.join(dir, d), { recursive: true });
      // 让空目录能进 git
      await fs.writeFile(path.join(dir, d, '.gitkeep'), '', 'utf8');
    }

    const packs = (opts.packs ?? []).filter((p) => packById(p));
    const meta: ProjectMeta = {
      id: randomId(),
      name,
      description: opts.description ?? '',
      packs,
      createdAt: new Date().toISOString(),
      version: 1,
    };
    await fs.writeFile(path.join(dir, '.project.json'), JSON.stringify(meta, null, 2), 'utf8');

    // README
    const readme = [
      `# ${name}`,
      '',
      opts.description ? `> ${opts.description}` : '> 还没有简介。',
      '',
      '## 目录',
      '',
      ...STANDARD_DIRS.map((d) => `- \`${d}/\``),
      '',
      '---',
      '',
      '这本小说是一个标准的 Obsidian 库。用 Obsidian 直接打开这个文件夹即可看到完整内容与原生关系图。',
      '',
    ].join('\n');
    await fs.writeFile(path.join(dir, 'README.md'), readme, 'utf8');

    // 安装素材包
    if (packs.length > 0) {
      await installPacks(dir, packs);
    }

    // 设为激活
    const ws = await this.getMeta();
    await this.writeMeta({ ...ws, activeProject: meta.id });

    return {
      id: meta.id,
      name: meta.name,
      dirName,
      path: dir,
      description: meta.description,
      packs: meta.packs,
      notes: 0,
      chapters: 0,
      words: 0,
      createdAt: meta.createdAt,
      updated: meta.createdAt,
    };
  }

  // ───────────────────────────────────────────────────────────
  // 更新 / 删除（任务 1.35 / 1.36）
  // ───────────────────────────────────────────────────────────

  async update(
    id: string,
    patch: { name?: string; description?: string; dirName?: string; packs?: string[] },
  ): Promise<ProjectSummary | null> {
    const all = await this.list();
    const p = all.find((x) => x.id === id);
    if (!p) return null;

    const metaPath = path.join(p.path, '.project.json');
    const meta = JSON.parse(await fs.readFile(metaPath, 'utf8')) as ProjectMeta;
    if (patch.name !== undefined && patch.name.trim() !== '') meta.name = patch.name.trim();
    if (patch.description !== undefined) meta.description = patch.description;
    if (patch.packs !== undefined) meta.packs = patch.packs.filter((x) => packById(x));

    // 先释放引擎：list() 会为每本书打开 index.db，不释放则 Windows 上目录无法 rename
    await this.dropEngine(id);

    // 目录重命名：显式 dirName 优先，否则跟随书名变化
    let dirName = p.dirName;
    const wantDir =
      patch.dirName !== undefined && patch.dirName.trim() !== ''
        ? sanitizeFileName(patch.dirName.trim())
        : patch.name !== undefined && patch.name.trim() !== '' && patch.name.trim() !== p.name
          ? sanitizeFileName(meta.name)
          : null;

    if (wantDir !== null && wantDir !== p.dirName) {
      const novelRoot = path.join(this.root, NOVEL_DIR);
      let candidate = wantDir;
      let n = 2;
      while (candidate !== p.dirName) {
        const target = path.join(novelRoot, candidate);
        try {
          await fs.access(target);
          candidate = `${wantDir} ${n++}`;
        } catch {
          break;
        }
      }
      if (candidate !== p.dirName) {
        // 元信息先写进旧目录，再整体搬走，避免中间态丢数据
        await fs.writeFile(metaPath, JSON.stringify(meta, null, 2), 'utf8');
        await fs.rename(p.path, path.join(novelRoot, candidate));
        dirName = candidate;
      }
    }

    const finalMetaPath = path.join(this.root, NOVEL_DIR, dirName, '.project.json');
    await fs.writeFile(finalMetaPath, JSON.stringify(meta, null, 2), 'utf8');

    // 素材包有变化则补装
    if (patch.packs !== undefined) {
      const dir = path.join(this.root, NOVEL_DIR, dirName);
      await installPacks(dir, meta.packs);
    }

    const fresh = await this.list();
    return fresh.find((x) => x.id === id) ?? null;
  }

  /** 删除 → 移入 .trash，不真删（任务 1.35） */
  async remove(id: string): Promise<{ movedTo: string } | null> {
    const all = await this.list();
    const p = all.find((x) => x.id === id);
    if (!p) return null;
    // 先释放引擎，否则 Windows 上目录被 index.db 占用，rename 会失败
    await this.dropEngine(id);
    const trash = path.join(this.root, TRASH_DIR);
    await fs.mkdir(trash, { recursive: true });
    const dest = path.join(trash, `${p.dirName}-${Date.now()}`);
    await fs.rename(p.path, dest);

    const ws = await this.getMeta();
    if (ws.activeProject === id) {
      const rest = (await this.list())[0];
      await this.writeMeta({ ...ws, activeProject: rest?.id ?? null });
    }
    return { movedTo: dest };
  }

  // ───────────────────────────────────────────────────────────
  // 归档 / 恢复（docs/01 第 3.5 节）
  //
  // 用户原话：「还可以归档项目（本代码项目可以归档一级直接删除，
  //   但删除在回收站中，可以恢复归档）」
  //
  // 归档 = 移到 .trash/ + 写一条归档记录（含 id/名称/原目录/时间），
  // 可在 UI 里列出并恢复。与 remove 的区别：remove 是终态，归档可逆。
  // ───────────────────────────────────────────────────────────

  private get archivePath(): string {
    return path.join(this.root, TRASH_DIR, 'archived.json');
  }

  private async readArchiveIndex(): Promise<ArchivedProject[]> {
    try {
      const raw = await fs.readFile(this.archivePath, 'utf8');
      const list = JSON.parse(raw) as ArchivedProject[];
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  }

  private async writeArchiveIndex(list: ArchivedProject[]): Promise<void> {
    await fs.mkdir(path.dirname(this.archivePath), { recursive: true });
    await fs.writeFile(this.archivePath, JSON.stringify(list, null, 2), 'utf8');
  }

  /** 归档一本书 */
  async archive(id: string): Promise<{ archivedTo: string; id: string } | null> {
    const all = await this.list();
    const p = all.find((x) => x.id === id);
    if (!p) return null;

    await this.dropEngine(id);
    const trash = path.join(this.root, TRASH_DIR);
    await fs.mkdir(trash, { recursive: true });
    const stamp = Date.now();
    const dest = path.join(trash, `${p.dirName}-${stamp}`);
    await fs.rename(p.path, dest);

    const index = await this.readArchiveIndex();
    index.push({
      id: p.id,
      name: p.name,
      dirName: p.dirName,
      description: p.description,
      packs: p.packs,
      archivedAt: new Date(stamp).toISOString(),
      storedAs: path.basename(dest),
    });
    await this.writeArchiveIndex(index);

    const ws = await this.getMeta();
    if (ws.activeProject === id) {
      const rest = (await this.list())[0];
      await this.writeMeta({ ...ws, activeProject: rest?.id ?? null });
    }
    return { archivedTo: dest, id };
  }

  /** 列出已归档 */
  async listArchived(): Promise<ArchivedProject[]> {
    const list = await this.readArchiveIndex();
    return list.sort((a, b) => (a.archivedAt < b.archivedAt ? 1 : -1));
  }

  /** 从归档恢复 */
  async restore(id: string): Promise<{ id: string; name: string } | null> {
    const index = await this.readArchiveIndex();
    const item = index.find((x) => x.id === id);
    if (!item) return null;
    const storedAs = safeStoredName(item.storedAs);
    if (!storedAs) return null;

    const trash = path.join(this.root, TRASH_DIR);
    const src = path.join(trash, storedAs);
    try {
      await fs.access(src);
    } catch {
      return null;
    }
    const novelRoot = path.join(this.root, NOVEL_DIR);
    await fs.mkdir(novelRoot, { recursive: true });

    // 目标目录若已被占用，加序号
    let dirName = sanitizeFileName(item.dirName);
    let n = 2;
    while (true) {
      try {
        await fs.access(path.join(novelRoot, dirName));
        dirName = `${sanitizeFileName(item.dirName)} ${n++}`;
      } catch {
        break;
      }
    }

    await fs.rename(src, path.join(novelRoot, dirName));
    // 目录名可能与 .project.json 里的 name 不一致，但 id 不变，不影响引用
    const remaining = index.filter((x) => x.id !== id);
    await this.writeArchiveIndex(remaining);
    return { id: item.id, name: item.name };
  }

  /** 彻底清除一本归档（真删 .trash 目录 + 移除归档记录），不可恢复 */
  async purgeArchived(id: string): Promise<{ id: string } | null> {
    const index = await this.readArchiveIndex();
    const item = index.find((x) => x.id === id);
    if (!item) return null;
    const storedAs = safeStoredName(item.storedAs);
    if (!storedAs) return null;
    const trash = path.join(this.root, TRASH_DIR);
    const src = path.join(trash, storedAs);
    await fs.rm(src, { recursive: true, force: true }).catch(() => undefined);
    const remaining = index.filter((x) => x.id !== id);
    await this.writeArchiveIndex(remaining);
    return { id: item.id };
  }

  /** 彻底清除全部归档，返回清除了多少本 */
  async purgeAllArchived(): Promise<{ count: number }> {
    const index = await this.readArchiveIndex();
    const trash = path.join(this.root, TRASH_DIR);
    let count = 0;
    for (const item of index) {
      const storedAs = safeStoredName(item.storedAs);
      // 归档索引是磁盘上的普通文件，可能被改坏；只允许删除 .trash 下的直接子项
      if (!storedAs) continue;
      await fs.rm(path.join(trash, storedAs), { recursive: true, force: true }).catch(() => undefined);
      count++;
    }
    await this.writeArchiveIndex([]);
    return { count };
  }

  /** 释放并移除某本的引擎 */
  private async dropEngine(id: string): Promise<void> {    const e = this.engines.get(id);
    if (!e) return;
    this.engines.delete(id);
    await e.release();
  }

  async activate(id: string): Promise<void> {
    const ws = await this.getMeta();
    await this.writeMeta({ ...ws, activeProject: id });
  }

  async activeId(): Promise<string | null> {
    const ws = await this.getMeta();
    return ws.activeProject;
  }

  /** 释放全部引擎内存 */
  async releaseAll(): Promise<void> {
    const engines = [...this.engines.values()];
    this.engines.clear();
    await Promise.all(engines.map((e) => e.release()));
  }
}

// ─────────────────────────────────────────────────────────────
// 素材包安装（任务 1.33）
// ─────────────────────────────────────────────────────────────

async function installPacks(dir: string, packs: string[]): Promise<void> {
  const typeDir = path.join(dir, '07-类型');
  await fs.mkdir(typeDir, { recursive: true });
  for (const packId of packs) {
    const pack = packById(packId);
    if (!pack) continue;
    for (const t of pack.types) {
      const file = path.join(typeDir, `${sanitizeFileName(t.name)}.md`);
      try {
        await fs.access(file);
        continue; // 已存在不覆盖（用户可能改过）
      } catch {
        /* 继续写入 */
      }
      const lines = [
        '---',
        'type: _type',
        `name: ${t.name}`,
        `label: ${t.label}`,
        `color: "${t.color}"`,
        `defaultView: ${t.view}`,
        `group: ${pack.group}`,
      ];
      if (t.fields.length > 0) {
        lines.push('fields:');
        for (const f of t.fields) {
          lines.push(`  - key: ${f.key}`);
          lines.push(`    label: ${f.label}`);
          lines.push(`    type: ${f.type}`);
          if (f.required) lines.push('    required: true');
        }
      }
      lines.push('---', '', `# ${t.label}`, '', t.desc, '');
      await fs.writeFile(file, lines.join('\n'), 'utf8');
    }
  }
}

// ─────────────────────────────────────────────────────────────
// 工具
// ─────────────────────────────────────────────────────────────

function randomId(): string {
  return randomBytes(4).toString('hex');
}

/** 归档目录名只允许是 .trash 下的直接子项（防止索引被篡改后越界删除） */
function safeStoredName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const name = value.trim();
  if (!name || name === '.' || name === '..') return null;
  if (name.includes('/') || name.includes('\\') || name.includes('\0')) return null;
  return name;
}

export { PACKS };
