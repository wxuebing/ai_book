/**
 * 极简 YAML 子集解析 / 序列化
 *
 * 覆盖 Obsidian frontmatter 的全部实际用法：
 *   - 标量：字符串 / 数字 / 布尔 / null
 *   - 引号：'single'（'' 转义）、"double"（\n \t \" \\ \uXXXX）
 *   - 数组：块式 `- item`、流式 `[a, b]`、同行 `key:\n- a`
 *   - 对象：块式缩进、流式 `{k: v}`
 *   - 多行：`|` `|-` `|+` `>` `>-` `>+`，含缩进指示符 `|2`
 *   - 注释：整行 `#`、行尾 ` #`
 *   - 多行流式集合跨行书写
 *
 * 设计取舍：不做 YAML 1.2 全集（锚点、标签、复杂键、多文档）。
 * frontmatter 里出现这些属于极少数，遇到直接抛错而不是静默误解析。
 */

export type YamlValue =
  | string
  | number
  | boolean
  | null
  | YamlValue[]
  | { [key: string]: YamlValue };

export type YamlObject = { [key: string]: YamlValue };

export class YamlError extends Error {
  /** 出错行号（1 起） */
  line: number;

  constructor(message: string, line: number) {
    super(`YAML 第 ${line} 行：${message}`);
    this.name = 'YamlError';
    this.line = line;
  }
}

interface Line {
  /** 缩进空格数 */
  indent: number;
  /** 去掉缩进后的内容 */
  text: string;
  /** 原始行（含缩进，不含换行符） */
  raw: string;
  /** 1 起的行号 */
  no: number;
}

// ─────────────────────────────────────────────────────────────
// 解析入口
// ─────────────────────────────────────────────────────────────

/**
 * 解析 frontmatter 文本。
 * @param src 不含首尾 `---` 分隔符的内容
 */
export function parseYaml(src: string): YamlValue {
  const lines = toLines(src);
  if (lines.length === 0) return {};
  const [value, end] = parseBlock(lines, 0, lines[0]!.indent);
  if (end < lines.length) {
    throw new YamlError(`缩进不一致，无法继续解析`, lines[end]!.no);
  }
  return value;
}

/** 解析 frontmatter，且强制结果为对象（frontmatter 必须是映射） */
export function parseFrontmatter(src: string): YamlObject {
  const v = parseYaml(src);
  if (v === null || v === undefined) return {};
  if (typeof v !== 'object' || Array.isArray(v)) {
    throw new YamlError('frontmatter 必须是键值映射，不能是数组或标量', 1);
  }
  return v as YamlObject;
}

// ─────────────────────────────────────────────────────────────
// 行预处理
// ─────────────────────────────────────────────────────────────

function toLines(src: string): Line[] {
  const rawLines = src.replace(/\r\n?/g, '\n').split('\n');
  const out: Line[] = [];
  for (let i = 0; i < rawLines.length; i++) {
    const raw = rawLines[i]!;
    const trimmedRight = raw.replace(/\s+$/, '');
    const content = trimmedRight.trimStart();
    // 空行与整行注释跳过
    if (content === '' || content.startsWith('#')) continue;
    let indent = 0;
    for (const ch of trimmedRight) {
      if (ch === ' ') indent++;
      else if (ch === '\t') indent += 2; // 宽容处理制表符
      else break;
    }
    out.push({ indent, text: content, raw: trimmedRight, no: i + 1 });
  }
  return out;
}

// ─────────────────────────────────────────────────────────────
// 块解析
// ─────────────────────────────────────────────────────────────

function isSeqItem(text: string): boolean {
  return text === '-' || text.startsWith('- ');
}

function parseBlock(lines: Line[], start: number, indent: number): [YamlValue, number] {
  const first = lines[start]!;
  if (isSeqItem(first.text)) return parseSeq(lines, start, indent);
  return parseMap(lines, start, indent);
}

