/**
 * 笔记解析：源文件 → ParsedNote
 *
 * 依据：docs/02-数据模型.md 第 2 / 3 / 5 / 6 / 7 章
 */

import type {
  Frontmatter,
  ParsedNote,
  PathLevel,
  PropValue,
  RawRelation,
  Scope,
  TypeDef,
  FieldDef,
  ViewKind,
  Concept,
  ConceptAlias,
} from './types.ts';
import { parseFrontmatter, type YamlObject, type YamlValue } from './yaml.ts';
import { parseBody, splitFrontmatter, countWords, inlineToText } from './markdown.ts';

// ─────────────────────────────────────────────────────────────
// 路径工具
// ─────────────────────────────────────────────────────────────

/** 统一为 POSIX 分隔符并去掉前导 ./ */
export function normalizePath(p: string): string {
  return p.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/{2,}/g, '/');
}

export function dirOf(path: string): string {
  const i = path.lastIndexOf('/');
  return i < 0 ? '' : path.slice(0, i);
}

export function basenameOf(path: string): string {
  const i = path.lastIndexOf('/');
  const base = i < 0 ? path : path.slice(i + 1);
  return base.replace(/\.md$/i, '');
}

// ─────────────────────────────────────────────────────────────
// 值转换
// ─────────────────────────────────────────────────────────────

function toPropValue(v: YamlValue): PropValue {
  return v as PropValue;
}

function asString(v: YamlValue | undefined): string | null {
  if (v === undefined || v === null) return null;
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return null;
}

function asNumber(v: YamlValue | undefined): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v);
  return null;
}

function asStringArray(v: YamlValue | undefined): string[] {
  if (v === undefined || v === null) return [];
  if (typeof v === 'string') {
    const t = v.trim();
    if (t === '') return [];
    // 支持 "东域, 西荒" 与 "东域、西荒" 这类简写
    return t.split(/[,，、]/).map((s) => s.trim()).filter(Boolean);
  }
  if (Array.isArray(v)) {
    return v.map((x) => asString(x)).filter((x): x is string => x !== null && x !== '');
  }
  return [];
}

// ─────────────────────────────────────────────────────────────
// 作用域
// ─────────────────────────────────────────────────────────────

const ANY_SCOPE: Scope = { space: [], time: [], any: true };

/**
 * 规范化 scope。
 * 支持三种写法：
 *   scope: 宇宙                        （简写，只约束空间）
 *   scope: {space: 宇宙, time: 宇宙历}
 *   scope: [宇宙, 主世界]              （简写，多空间）
 */
export function normalizeScope(raw: YamlValue | undefined): Scope {
  if (raw === undefined || raw === null) return { ...ANY_SCOPE, any: true };
  if (typeof raw === 'string') {
    const space = asStringArray(raw);
    return { space, time: [], any: space.length === 0 };
  }
  if (Array.isArray(raw)) {
    const space = asStringArray(raw);
    return { space, time: [], any: space.length === 0 };
  }
  if (typeof raw === 'object') {
    const obj = raw as YamlObject;
    const space = asStringArray(obj.space);
    const time = asStringArray(obj.time);
    return { space, time, any: space.length === 0 && time.length === 0 };
  }
  return { ...ANY_SCOPE };
}

/**
 * 作用域匹配：条目声明的空间/时间里，至少有一个与当前坐标一致。
 * 未声明维度 = 不限。支持包含匹配（「宇宙」匹配「宇宙·天外」）。
 */
export function scopeMatches(scope: Scope, coord: Coord2): boolean {
  if (scope.any) return true;
  const matchDim = (declared: string[], actual: string | null | undefined): boolean => {
    if (declared.length === 0) return true;
    if (!actual) return false;
    return declared.some((d) => d === actual || actual.includes(d) || d.includes(actual));
  };
  return matchDim(scope.space, coord.space) && matchDim(scope.time, coord.time);
}

interface Coord2 {
  space?: string | null;
  time?: string | null;
}

// ─────────────────────────────────────────────────────────────
// 多体系等级
// ─────────────────────────────────────────────────────────────

/**
 * 规范化 paths。
 * 兼容单值写法：realm: 具名 + system: 归墟纪体系
 */
