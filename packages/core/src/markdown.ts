/**
 * Obsidian 风格 Markdown 解析
 *
 * 依据：docs/03-接口契约.md 第 8 章
 * 输出结构化 blocks（不是 HTML）——前端渲染 React 组件，天然防 XSS。
 *
 * 支持语法：
 *   [[双链]] [[笔记|别名]] [[笔记#标题]] [[笔记#^块ID]] ![[嵌入]]
 *   #标签   key:: value   [key:: value]   %%注释%%
 *   > [!clue] 标题        - [ ] / - [x] / - [/
 *   |表格|   ```lang   $公式$ / $$块公式$$
 *   粗体 / 斜体 / 删除线 / 高亮 / 行内代码 / 分隔线 / 引用 / 列表
 */

import type { Block, InlineToken, ListItem, Heading, RawLink, InlineField } from './types.ts';

// ─────────────────────────────────────────────────────────────
// 公共工具
// ─────────────────────────────────────────────────────────────

/** 中文友好的字数统计：CJK 按字，其他按空白分词 */
export function countWords(text: string): number {
  if (!text) return 0;
  const cjk = text.match(/[\u3400-\u4dbf\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/g);
  const cjkCount = cjk ? cjk.length : 0;
  const rest = text.replace(/[\u3400-\u4dbf\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/g, ' ');
  const latin = rest.split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).length;
  return cjkCount + latin;
}

/** 标题 → 锚点 slug（保留中文，空格转 -，去掉标点） */
export function slugify(text: string): string {
  return text
    .trim()
    .replace(/[`*_~[\]()#>|]/g, '')
    .replace(/[：:，,。.、；;！!？?（）()「」『』【】《》""'']/g, '')
    .replace(/\s+/g, '-')
    .toLowerCase();
}

// ─────────────────────────────────────────────────────────────
// 注释剥离
// ─────────────────────────────────────────────────────────────

/**
 * 去掉 %%注释%%（可跨行）。
 * 替换为等宽空格而不是删掉 —— 否则「前%%隐藏%%后」会粘成「前后」，
 * 破坏分词与文本相邻关系。
 */
export function stripComments(src: string): string {
  return src.replace(/%%[\s\S]*?%%/g, (m) => m.replace(/[^\n]/g, ' '));
}

// ─────────────────────────────────────────────────────────────
// 行内解析
// ─────────────────────────────────────────────────────────────

interface InlinePattern {
  type: string;
  re: RegExp;
  build: (m: RegExpExecArray) => InlineToken | null;
}

const WIKILINK_RE = /(!?)\[\[([^\]\n|#]+)(?:#([^\]\n|]+))?(?:\|([^\]\n]+))?\]\]/;

/** 行内解析器：单遍扫描，优先级由 PATTERNS 顺序决定 */
export function parseInline(text: string): InlineToken[] {
  const out: InlineToken[] = [];
  let buf = '';
  let i = 0;

  const flush = () => {
    if (buf) {
      out.push({ type: 'text', text: buf });
      buf = '';
    }
  };

  while (i < text.length) {
    const rest = text.slice(i);

    // 1. wikilink / 嵌入
    if (rest.startsWith('[[') || rest.startsWith('![[')) {
      const m = WIKILINK_RE.exec(rest);
      if (m && m.index === 0) {
        flush();
        const embed = m[1] === '!';
        const target = m[2]!.trim();
        const sub = m[3] ? m[3].trim() : null;
        const alias = m[4] ? m[4].trim() : null;
        let subType: 'heading' | 'block' | null = null;
        if (sub) subType = sub.startsWith('^') ? 'block' : 'heading';
        out.push({
          type: 'wikilink',
          target,
          targetPath: null, // 由 vault 层回填
          alias,
          subpath: sub,
          subType,
          embed,
          self: false,
        });
        i += m[0].length;
        continue;
      }
    }

    // 2. 行内代码（最高优先级，内部不解析任何语法）
    if (rest.startsWith('`')) {
      const m = /^(`+)([\s\S]*?)\1(?!`)/.exec(rest);
      if (m) {
        flush();
        out.push({ type: 'code', text: m[2]! });
        i += m[0].length;
        continue;
      }
    }

    // 3. 行内公式
    if (rest.startsWith('$$')) {
      const m = /^\$\$([\s\S]*?)\$\$/.exec(rest);
      if (m) {
        flush();
        out.push({ type: 'math', text: m[1]! });
        i += m[0].length;
        continue;
      }
    }
    if (rest.startsWith('$')) {
      const m = /^\$([^$\n]+)\$/.exec(rest);
      if (m) {
        flush();
        out.push({ type: 'math', text: m[1]! });
        i += m[0].length;
        continue;
      }
    }

    // 4. 高亮 / 粗体 / 斜体 / 删除线
    if (rest.startsWith('==')) {
      const m = /^==([^=\n]+)==/.exec(rest);
      if (m) {
        flush();
        out.push({ type: 'mark', text: m[1]! });
        i += m[0].length;
        continue;
      }
    }
    if (rest.startsWith('**') || rest.startsWith('__')) {
      const m = /^(\*\*|__)([\s\S]+?)\1/.exec(rest);
      if (m && m[2]!.trim() !== '') {
        flush();
        out.push({ type: 'strong', text: m[2]! });
        i += m[0].length;
        continue;
      }
    }
    if (rest.startsWith('~~')) {
      const m = /^~~([\s\S]+?)~~/.exec(rest);
      if (m) {
        flush();
        out.push({ type: 'del', text: m[1]! });
        i += m[0].length;
        continue;
      }
    }
    if (rest.startsWith('*') || rest.startsWith('_')) {
      const m = /^(\*|_)([^\s*_][\s\S]*?)\1/.exec(rest);
      if (m && !/^\s/.test(m[2]!)) {
        flush();
        out.push({ type: 'em', text: m[2]! });
        i += m[0].length;
        continue;
      }
    }

    // 5. Markdown 图片 ![alt](url)
    if (rest.startsWith('![')) {
      const m = /^!\[([^\]\n]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/.exec(rest);
      if (m) {
        flush();
        out.push({ type: 'image', alt: m[1]!, href: m[2]! });
        i += m[0].length;
        continue;
      }
    }

    // 6. Markdown 链接
    if (rest.startsWith('[')) {
      const m = /^\[([^\]\n]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/.exec(rest);
      if (m) {
        flush();
        out.push({ type: 'mdlink', text: m[1]!, href: m[2]! });
        i += m[0].length;
        continue;
      }
      // 6. 方括号内联字段 [key:: value]
      const f = /^\[([^\[\]:\n]+)::\s*([^\]\n]*)\]/.exec(rest);
      if (f) {
        flush();
        out.push({ type: 'inlinefield', key: f[1]!.trim(), value: f[2]!.trim() });
        i += f[0].length;
        continue;
      }
    }

    // 7. 标签（前面必须是行首或空白）
    if (rest.startsWith('#') && (i === 0 || /\s/.test(text[i - 1]!))) {
      const m = /^#([\p{L}\p{N}_/-]+)/u.exec(rest);
      if (m) {
        flush();
        out.push({ type: 'tag', tag: m[1]! });
        i += m[0].length;
        continue;
      }
    }

    // 8. 行内字段 key:: value（前面必须是行首或空白，避免吃掉 URL 的 ://）
    if (i === 0 || /\s/.test(text[i - 1]!)) {
      const m = /^([\p{L}\p{N}_-]+)::[ \t]*([^\n]*?)(?=\s+[\p{L}\p{N}_-]+::|$)/u.exec(rest);
      if (m && m[2]!.trim() !== '') {
        flush();
        out.push({ type: 'inlinefield', key: m[1]!, value: m[2]!.trim() });
        i += m[0].length;
        continue;
      }
    }

    buf += text[i]!;
    i++;
  }

  flush();
  return mergeText(out);
}

function mergeText(tokens: InlineToken[]): InlineToken[] {
  const out: InlineToken[] = [];
  for (const t of tokens) {
    const last = out[out.length - 1];
    if (t.type === 'text' && last && last.type === 'text') {
      last.text += t.text;
    } else if (t.type === 'text' && t.text === '') {
      continue;
    } else {
      out.push(t);
    }
  }
  return out;
}

/** 从行内 token 中提取纯文本 */
export function inlineToText(tokens: InlineToken[]): string {
  let s = '';
  for (const t of tokens) {
    switch (t.type) {
      case 'text':
      case 'strong':
      case 'em':
      case 'del':
      case 'mark':
      case 'code':
      case 'math':
        s += t.text;
        break;
      case 'wikilink':
        s += t.alias ?? t.target;
        break;
      case 'mdlink':
        s += t.text;
        break;
      case 'image':
        s += t.alt;
        break;
      case 'tag':
        s += '#' + t.tag;
        break;
      case 'inlinefield':
        s += `${t.key}:: ${t.value}`;
        break;
    }
  }
  return s;
}

// ─────────────────────────────────────────────────────────────
// 块级解析
// ─────────────────────────────────────────────────────────────

export interface ParseBodyResult {
  blocks: Block[];
  headings: Heading[];
  links: RawLink[];
  fields: InlineField[];
  tags: string[];
  blockIds: string[];
}

const CALLOUT_RE = /^>\s*\[!([^\]]+)\]([+-])?\s*(.*)$/;
const FENCE_RE = /^(\s*)(`{3,}|~{3,})\s*([^\s`]*)\s*$/;
const HEADING_RE = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const HR_RE = /^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/;
const BLOCK_ID_RE = /\s\^([A-Za-z0-9-]+)\s*$/;
const LIST_RE = /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/;
const TABLE_SEP_RE = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