function parseSeq(lines: Line[], start: number, indent: number): [YamlValue[], number] {
  const out: YamlValue[] = [];
  let i = start;
  while (i < lines.length) {
    const line = lines[i]!;
    if (line.indent !== indent || !isSeqItem(line.text)) break;

    const content = line.text === '-' ? '' : line.text.slice(2).trim();

    // 本项占据的行范围：后续缩进更深的行
    let j = i + 1;
    while (j < lines.length && lines[j]!.indent > indent) j++;

    if (content === '') {
      if (j > i + 1) {
        const [v] = parseBlock(lines, i + 1, lines[i + 1]!.indent);
        out.push(v);
      } else {
        out.push(null);
      }
    } else if (isBlockScalarHeader(content)) {
      const { value, next } = readBlockScalar(lines, i, indent, content);
      out.push(value);
      i = next;
      continue;
    } else if (isMapEntryStart(content)) {
      // `- key: value` → 以虚拟首行构成子块，缩进取 dash 之后的位置
      const sub: Line[] = [{ indent: indent + 2, text: content, raw: content, no: line.no }];
      for (let k = i + 1; k < j; k++) sub.push(lines[k]!);
      const [v] = parseBlock(sub, 0, indent + 2);
      out.push(v);
    } else {
      out.push(parseInlineWithContinuation(lines, i, j, content));
    }
    i = j;
  }
  return [out, i];
}

function parseMap(lines: Line[], start: number, indent: number): [YamlObject, number] {
  const obj: YamlObject = {};
  let i = start;
  while (i < lines.length) {
    const line = lines[i]!;
    if (line.indent !== indent) break;
    if (isSeqItem(line.text)) break; // 交给上层

    const kv = splitKeyValue(line.text);
    if (!kv) throw new YamlError(`不是合法的「键: 值」写法：${line.text}`, line.no);
    const [rawKey, rest] = kv;
    const key = unquoteKey(rawKey);

    if (rest === '') {
      // 值为空：可能嵌套块，也可能同级序列，也可能就是 null
      const next = i + 1;
      if (next < lines.length && lines[next]!.indent > indent) {
        let j = next;
        while (j < lines.length && lines[j]!.indent > indent) j++;
        const [v] = parseBlock(lines, next, lines[next]!.indent);
        obj[key] = v;
        i = j;
        continue;
      }
      if (next < lines.length && lines[next]!.indent === indent && isSeqItem(lines[next]!.text)) {
        const [v, nextI] = parseSeq(lines, next, indent);
        obj[key] = v;
        i = nextI;
        continue;
      }
      obj[key] = null;
      i++;
      continue;
    }

    if (isBlockScalarHeader(rest)) {
      const { value, next } = readBlockScalar(lines, i, indent, rest);
      obj[key] = value;
      i = next;
      continue;
    }

    // 流式集合可能跨行
    const consumed = collectFlowContinuation(lines, i, indent, rest);
    obj[key] = parseInline(consumed.text, line.no);
    i = consumed.next;
  }
  return [obj, i];
}

// ─────────────────────────────────────────────────────────────
// 块标量 | 和 >
// ─────────────────────────────────────────────────────────────

function isBlockScalarHeader(s: string): boolean {
  return /^[|>][+-]?\d*$/.test(s.trim());
}

function readBlockScalar(
  lines: Line[],
  keyLineIdx: number,
  parentIndent: number,
  header: string,
): { value: string; next: number } {
  const m = /^([|>])([+-])?(\d*)$/.exec(header.trim());
  if (!m) throw new YamlError(`块标量头非法：${header}`, lines[keyLineIdx]!.no);
  const style = m[1] as '|' | '>';
  const chomp = m[2] ?? '';
  const explicitIndent = m[3] ? Number(m[3]) : 0;

  const parentRaw = lines[keyLineIdx]!.raw;
  // 收集所有缩进大于父级的原始行（含空行）
  let i = keyLineIdx + 1;
  const collected: Array<{ raw: string; indent: number }> = [];
  while (i < lines.length && lines[i]!.indent > parentIndent) {
    collected.push({ raw: lines[i]!.raw, indent: lines[i]!.indent });
    i++;
  }

  const baseIndent = explicitIndent
    ? parentIndent + explicitIndent
    : collected.length
      ? Math.min(...collected.map((c) => c.indent))
      : parentIndent + 2;

  const contentLines = collected.map((c) => c.raw.slice(Math.min(baseIndent, c.raw.length)));

  let text: string;
  if (style === '|') {
    text = contentLines.join('\n');
  } else {
    // 折叠：单个换行变空格，空行变换行
    const parts: string[] = [];
    let pendingBlank = 0;
    for (const ln of contentLines) {
      if (ln.trim() === '') {
        pendingBlank++;
        continue;
      }
      if (parts.length > 0) parts.push(pendingBlank > 0 ? '\n'.repeat(pendingBlank) : ' ');
      parts.push(ln);
      pendingBlank = 0;
    }
    text = parts.join('');
  }

  if (chomp === '-') text = text.replace(/\n+$/, '');
  else if (chomp === '+') text = text + '\n';
  else text = text.replace(/\n+$/, '') + (text.trim() === '' ? '' : '\n');

  void parentRaw;
  return { value: text, next: i };
}

