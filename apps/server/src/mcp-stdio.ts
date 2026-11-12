/**
 * MCP stdio 入口（docs/03 7.1）
 *
 * 供 Claude Desktop / Cursor / Cline 直接接入：
 *   {
 *     "mcpServers": {
 *       "liuyun-loom": {
 *         "command": "node",
 *         "args": ["F:/path/to/apps/server/src/mcp-stdio.ts"],
 *         "env": { "LOOM_WORKSPACE": "F:/novels" }
 *       }
 *     }
 *   }
 *
 * 协议：一行一条 JSON-RPC（换行分隔），符合 MCP stdio 传输规范。
 */

import path from 'node:path';
import { Workspace } from '@loom/core';
import { McpServer, type JsonRpcRequest } from './mcp.ts';

async function main(): Promise<void> {
  const root = path.resolve(process.env.LOOM_WORKSPACE ?? path.join(process.cwd(), '.workspace'));
  const ws = new Workspace(root);
  await ws.init();

  const server = new McpServer({ ws });

  // stderr 才是日志通道；stdout 只走协议
  process.stderr.write(`[loom-mcp] 工作区：${ws.root}\n`);

  let buffer = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk: string) => {
    buffer += chunk;
    let idx: number;
    while ((idx = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (line === '') continue;
      void handleLine(line);
    }
  });

  const handleLine = async (line: string) => {
    let msg: JsonRpcRequest;
    try {
      msg = JSON.parse(line) as JsonRpcRequest;
    } catch {
      write({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'JSON 解析失败' } });
      return;
    }

    try {
      const res = await server.handle(msg);
      if (res) write(res);
    } catch (err) {
      write({
        jsonrpc: '2.0',
        id: msg.id ?? null,
        error: { code: -32603, message: err instanceof Error ? err.message : String(err) },
      });
    }
  };

  const write = (payload: unknown) => {
    process.stdout.write(JSON.stringify(payload) + '\n');
  };

  const shutdown = async () => {
    await ws.releaseAll();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
  process.stdin.on('end', () => void shutdown());
}

main().catch((err) => {
  process.stderr.write(`[loom-mcp] 启动失败：${String(err)}\n`);
  process.exit(1);
});
