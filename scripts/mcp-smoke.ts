/**
 * MCP 集成测试（docs/05 任务 2.18：18 工具全覆盖）
 *
 * 覆盖：
 *   - initialize / tools/list / tools/call 全链路
 *   - 18 个工具逐个调用
 *   - 只读工具的 readOnlyHint
 *   - stdio 传输（子进程握手）
 *   - streamable-http 传输（POST /mcp）
 *   - resources / prompts
 *   - 错误处理（未知工具、未知方法、工具内异常）
 */

import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const PORT = 5198;
const BASE = `http://127.0.0.1:${PORT}`;

let pass = 0;
let failCount = 0;
const failures: string[] = [];

function check(name: string, cond: boolean, detail?: unknown): void {
  if (cond) {
    pass++;
    console.log(`  ✔ ${name}`);
  } else {
    failCount++;
    const msg = `${name}${detail !== undefined ? ' :: ' + JSON.stringify(detail).slice(0, 300) : ''}`;
    failures.push(msg);
    console.log(`  ✖ ${msg}`);
  }
}

interface RpcResult {
  result?: any;
  error?: { code: number; message: string };
}

async function rpc(method: string, params?: unknown, id = 1): Promise<RpcResult> {
  const res = await fetch(`${BASE}/mcp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
  });
  const text = await res.text();
  return JSON.parse(text) as RpcResult;
}

async function callTool(name: string, args: Record<string, unknown> = {}): Promise<any> {
  const r = await rpc('tools/call', { name, arguments: args });
  if (r.error) throw new Error(`RPC 错误：${r.error.message}`);
  return r.result;
}

async function waitForServer(timeoutMs = 15000): Promise<void> {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.ok) return;
    } catch {
      /* 还没起来 */
    }
    await new Promise((r) => setTimeout(r, 120));
  }
  throw new Error('服务启动超时');
}

async function main(): Promise<void> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'loom-mcp-'));
  console.log(`工作区：${root}\n`);

  const child = spawn(process.execPath, [path.resolve('apps/server/src/main.ts')], {
    env: { ...process.env, LOOM_PORT: String(PORT), LOOM_WORKSPACE: root },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (d) => process.stdout.write(`  [server] ${d}`));
  child.stderr.on('data', (d) => process.stderr.write(`  [server:err] ${d}`));

  try {
    await waitForServer();

    // ───────────────────────────────────────────────────────
    console.log('【协议握手】');
    // ───────────────────────────────────────────────────────
    {
      const r = await rpc('initialize', {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'test', version: '1' },
      });
      check('initialize 成功', !!r.result, r.error);
      check('返回 protocolVersion', typeof r.result?.protocolVersion === 'string');
      check('返回 serverInfo', r.result?.serverInfo?.name === 'liuyun-loom');
      check('声明 tools 能力', !!r.result?.capabilities?.tools);
      check('注入 instructions（连上即知道怎么用）',
        typeof r.result?.instructions === 'string' && r.result.instructions.length > 100);
    }

    {
      const r = await rpc('tools/list');
      const tools = r.result?.tools ?? [];
      check('tools/list 成功', Array.isArray(tools));
      check('工具数 = 18（只读 12 + 写入 6）', tools.length === 18, tools.length);

      const readOnly = tools.filter((t: any) => t.annotations?.readOnlyHint === true);
      const write = tools.filter((t: any) => t.annotations?.readOnlyHint === false);
      check('只读工具 12 个', readOnly.length === 12, readOnly.length);
      check('写入工具 6 个', write.length === 6, write.length);

      const names = tools.map((t: any) => t.name);
      const expectedReadOnly = [
        'loom_world_overview', 'loom_list_projects', 'loom_search', 'loom_read_note',
        'loom_list_entries', 'loom_world_map', 'loom_types', 'loom_concepts',
        'loom_active_at', 'loom_check', 'loom_backlinks', 'loom_trace',
      ];
      const expectedWrite = [
        'loom_create_entry', 'loom_update_entry', 'loom_create_type',
        'loom_link', 'loom_write_chapter', 'loom_create_project',
      ];
      check('只读工具名齐全', expectedReadOnly.every((n) => names.includes(n)),
        expectedReadOnly.filter((n) => !names.includes(n)));
      check('写入工具名齐全', expectedWrite.every((n) => names.includes(n)),
        expectedWrite.filter((n) => !names.includes(n)));

      check('每个工具都有 description（面向叙事动作）',
        tools.every((t: any) => typeof t.description === 'string' && t.description.length > 20));
      check('每个工具都有 inputSchema',
        tools.every((t: any) => t.inputSchema && t.inputSchema.type === 'object'));
    }

    // ───────────────────────────────────────────────────────
    console.log('\n【写入工具 ×6】');
    // ───────────────────────────────────────────────────────
    let projectId = '';
    {
      const r = await callTool('loom_create_project', {
        name: '归墟纪',
        description: '境界靠被记住程度决定的世界',
        packs: ['xianxia'],
      });
      check('loom_create_project 成功', !!r?.structuredContent?.id, r);
      projectId = r.structuredContent.id;
      check('返回 path', typeof r.structuredContent.path === 'string');
    }

    {
      const r = await callTool('loom_create_entry', {
        title: '沈砚',
        type: '人物',
        body: '# 沈砚\n\n二十七岁，眉骨有一道旧疤。',
        frontmatter: { age: 27, faction: '云隐宗' },
        projectId,
      });
      check('loom_create_entry 成功', !!r?.structuredContent?.path, r);
    }

    {
      await callTool('loom_create_entry', {
        title: '苏挽', type: '人物', body: '# 苏挽\n\n沈砚的锚。', projectId,
      });
      await callTool('loom_create_entry', {
        title: '陆沉舟', type: '人物', body: '# 陆沉舟\n\n沈砚的师父。', projectId,
      });
      const r = await callTool('loom_list_entries', { type: '人物', projectId });
      check('loom_list_entries 按类型列出', r?.structuredContent?.notes?.length === 3,
        r?.structuredContent?.notes?.length);
    }

    {
      const r = await callTool('loom_link', {
        from: '05-人物/沈砚.md',
        to: '苏挽',
        kind: '情感',
        note: '互为锚点',
        projectId,
      });
      check('loom_link 成功', r?.structuredContent?.created === true, r);
    }

    {
      const r = await callTool('loom_update_entry', {
        path: '05-人物/沈砚.md',
        frontmatter: { status: 'active' },
        append: '他记得所有人的名字，唯独忘了自己是谁。',
        projectId,
      });
      check('loom_update_entry 成功', r?.structuredContent?.updated === true, r);
    }

    {
      const r = await callTool('loom_write_chapter', {
        chapter: 1,
        title: '织机之下',
        content: '# 第1章 织机之下\n\n沈砚在[[云隐宗]]醒来。',
        arc: '卷一·初见',
        projectId,
      });
      check('loom_write_chapter 成功', !!r?.structuredContent?.path, r);
      check('章节落到 03-章节', String(r?.structuredContent?.path).startsWith('03-章节/'),
        r?.structuredContent?.path);
    }

    {
      const r = await callTool('loom_create_type', {
        name: '符箓',
        label: '符箓',
        defaultView: 'list',
        fields: [{ key: 'grade', label: '品阶', type: 'text' }],
        projectId,
      });
      check('loom_create_type 成功', !!r?.structuredContent?.path, r);
    }

    // ───────────────────────────────────────────────────────
    console.log('\n【只读工具 ×12】');
    // ───────────────────────────────────────────────────────
    {
      const r = await callTool('loom_world_overview', { projectId });
      const d = r?.structuredContent;
      check('loom_world_overview 成功', !!d?.project, r);
      check('返回规模与健康度',
        typeof d.notes === 'number' && typeof d.words === 'number' &&
        Array.isArray(d.types) && typeof d.brokenLinks === 'number', d);
      check('章节数已计入', d.chapters >= 1, d.chapters);
    }

    {
      const r = await callTool('loom_list_projects');
      const d = r?.structuredContent;
      check('loom_list_projects 成功', Array.isArray(d?.projects), r);
      check('含当前激活', d.active === projectId);
    }

    {
      const r = await callTool('loom_search', { query: '旧疤', projectId });
      const d = r?.structuredContent;
      check('loom_search 成功', d?.count > 0, d?.count);
      check('命中沈砚', d.hits?.some((h: any) => h.title === '沈砚'));
    }

    {
      const r = await callTool('loom_read_note', { path: '05-人物/沈砚.md', projectId });
      const d = r?.structuredContent;
      check('loom_read_note 成功', d?.title === '沈砚', r);
      check('返回 blocks', Array.isArray(d.blocks) && d.blocks.length > 0);
      check('返回出链', Array.isArray(d.outgoing) && d.outgoing.length >= 1, d.outgoing);
      check('出链已解析', d.outgoing.some((o: any) => o.resolved === true));
      check('返回反链', Array.isArray(d.backlinks));
      check('frontmatter 已合并', d.frontmatter?.status === 'active', d.frontmatter);
    }

    {
      const r = await callTool('loom_list_entries', { projectId });
      check('loom_list_entries 无参返回分组', Array.isArray(r?.structuredContent?.groups), r);
    }

    {
      const r = await callTool('loom_world_map', { projectId });
      const d = r?.structuredContent;
      check('loom_world_map 成功', Array.isArray(d?.nodes) && d.nodes.length > 0, r);
      check('有边', Array.isArray(d.edges) && d.edges.length > 0, d?.edges?.length);
    }

    {
      const r = await callTool('loom_types', { projectId });
      const d = r?.structuredContent;
      check('loom_types 成功', Array.isArray(d?.types) && d.types.length > 0, r);
      check('含仙侠素材包类型', d.types.some((t: any) => t.name === '境界'));
      check('含新建的符箓', d.types.some((t: any) => t.name === '符箓'));
    }

    {
      const r = await callTool('loom_concepts', { projectId });
      check('loom_concepts 成功', Array.isArray(r?.structuredContent?.concepts), r);
    }

    {
      const r = await callTool('loom_active_at', { space: '宇宙', time: '宇宙历', projectId });
      const d = r?.structuredContent;
      check('loom_active_at 成功', Array.isArray(d?.active) && Array.isArray(d?.inactive), r);
    }

    {
      const r = await callTool('loom_check', { projectId });
      const d = r?.structuredContent;
      check('loom_check 成功', d && Array.isArray(d.broken), r);
      check('四类结果齐全',
        Array.isArray(d.broken) && Array.isArray(d.scopeConflicts) &&
        Array.isArray(d.conceptConflicts) && Array.isArray(d.untyped), d);
      check('检测到断链（云隐宗未建）', d.broken.length >= 1, d.broken);
    }

    {
      const r = await callTool('loom_backlinks', { path: '05-人物/苏挽.md', projectId });
      const d = r?.structuredContent;
      check('loom_backlinks 成功', Array.isArray(d?.backlinks), r);
      check('苏挽被沈砚引用', d.backlinks.some((b: any) => b.path === '05-人物/沈砚.md'), d.backlinks);
    }

    {
      const r = await callTool('loom_trace', { path: '05-人物/沈砚.md', direction: 'down', projectId });
      const d = r?.structuredContent;
      check('loom_trace 成功', Array.isArray(d?.nodes), r);
      check('向下能追到关系目标', d.nodes.length >= 1, d.nodes);
    }

    // ───────────────────────────────────────────────────────
    console.log('\n【Resources / Prompts】');
    // ───────────────────────────────────────────────────────
    {
      const r = await rpc('resources/list');
      const list = r.result?.resources ?? [];
      check('resources/list 成功', Array.isArray(list), r);
      check('笔记暴露为 loom://note/*',
        list.length > 0 && list.every((x: any) => String(x.uri).startsWith('loom://note/')),
        list[0]?.uri);
    }

    {
      const r = await rpc('resources/read', { uri: 'loom://note/05-人物/沈砚.md' });
      check('resources/read 成功', r.result?.contents?.length > 0, r.error);
      check('返回 markdown', String(r.result?.contents?.[0]?.text ?? '').includes('沈砚'));
    }

    {
      const r = await rpc('prompts/list');
      const prompts = r.result?.prompts ?? [];
      check('prompts/list 成功', prompts.length === 3, prompts.length);
      check('含 write-chapter', prompts.some((p: any) => p.name === 'write-chapter'));
    }

    {
      const r = await rpc('prompts/get', {
        name: 'write-chapter',
        arguments: { chapter: '2', intent: '沈砚初遇苏挽' },
      });
      const text = r.result?.messages?.[0]?.content?.text ?? '';
      check('prompts/get 成功', text.includes('第 2 章'), r.error);
      check('prompt 里含工作流步骤', text.includes('loom_active_at') && text.includes('loom_check'));
    }

    // ───────────────────────────────────────────────────────
    console.log('\n【错误处理】');
    // ───────────────────────────────────────────────────────
    {
      const r = await callTool('loom_nonexistent', {});
      check('未知工具返回 isError', r?.isError === true, r);
    }

    {
      const r = await rpc('tools/call', { name: 'loom_read_note', arguments: { path: '不存在.md', projectId } });
      check('工具内异常返回 isError', r.result?.isError === true, r.result);
      check('错误信息可读', String(r.result?.content?.[0]?.text ?? '').includes('找不到笔记'));
    }

    {
      const r = await rpc('bogus/method');
      check('未知方法返回 METHOD_NOT_FOUND', r.error?.code === -32601, r.error);
    }

    {
      // 通知（无 id）不应产生响应体
      const res = await fetch(`${BASE}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
      });
      check('通知返回 202 无内容', res.status === 202, res.status);
    }

    // ───────────────────────────────────────────────────────
    console.log('\n【MCP 管理接口】');
    // ───────────────────────────────────────────────────────
    {
      const res = await fetch(`${BASE}/api/tools/mcp-out`);
      const j = await res.json();
      check('GET /api/tools/mcp-out 200', res.ok, j);
      check('暴露 18 工具', j?.data?.counts?.total === 18, j?.data?.counts);
      check('双传输都声明',
        j?.data?.transports?.includes('stdio') && j?.data?.transports?.includes('streamable-http'));
    }

    {
      const res = await fetch(`${BASE}/api/tools/mcp-in`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: '测试服务',
          command: 'node',
          args: ['-e', 'process.exit(0)'],
        }),
      });
      const j = await res.json();
      check('POST /api/tools/mcp-in 201', res.status === 201, j);
      const id = j?.data?.id;

      const listRes = await fetch(`${BASE}/api/tools/mcp-in`);
      const listJ = await listRes.json();
      check('已接入列表含新服务', listJ?.data?.servers?.some((s: any) => s.id === id), listJ?.data);

      // 连接测试：故意用一个立即退出的进程，应报错而不是崩
      const testRes = await fetch(`${BASE}/api/tools/mcp-in/${id}/test`, { method: 'POST' });
      const testJ = await testRes.json();
      check('连接测试返回结果而非崩溃', testRes.ok && testJ?.data, testJ);
      check('失败时给出 error 说明', testJ?.data?.connected === false && !!testJ?.data?.error, testJ?.data);

      const permRes = await fetch(`${BASE}/api/tools/mcp-in/${id}/perm`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'deny', tools: ['danger'] }),
      });
      check('权限控制 200', permRes.ok);

      const delRes = await fetch(`${BASE}/api/tools/mcp-in/${id}`, { method: 'DELETE' });
      check('移除服务 200', delRes.ok);
    }

    {
      const res = await fetch(`${BASE}/api/tools/mcp-in`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: '没有传输方式' }),
      });
      check('缺 command/url 返回 422', res.status === 422, res.status);
    }

    // ───────────────────────────────────────────────────────
    console.log('\n【stdio 传输】');
    // ───────────────────────────────────────────────────────
    {
      const tools = await testStdioTransport(root);
      check('stdio 握手成功', tools.length === 18, tools.length);
    }
  } finally {
    child.kill();
    await fs.rm(root, { recursive: true, force: true }).catch(() => {});
  }

  console.log(`\n───────────────`);
  console.log(`通过 ${pass} · 失败 ${failCount}`);
  if (failCount > 0) {
    console.log('\n失败项：');
    for (const f of failures) console.log('  - ' + f);
    process.exit(1);
  }
}

/** 直接用 stdio 起 MCP 子进程，验证换行分隔的 JSON-RPC */
async function testStdioTransport(root: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.resolve('apps/server/src/mcp-stdio.ts')], {
      env: { ...process.env, LOOM_WORKSPACE: root },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let buf = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('stdio 传输超时'));
    }, 15000);

    child.stdout.on('data', (chunk: Buffer) => {
      buf += chunk.toString('utf8');
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        const t = line.trim();
        if (!t) continue;
        let msg: any;
        try {
          msg = JSON.parse(t);
        } catch {
          continue;
        }
        if (msg.id === 1) {
          child.stdin.write(
            JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }) + '\n',
          );
        } else if (msg.id === 2) {
          clearTimeout(timer);
          child.kill();
          resolve((msg.result?.tools ?? []).map((x: any) => x.name));
          return;
        }
      }
    });

    child.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });

    child.stdin.write(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: 'stdio-test', version: '1' },
        },
      }) + '\n',
    );
  });
}

main().catch((err) => {
  console.error('测试崩溃：', err);
  process.exit(1);
});