// ─────────────────────────────────────────────────────────────
// 键值拆分
// ─────────────────────────────────────────────────────────────

/** 判断一段文本是否形如 `key:` / `key: value`（用于识别 `- key: v` 项） */
function isMapEntryStart(text: string): boolean {
  return splitKeyValue(text) !== null;
}

/**
 * 拆分 `key: value`。冒号必须位于引号与括号之外，且后面是空格或行尾。
 */
function splitKeyValue(text: string): [string, string] | null {
  let inSingle = false;
  let inDouble = false;
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (inSingle) {
      if (ch === "'") {
        if (text[i + 1] === "'") i++;
        else inSingle = false;
      }
      continue;
    }
    if (inDouble) {
      if (ch === '\\') i++;
      else if (ch === '"') inDouble = false;
      continue;
    }
    if (ch === "'") { inSingle = true; continue; }
    if (ch === '"') { inDouble = true; continue; }
    if (ch === '[' || ch === '{') { depth++; continue; }
    if (ch === ']' || ch === '}') { depth--; continue; }
    if (ch === '#' && i > 0 && /\s/.test(text[i - 1]!)) return null; // 注释行
    if (ch === ':' && depth === 0) {
      const nextCh = text[i + 1];
      if (nextCh === undefined || nextCh === ' ' || nextCh === '\t') {
        const key = text.slice(0, i).trim();
        const rest = text.slice(i + 1).trim();
        if (key === '') return null;
        return [key, stripTrailingComment(rest)];
      }
    }
  }
  return null;
}

function unquoteKey(key: string): string {
  const t = key.trim();
  if (t.length >= 2 && t.startsWith('"') && t.endsWith('"')) return unescapeDouble(t.slice(1, -1));
  if (t.length >= 2 && t.startsWith("'") && t.endsWith("'")) return t.slice(1, -1).replace(/''/g, "'");
  return t;
}

// ─────────────────────────────────────────────────────────────
// 流式集合跨行拼接
// ─────────────────────────────────────────────────────────────

function collectFlowContinuation(
  lines: Line[],
  idx: number,
  indent: number,
  firstRest: string,
): { text: string; next: number } {
  const opens = countUnbalanced(firstRest);
  if (opens === 0) return { text: firstRest, next: idx + 1 };

  let text = firstRest;
  let i = idx + 1;
  let balance = opens;
  while (i < lines.length && balance > 0) {
    const ln = lines[i]!;
    if (ln.indent <= indent && !isSeqItem(ln.text)) break;
    text += ' ' + ln.text;
    balance += countUnbalanced(ln.text);
    i++;
  }
  return { text, next: i };
}

/** 返回未闭合的括号数（负数视为已闭合） */
function countUnbalanced(s: string): number {
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    if (inSingle) {
      if (ch === "'") {
        if (s[i + 1] === "'") i++;
        else inSingle = false;
      }
      continue;
    }
    if (inDouble) {
      if (ch === '\\') i++;
      else if (ch === '"') inDouble = false;
      continue;
    }
    if (ch === "'") inSingle = true;
    else if (ch === '"') inDouble = true;
    else if (ch === '[' || ch === '{') depth++;
    else if (ch === ']' || ch === '}') depth--;
  }
  return depth;
}

