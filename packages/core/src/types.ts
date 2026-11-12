/**
 * 流云织小说工作台 · 核心类型
 *
 * 依据：docs/02-数据模型.md
 * 铁律：内核里没有「题材」「分类」「体裁」——一个字段都没有。
 */

// ─────────────────────────────────────────────────────────────
// 1. 原语层
// ─────────────────────────────────────────────────────────────

/** 属性值：frontmatter 任意键值的解析结果 */
export type PropValue =
  | string
  | number
  | boolean
  | null
  | PropValue[]
  | { [key: string]: PropValue };

/** frontmatter = 一个普通对象，键名不设限 */
export type Frontmatter = Record<string, PropValue>;

// ─────────────────────────────────────────────────────────────
// 2. 行内 Token（docs/03 第 8.2 节）
// ─────────────────────────────────────────────────────────────

export type InlineToken =
  | { type: 'text'; text: string }
  | { type: 'strong'; text: string }
  | { type: 'em'; text: string }
  | { type: 'del'; text: string }
  | { type: 'mark'; text: string }
  | { type: 'code'; text: string }
  | { type: 'math'; text: string }
  | {
      type: 'wikilink';
      target: string;
      /** 解析后的目标路径，null = 断链 */
      targetPath: string | null;
      alias: string | null;
      subpath: string | null;
      subType: 'heading' | 'block' | null;
      embed: boolean;
      /** 指向自身笔记 */
      self: boolean;
    }
  | { type: 'mdlink'; text: string; href: string }
  | { type: 'image'; alt: string; href: string }
  | { type: 'tag'; tag: string }
  | { type: 'inlinefield'; key: string; value: string };

// ─────────────────────────────────────────────────────────────
// 3. 块级 Block（docs/03 第 8.2 节）
// ─────────────────────────────────────────────────────────────

export interface ListItem {
  /** 有序列表的序号；无序为 null */
  index: number | null;
  /** 任务态：null = 非任务；' ' 未完成；'x' 已完成；'/' 进行中 */
  task: ' ' | 'x' | '/' | null;
  inline: InlineToken[];
  /** 缩进层级，0 起 */
  depth: number;
}

export type Block =
  | { type: 'heading'; level: number; inline: InlineToken[]; id: string; blockId: string | null }
  | { type: 'paragraph'; inline: InlineToken[]; blockId: string | null }
  | { type: 'list'; ordered: boolean; items: ListItem[]; blockId: string | null }
  | { type: 'code'; lang: string; code: string; blockId: string | null }
  | { type: 'quote'; inline: InlineToken[]; blockId: string | null }
  | {
      type: 'callout';
      kind: string;
      fold: 'open' | 'closed' | null;
      title: string;
      blocks: Block[];
      blockId: string | null;
    }
  | {
      type: 'table';
      align: Array<'left' | 'center' | 'right' | null>;
      header: InlineToken[][];
      rows: InlineToken[][][];
      blockId: string | null;
    }
  | { type: 'hr'; blockId: string | null }
  | { type: 'mathblock'; text: string; blockId: string | null }
  | { type: 'html'; html: string; blockId: string | null };

// ─────────────────────────────────────────────────────────────
// 4. 关系（docs/02 第 3 章）
// ─────────────────────────────────────────────────────────────

/** 系统识别的 10 种关系语义 */
export type RelationKind =
  | 'parallel'
  | 'sequential'
  | 'replace'
  | 'oppose'
  | 'support'
  | 'depend'
  | 'cognate'
  | 'erode'
  | 'contain'
  | 'point';

/** 关系来源：显式 > 树形 > 双链 */
export type RelationOrigin =
  | 'frontmatter'
  | 'frontmatter-reverse'
  | 'wikilink'
  | 'parent';

export interface Relation {
  id: string;
  /** 源笔记相对路径 */
  source: string;
  /** 目标笔记相对路径，null = 断链 */
  target: string | null;
  /** 目标原始写法（断链时保留原词） */
  targetRaw: string;
  kind: RelationKind;
  /** 作者写的原词，如「师徒」「情感」 */
  rawKind: string;
  /** 显示标签 */
  label: string;
  note: string | null;
  /** 是否双向（默认 true） */
  mutual: boolean;
  origin: RelationOrigin;
}

// ─────────────────────────────────────────────────────────────
// 5. 作用域（docs/02 第 6 章）
// ─────────────────────────────────────────────────────────────

/** 规范化后的作用域。空数组 = 该维度不限 */
export interface Scope {
  space: string[];
  time: string[];
  /** 两个维度都不限 */
  any: boolean;
}

/** 写作坐标 */
export interface Coord {
  space?: string | null;
  time?: string | null;
}

// ─────────────────────────────────────────────────────────────
// 6. 概念别名（docs/02 第 7 章）
// ─────────────────────────────────────────────────────────────

export interface ConceptAlias {
  name: string;
  region: string | null;
  era: string | null;
  nature: string | null;
  /** 与同概念其他别名性质冲突 */
  conflict: boolean;
}

export interface Concept {
  /** 概念笔记路径 */
  path: string;
  /** 概念正名 */
  name: string;
  description: string | null;
  aliases: ConceptAlias[];
}

