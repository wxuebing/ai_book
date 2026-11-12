/**
 * 引擎：一本小说（一个 vault）的全部内存状态
 *
 * 依据：docs/05-任务清单.md 3.6 节（任务 1.31 ~ 1.37）
 * 特性：懒加载、按 revision 失效缓存、多小说互不影响。
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import type {
  Coord,
  ParsedNote,
  ProjectMeta,
  Scope,
  TypeGroup,
  ViewKind,
  Relation,
  Concept,
} from './types.ts';
import { UNTYPED, isMetaType } from './types.ts';
import { Vault, LinkResolver } from './vault.ts';
import { NoteIndex, type SearchHit } from './index-db.ts';
import {
  buildRelations,
  buildConcepts,
  buildTypes,
  inferView,
  colorForType,
  type RelationIndex,
  type ConceptIndex,
  type TypeIndex,
} from './relations.ts';
import { scopeMatches, excerptOf, normalizeScope } from './note.ts';

/** frontmatter 里不允许出现的键：避免原型污染写入对象原型 */
const UNSAFE_FM_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

export interface EngineState {
  notes: ParsedNote[];
  byPath: Map<string, ParsedNote>;
  resolver: LinkResolver;
  relations: RelationIndex;
  concepts: ConceptIndex;
  types: TypeIndex;
  /** 每次重建 +1，缓存据此失效 */
  revision: number;
}

export class NovelEngine {
  readonly vault: Vault;
  readonly meta: ProjectMeta;
  private index: NoteIndex | null = null;
  private state: EngineState | null = null;
  private loading: Promise<EngineState> | null = null;
  private revision = 0;
  /** 挂起的索引重建任务；release 前必须等它落地，否则 Windows 上 db 文件被占用 */
  private pendingIndex: Promise<unknown> | null = null;
  /** 写入串行化：自动保存与手动保存可能并发，避免互相覆盖内存状态 */
  private touchQueue: Promise<void> = Promise.resolve();

  constructor(vaultRoot: string, meta: ProjectMeta) {
    this.vault = new Vault({ root: vaultRoot });
    this.meta = meta;
  }

  /** 懒加载索引（任务 1.37：按需启动，不常驻） */
  private async getIndex(): Promise<NoteIndex> {
    if (this.index) return this.index;
    this.index = await NoteIndex.open({ file: path.join(this.vault.root, '.loom', 'index.db') });
    return this.index;
  }

  /** 由一组笔记重建内存状态（链接/关系/类型全部重新推导） */
  private rebuildState(notes: ParsedNote[]): EngineState {
    const sorted = [...notes].sort((a, b) => a.path.localeCompare(b.path, 'zh'));

    // 回填链接解析
    const resolver = new LinkResolver(sorted);
    for (const n of sorted) {
      for (const l of n.links) {
        l.targetPath = resolver.resolve(l.targetRaw, n.path);
      }
    }

    const relations = buildRelations(sorted, resolver);
    const concepts = buildConcepts(sorted);
    const types = buildTypes(sorted);

    const byPath = new Map<string, ParsedNote>();
    for (const n of sorted) byPath.set(n.path, n);

    this.revision++;
    const next: EngineState = {
      notes: sorted,
      byPath,
      resolver,
      relations,
      concepts,
      types,
      revision: this.revision,
    };
    this.state = next;
    return next;
  }

  /** 加载或复用内存状态 */
  async load(force = false): Promise<EngineState> {
    if (!force && this.state) return this.state;
    if (!force && this.loading) return this.loading;
    const pending = (async () => {
      const idx = await this.getIndex();
      const { notes } = await this.vault.scan();
      const next = this.rebuildState(notes);

      // 索引重建放到后台，不阻塞读；但登记 promise 以便 release 时等待
      this.pendingIndex = idx.rebuild(next.notes).catch(() => {});
      return next;
    })();
    this.loading = pending;
    try {
      return await pending;
    } finally {
      // 只清理自己这个 promise，避免并发强制刷新时把新的加载状态抹掉
      if (this.loading === pending) this.loading = null;
    }
  }

  /**
   * 单篇变更后增量刷新（任务 1.19）。
   *
   * 只读变化的那一篇，其余笔记复用内存里的解析结果 —— 避免每次保存都
   * 扫全库（千篇规模下约 400ms）。链接与关系仍需全局重算，因为新标题
   * 可能让旧的断链变成有效链接。
   */
  async touch(relPath: string): Promise<void> {
    const run = this.touchQueue.then(() => this.touchNow(relPath));
    this.touchQueue = run.catch(() => undefined);
    return run;
  }