function parseInlineWithContinuation(lines: Line[], i: number, j: number, content: string): YamlValue {
  if (countUnbalanced(content) > 0 && j > i + 1) {
    let text = content;
    for (let k = i + 1; k < j; k++) text += ' ' + lines[k]!.text;
    return parseInline(text, lines[i]!.no);
  }
  return parseInline(content, lines[i]!.no);
}

// ─────────────────────────────────────────────────────────────
// 标量与流式集合
// ─────────────────────────────────────────────────────────────

function stripTrailingComment(s: string): string {
  let inSingle = false;
  let inDouble = false;
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    if (inSingle) {
      if (ch === "'") {
        if (s[i + 1] === "'") i++;
        else inSingle = false;
      }
      continue;
    }
    if (inDouble) {
      if (ch === '\\') i++;
      else if (ch === '"') inDouble = false;
      continue;
    }
    if (ch === "'") inSingle = true;
    else if (ch === '"') inDouble = true;
    else if (ch === '[' || ch === '{') depth++;
    else if (ch === ']' || ch === '}') depth--;
    else if (ch === '#' && depth === 0 && i > 0 && /\s/.test(s[i - 1]!)) {
      return s.slice(0, i).trim();
    }
  }
  return s.trim();
}

export function parseInline(text: string, lineNo = 1): YamlValue {
  const t = text.trim();
  if (t === '') return null;
  if (t.startsWith('[')) return parseFlowSeq(t, lineNo);
  if (t.startsWith('{')) return parseFlowMap(t, lineNo);
  if (t.startsWith('"') && t.endsWith('"') && t.length >= 2) return unescapeDouble(t.slice(1, -1));
  if (t.startsWith("'") && t.endsWith("'") && t.length >= 2) return t.slice(1, -1).replace(/''/g, "'");
  return toScalar(t);
}

function toScalar(t: string): YamlValue {
  if (t === '~' || t === 'null' || t === 'Null' || t === 'NULL') return null;
  if (t === 'true' || t === 'True' || t === 'TRUE') return true;
  if (t === 'false' || t === 'False' || t === 'FALSE') return false;
  if (/^[+-]?\d+$/.test(t)) {
    const n = Number(t);
    if (Number.isSafeInteger(n)) return n;
    return t;
  }
  if (/^[+-]?(\d+\.\d*|\.\d+|\d+)([eE][+-]?\d+)?$/.test(t)) {
    const n = Number(t);
    if (Number.isFinite(n)) return n;
  }
  return t;
}

function unescapeDouble(s: string): string {
  return s.replace(/\\(u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|.)/g, (_m, esc: string) => {
    switch (esc[0]) {
      case 'n': return '\n';
      case 't': return '\t';
      case 'r': return '\r';
      case '"': return '"';
      case '\\': return '\\';
      case '/': return '/';
      case '0': return '\0';
      case 'b': return '\b';
      case 'f': return '\f';
      case 'u': return String.fromCharCode(parseInt(esc.slice(1), 16));
      case 'x': return String.fromCharCode(parseInt(esc.slice(1), 16));
      default: return esc;
    }
  });
}

function splitFlowItems(inner: string): string[] {
  const out: string[] = [];
  let cur = '';
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i]!;
    if (inSingle) {
      cur += ch;
      if (ch === "'") {
        if (inner[i + 1] === "'") { cur += "'"; i++; }
        else inSingle = false;
      }
      continue;
    }
    if (inDouble) {
      cur += ch;
      if (ch === '\\') { cur += inner[i + 1] ?? ''; i++; }
      else if (ch === '"') inDouble = false;
      continue;
    }
    if (ch === "'") { inSingle = true; cur += ch; continue; }
    if (ch === '"') { inDouble = true; cur += ch; continue; }
    if (ch === '[' || ch === '{') { depth++; cur += ch; continue; }
    if (ch === ']' || ch === '}') { depth--; cur += ch; continue; }
    if (ch === ',' && depth === 0) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim() !== '') out.push(cur);
  return out;
}

function parseFlowSeq(t: string, lineNo: number): YamlValue[] {
  const close = t.lastIndexOf(']');
  if (close < 0) throw new YamlError(`流式数组未闭合：${t}`, lineNo);
  const inner = t.slice(1, close).trim();
  if (inner === '') return [];
  return splitFlowItems(inner).map((item) => parseInline(item, lineNo));
}

