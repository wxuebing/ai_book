/**
 * 数据模型测试（docs/05 任务 1.22 ~ 1.30）
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseNote,
  normalizeScope,
  scopeMatches,
  normalizePaths,
  normalizeRelations,
  mapRelationKind,
  parseTypeDef,
  parseConcept,
} from '../src/note.ts';
import { buildRelations, buildConcepts, buildTypes, inferView, colorForType } from '../src/relations.ts';
import { LinkResolver } from '../src/vault.ts';
import { UNTYPED } from '../src/types.ts';
import type { ParsedNote } from '../src/types.ts';

const note = (path: string, src: string): ParsedNote =>
  parseNote(src, { path, mtime: Date.now(), size: src.length });

// ─────────────────────────────────────────────────────────────
// 1.24 / 1.25 作用域
// ─────────────────────────────────────────────────────────────

test('scope：未声明 = 全局生效', () => {
  const s = normalizeScope(undefined);
  assert.equal(s.any, true);
  assert.equal(scopeMatches(s, { space: '地球', time: '21世纪' }), true);
});

test('scope：简写只约束空间', () => {
  const s = normalizeScope('宇宙');
  assert.deepEqual(s.space, ['宇宙']);
  assert.deepEqual(s.time, []);
  assert.equal(s.any, false);
});

test('scope：对象写法空间+时间', () => {
  const s = normalizeScope({ space: '宇宙', time: '宇宙历' });
  assert.deepEqual(s.space, ['宇宙']);
  assert.deepEqual(s.time, ['宇宙历']);
});

test('scope：数组简写多空间', () => {
  const s = normalizeScope(['宇宙', '主世界']);
  assert.deepEqual(s.space, ['宇宙', '主世界']);
});

test('scope：都声明时须同时匹配', () => {
  const s = normalizeScope({ space: '宇宙', time: '宇宙历' });
  assert.equal(scopeMatches(s, { space: '宇宙', time: '宇宙历' }), true);
  assert.equal(scopeMatches(s, { space: '宇宙', time: '上古' }), false);
  assert.equal(scopeMatches(s, { space: '地球', time: '宇宙历' }), false);
});

test('scope：未声明维度不限', () => {
  const s = normalizeScope({ space: '地球' });
  assert.equal(scopeMatches(s, { space: '地球', time: '任意时代' }), true);
  assert.equal(scopeMatches(s, { space: '宇宙', time: '任意时代' }), false);
});

test('scope：包含匹配', () => {
  const s = normalizeScope({ space: '宇宙' });
  assert.equal(scopeMatches(s, { space: '宇宙·天外' }), true);
  assert.equal(scopeMatches(s, { space: '宇宙' }), true);
});

test('scope：当前坐标缺维度则不匹配已声明维度', () => {
  const s = normalizeScope({ space: '地球' });
  assert.equal(scopeMatches(s, {}), false);
});

// ─────────────────────────────────────────────────────────────
// 1.28 多体系等级
// ─────────────────────────────────────────────────────────────

test('paths：数组写法', () => {
  const p = normalizePaths({
    paths: [
      { system: '剑修', tier: '剑王' },
      { system: '炼体', tier: '铜皮' },
    ],
  } as never);
  assert.equal(p.length, 2);
  assert.equal(p[0]!.system, '剑修');
  assert.equal(p[1]!.tier, '铜皮');
});

test('paths：单值兼容 realm + system', () => {
  const p = normalizePaths({ realm: '具名', system: '归墟纪体系' } as never);
  assert.equal(p.length, 1);
  assert.equal(p[0]!.system, '归墟纪体系');
  assert.equal(p[0]!.tier, '具名');
});

test('paths：简写字符串 剑修::剑王', () => {
  const p = normalizePaths({ paths: ['剑修::剑王'] } as never);
  assert.equal(p[0]!.system, '剑修');
  assert.equal(p[0]!.tier, '剑王');
});

test('paths：无任何等级信息返回空', () => {
  assert.deepEqual(normalizePaths({} as never), []);
});

// ─────────────────────────────────────────────────────────────
// 1.26 关系语义映射
// ─────────────────────────────────────────────────────────────

test('关系语义：中文词映射到 10 种', () => {
  assert.equal(mapRelationKind('并行').kind, 'parallel');
  assert.equal(mapRelationKind('串行').kind, 'sequential');
  assert.equal(mapRelationKind('替代').kind, 'replace');
  assert.equal(mapRelationKind('对立').kind, 'oppose');
  assert.equal(mapRelationKind('支撑').kind, 'support');
  assert.equal(mapRelationKind('依赖').kind, 'depend');
  assert.equal(mapRelationKind('同源').kind, 'cognate');
  assert.equal(mapRelationKind('侵蚀').kind, 'erode');
  assert.equal(mapRelationKind('包含').kind, 'contain');
});

test('关系语义：英文词映射', () => {
  assert.equal(mapRelationKind('parallel').kind, 'parallel');
  assert.equal(mapRelationKind('OPPOSE').kind, 'oppose');
  assert.equal(mapRelationKind('depend').kind, 'depend');
});

test('关系语义：未知词归 point 但保留原词', () => {
  const r = mapRelationKind('师徒');
  assert.equal(r.kind, 'point');
  assert.equal(r.label, '师徒');
});

test('关系语义：空词归 point', () => {
  assert.equal(mapRelationKind('').kind, 'point');
});

// ─────────────────────────────────────────────────────────────
// 关系写法三种
// ─────────────────────────────────────────────────────────────

test('关系写法 A：对象数组', () => {
  const r = normalizeRelations({
    relations: [{ to: '苏挽', kind: '情感', note: '互为锚点', mutual: true }],
  } as never);
  assert.equal(r.length, 1);
  assert.equal(r[0]!.to, '苏挽');
  assert.equal(r[0]!.rawKind, '情感');
  assert.equal(r[0]!.mutual, true);
});

test('关系写法 B：简写字符串', () => {
  const r = normalizeRelations({ relations: ['苏挽::情感', '陆沉舟::师徒'] } as never);
  assert.equal(r.length, 2);
  assert.equal(r[0]!.to, '苏挽');
  assert.equal(r[0]!.rawKind, '情感');
});

test('关系写法 C：单条 relation', () => {
  const r = normalizeRelations({ relation: '苏挽::情感' } as never);
  assert.equal(r.length, 1);
  assert.equal(r[0]!.to, '苏挽');
});

test('关系：mutual 显式 false 保留', () => {
  const r = normalizeRelations({
    relations: [{ to: '阿箬', kind: '看守', mutual: false }],
  } as never);
  assert.equal(r[0]!.mutual, false);
});

// ─────────────────────────────────────────────────────────────
// 1.27 双向关系补齐
// ─────────────────────────────────────────────────────────────

test('双向关系：mutual 自动补反向', () => {
  const a = note('05-人物/沈砚.md', '---\ntype: 人物\nrelations:\n  - to: 苏挽\n    kind: 情感\n    mutual: true\n---\n# 沈砚');
  const b = note('05-人物/苏挽.md', '---\ntype: 人物\n---\n# 苏挽');
  const resolver = new LinkResolver([a, b]);
  const idx = buildRelations([a, b], resolver);

  const out = idx.out.get('05-人物/沈砚.md') ?? [];
  const rev = idx.out.get('05-人物/苏挽.md') ?? [];
  assert.equal(out.length, 1);
  assert.equal(out[0]!.origin, 'frontmatter');
  assert.equal(rev.length, 1);
  assert.equal(rev[0]!.origin, 'frontmatter-reverse');
  assert.equal(rev[0]!.target, '05-人物/沈砚.md');
});

test('双向关系：mutual false 不补反向', () => {
  const a = note('a.md', '---\nrelations:\n  - to: b\n    kind: 看守\n    mutual: false\n---\n');
  const b = note('b.md', '---\ntype: x\n---\n');
  const resolver = new LinkResolver([a, b]);
  const idx = buildRelations([a, b], resolver);
  assert.equal((idx.out.get('b.md') ?? []).length, 0);
});

// ─────────────────────────────────────────────────────────────
// 双链 / 断链 / parent
// ─────────────────────────────────────────────────────────────

test('双链：正文 [[链接]] 产生关系', () => {
  const a = note('03-章节/第1章.md', '罗峰踏入[[虚拟宇宙]]。');
  const b = note('06-设定/虚拟宇宙.md', '# 虚拟宇宙');
  const resolver = new LinkResolver([a, b]);
  const idx = buildRelations([a, b], resolver);
  const rels = idx.out.get('03-章节/第1章.md') ?? [];
  assert.equal(rels.length, 1);
  assert.equal(rels[0]!.origin, 'wikilink');
  assert.equal(rels[0]!.target, '06-设定/虚拟宇宙.md');
});

test('断链：指向不存在笔记进入 broken', () => {
  const a = note('a.md', '看[[不存在]]');
  const resolver = new LinkResolver([a]);
  const idx = buildRelations([a], resolver);
  assert.equal(idx.broken.length, 1);
  assert.equal(idx.broken[0]!.target, null);
  assert.equal(idx.broken[0]!.targetRaw, '不存在');
});

test('parent：产生 contain 关系', () => {
  const a = note('06-设定/具名.md', '---\nparent: 境界体系\n---\n');
  const b = note('06-设定/境界体系.md', '---\ntype: 修炼体系\n---\n');
  const resolver = new LinkResolver([a, b]);
  const idx = buildRelations([a, b], resolver);
  const rels = idx.out.get('06-设定/具名.md') ?? [];
  const contain = rels.find((r) => r.kind === 'contain');
  assert.ok(contain);
  assert.equal(contain!.origin, 'parent');
});

test('嵌入不算关系', () => {
  const a = note('a.md', '![[图片.png]]');
  const b = note('图片.png.md', '# 图');
  const resolver = new LinkResolver([a, b]);
  const idx = buildRelations([a, b], resolver);
  assert.equal((idx.out.get('a.md') ?? []).length, 0);
});

test('自引用不计关系', () => {
  const a = note('a.md', '看[[a]]');
  const resolver = new LinkResolver([a]);
  const idx = buildRelations([a], resolver);
  assert.equal((idx.out.get('a.md') ?? []).length, 0);
});

// ─────────────────────────────────────────────────────────────
// 1.13 链接解析优先级
// ─────────────────────────────────────────────────────────────

test('链接解析：文件名精确', () => {
  const r = new LinkResolver([note('05-人物/沈砚.md', '# 沈砚')]);
  assert.equal(r.resolve('沈砚', 'x.md'), '05-人物/沈砚.md');
});

test('链接解析：全路径优先', () => {
  const r = new LinkResolver([
    note('05-人物/沈砚.md', '# 沈砚'),
    note('08-共享/沈砚.md', '# 沈砚'),
  ]);
  assert.equal(r.resolve('08-共享/沈砚', 'x.md'), '08-共享/沈砚.md');
});

test('链接解析：同名取层级最浅', () => {
  const r = new LinkResolver([
    note('a/b/c/沈砚.md', '# 沈砚'),
    note('沈砚.md', '# 沈砚'),
  ]);
  assert.equal(r.resolve('沈砚', 'x.md'), '沈砚.md');
});

test('链接解析：相对当前目录', () => {
  const r = new LinkResolver([
    note('05-人物/沈砚.md', '# 沈砚'),
    note('08-共享/沈砚.md', '# 沈砚'),
  ]);
  assert.equal(r.resolve('沈砚', '05-人物/其他.md'), '05-人物/沈砚.md');
});

test('链接解析：带 .md 后缀也能命中', () => {
  const r = new LinkResolver([note('05-人物/沈砚.md', '# 沈砚')]);
  assert.equal(r.resolve('沈砚.md', 'x.md'), '05-人物/沈砚.md');
});

test('链接解析：无匹配返回 null', () => {
  const r = new LinkResolver([note('a.md', '# A')]);
  assert.equal(r.resolve('不存在', 'a.md'), null);
});

// ─────────────────────────────────────────────────────────────
// 1.22 类型定义
// ─────────────────────────────────────────────────────────────

const typeNote = () => note('07-类型/境界.md', [
  '---',
  'type: _type',
  'name: 境界',
  'label: 境界',
  'color: "#4E9CA8"',
  'defaultView: ladder',
  'group: 设定',
  'fields:',
  '  - key: order',
  '    label: 阶数',
  '    type: number',
  '    required: true',
  '  - key: parent',
  '    label: 所属体系',
  '    type: ref',
  '  - key: kind',
  '    label: 类别',
  '    type: enum',
  '    options: [正道, 邪道]',
  '---',
  '# 境界',
].join('\n'));

test('_type：解析类型定义', () => {
  const d = parseTypeDef(typeNote());
  assert.ok(d);
  assert.equal(d!.name, '境界');
  assert.equal(d!.color, '#4E9CA8');
  assert.equal(d!.defaultView, 'ladder');
  assert.equal(d!.group, '设定');
  assert.equal(d!.fields.length, 3);
  assert.equal(d!.fields[0]!.type, 'number');
  assert.equal(d!.fields[0]!.required, true);
  assert.deepEqual(d!.fields[2]!.options, ['正道', '邪道']);
});

test('_type：非 _type 笔记返回 null', () => {
  assert.equal(parseTypeDef(note('a.md', '---\ntype: 人物\n---\n')), null);
});

test('_type：非法 view 回落 null', () => {
  const n = note('07-类型/x.md', '---\ntype: _type\nname: X\ndefaultView: 瞎写\n---\n');
  assert.equal(parseTypeDef(n)!.defaultView, null);
});

// ─────────────────────────────────────────────────────────────
// 1.23 概念别名
// ─────────────────────────────────────────────────────────────

const conceptNote = () => note('06-设定/天地本源之力.md', [
  '---',
  'type: _concept',
  'name: 天地本源之力',
  'description: 世界的底层能量',
  'aliases:',
  '  - name: 灵气',
  '    region: 东域',
  '    nature: 温和，可吸纳',
  '  - name: 源力',
  '    region: 西荒',
  '    nature: 暴烈，需炼化',
  '    conflict: true',
  '  - name: 星尘',
  '    region: 天外',
  '---',
].join('\n'));

test('_concept：解析别名', () => {
  const c = parseConcept(conceptNote());
  assert.ok(c);
  assert.equal(c!.name, '天地本源之力');
  assert.equal(c!.aliases.length, 3);
  assert.equal(c!.aliases[0]!.name, '灵气');
  assert.equal(c!.aliases[1]!.conflict, true);
  assert.equal(c!.aliases[2]!.region, '天外');
});

test('_concept：别名索引可反查概念', () => {
  const idx = buildConcepts([conceptNote()]);
  assert.equal(idx.concepts.length, 1);
  assert.equal(idx.byAlias.get('灵气')!.name, '天地本源之力');
  assert.equal(idx.byAlias.get('源力')!.name, '天地本源之力');
});

test('_concept：字符串简写别名', () => {
  const n = note('c.md', '---\ntype: _concept\nname: X\naliases: [A, B]\n---\n');
  const c = parseConcept(n);
  assert.equal(c!.aliases.length, 2);
  assert.equal(c!.aliases[0]!.name, 'A');
});

// ─────────────────────────────────────────────────────────────
// 1.29 无类型实体
// ─────────────────────────────────────────────────────────────

test('无类型实体：不报错，type 为 null', () => {
  const n = note('06-设定/虚拟宇宙.md', '# 虚拟宇宙\n\n罗峰踏入这里时，物理规则失效。');
  assert.equal(n.type, null);
  assert.equal(n.title, '虚拟宇宙');
});

test('无类型实体：归入未归类分组', () => {
  const notes = [
    note('a.md', '# A'),
    note('b.md', '---\ntype: 人物\n---\n# B'),
  ];
  const counts = new Map<string, number>();
  for (const n of notes) counts.set(n.type ?? UNTYPED, (counts.get(n.type ?? UNTYPED) ?? 0) + 1);
  assert.equal(counts.get(UNTYPED), 1);
  assert.equal(counts.get('人物'), 1);
});

// ─────────────────────────────────────────────────────────────
// 1.30 视图推断
// ─────────────────────────────────────────────────────────────

test('视图推断：类型定义显式指定优先', () => {
  const def = parseTypeDef(typeNote())!;
  const notes = [note('06-设定/具名.md', '---\ntype: 境界\norder: 3\n---\n')];
  assert.equal(inferView('境界', def, notes), 'ladder');
});

test('视图推断：有 order 字段 → ladder', () => {
  const notes = [
    note('a.md', '---\ntype: X\norder: 1\n---\n'),
    note('b.md', '---\ntype: X\norder: 2\n---\n'),
  ];
  assert.equal(inferView('X', undefined, notes), 'ladder');
});

test('视图推断：有 parent → tree', () => {
  const notes = [
    note('a.md', '---\ntype: X\nparent: 根\n---\n'),
    note('b.md', '---\ntype: X\nparent: 根\n---\n'),
  ];
  assert.equal(inferView('X', undefined, notes), 'tree');
});

test('视图推断：有 date → timeline', () => {
  const notes = [
    note('a.md', '---\ntype: X\ndate: 2020-01-01\n---\n'),
    note('b.md', '---\ntype: X\ndate: 2021-01-01\n---\n'),
  ];
  assert.equal(inferView('X', undefined, notes), 'timeline');
});

test('视图推断：兜底 list', () => {
  const notes = [note('a.md', '---\ntype: X\n---\n')];
  assert.equal(inferView('X', undefined, notes), 'list');
});

test('视图推断：空类型返回 list', () => {
  assert.equal(inferView('空', undefined, []), 'list');
});

// ─────────────────────────────────────────────────────────────
// 类型色稳定性（docs/04 第 2.4 节）
// ─────────────────────────────────────────────────────────────

test('类型色：同名永远同色', () => {
  assert.equal(colorForType('人物'), colorForType('人物'));
  assert.match(colorForType('人物'), /^#[0-9A-F]{6}$/i);
});

test('类型色：不同名大概率不同色', () => {
  const a = colorForType('人物');
  const b = colorForType('境界');
  assert.notEqual(a, b);
});

// ─────────────────────────────────────────────────────────────
// 类型索引
// ─────────────────────────────────────────────────────────────

test('类型索引：收集全部 _type', () => {
  const idx = buildTypes([
    typeNote(),
    note('07-类型/人物.md', '---\ntype: _type\nname: 人物\n---\n'),
    note('a.md', '---\ntype: 人物\n---\n'),
  ]);
  assert.equal(idx.list.length, 2);
  assert.ok(idx.defs.has('境界'));
  assert.ok(idx.defs.has('人物'));
});