/** 解析正文（不含 frontmatter） */
export function parseBody(src: string): ParseBodyResult {
  const lines = stripComments(src).replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  const headings: Heading[] = [];
  const links: RawLink[] = [];
  const fields: InlineField[] = [];
  const tags: string[] = [];
  const blockIds: string[] = [];

  const collect = (inline: InlineToken[]) => {
    for (const t of inline) {
      if (t.type === 'wikilink') {
        links.push({
          targetRaw: t.target,
          alias: t.alias,
          subpath: t.subpath,
          subType: t.subType,
          embed: t.embed,
          targetPath: null,
        });
      } else if (t.type === 'tag') {
        if (!tags.includes(t.tag)) tags.push(t.tag);
      } else if (t.type === 'inlinefield') {
        fields.push({ key: t.key, value: t.value });
      }
    }
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    const trimmed = line.trim();

    // 空行
    if (trimmed === '') { i++; continue; }

    // 代码块（fence 优先于一切）
    const fence = FENCE_RE.exec(line);
    if (fence) {
      const marker = fence[2]!;
      const lang = fence[3] ?? '';
      const codeLines: string[] = [];
      let j = i + 1;
      while (j < lines.length) {
        const cur = lines[j]!;
        if (cur.trim().startsWith(marker) && cur.trim().replace(/[`~]/g, '') === '') break;
        codeLines.push(cur);
        j++;
      }
      const { blockId, clean } = takeBlockId(codeLines);
      blocks.push({ type: 'code', lang, code: clean.join('\n'), blockId });
      if (blockId) blockIds.push(blockId);
      i = j + 1;
      continue;
    }

    // 块公式 $$
    if (trimmed.startsWith('$$')) {
      const mathLines: string[] = [];
      let j = i;
      if (trimmed === '$$') {
        j = i + 1;
        while (j < lines.length && lines[j]!.trim() !== '$$') {
          mathLines.push(lines[j]!);
          j++;
        }
        i = j + 1;
      } else {
        // $$ 同行闭合 或 到行尾
        const inline = trimmed.slice(2);
        if (inline.endsWith('$$')) {
          mathLines.push(inline.slice(0, -2));
          i++;
        } else {
          mathLines.push(inline);
          j = i + 1;
          while (j < lines.length && !lines[j]!.includes('$$')) {
            mathLines.push(lines[j]!);
            j++;
          }
          if (j < lines.length) {
            const tail = lines[j]!;
            const idx = tail.indexOf('$$');
            if (idx > 0) mathLines.push(tail.slice(0, idx));
          }
          i = j + 1;
        }
      }
      blocks.push({ type: 'mathblock', text: mathLines.join('\n'), blockId: null });
      continue;
    }

    // 分隔线
    if (HR_RE.test(line)) {
      blocks.push({ type: 'hr', blockId: null });
      i++;
      continue;
    }

    // 标题
    const h = HEADING_RE.exec(line);
    if (h) {
      const level = h[1]!.length;
      let textPart = h[2] ?? '';
      let blockId: string | null = null;
      const bid = BLOCK_ID_RE.exec(textPart);
      if (bid) {
        blockId = bid[1]!;
        textPart = textPart.slice(0, bid.index);
        blockIds.push(blockId);
      }
      const inline = parseInline(textPart);
      collect(inline);
      const plain = inlineToText(inline);
      headings.push({ level, text: plain, slug: slugify(plain), blockId });
      blocks.push({ type: 'heading', level, inline, id: slugify(plain), blockId });
      i++;
      continue;
    }

    // callout
    const co = CALLOUT_RE.exec(line);
    if (co) {
      const kind = co[1]!.trim().toLowerCase();
      const fold = co[2] === '+' ? 'open' : co[2] === '-' ? 'closed' : null;
      const titleRaw = co[3] ?? '';
      const bodyLines: string[] = [];
      let j = i + 1;
      while (j < lines.length && /^\s*>/.test(lines[j]!)) {
        bodyLines.push(lines[j]!.replace(/^\s*>\s?/, ''));
        j++;
      }
      const inner = parseBody(bodyLines.join('\n'));
      for (const l of inner.links) links.push(l);
      for (const t of inner.tags) if (!tags.includes(t)) tags.push(t);
      for (const f of inner.fields) fields.push(f);
      for (const hid of inner.headings) headings.push(hid);
      for (const bid2 of inner.blockIds) blockIds.push(bid2);
      blocks.push({
        type: 'callout',
        kind,
        fold,
        title: titleRaw.trim(),
        blocks: inner.blocks,
        blockId: null,
      });
      i = j;
      continue;
    }

    // 引用（非 callout）
    if (/^\s*>/.test(line)) {
      const quoteLines: string[] = [];
      let j = i;
      while (j < lines.length && /^\s*>/.test(lines[j]!)) {
        quoteLines.push(lines[j]!.replace(/^\s*>\s?/, ''));
        j++;
      }
      const inline = parseInline(quoteLines.join(' '));
      collect(inline);
      blocks.push({ type: 'quote', inline, blockId: null });
      i = j;
      continue;
    }

    // 表格
    if (trimmed.includes('|') && i + 1 < lines.length && TABLE_SEP_RE.test(lines[i + 1]!)) {
      const headerCells = splitTableRow(line);
      const align = parseAlignRow(lines[i + 1]!);
      const rows: InlineToken[][][] = [];
      let j = i + 2;
      while (j < lines.length && lines[j]!.includes('|') && lines[j]!.trim() !== '') {
        rows.push(splitTableRow(lines[j]!).map((c) => {
          const toks = parseInline(c);
          collect(toks);
          return toks;
        }));
        j++;
      }
      const header = headerCells.map((c) => {
        const toks = parseInline(c);
        collect(toks);
        return toks;
      });
      blocks.push({ type: 'table', align, header, rows, blockId: null });
      i = j;
      continue;
    }

    // 列表
    if (LIST_RE.test(line)) {
      const items: ListItem[] = [];
      let j = i;
      let ordered = false;
      let firstIndex: number | null = null;
      while (j < lines.length) {
        const lm = LIST_RE.exec(lines[j]!);
        if (!lm) break;
        const indentStr = lm[1]!;
        const marker = lm[2]!;
        const content = lm[3]!;
        if (items.length === 0) {
          ordered = /^\d/.test(marker);
          firstIndex = ordered ? parseInt(marker, 10) : null;
        }
        const depth = Math.floor(indentStr.replace(/\t/g, '  ').length / 2);
        let task: ListItem['task'] = null;
        let rest = content;
        const tm = /^\[([ x/])\]\s+(.*)$/.exec(content);
        if (tm) {
          task = tm[1] as ListItem['task'];
          rest = tm[2]!;
        }
        let blockId: string | null = null;
        const bid = BLOCK_ID_RE.exec(rest);
        if (bid) {
          blockId = bid[1]!;
          blockIds.push(blockId);
          rest = rest.slice(0, bid.index);
        }
        const inline = parseInline(rest);
        collect(inline);
        const idx = ordered && firstIndex !== null ? firstIndex + items.length : null;
        items.push({ index: idx, task, inline, depth });
        j++;
      }
      blocks.push({ type: 'list', ordered, items, blockId: null });
      i = j;
      continue;
    }

    // HTML 块（整行以 < 开头且看起来像标签）
    if (/^\s*<[A-Za-z!/]/.test(line) && /^\s*<\/?[A-Za-z!][^>]*>\s*$/.test(line)) {
      const htmlLines: string[] = [];
      let j = i;
      while (j < lines.length && lines[j]!.trim() !== '') {
        htmlLines.push(lines[j]!);
        j++;
      }
      blocks.push({ type: 'html', html: htmlLines.join('\n'), blockId: null });
      i = j;
      continue;
    }

    // 段落（连续非空行合并，遇到其他块起始则断）
    const paraLines: string[] = [];
    let j = i;
    while (j < lines.length) {
      const cur = lines[j]!;
      if (cur.trim() === '') break;
      if (j > i && startsNewBlock(cur)) break;
      paraLines.push(cur);
      j++;
    }
    {
      const joined = paraLines.join('\n');
      let blockId: string | null = null;
      let textPart = joined;
      const bid = BLOCK_ID_RE.exec(joined);
      if (bid) {
        blockId = bid[1]!;
        blockIds.push(blockId);
        textPart = joined.slice(0, bid.index);
      }
      const inline = parseInline(textPart);
      collect(inline);
      blocks.push({ type: 'paragraph', inline, blockId });
    }
    i = j;
  }

  return { blocks, headings, links, fields, tags, blockIds };
}

function startsNewBlock(line: string): boolean {
  if (FENCE_RE.test(line)) return true;
  if (HEADING_RE.test(line)) return true;
  if (HR_RE.test(line)) return true;
  if (CALLOUT_RE.test(line)) return true;
  if (/^\s*>/.test(line)) return true;
  if (LIST_RE.test(line)) return true;
  if (line.trim().startsWith('$$')) return true;
  return false;
}

function takeBlockId(lines: string[]): { blockId: string | null; clean: string[] } {
  const copy = [...lines];
  if (copy.length === 0) return { blockId: null, clean: copy };
  const last = copy[copy.length - 1]!;
  const m = BLOCK_ID_RE.exec(last);
  if (m) {
    copy[copy.length - 1] = last.slice(0, m.index);
    return { blockId: m[1]!, clean: copy };
  }
  return { blockId: null, clean: copy };
}

function splitTableRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|')) s = s.slice(0, -1);
  const cells: string[] = [];
  let cur = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    if (ch === '\\' && s[i + 1] === '|') { cur += '|'; i++; continue; }
    if (ch === '|') { cells.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  cells.push(cur.trim());
  return cells;
}

function parseAlignRow(line: string): Array<'left' | 'center' | 'right' | null> {
  return splitTableRow(line).map((c) => {
    const t = c.trim();
    const left = t.startsWith(':');
    const right = t.endsWith(':');
    if (left && right) return 'center';
    if (left) return 'left';
    if (right) return 'right';
    return null;
  });
}

// ─────────────────────────────────────────────────────────────
// frontmatter 拆分
// ─────────────────────────────────────────────────────────────

export interface SplitResult {
  /** frontmatter 原文（不含 --- 行），无则 null */
  frontmatter: string | null;
  body: string;
  /** frontmatter 起始行号（1 起），无则 1 */
  bodyStartLine: number;
}

export function splitFrontmatter(src: string): SplitResult {
  const text = src.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  if (!text.startsWith('---')) {
    return { frontmatter: null, body: text, bodyStartLine: 1 };
  }
  const lines = text.split('\n');
  if (lines[0]!.trim() !== '---') {
    return { frontmatter: null, body: text, bodyStartLine: 1 };
  }
  for (let i = 1; i < lines.length; i++) {
    const t = lines[i]!.trim();
    if (t === '---' || t === '...') {
      const fm = lines.slice(1, i).join('\n');
      const body = lines.slice(i + 1).join('\n');
      return { frontmatter: fm, body, bodyStartLine: i + 2 };
    }
  }
  // 未闭合：当作没有 frontmatter
  return { frontmatter: null, body: text, bodyStartLine: 1 };
}