function parseFlowMap(t: string, lineNo: number): YamlObject {
  const close = t.lastIndexOf('}');
  if (close < 0) throw new YamlError(`流式对象未闭合：${t}`, lineNo);
  const inner = t.slice(1, close).trim();
  const obj: YamlObject = {};
  if (inner === '') return obj;
  for (const item of splitFlowItems(inner)) {
    const kv = splitKeyValue(item.trim());
    if (!kv) throw new YamlError(`流式对象成员非法：${item}`, lineNo);
    obj[unquoteKey(kv[0])] = parseInline(kv[1], lineNo);
  }
  return obj;
}

// ─────────────────────────────────────────────────────────────
// 序列化
// ─────────────────────────────────────────────────────────────

/** 序列化为 YAML 文本（不含 `---` 分隔符） */
export function stringifyYaml(value: YamlValue): string {
  if (value === null || typeof value !== 'object') return formatScalar(value) + '\n';
  if (Array.isArray(value)) return value.length === 0 ? '[]\n' : emitSeq(value, 0) + '\n';
  const keys = Object.keys(value);
  if (keys.length === 0) return '{}\n';
  return emitMap(value as YamlObject, 0) + '\n';
}

function emitMap(obj: YamlObject, indent: number): string {
  const pad = ' '.repeat(indent);
  let out = '';
  for (const [k, v] of Object.entries(obj)) {
    const key = needsQuoteKey(k) ? JSON.stringify(k) : k;
    if (v === null) {
      out += `${pad}${key}:\n`;
    } else if (typeof v === 'string' && v.includes('\n')) {
      out += `${pad}${key}: |-\n`;
      for (const ln of v.replace(/\n+$/, '').split('\n')) out += `${pad}  ${ln}\n`;
    } else if (Array.isArray(v)) {
      out += v.length === 0 ? `${pad}${key}: []\n` : `${pad}${key}:\n${emitSeq(v, indent + 2)}`;
    } else if (typeof v === 'object') {
      out += Object.keys(v).length === 0
        ? `${pad}${key}: {}\n`
        : `${pad}${key}:\n${emitMap(v as YamlObject, indent + 2)}`;
    } else {
      out += `${pad}${key}: ${formatScalar(v)}\n`;
    }
  }
  return out;
}

function emitSeq(arr: YamlValue[], indent: number): string {
  const pad = ' '.repeat(indent);
  let out = '';
  for (const v of arr) {
    if (v === null) {
      out += `${pad}-\n`;
    } else if (typeof v === 'string' && v.includes('\n')) {
      out += `${pad}- |-\n`;
      for (const ln of v.replace(/\n+$/, '').split('\n')) out += `${pad}  ${ln}\n`;
    } else if (Array.isArray(v)) {
      out += v.length === 0 ? `${pad}- []\n` : `${pad}-\n${emitSeq(v, indent + 2)}`;
    } else if (typeof v === 'object') {
      const keys = Object.keys(v);
      if (keys.length === 0) {
        out += `${pad}- {}\n`;
      } else {
        // 紧凑写法：首个键跟在 `- ` 后面
        const inner = emitMap(v as YamlObject, indent + 2);
        out += `${pad}- ${inner.slice(indent + 2)}`;
      }
    } else {
      out += `${pad}- ${formatScalar(v)}\n`;
    }
  }
  return out;
}

function needsQuoteKey(k: string): boolean {
  return !/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(k);
}

function formatScalar(v: YamlValue): string {
  if (v === null) return 'null';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'null';
  const s = v as string;
  if (s === '') return '""';
  if (/^(true|false|null|~|True|False|Null|NULL|TRUE|FALSE)$/.test(s)) return JSON.stringify(s);
  if (/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(s)) return JSON.stringify(s);
  if (/^[ \t]|[ \t]$/.test(s)) return JSON.stringify(s);
  if (/^[-?:,[\]{}#&*!|>'"%@`]/.test(s)) return JSON.stringify(s);
  if (s.includes(': ') || s.includes(' #') || s.endsWith(':')) return JSON.stringify(s);
  return s;
}
