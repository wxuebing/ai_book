/**
 * Markdown 解析测试（docs/05 任务 1.6 ~ 1.10）
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseInline,
  parseBody,
  splitFrontmatter,
  countWords,
  slugify,
  stripComments,
} from '../src/markdown.ts';
import type { InlineToken, Block } from '../src/types.ts';

const wikilinks = (t: InlineToken[]) => t.filter((x) => x.type === 'wikilink');

// ─────────────────────────────────────────────────────────────
// 1.6 wikilink 五种写法
// ─────────────────────────────────────────────────────────────

test('wikilink：[[a]] 基本形式', () => {
  const t = parseInline('罗峰踏入[[虚拟宇宙]]');
  const w = wikilinks(t);
  assert.equal(w.length, 1);
  assert.equal((w[0] as never as { target: string }).target, '虚拟宇宙');
  assert.equal((w[0] as never as { embed: boolean }).embed, false);
});

test('wikilink：[[a|b]] 别名', () => {
  const w = wikilinks(parseInline('[[归墟纪|那本书]]'));
  assert.equal((w[0] as never as { target: string }).target, '归墟纪');
  assert.equal((w[0] as never as { alias: string }).alias, '那本书');
});

test('wikilink：[[a#h]] 标题锚点', () => {
  const w = wikilinks(parseInline('[[沈砚#外貌]]'));
  assert.equal((w[0] as never as { subpath: string }).subpath, '外貌');
  assert.equal((w[0] as never as { subType: string }).subType, 'heading');
});

test('wikilink：[[a#^b]] 块锚点', () => {
  const w = wikilinks(parseInline('[[沈砚#^abc123]]'));
  assert.equal((w[0] as never as { subpath: string }).subpath, '^abc123');
  assert.equal((w[0] as never as { subType: string }).subType, 'block');
});

test('wikilink：![[a]] 嵌入', () => {
  const w = wikilinks(parseInline('![[沈砚]]'));
  assert.equal((w[0] as never as { embed: boolean }).embed, true);
});

test('wikilink：嵌入 + 别名组合', () => {
  const w = wikilinks(parseInline('![[笔记|显示名]]'));
  assert.equal(w.length, 1);
  assert.equal((w[0] as never as { embed: boolean }).embed, true);
  assert.equal((w[0] as never as { alias: string }).alias, '显示名');
});

// ─────────────────────────────────────────────────────────────
// 1.7 行内元素
// ─────────────────────────────────────────────────────────────

test('行内：粗体 / 斜体 / 删除线 / 高亮 / 代码', () => {
  const t = parseInline('**粗** *斜* ~~删~~ ==高== `码`');
  const types = t.map((x) => x.type);
  assert.ok(types.includes('strong'));
  assert.ok(types.includes('em'));
  assert.ok(types.includes('del'));
  assert.ok(types.includes('mark'));
  assert.ok(types.includes('code'));
});

test('行内：公式 $x$ 与 $$x$$', () => {
  const t = parseInline('$a+b$ 和 $$c+d$$');
  const math = t.filter((x) => x.type === 'math');
  assert.equal(math.length, 2);
  assert.equal((math[0] as never as { text: string }).text, 'a+b');
  assert.equal((math[1] as never as { text: string }).text, 'c+d');
});

test('行内：标签 #tag', () => {
  const t = parseInline('这是 #主角 和 #支线/复仇');
  const tags = t.filter((x) => x.type === 'tag');
  assert.equal(tags.length, 2);
  assert.equal((tags[0] as never as { tag: string }).tag, '主角');
  assert.equal((tags[1] as never as { tag: string }).tag, '支线/复仇');
});

test('行内：# 在词中间不算标签', () => {
  const t = parseInline('C#语言');
  assert.equal(t.filter((x) => x.type === 'tag').length, 0);
});

test('行内：内联字段两种写法', () => {
  const t = parseInline('年龄:: 27');
  const f = t.filter((x) => x.type === 'inlinefield');
  assert.equal(f.length, 1);
  assert.equal((f[0] as never as { key: string }).key, '年龄');
  assert.equal((f[0] as never as { value: string }).value, '27');

  const t2 = parseInline('[faction:: 云隐宗]');
  const f2 = t2.filter((x) => x.type === 'inlinefield');
  assert.equal(f2.length, 1);
  assert.equal((f2[0] as never as { key: string }).key, 'faction');
});

test('行内：URL 里的 :// 不被当作内联字段', () => {
  const t = parseInline('见 https://example.com 页面');
  assert.equal(t.filter((x) => x.type === 'inlinefield').length, 0);
});

test('行内：markdown 链接', () => {
  const t = parseInline('看[这里](https://a.com)');
  const m = t.filter((x) => x.type === 'mdlink');
  assert.equal(m.length, 1);
  assert.equal((m[0] as never as { href: string }).href, 'https://a.com');
});

// ─────────────────────────────────────────────────────────────
// 1.8 块级元素
// ─────────────────────────────────────────────────────────────

const blocksOf = (src: string): Block[] => parseBody(src).blocks;

test('块级：标题层级', () => {
  const b = blocksOf('# 一\n## 二\n### 三');
  assert.equal(b.length, 3);
  assert.equal((b[0] as never as { level: number }).level, 1);
  assert.equal((b[2] as never as { level: number }).level, 3);
});

test('块级：段落', () => {
  const b = blocksOf('第一段\n第二行\n\n另一段');
  assert.equal(b.length, 2);
  assert.equal(b[0]!.type, 'paragraph');
});

test('块级：无序 / 有序列表', () => {
  const b = blocksOf('- a\n- b\n\n1. x\n2. y');
  assert.equal(b[0]!.type, 'list');
  assert.equal((b[0] as never as { ordered: boolean }).ordered, false);
  assert.equal((b[1] as never as { ordered: boolean }).ordered, true);
});

test('块级：任务列表三种状态', () => {
  const b = blocksOf('- [ ] 未完成\n- [x] 已完成\n- [/] 进行中');
  const items = (b[0] as never as { items: Array<{ task: string | null }> }).items;
  assert.equal(items[0]!.task, ' ');
  assert.equal(items[1]!.task, 'x');
  assert.equal(items[2]!.task, '/');
});

test('块级：引用', () => {
  const b = blocksOf('> 一句引文');
  assert.equal(b[0]!.type, 'quote');
});

test('块级：callout 含标题与折叠', () => {
  const b = blocksOf('> [!clue]- 伏笔提醒\n> 这里埋了东西');
  assert.equal(b[0]!.type, 'callout');
  const co = b[0] as never as { kind: string; fold: string; title: string; blocks: Block[] };
  assert.equal(co.kind, 'clue');
  assert.equal(co.fold, 'closed');
  assert.equal(co.title, '伏笔提醒');
  assert.equal(co.blocks.length, 1);
});

test('块级：表格含对齐', () => {
  const b = blocksOf('| 名 | 阶 |\n|:---|---:|\n| 具名 | 3 |\n| 显名 | 4 |');
  assert.equal(b[0]!.type, 'table');
  const tb = b[0] as never as {
    align: Array<string | null>;
    header: InlineToken[][];
    rows: InlineToken[][][];
  };
  assert.deepEqual(tb.align, ['left', 'right']);
  assert.equal(tb.header.length, 2);
  assert.equal(tb.rows.length, 2);
});

test('块级：代码块含语言', () => {
  const b = blocksOf('```ts\nconst a = 1;\n```');
  assert.equal(b[0]!.type, 'code');
  const c = b[0] as never as { lang: string; code: string };
  assert.equal(c.lang, 'ts');
  assert.equal(c.code, 'const a = 1;');
});

test('块级：分隔线三种写法', () => {
  assert.equal(blocksOf('---').filter((x) => x.type === 'hr').length, 1);
  assert.equal(blocksOf('***').filter((x) => x.type === 'hr').length, 1);
  assert.equal(blocksOf('___').filter((x) => x.type === 'hr').length, 1);
});

test('块级：块公式', () => {
  const b = blocksOf('$$\na + b\n$$');
  assert.equal(b[0]!.type, 'mathblock');
  assert.equal((b[0] as never as { text: string }).text, 'a + b');
});

test('块级：代码块内的 markdown 不被解析', () => {
  const r = parseBody('```\n# 这不是标题\n[[也不是链接]]\n```');
  assert.equal(r.blocks.length, 1);
  assert.equal(r.blocks[0]!.type, 'code');
  assert.equal(r.links.length, 0);
});

// ─────────────────────────────────────────────────────────────
// 1.9 块 ID 与标题锚点
// ─────────────────────────────────────────────────────────────

test('块 ID：段落末尾 ^abc123', () => {
  const r = parseBody('这段有 ID ^abc123');
  const p = r.blocks[0] as never as { blockId: string | null };
  assert.equal(p.blockId, 'abc123');
  assert.ok(r.blockIds.includes('abc123'));
});

test('块 ID：标题锚点可定位', () => {
  const r = parseBody('## 外貌 ^head01');
  const h = r.blocks[0] as never as { id: string; blockId: string | null };
  assert.equal(h.blockId, 'head01');
  assert.equal(h.id, '外貌');
});

test('标题锚点：中文 slug 保留', () => {
  assert.equal(slugify('沈砚的外貌'), '沈砚的外貌');
  assert.equal(slugify('A B'), 'a-b');
});

// ─────────────────────────────────────────────────────────────
// 1.10 注释剥离
// ─────────────────────────────────────────────────────────────

test('注释：%%...%% 不参与索引', () => {
  // 注释替换为等宽空格（%%隐藏%% = 6 字符），避免前后文粘连
  assert.equal(stripComments('前%%隐藏%%后'), '前      后');
  const r = parseBody('可见%%[[隐藏链接]]%%内容');
  assert.equal(r.links.length, 0);
});

test('注释：跨行注释', () => {
  const r = parseBody('前\n%%\n[[隐藏]]\n%%\n后');
  assert.equal(r.links.length, 0);
});

// ─────────────────────────────────────────────────────────────
// frontmatter 拆分
// ─────────────────────────────────────────────────────────────

test('frontmatter：正常拆分', () => {
  const s = splitFrontmatter('---\ntype: 人物\n---\n\n# 沈砚');
  assert.equal(s.frontmatter, 'type: 人物');
  assert.equal(s.body.trim(), '# 沈砚');
});

test('frontmatter：无 frontmatter', () => {
  const s = splitFrontmatter('# 标题\n正文');
  assert.equal(s.frontmatter, null);
  assert.equal(s.body, '# 标题\n正文');
});

test('frontmatter：未闭合时整篇当正文', () => {
  const s = splitFrontmatter('---\ntype: 人物\n没有结束');
  assert.equal(s.frontmatter, null);
});

test('frontmatter：BOM 与 CRLF 容错', () => {
  const s = splitFrontmatter('\uFEFF---\r\na: 1\r\n---\r\n正文');
  assert.equal(s.frontmatter?.trim(), 'a: 1');
  assert.equal(s.body.trim(), '正文');
});

// ─────────────────────────────────────────────────────────────
// 字数
// ─────────────────────────────────────────────────────────────

test('字数：中文按字算', () => {
  assert.equal(countWords('一二三四五'), 5);
});

test('字数：中英混排', () => {
  assert.equal(countWords('你好 world test'), 4); // 2 汉字 + 2 单词
});

test('字数：空与标点', () => {
  assert.equal(countWords(''), 0);
  assert.equal(countWords('。，、'), 0);
});
