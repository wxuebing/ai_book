/**
 * 极简 HTTP 层（docs/05 任务 2.1：零框架，仅 Node 内置）
 *
 * 提供：路由匹配、JSON 响应、错误码、路径参数、通配路径、静态资源。
 */

import http from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';

// ─────────────────────────────────────────────────────────────
// 错误
// ─────────────────────────────────────────────────────────────

export type ErrorCode =
  | 'BAD_REQUEST'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'VALIDATION_FAILED'
  | 'INTERNAL';

const STATUS_OF: Record<ErrorCode, number> = {
  BAD_REQUEST: 400,
  NOT_FOUND: 404,
  CONFLICT: 409,
  VALIDATION_FAILED: 422,
  INTERNAL: 500,
};

export class ApiError extends Error {
  code: ErrorCode;
  detail: unknown;

  constructor(code: ErrorCode, message: string, detail?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.detail = detail ?? null;
  }

  get status(): number {
    return STATUS_OF[this.code];
  }

  static badRequest(msg: string, detail?: unknown): ApiError {
    return new ApiError('BAD_REQUEST', msg, detail);
  }
  static notFound(msg: string, detail?: unknown): ApiError {
    return new ApiError('NOT_FOUND', msg, detail);
  }
  static conflict(msg: string, detail?: unknown): ApiError {
    return new ApiError('CONFLICT', msg, detail);
  }
  static validation(msg: string, detail?: unknown): ApiError {
    return new ApiError('VALIDATION_FAILED', msg, detail);
  }
}

// ─────────────────────────────────────────────────────────────
// 请求上下文
// ─────────────────────────────────────────────────────────────

export interface Ctx {
  req: http.IncomingMessage;
  res: http.ServerResponse;
  method: string;
  pathname: string;
  query: URLSearchParams;
  params: Record<string, string>;
  /** 通配段（*path），已解码 */
  wildcard: string;
  body: unknown;
  /** SSE 写入器；仅 /api/events 路由有 */
  sse?: SseWriter;
}

type Handler = (ctx: Ctx) => Promise<void> | void;

interface Route {
  method: string;
  /** 形如 /api/library/:id/note/*path */
  pattern: string;
  segments: string[];
  handler: Handler;
}

export class Router {
  private routes: Route[] = [];

  get(pattern: string, handler: Handler): this {
    return this.add('GET', pattern, handler);
  }
  post(pattern: string, handler: Handler): this {
    return this.add('POST', pattern, handler);
  }
  patch(pattern: string, handler: Handler): this {
    return this.add('PATCH', pattern, handler);
  }
  put(pattern: string, handler: Handler): this {
    return this.add('PUT', pattern, handler);
  }
  delete(pattern: string, handler: Handler): this {
    return this.add('DELETE', pattern, handler);
  }

  private add(method: string, pattern: string, handler: Handler): this {
    this.routes.push({
      method,
      pattern,
      segments: pattern.split('/').filter((s) => s !== ''),
      handler,
    });
    return this;
  }

  /** 精确匹配优先，通配段兜底；HEAD 复用 GET 处理器（Node 自动省略响应体） */
  match(method: string, pathname: string): { route: Route; params: Record<string, string>; wildcard: string } | null {
    const want = method === 'HEAD' ? 'GET' : method;
    const parts = pathname.split('/').filter((s) => s !== '');
    let best: { route: Route; params: Record<string, string>; wildcard: string } | null = null;

    for (const route of this.routes) {
      if (route.method !== want) continue;
      const r = matchSegments(route.segments, parts);
      if (!r) continue;
      // 精确路由（无通配）优先
      if (!best || (best.wildcard !== '' && r.wildcard === '')) {
        best = { route, params: r.params, wildcard: r.wildcard };
      }
      if (r.wildcard === '') break;
    }
    return best;
  }
}