  private async touchNow(relPath: string): Promise<void> {
    const idx = await this.getIndex();
    const current = this.state;
    const exists = await this.vault.exists(relPath);

    if (!current) {
      await this.load(true);
      return;
    }

    try {
      if (!exists) {
        const notes = current.notes.filter((n) => n.path !== relPath);
        this.rebuildState(notes);
        await idx.remove(relPath);
        this.pendingIndex = Promise.resolve();
        return;
      }

      const note = await this.vault.readNote(relPath);
      const notes = current.notes.filter((n) => n.path !== note.path);
      notes.push(note);
      this.rebuildState(notes);
      this.pendingIndex = idx.upsert(note).catch(() => {});
    } catch {
      // 读失败或索引异常 → 退回全量重载，保证一致性
      await this.load(true);
    }
  }

  /**
   * 释放内存（闲置回收）。
   * 必须等挂起的索引重建落地再关库，否则 Windows 上 db 文件句柄被占用（EBUSY）。
   */
  async release(): Promise<void> {
    if (this.pendingIndex) {
      try {
        await this.pendingIndex;
      } catch {
        /* 重建失败不影响释放 */
      }
      this.pendingIndex = null;
    }
    this.state = null;
    this.index?.close();
    this.index = null;
  }

  /** 同步释放（不等待索引），仅用于进程退出兜底 */
  releaseSync(): void {
    this.state = null;
    try {
      this.index?.close();
    } catch {
      /* 句柄可能仍被占用，交给进程退出回收 */
    }
    this.index = null;
  }

  // ───────────────────────────────────────────────────────────
  // 查询
  // ───────────────────────────────────────────────────────────

  async note(relPath: string): Promise<ParsedNote | null> {
    const s = await this.load();
    return s.byPath.get(relPath) ?? null;
  }

