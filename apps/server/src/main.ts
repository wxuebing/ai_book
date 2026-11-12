/**
 * 服务入口（docs/03 第 1.1 节：默认端口 5178）
 *
 * 用法：
 *   node apps/server/src/main.ts                    # 用默认工作区
 *   LOOM_WORKSPACE=F:/novels node apps/server/src/main.ts
 *   node apps/server/src/main.ts --port 5178 --root F:/novels
 */

import http from 'node:http';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Workspace } from '@loom/core';
import { Router, fail, serveStatic, readJsonBody, ApiError, SseWriter } from './http.ts';
import { registerRoutes } from './routes.ts';
import { McpServer, McpClientManager, type JsonRpcRequest } from './mcp.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface CliArgs {
  port: number;
  root: string;
  webDir: string | null;
}

function parseArgs(argv: string[]): CliArgs {
  const env = process.env;
  let port = Number(env.LOOM_PORT ?? env.PORT ?? 5178);
  let root = env.LOOM_WORKSPACE ?? path.resolve(process.cwd(), '.workspace');
  let webDir: string | null = env.LOOM_WEB_DIR ?? null;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--port' && argv[i + 1]) port = Number(argv[++i]);
    else if (a === '--root' && argv[i + 1]) root = argv[++i]!;
    else if (a === '--web' && argv[i + 1]) webDir = argv[++i]!;
  }
  if (!Number.isFinite(port) || port <= 0) port = 5178;

  // 默认静态目录：apps/web/dist
  if (!webDir) {
    const candidate = path.resolve(__dirname, '../../web/dist');
    webDir = candidate;
  }

  return { port, root: path.resolve(root), webDir };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const ws = new Workspace(args.root);
  await ws.init();
  console.log(`[loom] 工作区：${ws.root}`);

  const sse = new SseWriter();
  const router = new Router();
  registerRoutes(router, { ws, sse, startedAt: Date.now() });

  // MCP 双通道
  const mcp = new McpServer({ ws });
  const mcpClients = new McpClientManager();

  /** streamable-http：POST /mcp（docs/03 7.1） */
  router.post('/mcp', async (ctx) => {
    const body = ctx.body;
    const messages = Array.isArray(body) ? body : [body];
    const responses: unknown[] = [];
    for (const m of messages) {
      if (!m || typeof m !== 'object') continue;
      const res = await mcp.handle(m as JsonRpcRequest);
      if (res) responses.push(res);
    }
    // 全是通知 → 202 无内容
    if (responses.length === 0) {
      ctx.res.writeHead(202);
      ctx.res.end();
      return;
    }
    const payload = Array.isArray(body) ? responses : responses[0];
    ctx.res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    ctx.res.end(JSON.stringify(payload));
  });

  /** MCP 探活（GET /mcp 用于客户端发现） */
  router.get('/mcp', async (ctx) => {
    ctx.res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    ctx.res.end(
      JSON.stringify({
        name: 'liuyun-loom',
        protocolVersion: '2025-06-18',
        transport: 'streamable-http',
        tools: mcp.listTools().length,
        hint: '用 POST /mcp 发送 JSON-RPC',
      }),
    );
  });

  /** MCP 对外状态（docs/03 7.2 工具库「服务状态」） */
  router.get('/api/tools/mcp-out', async (ctx) => {
    const tools = mcp.listTools() as Array<{
      name: string;
      title: string;
      description: string;
      annotations: { readOnlyHint: boolean };
    }>;
    ctx.res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    ctx.res.end(
      JSON.stringify({
        ok: true,
        data: {
          server: { name: 'liuyun-loom', version: '0.1.0', protocolVersion: '2025-06-18' },
          transports: ['stdio', 'streamable-http'],
          endpoints: { http: `http://127.0.0.1:${args.port}/mcp` },
          tools: tools.map((t) => ({
            name: t.name,
            title: t.title,
            readOnly: t.annotations.readOnlyHint,
            description: t.description,
          })),
          counts: {
            total: tools.length,
            readOnly: tools.filter((t) => t.annotations.readOnlyHint).length,
            write: tools.filter((t) => !t.annotations.readOnlyHint).length,
          },
          connectedClients: sse.size,
        },
      }),
    );
  });

  /** MCP 对内管理（docs/03 7.3） */
  router.get('/api/tools/mcp-in', async (ctx) => {
    ctx.res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    ctx.res.end(
      JSON.stringify({
        ok: true,
        data: { servers: mcpClients.list(), statuses: mcpClients.statuses() },
      }),
    );
  });

  router.post('/api/tools/mcp-in', async (ctx) => {
    const body = (ctx.body ?? {}) as Record<string, unknown>;
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) throw ApiError.validation('字段 name 必填', { field: 'name' });
    const hasStdio = typeof body.command === 'string' && body.command.trim() !== '';
    const hasHttp = typeof body.url === 'string' && body.url.trim() !== '';
    if (!hasStdio && !hasHttp) {
      throw ApiError.validation('必须提供 command（stdio）或 url（http）之一');
    }
    const id = typeof body.id === 'string' && body.id ? body.id : `mcp-${Date.now().toString(36)}`;
    const cfg = mcpClients.add({
      id,
      name,
      command: hasStdio ? (body.command as string) : undefined,
      args: Array.isArray(body.args) ? (body.args as string[]) : undefined,
      env: isObj(body.env) ? (body.env as Record<string, string>) : undefined,
      cwd: typeof body.cwd === 'string' ? body.cwd : undefined,
      url: hasHttp ? (body.url as string) : undefined,
      headers: isObj(body.headers) ? (body.headers as Record<string, string>) : undefined,
      enabled: body.enabled !== false,
    });
    ctx.res.writeHead(201, { 'Content-Type': 'application/json; charset=utf-8' });
    ctx.res.end(JSON.stringify({ ok: true, data: cfg }));
  });

  router.delete('/api/tools/mcp-in/:id', async (ctx) => {
    const removed = mcpClients.remove(ctx.params.id!);
    if (!removed) throw ApiError.notFound(`没有这个 MCP 服务：${ctx.params.id}`);
    ctx.res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    ctx.res.end(JSON.stringify({ ok: true, data: { removed: ctx.params.id } }));
  });

  router.post('/api/tools/mcp-in/:id/test', async (ctx) => {
    const st = await mcpClients.test(ctx.params.id!);
    ctx.res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    ctx.res.end(JSON.stringify({ ok: true, data: st }));
  });

  router.patch('/api/tools/mcp-in/:id/perm', async (ctx) => {
    const body = (ctx.body ?? {}) as Record<string, unknown>;
    const mode = body.mode === 'deny' ? 'deny' : 'allow';
    const tools = Array.isArray(body.tools) ? (body.tools as string[]) : [];
    const okFlag = mcpClients.setPermissions(ctx.params.id!, { mode, tools });
    if (!okFlag) throw ApiError.notFound(`没有这个 MCP 服务：${ctx.params.id}`);
    ctx.res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    ctx.res.end(JSON.stringify({ ok: true, data: { id: ctx.params.id, mode, tools } }));
  });

  const webDirExists = await fs
    .stat(args.webDir!)
    .then((s) => s.isDirectory())
    .catch(() => false);
  if (!webDirExists) {
    console.log(`[loom] 前端未构建（${args.webDir}），仅提供 API`);
  }

  const server = http.createServer(async (req, res) => {
    const method = (req.method ?? 'GET').toUpperCase();
    const host = requestHost(req);
    const rawOrigin = req.headers.origin;
    const origin = Array.isArray(rawOrigin) ? rawOrigin[0] : rawOrigin;

    // 只监听回环地址还不够：浏览器里的任意网页都能向 127.0.0.1 发请求。
    // Host 校验防 DNS rebinding，Origin 校验防跨站读写（本服务没有鉴权，
    // 一个跨站请求就能改稿、删书，甚至通过 /api/tools/mcp-in 起进程）。
    if (!isLoopbackHost(host)) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Forbidden: invalid Host');
      return;
    }
    if (origin !== undefined && !isLoopbackOrigin(origin)) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Forbidden: invalid Origin');
      return;
    }

    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');

    // CORS：只放行本机来源（开发时前端跑在 5173 等端口）
    if (origin !== undefined) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Vary', 'Origin');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
    if (method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url ?? '/', `http://${host ?? '127.0.0.1'}`);
    const pathname = url.pathname;

    try {
      const matched = router.match(method, pathname);
      if (matched) {
        let body: unknown = null;
        if (method === 'POST' || method === 'PATCH' || method === 'PUT') {
          body = await readJsonBody(req);
        }
        const ctx = {
          req,
          res,
          method,
          pathname,
          query: url.searchParams,
          params: matched.params,
          wildcard: matched.wildcard,
          body,
        };
        await matched.route.handler(ctx);
        // 处理器忘记写响应会让客户端永久挂起，这里兜底
        if (!res.writableEnded) {
          fail(res, ApiError.badRequest(`处理器未产生响应：${method} ${pathname}`));
        }
        return;
      }

      // 静态资源
      if ((method === 'GET' || method === 'HEAD') && !pathname.startsWith('/api/')) {
        if (webDirExists && (await serveStatic(args.webDir!, pathname, res))) return;
        // 没有前端时给个可用提示
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(
          [
            '<!doctype html><meta charset="utf-8">',
            '<title>流云织小说工作台</title>',
            '<body style="font:16px/1.7 system-ui;padding:48px;background:#F8F6F2;color:#1A2E34">',
            '<h1 style="font-weight:600;letter-spacing:.04em">流云织小说工作台</h1>',
            '<p>内核与服务已启动，但前端尚未构建。</p>',
            '<p>构建前端：<code>pnpm build:web</code></p>',
            `<p>API 探活：<a href="/api/health">/api/health</a> · `,
            '<a href="/api/library">/api/library</a> · <a href="/api/tools">/api/tools</a></p>',
            '</body>',
          ].join('\n'),
        );
        return;
      }

      throw ApiError.notFound(`没有这个接口：${method} ${pathname}`);
    } catch (err) {
      if (!res.headersSent) fail(res, err);
      else res.end();
    }
  });

  /**
   * 显式绑定 127.0.0.1：Windows 上 localhost 可能先解析到 ::1，
   * 若只监听 IPv4 会导致客户端连接被拒或长时间挂起。
   */
  server.listen(args.port, '127.0.0.1', () => {
    console.log(`[loom] 服务已启动：http://127.0.0.1:${args.port}`);
    console.log(`[loom] API：http://127.0.0.1:${args.port}/api/health`);
  });

  const shutdown = async (sig: string) => {
    console.log(`\n[loom] 收到 ${sig}，正在关闭…`);
    sse.closeAll();
    server.close();
    await ws.releaseAll();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('[loom] 启动失败：', err);
  process.exit(1);
});

function isObj(v: unknown): boolean {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

// ─────────────────────────────────────────────────────────────
// 访问来源校验
// ─────────────────────────────────────────────────────────────

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

function requestHost(req: http.IncomingMessage): string | undefined {
  const h = req.headers.host;
  return Array.isArray(h) ? h[0] : h;
}

function hostnameOf(value: string): string | null {
  try {
    return new URL(value.includes('://') ? value : `http://${value}`).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** Host 必须是回环主机，挡住 DNS rebinding */
function isLoopbackHost(host: string | undefined): boolean {
  if (!host) return false;
  const name = hostnameOf(host);
  return name !== null && LOOPBACK_HOSTS.has(name);
}

/** 浏览器带来的 Origin 必须是本机页面；无 Origin = 非浏览器客户端（MCP/CLI） */
function isLoopbackOrigin(origin: string): boolean {
  if (origin === 'null') return false;
  let u: URL;
  try {
    u = new URL(origin);
  } catch {
    return false;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  return LOOPBACK_HOSTS.has(u.hostname.toLowerCase());
}
