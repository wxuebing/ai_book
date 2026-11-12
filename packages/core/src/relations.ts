/**
 * 关系推导层
 *
 * 依据：docs/02-数据模型.md 第 3 章、第 10.4 节
 * 铁律：关系不落库，每次从 frontmatter + links 实时推导。
 */

import type {
  Concept,
  ConceptAlias,
  ParsedNote,
  Relation,
  RelationKind,
  TypeDef,
  ViewKind,
} from './types.ts';
import { UNTYPED } from './types.ts';
import { mapRelationKind, parseConcept, parseTypeDef } from './note.ts';
import { LinkResolver } from './vault.ts';

// ─────────────────────────────────────────────────────────────
// 关系图
// ─────────────────────────────────────────────────────────────

export interface RelationIndex {
  /** 出链（按源路径） */
  out: Map<string, Relation[]>;
  /** 入链（按目标路径） */
  in: Map<string, Relation[]>;
  /** 断链 */
  broken: Relation[];
  /** 全部关系（含双链） */
  all: Relation[];
}

/**
 * 推导全量关系。
 * 优先级：frontmatter 显式 > parent 树形 > 正文双链。
 * mutual: true 时自动补反向（docs/02 第 3.4 节）。
 */
export function buildRelations(notes: ParsedNote[], resolver: LinkResolver): RelationIndex {
  const out = new Map<string, Relation[]>();
  const inn = new Map<string, Relation[]>();
  const broken: Relation[] = [];
  const all: Relation[] = [];

  const addOut = (source: string, rel: Relation) => {
    const arr = out.get(source);
    if (arr) arr.push(rel);
    else out.set(source, [rel]);
  };
  const addIn = (target: string, rel: Relation) => {
    const arr = inn.get(target);
    if (arr) arr.push(rel);
    else inn.set(target, [rel]);
  };

  for (const note of notes) {
    // 1. frontmatter 显式关系
    for (const raw of note.relations) {
      const targetPath = resolver.resolve(raw.to, note.path);
      const { kind, label } = mapRelationKind(raw.rawKind);
      const rel: Relation = {
        id: `${note.path}->${targetPath ?? raw.to}::${kind}`,
        source: note.path,
        target: targetPath,
        targetRaw: raw.to,
        kind: kind as RelationKind,
        rawKind: raw.rawKind,
        label,
        note: raw.note,
        mutual: raw.mutual,
        origin: 'frontmatter',
      };
      all.push(rel);
      addOut(note.path, rel);
      if (targetPath) addIn(targetPath, rel);
      else broken.push(rel);

      // 自动补反向
      if (raw.mutual && targetPath && targetPath !== note.path) {
        const reverse: Relation = {
          id: `${targetPath}->${note.path}::${kind}#reverse`,
          source: targetPath,
          target: note.path,
          targetRaw: note.basename,
          kind: kind as RelationKind,
          rawKind: raw.rawKind,
          label,
          note: raw.note,
          mutual: true,
          origin: 'frontmatter-reverse',
        };
        all.push(reverse);
        addOut(targetPath, reverse);
        addIn(note.path, reverse);
      }
    }

    // 2. parent 树形包含
    if (note.parent) {
      const parentPath = resolver.resolve(note.parent, note.path);
      const rel: Relation = {
        id: `${note.path}->${parentPath ?? note.parent}::contain`,
        source: note.path,
        target: parentPath,
        targetRaw: note.parent,
        kind: 'contain',
        rawKind: 'parent',
        label: '属于',
        note: null,
        mutual: false,
        origin: 'parent',
      };
      all.push(rel);
      addOut(note.path, rel);
      if (parentPath) addIn(parentPath, rel);
      else broken.push(rel);
    }

    // 3. 正文双链
    const seen = new Set<string>();
    for (const link of note.links) {
      if (link.embed) continue; // 嵌入不算关系
      const targetPath = resolver.resolve(link.targetRaw, note.path);
      const key = `${targetPath ?? link.targetRaw}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (targetPath === note.path) continue; // 自引用不计
      const rel: Relation = {
        id: `${note.path}->${key}::point`,
        source: note.path,
        target: targetPath,
        targetRaw: link.targetRaw,
        kind: 'point',
        rawKind: '',
        label: link.alias ?? link.targetRaw,
        note: null,
        mutual: false,
        origin: 'wikilink',
      };
      all.push(rel);
      addOut(note.path, rel);
      if (targetPath) addIn(targetPath, rel);
      else broken.push(rel);
    }
  }

  return { out, in: inn, broken, all };
}

// ─────────────────────────────────────────────────────────────
// 概念别名索引
// ─────────────────────────────────────────────────────────────

export interface ConceptIndex {
  concepts: Concept[];
  /** 别名（小写）→ 概念 */
  byAlias: Map<string, Concept>;
  /** 概念正名（小写）→ 概念 */
  byName: Map<string, Concept>;
}

export function buildConcepts(notes: ParsedNote[]): ConceptIndex {
  const concepts: Concept[] = [];
  const byAlias = new Map<string, Concept>();
  const byName = new Map<string, Concept>();
  for (const note of notes) {
    const c = parseConcept(note);
    if (!c) continue;
    concepts.push(c);
    byName.set(c.name.toLowerCase(), c);
    for (const a of c.aliases) {
      const key = a.name.toLowerCase();
      if (!byAlias.has(key)) byAlias.set(key, c);
    }
  }
  return { concepts, byAlias, byName };
}

/** 把一个词归一为概念正名；未命中返回原词 */
export function canonicalName(index: ConceptIndex, word: string): string {
  const key = word.trim().toLowerCase();
  const c = index.byAlias.get(key) ?? index.byName.get(key);
  return c ? c.name : word;
}

/** 两个别名是否性质冲突（docs/02 第 7.3 节） */
export function aliasesConflict(a: ConceptAlias, b: ConceptAlias): boolean {
  if (a === b) return false;
  if (a.conflict || b.conflict) {
    // 同一区域的别名之间不算冲突
    if (a.region && b.region && a.region === b.region) return false;
    return true;
  }
  return false;
}

// ─────────────────────────────────────────────────────────────
// 类型索引
// ─────────────────────────────────────────────────────────────

export interface TypeIndex {
  defs: Map<string, TypeDef>;
  list: TypeDef[];
}

export function buildTypes(notes: ParsedNote[]): TypeIndex {
  const defs = new Map<string, TypeDef>();
  const list: TypeDef[] = [];
  for (const note of notes) {
    const t = parseTypeDef(note);
    if (!t) continue;
    if (!defs.has(t.name)) {
      defs.set(t.name, t);
      list.push(t);
    }
  }
  return { defs, list };
}

// ─────────────────────────────────────────────────────────────
// 视图推断（docs/02 第 9.2 节）
// ─────────────────────────────────────────────────────────────

/** 按优先级推断某类型应使用的视图 */
export function inferView(
  typeName: string,
  def: TypeDef | undefined,
  notes: ParsedNote[],
): ViewKind {
  // 1. 类型定义显式指定
  if (def?.defaultView) return def.defaultView;

  const group = notes.filter((n) => (n.type ?? UNTYPED) === typeName);
  if (group.length === 0) return 'list';

  // 2. 字段特征
  const has = (key: string) => {
    const count = group.filter((n) => {
      const v = n.frontmatter[key];
      return v !== undefined && v !== null && v !== '';
    }).length;
    return count / group.length;
  };

  if (has('order') > 0.5) return 'ladder';
  if (has('parent') > 0.5) return 'tree';
  if (has('date') > 0.5 || has('time') > 0.5) return 'timeline';
  if (has('span') > 0.5 || has('from') > 0.5 || has('to') > 0.5) return 'swimlane';
  if (has('relations') > 0.5) return 'graph';

  // 3. 字段定义里的声明
  if (def?.fields.some((f) => f.key === 'order')) return 'ladder';
  if (def?.fields.some((f) => f.key === 'parent')) return 'tree';

  // 4. 兜底
  return 'list';
}

// ─────────────────────────────────────────────────────────────
// 调色板（docs/04 第 2.4 节）
// ─────────────────────────────────────────────────────────────

export const PALETTE = [
  '#5B7C99', '#7A6A9B', '#3E8E8A', '#4E9CA8', '#6E8CA0',
  '#7BA05B', '#B08A5A', '#C4735A', '#8A93A8', '#A8B4C0',
  '#B06A8A', '#A08A5A', '#5B8C6E', '#9A8FA8', '#C4915A',
];

/** 名字哈希取稳定色：同名永远同色 */
export function colorForType(type: string): string {
  let h = 0;
  for (let i = 0; i < type.length; i++) h = (h * 31 + type.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length]!;
}