  /** 类型分组（含「未归类」） */
  async groups(): Promise<TypeGroup[]> {
    const s = await this.load();
    const counts = new Map<string, number>();
    for (const n of s.notes) {
      if (isMetaType(n.type)) continue;
      const key = n.type ?? UNTYPED;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    const out: TypeGroup[] = [];
    const seen = new Set<string>();

    for (const def of s.types.list) {
      if (def.meta && !seen.has(def.name)) {
        // _type 定义本身也代表一个内容类型
      }
      const count = counts.get(def.name) ?? 0;
      out.push({
        type: def.name,
        label: def.label,
        color: def.color ?? colorForType(def.name),
        view: inferView(def.name, def, s.notes),
        count,
        fields: def.fields,
      });
      seen.add(def.name);
    }

    // 有实例但没定义的类型
    for (const [type, count] of counts) {
      if (seen.has(type) || type === UNTYPED) continue;
      out.push({
        type,
        label: type,
        color: colorForType(type),
        view: inferView(type, undefined, s.notes),
        count,
        fields: [],
      });
      seen.add(type);
    }

    // 未归类恒排最后
    const untypedCount = counts.get(UNTYPED) ?? 0;
    if (untypedCount > 0) {
      out.push({
        type: UNTYPED,
        label: '未归类',
        color: '#B4BCC4',
        view: 'list',
        count: untypedCount,
        fields: [],
        hint: '这些条目还没定类型',
      });
    }

    return out;
  }

  /** 某类型的全部条目 */
  async entriesOf(type: string): Promise<{
    type: string;
    label: string;
    color: string;
    view: ViewKind;
    fields: TypeGroup['fields'];
    notes: Array<{
      path: string;
      title: string;
      type: string | null;
      words: number;
      mtime: number;
      frontmatter: Record<string, unknown>;
      excerpt: string;
    }>;
  }> {
    const s = await this.load();
    const def = s.types.defs.get(type);
    const list = s.notes.filter((n) => {
      if (isMetaType(n.type)) return false;
      return (n.type ?? UNTYPED) === type;
    });
    const view = inferView(type, def, s.notes);
    return {
      type,
      label: type === UNTYPED ? '未归类' : (def?.label ?? type),
      color: type === UNTYPED ? '#B4BCC4' : (def?.color ?? colorForType(type)),
      view,
      fields: def?.fields ?? [],
      notes: list.map((n) => ({
        path: n.path,
        title: n.title,
        type: n.type,
        words: n.words,
        mtime: n.mtime,
        frontmatter: n.frontmatter as Record<string, unknown>,
        excerpt: excerptOf(n),
      })),
    };
  }

  async search(query: string, limit = 50): Promise<SearchHit[]> {
    const idx = await this.getIndex();
    // 确保索引已建好
    const s = await this.load();
    const st = idx.stats;
    if (!st.persistent) {
      // 内存降级：直接扫内存
      const q = query.trim().toLowerCase();
      if (!q) return [];
      const out: SearchHit[] = [];
      for (const n of s.notes) {
        const text = (n.title + '\n' + n.body).toLowerCase();
        const i = text.indexOf(q);
        if (i < 0) continue;
        const start = Math.max(0, i - 40);
        const end = Math.min(text.length, i + q.length + 60);
        out.push({
          path: n.path,
          title: n.title,
          type: n.type,
          excerpt: (start > 0 ? '…' : '') + text.slice(start, end).replace(/\s+/g, ' ').trim(),
          snippet: '',
        });
        if (out.length >= limit) break;
      }
      return out;
    }
    if (st.notes === 0 && s.notes.length > 0) {
      await idx.rebuild(s.notes);
    }
    return idx.search(query, limit);
  }

  async backlinks(relPath: string): Promise<Relation[]> {
    const s = await this.load();
    return s.relations.in.get(relPath) ?? [];
  }

  async outgoing(relPath: string): Promise<Relation[]> {
    const s = await this.load();
    return s.relations.out.get(relPath) ?? [];
  }

  /** 关系图（任务：300 节点可拖拽 60fps —— 由前端保证） */
  async graph(opts: { types?: string[]; centerOn?: string; depth?: number } = {}): Promise<{
    nodes: Array<{
      id: string;
      label: string;
      type: string | null;
      color: string;
      words: number;
      folder: string;
    }>;
    edges: Array<{
      source: string;
      target: string;
      kind: string;
      label: string;
      origin: string;
    }>;
  }> {
    const s = await this.load();
    const typeFilter = opts.types && opts.types.length > 0 ? new Set(opts.types) : null;

    let allowed: Set<string> | null = null;
    if (opts.centerOn) {
      const depth = opts.depth ?? 2;
      allowed = new Set<string>([opts.centerOn]);
      let frontier = [opts.centerOn];
      for (let d = 0; d < depth; d++) {
        const next: string[] = [];
        for (const p of frontier) {
          for (const r of s.relations.out.get(p) ?? []) {
            if (r.target && !allowed.has(r.target)) { allowed.add(r.target); next.push(r.target); }
          }
          for (const r of s.relations.in.get(p) ?? []) {
            if (r.source && !allowed.has(r.source)) { allowed.add(r.source); next.push(r.source); }
          }
        }
        frontier = next;
        if (frontier.length === 0) break;
      }
    }

    const nodes = s.notes
      .filter((n) => !isMetaType(n.type))
      .filter((n) => (typeFilter ? typeFilter.has(n.type ?? UNTYPED) : true))
      .filter((n) => (allowed ? allowed.has(n.path) : true))
      .map((n) => ({
        id: n.path,
        label: n.title,
        type: n.type,
        color: colorForType(n.type ?? UNTYPED),
        words: n.words,
        folder: n.folder,
      }));

    const nodeIds = new Set(nodes.map((n) => n.id));
    const edges = s.relations.all
      .filter((r) => r.target && nodeIds.has(r.source) && nodeIds.has(r.target))
      .filter((r) => r.origin !== 'frontmatter-reverse') // 反向边不重复画
      .map((r) => ({
        source: r.source,
        target: r.target!,
        kind: r.kind,
        label: r.label,
        origin: r.origin,
      }));

    return { nodes, edges };
  }

  async types(): Promise<TypeGroup['fields'] extends never ? never : TypeIndex['list']> {
    const s = await this.load();
    return s.types.list;
  }

  async concepts(): Promise<Concept[]> {
    const s = await this.load();
    return s.concepts.concepts;
  }

  /** 作用域汇总 */
  async scopes(): Promise<{ spaces: string[]; times: string[] }> {
    const s = await this.load();
    const spaces = new Set<string>();
    const times = new Set<string>();
    for (const n of s.notes) {
      for (const v of n.scope.space) spaces.add(v);
      for (const v of n.scope.time) times.add(v);
    }
    return {
      spaces: [...spaces].sort((a, b) => a.localeCompare(b, 'zh')),
      times: [...times].sort((a, b) => a.localeCompare(b, 'zh')),
    };
  }

  /** 生效规则计算（docs/02 第 6.4 节） */
  async activeAt(coord: Coord): Promise<{
    coord: Coord;
    active: Array<{ path: string; title: string; type: string | null; scope: Scope }>;
    inactive: Array<{ path: string; title: string; type: string | null; scope: Scope }>;
  }> {
    const s = await this.load();
    const active: Array<{ path: string; title: string; type: string | null; scope: Scope }> = [];
    const inactive: typeof active = [];
    for (const n of s.notes) {
      if (isMetaType(n.type)) continue;
      const item = { path: n.path, title: n.title, type: n.type, scope: n.scope };
      if (scopeMatches(n.scope, coord)) active.push(item);
      else inactive.push(item);
    }
    return { coord, active, inactive };
  }

  /** 一致性检查（任务 2.23 ~ 2.26） */
  async check(): Promise<{
    broken: Array<{ source: string; target: string; raw: string }>;
    scopeConflicts: Array<{ items: string[]; reason: string }>;
    conceptConflicts: Array<{
      concept: string;
      a: string;
      b: string;
      reason: string;
    }>;
    untyped: Array<{ path: string; title: string }>;
  }> {
    const s = await this.load();

    const broken = s.relations.broken.map((r) => ({
      source: r.source,
      target: r.targetRaw,
      raw: `[[${r.targetRaw}]]`,
    }));

    // 作用域冲突：同一坐标下存在 oppose 关系的两条
    const scopeConflicts: Array<{ items: string[]; reason: string }> = [];
    const seenPair = new Set<string>();
    for (const r of s.relations.all) {
      if (r.kind !== 'oppose' || !r.target) continue;
      const a = s.byPath.get(r.source);
      const b = s.byPath.get(r.target);
      if (!a || !b) continue;
      const key = [r.source, r.target].sort().join('|');
      if (seenPair.has(key)) continue;
      seenPair.add(key);
      scopeConflicts.push({
        items: [r.source, r.target],
        reason: `「${a.title}」与「${b.title}」为对立关系，但作用域有重叠`,
      });
    }

    // 概念冲突
    const conceptConflicts: Array<{ concept: string; a: string; b: string; reason: string }> = [];
    for (const c of s.concepts.concepts) {
      const conflicts = c.aliases.filter((x) => x.conflict);
      for (const x of conflicts) {
        for (const y of c.aliases) {
          if (x === y) continue;
          if (x.region && y.region && x.region === y.region) continue;
          conceptConflicts.push({
            concept: c.name,
            a: x.name,
            b: y.name,
            reason: `「${x.name}」与「${y.name}」同指「${c.name}」但性质冲突`,
          });
        }
      }
    }

    const untyped = s.notes
      .filter((n) => n.type === null)
      .map((n) => ({ path: n.path, title: n.title }));

    return { broken, scopeConflicts, conceptConflicts, untyped };
  }

  /** 全链路回溯：向下（包含/出链）或向上（入链/父级） */
  async trace(
    relPath: string,
    direction: 'down' | 'up' = 'down',
    maxDepth = 5,
  ): Promise<Array<{ depth: number; path: string; title: string; type: string | null; via: string }>> {
    const s = await this.load();
    const out: Array<{ depth: number; path: string; title: string; type: string | null; via: string }> = [];
    const visited = new Set<string>([relPath]);
    let frontier: Array<{ path: string; depth: number; via: string }> = [{ path: relPath, depth: 0, via: '' }];

    while (frontier.length > 0) {
      const next: typeof frontier = [];
      for (const cur of frontier) {
        if (cur.depth >= maxDepth) continue;
        const rels = direction === 'down'
          ? (s.relations.out.get(cur.path) ?? [])
          : (s.relations.in.get(cur.path) ?? []);
        for (const r of rels) {
          const other = direction === 'down' ? r.target : r.source;
          if (!other || visited.has(other)) continue;
          visited.add(other);
          const n = s.byPath.get(other);
          if (!n) continue;
          out.push({
            depth: cur.depth + 1,
            path: other,
            title: n.title,
            type: n.type,
            via: r.label,
          });
          next.push({ path: other, depth: cur.depth + 1, via: r.label });
        }
      }
      frontier = next;
    }

    return out;
  }

  /** 统计 */
  async stats(): Promise<{
    notes: number;
    typed: number;
    untyped: number;
    words: number;
    types: number;
    concepts: number;
    relations: number;
    chapters: number;
  }> {
    const s = await this.load();
    // 内容笔记：排除元类型笔记（_type 类型定义等），它们不是用户写的故事内容，
    // 不应计入「笔记数 / 字数」—— 否则刚建、还没写一个字的新书也会显示几十上百字。
    const contentNotes = s.notes.filter((n) => !isMetaType(n.type));
    const typed = contentNotes.filter((n) => n.type !== null).length;
    const chapters = contentNotes.filter(
      (n) => n.type === '章节' || /^第\d+章/.test(n.basename),
    ).length;
    return {
      notes: contentNotes.length,
      typed,
      untyped: contentNotes.filter((n) => n.type === null).length,
      words: contentNotes.reduce((a, n) => a + n.words, 0),
      types: s.types.list.length,
      concepts: s.concepts.concepts.length,
      relations: s.relations.all.filter((r) => r.origin !== 'frontmatter-reverse').length,
      chapters,
    };
  }

  /** 新建条目（任务 1.32 的一部分） */
  async createNote(opts: {
    title: string;
    type?: string | null;
    folder?: string;
    body?: string;
    frontmatter?: Record<string, unknown>;
  }): Promise<{ path: string }> {
    const folder = opts.folder ?? defaultFolderFor(opts.type ?? null);
    const relPath = await this.vault.uniqueName(folder, opts.title);
    const fm: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(opts.frontmatter ?? {})) {
      if (!UNSAFE_FM_KEYS.has(k)) fm[k] = v;
    }
    if (opts.type) fm.type = opts.type;
    fm.title = opts.title;
    const { stringifyYaml } = await import('./yaml.ts');
    const fmText = stringifyYaml(fm as never).trimEnd();
    const body = opts.body ?? `# ${opts.title}\n\n`;
    const content = `---\n${fmText}\n---\n\n${body}`;
    await this.vault.writeAtomic(relPath, content);
    await this.touch(relPath);
    return { path: relPath };
  }