// ─────────────────────────────────────────────────────────────
// 7. 类型定义（docs/02 第 8 章）
// ─────────────────────────────────────────────────────────────

export type FieldType =
  | 'text'
  | 'number'
  | 'boolean'
  | 'date'
  | 'ref'
  | 'enum'
  | 'tags'
  | 'longtext';

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  /** enum 的可选值 */
  options?: string[];
}

/** 七种视图 */
export type ViewKind =
  | 'list'
  | 'ladder'
  | 'tree'
  | 'graph'
  | 'timeline'
  | 'swimlane'
  | 'table';

export interface TypeDef {
  /** 类型标识，如「境界」 */
  name: string;
  label: string;
  /** 主题色；缺省由名字哈希推出 */
  color: string | null;
  defaultView: ViewKind | null;
  /** 导航栏归属，如「设定」 */
  group: string | null;
  /** 是否在导航栏隐藏 */
  hidden: boolean;
  fields: FieldDef[];
  /** 定义它的笔记路径 */
  path: string;
  /** 是否内置元类型（_type / _concept / _template / _project） */
  meta: boolean;
}

// ─────────────────────────────────────────────────────────────
// 8. 多体系并行等级（docs/02 第 5 章）
// ─────────────────────────────────────────────────────────────

export interface PathLevel {
  system: string;
  tier: string;
  /** 数值化阶数，用于进度条；null = 未知 */
  order: number | null;
}

// ─────────────────────────────────────────────────────────────
// 9. 实体（docs/02 第 2 章）
// ─────────────────────────────────────────────────────────────

/** 解析一篇笔记后的完整内存结构 */
export interface ParsedNote {
  /** 相对 vault 根的路径，POSIX 分隔符 */
  path: string;
  /** 文件名去掉 .md */
  basename: string;
  /** 所在目录（相对路径），根目录为 '' */
  folder: string;
  /** 显示名：frontmatter.title ?? 首个一级标题 ?? basename */
  title: string;
  /** 实体类型；null = 未归类 */
  type: string | null;
  frontmatter: Frontmatter;
  body: string;
  blocks: Block[];
  headings: Heading[];
  tags: string[];
  /** 正文 wikilink 出链（去重前） */
  links: RawLink[];
  /** 正文内联字段 */
  fields: InlineField[];
  /** 块 ID 索引 */
  blockIds: string[];
  words: number;
  mtime: number;
  size: number;
  scope: Scope;
  paths: PathLevel[];
  /** frontmatter 显式关系（未补反向） */
  relations: RawRelation[];
  /** 树形包含上级 */
  parent: string | null;
}

export interface Heading {
  level: number;
  text: string;
  slug: string;
  blockId: string | null;
}

export interface RawLink {
  targetRaw: string;
  alias: string | null;
  subpath: string | null;
  subType: 'heading' | 'block' | null;
  embed: boolean;
  /** 解析后路径，null = 断链 */
  targetPath: string | null;
}

export interface InlineField {
  key: string;
  value: string;
}

export interface RawRelation {
  to: string;
  rawKind: string;
  note: string | null;
  mutual: boolean;
}

// ─────────────────────────────────────────────────────────────
// 10. 索引行（docs/02 第 10 章）
// ─────────────────────────────────────────────────────────────

export interface NoteRow {
  path: string;
  title: string;
  folder: string;
  type: string | null;
  status: string | null;
  body: string;
  frontmatter: string;
  mtime: number;
  size: number;
  words: number;
  hash: string;
}

export interface LinkRow {
  source: string;
  targetRaw: string;
  targetPath: string | null;
  alias: string | null;
  subpath: string | null;
  subType: string | null;
  embed: boolean;
  linkType: string;
  resolved: boolean;
}

// ─────────────────────────────────────────────────────────────
// 11. 工作区与项目（docs/02 第 11 章）
// ─────────────────────────────────────────────────────────────

export interface SeriesDecl {
  name: string;
  books: string[];
  shared: string[];
}

export interface WorkspaceMeta {
  version: number;
  name: string;
  created: string;
  activeProject: string | null;
  series?: SeriesDecl[];
}

export interface ProjectMeta {
  id: string;
  name: string;
  description: string;
  packs: string[];
  createdAt: string;
  version: number;
}

export interface ProjectSummary {
  id: string;
  name: string;
  dirName: string;
  path: string;
  description: string;
  packs: string[];
  notes: number;
  chapters: number;
  words: number;
  createdAt: string;
  updated: string;
}

// ─────────────────────────────────────────────────────────────
// 12. 视图分组
// ─────────────────────────────────────────────────────────────

export interface TypeGroup {
  type: string;
  label: string;
  color: string;
  view: ViewKind;
  count: number;
  fields: FieldDef[];
  hint?: string;
}

/** 未归类分组的保留 type 值 */
export const UNTYPED = '__untyped';

/** 内置元类型 */
export const META_TYPES = ['_type', '_concept', '_template', '_project'] as const;
export type MetaType = (typeof META_TYPES)[number];

export function isMetaType(t: string | null): t is MetaType {
  return t !== null && (META_TYPES as readonly string[]).includes(t);
}
