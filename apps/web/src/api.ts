/**
 * API 客户端
 *
 * 统一响应：{ ok: true, data } / { ok: false, error }
 */

export interface ApiError {
  code: string;
  message: string;
  detail?: unknown;
}

export class ApiFailure extends Error {
  code: string;
  detail?: unknown;

  constructor(err: ApiError) {
    super(err.message);
    this.name = 'ApiFailure';
    this.code = err.code;
    this.detail = err.detail;
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new ApiFailure({ code: 'BAD_RESPONSE', message: `服务返回了非 JSON（HTTP ${res.status}）` });
  }

  const payload = json as { ok?: boolean; data?: T; error?: ApiError };
  if (payload.ok === true) return payload.data as T;
  if (payload.error) throw new ApiFailure(payload.error);
  throw new ApiFailure({ code: 'UNKNOWN', message: `未知响应（HTTP ${res.status}）` });
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  del: <T>(path: string) => request<T>('DELETE', path),
};

// ─────────────────────────────────────────────────────────────
// 数据类型（与后端契约一致）
// ─────────────────────────────────────────────────────────────

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

export interface LibraryResponse {
  workspace: string;
  root: string;
  active: string | null;
  projects: ProjectSummary[];
}

export interface TypeGroup {
  type: string;
  label: string;
  color: string;
  view: string;
  count: number;
  fields: Array<{ key: string; label: string; type: string; required: boolean }>;
  hint?: string;
}

export interface ProjectOverview {
  name: string;
  path: string;
  notes: number;
  typed: number;
  untyped: number;
  words: number;
  types: number;
  concepts: number;
  relations: number;
  groups: TypeGroup[];
  scopes: { spaces: string[]; times: string[] };
}

export interface InlineToken {
  type: string;
  text?: string;
  alt?: string;
  target?: string;
  targetPath?: string | null;
  alias?: string | null;
  subpath?: string | null;
  subType?: string | null;
  embed?: boolean;
  self?: boolean;
  tag?: string;
  key?: string;
  value?: string;
  href?: string;
}

export interface Block {
  type: string;
  level?: number;
  inline?: InlineToken[];
  id?: string;
  blockId?: string | null;
  ordered?: boolean;
  items?: Array<{ index: number | null; task: string | null; inline: InlineToken[]; depth: number }>;
  lang?: string;
  code?: string;
  kind?: string;
  fold?: 'open' | 'closed' | null;
  title?: string;
  blocks?: Block[];
  align?: Array<string | null>;
  header?: InlineToken[][];
  rows?: InlineToken[][][];
  text?: string;
  html?: string;
}

export interface NoteDetail {
  projectId?: string;
  path: string;
  title: string;
  type: string | null;
  folder?: string;
  frontmatter: Record<string, unknown>;
  body: string;
  blocks: Block[];
  headings: Array<{ level: number; text: string; slug: string }>;
  tags: string[];
  links: Array<{ targetRaw: string; targetPath: string | null; alias: string | null; embed: boolean }>;
  backlinks: Array<{ path: string; title: string; label: string; kind: string }>;
  outgoing: Array<{ path: string | null; target: string; label: string; kind: string; resolved: boolean }>;
  words: number;
  mtime: number;
  scope: { space: string[]; time: string[]; any: boolean };
  paths: Array<{ system: string; tier: string; order: number | null }>;
}

export interface EntrySummary {
  path: string;
  title: string;
  type: string | null;
  words: number;
  mtime: number;
  frontmatter: Record<string, unknown>;
  excerpt: string;
}

export interface GroupResponse {
  type: string;
  label: string;
  color: string;
  view: string;
  fields: TypeGroup['fields'];
  notes: EntrySummary[];
}

export interface GraphResponse {
  nodes: Array<{ id: string; label: string; type: string | null; color: string; words: number; folder: string }>;
  edges: Array<{ source: string; target: string; kind: string; label: string; origin: string }>;
}

export interface SearchHit {
  path: string;
  title: string;
  type: string | null;
  excerpt: string;
  snippet: string;
}

export interface CheckResponse {
  broken: Array<{ source: string; target: string; raw: string }>;
  scopeConflicts: Array<{ items: string[]; reason: string }>;
  conceptConflicts: Array<{ concept: string; a: string; b: string; reason: string }>;
  untyped: Array<{ path: string; title: string }>;
}

export interface NavRoot {
  id: string;
  label: string;
  children: Array<{
    id: string;
    label: string;
    level: number;
    expanded?: boolean;
    children: Array<{ id: string; label: string; level: number }> | null;
    meta?: { words: number; chapters: number; notes: number };
  }> | null;
}

export interface NavResponse {
  roots: NavRoot[];
  meta: { activeProject: string | null; model: string };
}

export interface ToolGroup {
  id: string;
  label: string;
  hint: string;
  children: Array<{ id: string; label: string }>;
}

/**
 * 工具库的平面条目（docs/01 第 5.2 节）
 *
 * 工具库不分三级：每个二级就是一个功能页。
 */
export interface ToolItem {
  id: string;
  label: string;
  hint: string;
}

export interface McpOutInfo {
  server: { name: string; version: string; protocolVersion: string };
  transports: string[];
  endpoints: { http: string };
  tools: Array<{ name: string; title: string; readOnly: boolean; description: string }>;
  counts: { total: number; readOnly: number; write: number };
  connectedClients: number;
}

export interface PackInfo {
  id: string;
  label: string;
  desc: string;
  types: string[];
}