  /** 更新条目 */
  async updateNote(
    relPath: string,
    patch: { frontmatter?: Record<string, unknown>; body?: string; append?: string },
  ): Promise<void> {
    const abs = this.vault.resolve(relPath);
    const src = await fs.readFile(abs, 'utf8');
    const { splitFrontmatter } = await import('./markdown.ts');
    const { stringifyYaml, parseFrontmatter } = await import('./yaml.ts');
    const split = splitFrontmatter(src);

    let fm: Record<string, unknown> = {};
    if (split.frontmatter && split.frontmatter.trim() !== '') {
      try {
        fm = parseFrontmatter(split.frontmatter) as Record<string, unknown>;
      } catch {
        fm = {};
      }
    }
    if (patch.frontmatter) {
      for (const [k, v] of Object.entries(patch.frontmatter)) {
        if (UNSAFE_FM_KEYS.has(k)) continue;
        if (v === null || v === undefined) delete fm[k];
        else fm[k] = v;
      }
    }

    let body = split.body;
    if (patch.body !== undefined) body = patch.body;
    if (patch.append !== undefined) body = body.replace(/\s*$/, '') + '\n\n' + patch.append + '\n';

    const fmText = Object.keys(fm).length > 0
      ? `---\n${stringifyYaml(fm as never).trimEnd()}\n---\n\n`
      : '';
    await this.vault.writeAtomic(relPath, fmText + body);
    await this.touch(relPath);
  }

  async deleteNote(relPath: string): Promise<void> {
    await this.vault.remove(relPath);
    await this.touch(relPath);
  }

  /** 目录清单 */
  async folders(): Promise<string[]> {
    return this.vault.listDirs();
  }

  /** 手动重建索引 */
  async reindex(): Promise<{ notes: number; ms: number }> {
    const s = await this.load(true);
    const idx = await this.getIndex();
    return idx.rebuild(s.notes);
  }

  /** 规范化 scope 的工具方法（供 API 层复用） */
  static normalizeScope = normalizeScope;
}

/**
 * 类型 → 默认目录（docs/02 第 11.1 节）
 *
 * 「灵感」用 09-灵感（追加编号），不重排 01~08 —— 避免破坏已有数据与引用。
 * 导航顺序由 PROJECT_ENTRIES 控制，与目录编号无关。
 */
export function defaultFolderFor(type: string | null): string {
  switch (type) {
    case '大纲': return '01-大纲';
    case '章纲': return '02-章纲';
    case '章节': return '03-章节';
    case '线索':
    case '伏笔': return '04-线索';
    case '人物': return '05-人物';
    case '_type': return '07-类型';
    case '灵感': return '09-灵感';
    case null: return '06-设定';
    default: return '06-设定';
  }
}