export function normalizePaths(fm: YamlObject): PathLevel[] {
  const out: PathLevel[] = [];
  const raw = fm.paths;
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        const o = item as YamlObject;
        const system = asString(o.system) ?? '';
        const tier = asString(o.tier) ?? '';
        if (system || tier) {
          out.push({ system: system || '默认', tier, order: asNumber(o.order) });
        }
      } else if (typeof item === 'string') {
        // "剑修::剑王" 简写
        const [system, tier] = item.split('::').map((s) => s.trim());
        if (system) out.push({ system, tier: tier ?? '', order: null });
      }
    }
  }
  if (out.length === 0) {
    const realm = asString(fm.realm) ?? asString(fm.tier) ?? asString(fm.level);
    const system = asString(fm.system) ?? asString(fm.path) ?? asString(fm.体系);
    if (realm) {
      out.push({ system: system ?? '默认', tier: realm, order: asNumber(fm.order) });
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────────
// 关系
// ─────────────────────────────────────────────────────────────

/**
 * 规范化 frontmatter 里的关系。
 * 支持三种写法（docs/02 第 3.2 节）：
 *   A: relations: [{to, kind, note, mutual}]
 *   B: relations: ["苏挽::情感"]
 *   C: relation: "苏挽::情感"
 */
export function normalizeRelations(fm: YamlObject): RawRelation[] {
  const out: RawRelation[] = [];

  const pushStr = (s: string) => {
    const parts = s.split('::').map((x) => x.trim());
    const to = parts[0] ?? '';
    if (!to) return;
    out.push({
      to,
      rawKind: parts[1] ?? '',
      note: parts[2] ?? null,
      mutual: true,
    });
  };

  const handleItem = (item: YamlValue) => {
    if (typeof item === 'string') { pushStr(item); return; }
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      const o = item as YamlObject;
      const to = asString(o.to) ?? asString(o.target) ?? asString(o.name) ?? '';
      if (!to) return;
      out.push({
        to,
        rawKind: asString(o.kind) ?? asString(o.type) ?? asString(o.label) ?? '',
        note: asString(o.note),
        mutual: o.mutual === false ? false : true,
      });
    }
  };

  const rel = fm.relations;
  if (Array.isArray(rel)) rel.forEach(handleItem);
  else if (rel !== undefined && rel !== null) handleItem(rel);

  const single = fm.relation;
  if (single !== undefined && single !== null) {
    if (Array.isArray(single)) single.forEach(handleItem);
    else handleItem(single);
  }

  return out;
}

/** 关系语义映射表（docs/02 第 3.3 节） */
const KIND_MAP: Array<[RegExp, string]> = [
  [/并行|共存|parallel|coexist/i, 'parallel'],
  [/串行|sequential|serial/i, 'sequential'],
  [/替代|取代|退化|replace|supersede/i, 'replace'],
  [/对立|敌对|互斥|oppose|hostile|conflict/i, 'oppose'],
  [/支撑|增强|support|boost/i, 'support'],
  [/依赖|需要|depend|require/i, 'depend'],
  [/同源|分化|cognate|origin/i, 'cognate'],
  [/侵蚀|污染|erode|corrupt/i, 'erode'],
  [/包含|属于|parent|contain|belong/i, 'contain'],
];

/** 作者原词 → 系统语义 */
export function mapRelationKind(rawKind: string): { kind: string; label: string } {
  const k = rawKind.trim();
  if (k === '') return { kind: 'point', label: '关联' };
  for (const [re, kind] of KIND_MAP) {
    if (re.test(k)) return { kind, label: k };
  }
  return { kind: 'point', label: k };
}

// ─────────────────────────────────────────────────────────────
// 主解析
// ─────────────────────────────────────────────────────────────

/**
 * 去掉正文开头的「# 标题」一级标题行，用于字数统计。
 * 标题就是标题本身，不属于"写的内容"——否则刚建的空条目也会因标题字而显示非 0 字数。
 */
function stripLeadingTitle(body: string, title: string): string {
  const lines = body.split('\n');
  let i = 0;
  while (i < lines.length && lines[i]!.trim() === '') i++;
  const line = lines[i];
  if (line !== undefined) {
    const m = /^#\s+(.*)$/.exec(line.trim());
    // 只有「# 标题」且内容与标题一致（或未提供标题校验）时才剥掉
    if (m && (!title || m[1]!.trim() === title.trim())) {
      return lines.slice(i + 1).join('\n');
    }
  }
  return body;
}

export interface ParseNoteOptions {
  path: string;
  mtime: number;
  size: number;
}

/** 解析一篇 Markdown 源文件为 ParsedNote */
export function parseNote(source: string, opts: ParseNoteOptions): ParsedNote {
  const path = normalizePath(opts.path);
  const { frontmatter: fmText, body } = splitFrontmatter(source);

  let fm: YamlObject = {};
  if (fmText !== null && fmText.trim() !== '') {
    try {
      fm = parseFrontmatter(fmText);
    } catch (err) {
      // frontmatter 坏了不能让整篇笔记读不出来
      fm = { __error: (err as Error).message };
    }
  }

  const parsed = parseBody(body);

  const folder = dirOf(path);
  const basename = basenameOf(path);

  const titleFromFm = asString(fm.title);
  const firstH1 = parsed.headings.find((h) => h.level === 1);
  const title = titleFromFm ?? firstH1?.text ?? basename;

  const type = asString(fm.type);

  const frontmatter: Frontmatter = {};
  for (const [k, v] of Object.entries(fm)) frontmatter[k] = toPropValue(v);

  return {
    path,
    basename,
    folder,
    title,
    type: type && type.trim() !== '' ? type.trim() : null,
    frontmatter,
    body,
    blocks: parsed.blocks,
    headings: parsed.headings,
    tags: parsed.tags,
    links: parsed.links,
    fields: parsed.fields,
    blockIds: parsed.blockIds,
    words: countWords(stripLeadingTitle(body, title)),
    mtime: opts.mtime,
    size: opts.size,
    scope: normalizeScope(fm.scope),
    paths: normalizePaths(fm),
    relations: normalizeRelations(fm),
    parent: asString(fm.parent),
  };
}

/** 笔记正文的纯文本（用于摘要与检索） */
export function notePlainText(note: ParsedNote): string {
  const parts: string[] = [];
  const walk = (blocks: typeof note.blocks) => {
    for (const b of blocks) {
      switch (b.type) {
        case 'heading':
        case 'paragraph':
        case 'quote':
          parts.push(inlineToText(b.inline));
          break;
        case 'list':
          for (const it of b.items) parts.push(inlineToText(it.inline));
          break;
        case 'callout':
          if (b.title) parts.push(b.title);
          walk(b.blocks);
          break;
        case 'table':
          parts.push(b.header.map(inlineToText).join(' '));
          for (const row of b.rows) parts.push(row.map(inlineToText).join(' '));
          break;
        case 'code':
          parts.push(b.code);
          break;
        case 'mathblock':
          parts.push(b.text);
          break;
      }
    }
  };
  walk(note.blocks);
  return parts.join('\n');
}

/** 生成摘要（前 N 字，去 markdown 标记） */
export function excerptOf(note: ParsedNote, max = 120): string {
  const text = notePlainText(note)
    .replace(/^#+\s*/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length <= max ? text : text.slice(0, max) + '…';
}

// ─────────────────────────────────────────────────────────────
// 类型定义解析（_type）
// ─────────────────────────────────────────────────────────────

const FIELD_TYPES = new Set(['text', 'number', 'boolean', 'date', 'ref', 'enum', 'tags', 'longtext']);
const VIEW_KINDS = new Set(['list', 'ladder', 'tree', 'graph', 'timeline', 'swimlane', 'table']);

export function parseTypeDef(note: ParsedNote): TypeDef | null {
  if (note.type !== '_type') return null;
  const fm = note.frontmatter as Record<string, PropValue>;
  const name = asString(fm.name as YamlValue) ?? note.basename;
  const label = asString(fm.label as YamlValue) ?? name;
  const color = asString(fm.color as YamlValue);
  const defaultViewRaw = asString(fm.defaultView as YamlValue);
  const group = asString(fm.group as YamlValue);
  const hidden = fm.hidden === true;

  const fields: FieldDef[] = [];
  const rawFields = fm.fields;
  if (Array.isArray(rawFields)) {
    for (const f of rawFields) {
      if (!f || typeof f !== 'object' || Array.isArray(f)) continue;
      const o = f as Record<string, PropValue>;
      const key = asString(o.key as YamlValue);
      if (!key) continue;
      const t = asString(o.type as YamlValue) ?? 'text';
      const ftype = FIELD_TYPES.has(t) ? (t as FieldDef['type']) : 'text';
      const def: FieldDef = {
        key,
        label: asString(o.label as YamlValue) ?? key,
        type: ftype,
        required: o.required === true,
      };
      const options = asStringArray(o.options as YamlValue);
      if (options.length) def.options = options;
      fields.push(def);
    }
  }

  return {
    name,
    label,
    color,
    defaultView:
      defaultViewRaw && VIEW_KINDS.has(defaultViewRaw) ? (defaultViewRaw as ViewKind) : null,
    group,
    hidden,
    fields,
    path: note.path,
    meta: true,
  };
}

// ─────────────────────────────────────────────────────────────
// 概念别名解析（_concept）
// ─────────────────────────────────────────────────────────────

export function parseConcept(note: ParsedNote): Concept | null {
  if (note.type !== '_concept') return null;
  const fm = note.frontmatter as Record<string, PropValue>;
  const name = asString(fm.name as YamlValue) ?? note.title;
  const description = asString(fm.description as YamlValue);
  const aliases: ConceptAlias[] = [];
  const raw = fm.aliases;
  const handle = (item: PropValue) => {
    if (typeof item === 'string') {
      aliases.push({ name: item, region: null, era: null, nature: null, conflict: false });
      return;
    }
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      const o = item as Record<string, PropValue>;
      const an = asString(o.name as YamlValue);
      if (!an) return;
      aliases.push({
        name: an,
        region: asString(o.region as YamlValue),
        era: asString(o.era as YamlValue),
        nature: asString(o.nature as YamlValue),
        conflict: o.conflict === true,
      });
    }
  };
  if (Array.isArray(raw)) raw.forEach(handle);
  else if (raw !== undefined && raw !== null) handle(raw);

  return { path: note.path, name, description, aliases };
}