function matchSegments(
  pattern: string[],
  parts: string[],
): { params: Record<string, string>; wildcard: string } | null {
  const params: Record<string, string> = {};
  let wi = 0;

  for (let i = 0; i < pattern.length; i++) {
    const seg = pattern[i]!;
    if (seg.startsWith('*')) {
      // 通配：吃掉剩余全部
      const rest = parts.slice(wi).join('/');
      params[seg.slice(1)] = safeDecode(rest);
      return { params, wildcard: safeDecode(rest) };
    }
    if (wi >= parts.length) return null;
    const part = parts[wi]!;
    if (seg.startsWith(':')) {
      params[seg.slice(1)] = safeDecode(part);
    } else if (seg !== part) {
      return null;
    }
    wi++;
  }
  if (wi !== parts.length) return null;
  return { params, wildcard: '' };
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

// ─────────────────────────────────────────────────────────────
// 响应
// ─────────────────────────────────────────────────────────────

export function sendJson(res: http.ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

export function ok(res: http.ServerResponse, data: unknown, status = 200): void {
  sendJson(res, status, { ok: true, data });
}

export function fail(res: http.ServerResponse, err: unknown): void {
  if (err instanceof ApiError) {
    sendJson(res, err.status, {
      ok: false,
      error: { code: err.code, message: err.message, detail: err.detail },
    });
    return;
  }
  // 内部错误可能带绝对路径/堆栈信息，只进日志，不回给客户端
  console.error('[loom] 未处理错误：', err);
  sendJson(res, 500, {
    ok: false,
    error: { code: 'INTERNAL', message: '服务器内部错误', detail: null },
  });
}

// ─────────────────────────────────────────────────────────────
// 请求体
// ─────────────────────────────────────────────────────────────

const MAX_BODY = 32 * 1024 * 1024; // 32MB

export async function readJsonBody(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = chunk as Buffer;
    size += buf.length;
    if (size > MAX_BODY) throw ApiError.badRequest('请求体过大');
    chunks.push(buf);
  }
  if (chunks.length === 0) return null;
  const text = Buffer.concat(chunks).toString('utf8').trim();
  if (text === '') return null;
  try {
    return JSON.parse(text);
  } catch {
    throw ApiError.badRequest('请求体不是合法 JSON');
  }
}

// ─────────────────────────────────────────────────────────────
// SSE
// ─────────────────────────────────────────────────────────────

export class SseWriter {
  private clients = new Set<http.ServerResponse>();

  /** 挂载一条 SSE 连接 */
  attach(res: http.ServerResponse): void {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write(': connected\n\n');
    this.clients.add(res);
    res.on('close', () => this.clients.delete(res));
  }

  emit(event: string, data: unknown): void {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of this.clients) {
      try {
        res.write(payload);
      } catch {
        this.clients.delete(res);
      }
    }
  }

  get size(): number {
    return this.clients.size;
  }

  closeAll(): void {
    for (const res of this.clients) {
      try {
        res.end();
      } catch {
        /* ignore */
      }
    }
    this.clients.clear();
  }
}

// ─────────────────────────────────────────────────────────────
// 静态资源（SPA 回退，防目录穿越）
// ─────────────────────────────────────────────────────────────

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
};

/**
 * 服务静态文件；未命中时回退 index.html（SPA）。
 * 返回 true 表示已处理。
 */
export async function serveStatic(
  rootDir: string,
  pathname: string,
  res: http.ServerResponse,
): Promise<boolean> {
  const rel = safeDecode(pathname).replace(/^\/+/, '');
  if (rel.includes('..')) return false;

  const abs = path.resolve(rootDir, rel);
  const relToRoot = path.relative(rootDir, abs);
  if (relToRoot.startsWith('..') || path.isAbsolute(relToRoot)) return false;

  const tryFile = async (file: string): Promise<boolean> => {
    try {
      const st = await fs.stat(file);
      if (!st.isFile()) return false;
      const ext = path.extname(file).toLowerCase();
      const body = await fs.readFile(file);
      res.writeHead(200, {
        'Content-Type': MIME[ext] ?? 'application/octet-stream',
        'Content-Length': body.length,
        'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600',
      });
      res.end(body);
      return true;
    } catch {
      return false;
    }
  };

  if (await tryFile(abs)) return true;

  // SPA 回退
  const indexFile = path.join(rootDir, 'index.html');
  try {
    const body = await fs.readFile(indexFile);
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Length': body.length,
      'Cache-Control': 'no-cache',
    });
    res.end(body);
    return true;
  } catch {
    return false;
  }
}
