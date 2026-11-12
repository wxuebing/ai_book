/**
 * YAML 解析测试（docs/05 任务 1.4 / 1.5）
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseYaml, parseFrontmatter, stringifyYaml, parseInline } from '../src/yaml.ts';

test('标量：字符串 / 数字 / 布尔 / null', () => {
  const y = parseYaml([
    'title: 沈砚',
    'age: 27',
    'alive: true',
    'dead: false',
    'nothing: null',
    'tilde: ~',
    'empty:',
  ].join('\n')) as Record<string, unknown>;
  assert.equal(y.title, '沈砚');
  assert.equal(y.age, 27);
  assert.equal(y.alive, true);
  assert.equal(y.dead, false);
  assert.equal(y.nothing, null);
  assert.equal(y.tilde, null);
  assert.equal(y.empty, null);
});

test('引号：单引号转义 / 双引号转义', () => {
  const y = parseYaml([
    `a: 'it''s here'`,
    `b: "line1\\nline2"`,
    `c: "tab\\there"`,
    `d: "quote\\"inside"`,
  ].join('\n')) as Record<string, unknown>;
  assert.equal(y.a, "it's here");
  assert.equal(y.b, 'line1\nline2');
  assert.equal(y.c, 'tab\there');
  assert.equal(y.d, 'quote"inside');
});

test('数字形态的字符串不会被误判为数字', () => {
  const y = parseYaml([
    `version: "1.0"`,
    `num: 1.0`,
    `neg: -5`,
    `exp: 1e3`,
  ].join('\n')) as Record<string, unknown>;
  assert.equal(y.version, '1.0');
  assert.equal(y.num, 1);
  assert.equal(y.neg, -5);
  assert.equal(y.exp, 1000);
});

test('块式数组', () => {
  const y = parseYaml([
    'tags:',
    '  - 主角',
    '  - 剑修',
    '  - 云隐宗',
  ].join('\n')) as Record<string, unknown>;
  assert.deepEqual(y.tags, ['主角', '剑修', '云隐宗']);
});

test('流式数组 / 流式对象', () => {
  const y = parseYaml([
    'tags: [主角, 剑修, "云隐宗"]',
    'meta: {a: 1, b: "x", c: [1, 2]}',
  ].join('\n')) as Record<string, unknown>;
  assert.deepEqual(y.tags, ['主角', '剑修', '云隐宗']);
  assert.deepEqual(y.meta, { a: 1, b: 'x', c: [1, 2] });
});

test('嵌套对象', () => {
  const y = parseYaml([
    'scope:',
    '  space: 宇宙',
    '  time: 宇宙历',
    'power:',
    '  level: 9',
    '  desc: 强',
  ].join('\n')) as Record<string, unknown>;
  assert.deepEqual(y.scope, { space: '宇宙', time: '宇宙历' });
  assert.deepEqual(y.power, { level: 9, desc: '强' });
});

test('对象数组（relations 写法 A）', () => {
  const y = parseYaml([
    'relations:',
    '  - to: 苏挽',
    '    kind: 情感',
    '    note: 互为锚点',
    '    mutual: true',
    '  - to: 陆沉舟',
    '    kind: 师徒',
  ].join('\n')) as Record<string, unknown>;
  assert.deepEqual(y.relations, [
    { to: '苏挽', kind: '情感', note: '互为锚点', mutual: true },
    { to: '陆沉舟', kind: '师徒' },
  ]);
});

test('块标量：| 保留换行，>- 折叠', () => {
  const y = parseYaml([
    'literal: |',
    '  第一行',
    '  第二行',
    'stripped: |-',
    '  第一行',
    '  第二行',
    'folded: >-',
    '  这 是',
    '  一段 话',
  ].join('\n')) as Record<string, unknown>;
  // clip（默认）：保留单个结尾换行
  assert.equal(y.literal, '第一行\n第二行\n');
  // strip（-）：去掉全部结尾换行
  assert.equal(y.stripped, '第一行\n第二行');
  // 折叠：单换行变空格
  assert.equal(y.folded, '这 是 一段 话');
});

test('注释：整行与行尾', () => {
  const y = parseYaml([
    '# 这是注释',
    'title: 沈砚  # 行尾注释',
    'age: 27',
  ].join('\n')) as Record<string, unknown>;
  assert.equal(y.title, '沈砚');
  assert.equal(y.age, 27);
  assert.equal(Object.keys(y).length, 2);
});

test('含冒号的值不被截断（URL / 时间）', () => {
  const y = parseYaml([
    'url: https://example.com/a',
    'time: 12:30',
    'note: 他说：你好',
  ].join('\n')) as Record<string, unknown>;
  assert.equal(y.url, 'https://example.com/a');
  assert.equal(y.time, '12:30');
  assert.equal(y.note, '他说：你好');
});

test('跨行流式集合', () => {
  const y = parseYaml([
    'tags: [主角,',
    '  剑修,',
    '  云隐宗]',
  ].join('\n')) as Record<string, unknown>;
  assert.deepEqual(y.tags, ['主角', '剑修', '云隐宗']);
});

test('往返不失真（任务 1.5）', () => {
  const original = {
    type: '人物',
    title: '沈砚',
    age: 27,
    alive: true,
    tags: ['主角', '剑修'],
    scope: { space: '东域', time: '当今' },
    relations: [
      { to: '苏挽', kind: '情感', mutual: true },
    ],
    desc: '第一行\n第二行',
    note: null,
  };
  const text = stringifyYaml(original as never);
  const back = parseYaml(text);
  assert.deepEqual(back, original);
});

test('parseFrontmatter 拒绝数组顶层', () => {
  assert.throws(() => parseFrontmatter('- a\n- b'), /必须是键值映射/);
});

test('空 frontmatter 返回空对象', () => {
  assert.deepEqual(parseFrontmatter(''), {});
  assert.deepEqual(parseFrontmatter('\n\n'), {});
});

test('parseInline 直接解析值', () => {
  assert.equal(parseInline('27'), 27);
  assert.equal(parseInline('"27"'), '27');
  assert.deepEqual(parseInline('[a, b]'), ['a', 'b']);
  assert.deepEqual(parseInline('{k: v}'), { k: 'v' });
});
