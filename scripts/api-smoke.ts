/**
 * 接口冒烟测试（docs/05 任务 2.10：每个端点至少 1 个用例）
 *
 * 直接起服务、打 HTTP、断言响应形状。不依赖任何测试框架。
 */

import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const PORT = 5199;
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
    const msg = `${name}${detail !== undefined ? ' :: ' + JSON.stringify(detail) : ''}`;
    failures.push(msg);
    console.log(`  ✖ ${msg}`);
  }
}

async function api(
  method: string,
  p: string,
  body?: unknown,
): Promise<{ status: number; json: any }> {
  const res = await fetch(BASE + p, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json; charset=utf-8' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, json };
}

async function waitForServer(timeoutMs = 15000): Promise<void> {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try {
      const res = await fetch(BASE + '/api/health');
      if (res.ok) return;
    } catch {
      /* 还没起来 */
    }
    await new Promise((r) => setTimeout(r, 120));
  }
  throw new Error('服务启动超时');
}

async function main(): Promise<void> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'loom-api-'));
  console.log(`工作区：${root}\n`);

  const child = spawn(
    process.execPath,
    [path.resolve('apps/server/src/main.ts')],
    {
      env: { ...process.env, LOOM_PORT: String(PORT), LOOM_WORKSPACE: root },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  child.stdout.on('data', (d) => process.stdout.write(`  [server] ${d}`));
  child.stderr.on('data', (d) => process.stderr.write(`  [server:err] ${d}`));

  try {
    await waitForServer();

    // ───────────────────────────────────────────────────────
    console.log('\n【小说库】');
    // ───────────────────────────────────────────────────────
    {
      const r = await api('GET', '/api/health');
      check('GET /api/health 200', r.status === 200 && r.json?.ok === true, r.json);
    }

    let projectId = '';
    {
      const r = await api('POST', '/api/library', {
        name: '归墟纪',
        description: '境界靠被记住程度决定的世界',
        packs: ['xianxia'],
      });
      check('POST /api/library 201', r.status === 201, r.json);
      check('返回 id / name / path / dirName', !!r.json?.data?.id && !!r.json?.data?.path, r.json);
      projectId = r.json?.data?.id ?? '';
    }

    {
      const r = await api('GET', '/api/library');
      check('GET /api/library 200', r.status === 200);
      check('含 workspace/root/active/projects', 
        typeof r.json?.data?.workspace === 'string' &&
        Array.isArray(r.json?.data?.projects), r.json?.data);
      check('新书出现在列表', r.json?.data?.projects?.length === 1);
      check('自动激活', r.json?.data?.active === projectId);
    }

    {
      const r = await api('GET', '/api/library/packs');
      check('GET /api/library/packs 200', r.status === 200);
      check('素材包含 xianxia', r.json?.data?.packs?.some((p: any) => p.id === 'xianxia'));
    }

    {
      const r = await api('PATCH', `/api/library/${projectId}`, { description: '改过的简介' });
      check('PATCH /api/library/:id 200', r.status === 200);
      check('简介已更新', r.json?.data?.description === '改过的简介', r.json?.data);
    }

    {
      const r = await api('POST', `/api/library/${projectId}/activate`);
      check('POST /api/library/:id/activate 200', r.status === 200 && r.json?.data?.active === projectId);
    }

    // ───────────────────────────────────────────────────────
    console.log('\n【项目库】');
    // ───────────────────────────────────────────────────────
    {
      const r = await api('GET', `/api/project/${projectId}`);
      check('GET /api/project/:id 200', r.status === 200);
      check('含统计字段', typeof r.json?.data?.notes === 'number' && Array.isArray(r.json?.data?.groups), r.json?.data);
      // 素材包只写 07-类型/ 下的 _type 定义（docs/02 第 13 章），不产生内容笔记
      check('素材包装入后已建类型', r.json?.data?.types > 0, r.json?.data?.types);
    }

    {
      const r = await api('GET', `/api/project/${projectId}/groups`);
      check('GET /groups 200', r.status === 200);
      check('分组是数组', Array.isArray(r.json?.data?.groups));
      check('境界类型已装载', r.json?.data?.groups?.some((g: any) => g.type === '境界'), r.json?.data?.groups?.map((g: any) => g.type));
    }

    {
      const r = await api('GET', `/api/project/${projectId}/group/${encodeURIComponent('境界')}`);
      check('GET /group/:type 200', r.status === 200);
      check('view 推断为 ladder', r.json?.data?.view === 'ladder', r.json?.data?.view);
    }

    let notePath = '';
    {
      const r = await api('POST', `/api/project/${projectId}/entry`, {
        title: '沈砚',
        type: '人物',
        body: '# 沈砚\n\n二十七岁，眉骨有一道旧疤。\n\n与[[苏挽]]互为锚点。',
        frontmatter: { age: 27, faction: '云隐宗' },
      });
      check('POST /entry 201', r.status === 201, r.json);
      notePath = r.json?.data?.path ?? '';
      check('路径含中文目录', notePath.includes('05-人物'), notePath);
    }

    {
      await api('POST', `/api/project/${projectId}/entry`, {
        title: '苏挽',
        type: '人物',
        body: '# 苏挽\n\n沈砚的锚。',
      });
    }

    {
      const r = await api('GET', `/api/project/${projectId}/note/${encodeURI(notePath)}`);
      check('GET /note/*path 200', r.status === 200, r.json);
      check('返回 blocks 而非 HTML', Array.isArray(r.json?.data?.blocks) && r.json.data.blocks.length > 0);
      check('返回 frontmatter', r.json?.data?.frontmatter?.age === 27, r.json?.data?.frontmatter);
      check('返回出链', r.json?.data?.outgoing?.length === 1, r.json?.data?.outgoing);
      check('出链已解析', r.json?.data?.outgoing?.[0]?.resolved === true);
    }

    {
      const r = await api('PATCH', `/api/project/${projectId}/note/${encodeURI(notePath)}`, {
        frontmatter: { status: 'active' },
      });
      check('PATCH /note/*path 200', r.status === 200, r.json);
      const back = await api('GET', `/api/project/${projectId}/note/${encodeURI(notePath)}`);
      check('frontmatter 已合并', back.json?.data?.frontmatter?.status === 'active');
      check('原有字段保留', back.json?.data?.frontmatter?.age === 27);
    }

    {
      const r = await api('GET', `/api/project/${projectId}/graph`);
      check('GET /graph 200', r.status === 200);
      check('有节点', Array.isArray(r.json?.data?.nodes) && r.json.data.nodes.length > 0);
      check('有边', Array.isArray(r.json?.data?.edges) && r.json.data.edges.length > 0, r.json?.data?.edges?.length);
    }

    {
      const r = await api('GET', `/api/project/${projectId}/types`);
      check('GET /types 200', r.status === 200);
      check('类型清单非空', r.json?.data?.types?.length > 0);
      check('境界 defaultView=ladder',
        r.json?.data?.types?.find((t: any) => t.name === '境界')?.defaultView === 'ladder');
    }

    {
      const r = await api('POST', `/api/project/${projectId}/types`, {
        name: '符箓',
        defaultView: 'list',
        fields: [{ key: 'grade', label: '品阶', type: 'text' }],
      });
      check('POST /types 201（新建类型不改代码）', r.status === 201, r.json);
      const after = await api('GET', `/api/project/${projectId}/types`);
      check('新类型已出现', after.json?.data?.types?.some((t: any) => t.name === '符箓'));
    }

    {
      const r = await api('GET', `/api/project/${projectId}/scopes`);
      check('GET /scopes 200', r.status === 200);
      check('含 spaces/times', Array.isArray(r.json?.data?.spaces) && Array.isArray(r.json?.data?.times));
    }

    {
      const r = await api('GET', `/api/project/${projectId}/active-at?space=宇宙&time=宇宙历`);
      check('GET /active-at 200', r.status === 200);
      check('含 active/inactive', Array.isArray(r.json?.data?.active) && Array.isArray(r.json?.data?.inactive));
    }

    {
      const r = await api('GET', `/api/project/${projectId}/search?q=${encodeURIComponent('锚点')}`);
      check('GET /search 200', r.status === 200);
      check('能搜到内容', r.json?.data?.hits?.length > 0, r.json?.data?.hits?.length);
      check('命中沈砚', r.json?.data?.hits?.some((h: any) => h.title === '沈砚'));
    }

    {
      const r = await api('GET', `/api/project/${projectId}/search`);
      check('缺少 q 返回 400', r.status === 400 && r.json?.error?.code === 'BAD_REQUEST', r.json);
    }

    {
      const r = await api('GET', `/api/project/${projectId}/check`);
      check('GET /check 200', r.status === 200);
      check('含四类检查结果',
        Array.isArray(r.json?.data?.broken) &&
        Array.isArray(r.json?.data?.scopeConflicts) &&
        Array.isArray(r.json?.data?.conceptConflicts) &&
        Array.isArray(r.json?.data?.untyped), r.json?.data);
    }

    {
      const r = await api('GET', `/api/project/${projectId}/concepts`);
      check('GET /concepts 200', r.status === 200 && Array.isArray(r.json?.data?.concepts));
    }

    {
      const r = await api('GET', `/api/project/${projectId}/trace?path=${encodeURIComponent(notePath)}&direction=up`);
      check('GET /trace 200', r.status === 200 && Array.isArray(r.json?.data?.nodes));
    }

    {
      const r = await api('POST', `/api/project/${projectId}/reindex`);
      check('POST /reindex 200', r.status === 200);
      check('返回 notes/ms', typeof r.json?.data?.notes === 'number' && typeof r.json?.data?.ms === 'number');
    }

    // ───────────────────────────────────────────────────────
    console.log('\n【工具库 / 导航】');
    // ───────────────────────────────────────────────────────
    {
      const r = await api('GET', '/api/tools');
      check('GET /api/tools 200', r.status === 200);
      check('平面清单（无三级 children）', Array.isArray(r.json?.data?.items), r.json?.data);
      check('8 个功能项', r.json?.data?.items?.length === 8, r.json?.data?.items?.length);
      check('知识链接排第一', r.json?.data?.items?.[0]?.id === 'links');
      check('MCP 合并为一项（不再拆分对外/对内）',
        r.json?.data?.items?.some((x: any) => x.id === 'mcp') &&
        !r.json?.data?.items?.some((x: any) => x.id === 'mcp-out' || x.id === 'mcp-in'),
        r.json?.data?.items?.map((x: any) => x.id));
      check('全局搜索不在工具库（已移品牌区）',
        !r.json?.data?.items?.some((x: any) => x.id === 'search'));
      check('设置/导入导出不在工具库（已移右下角）',
        !r.json?.data?.items?.some((x: any) => x.id === 'settings' || x.id === 'io'));
      check('工具项无 children 字段',
        r.json?.data?.items?.every((x: any) => x.children === undefined));
    }

    {
      const r = await api('GET', '/api/views');
      check('GET /api/views 200', r.status === 200);
      check('七种视图齐全', Object.keys(r.json?.data?.views ?? {}).length === 7);
    }

    {
      const r = await api('GET', '/api/nav');
      check('GET /api/nav 200', r.status === 200);
      check('四个根节点', r.json?.data?.roots?.length === 4, r.json?.data?.roots?.length);
      check('一级是小说库/灵感墙/关系网/工作区',
        r.json?.data?.roots?.map((x: any) => x.id).join(',') === 'library,ideas,graph,project');
      const proj = r.json?.data?.roots?.find((x: any) => x.id === 'project');
      check('激活的书展开三级', proj?.children?.[0]?.expanded === true);
      check('三级含关系网与灵感（共 7 项）', proj?.children?.[0]?.children?.length === 7,
        proj?.children?.[0]?.children?.length);
      check('关系网在三级目录里',
        proj?.children?.[0]?.children?.some((c: any) => c.id === 'graph'));
      const toolRoot = r.json?.data?.roots?.find((x: any) => x.id === 'project');
      check('工作区二级有项目列表', Array.isArray(toolRoot?.children), toolRoot?.children?.length);
    }

    // ───────────────────────────────────────────────────────
    console.log('\n【错误处理】');
    // ───────────────────────────────────────────────────────
    {
      const r = await api('GET', '/api/project/不存在');
      check('未知项目 404', r.status === 404 && r.json?.error?.code === 'NOT_FOUND', r.json);
    }
    {
      const r = await api('GET', `/api/project/${projectId}/note/${encodeURI('不存在.md')}`);
      check('未知笔记 404', r.status === 404, r.json);
    }
    {
      const r = await api('POST', '/api/library', {});
      check('缺 name 返回 422', r.status === 422 && r.json?.error?.code === 'VALIDATION_FAILED', r.json);
    }
    {
      const r = await api('GET', '/api/nope');
      check('未知接口 404', r.status === 404);
    }
    {
      const r = await fetch(BASE + '/api/library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{坏 JSON',
      });
      check('坏 JSON 返回 400', r.status === 400);
    }

    // ───────────────────────────────────────────────────────
    console.log('\n【删除】');
    // ───────────────────────────────────────────────────────
    {
      const r = await api('DELETE', `/api/project/${projectId}/note/${encodeURI(notePath)}`);
      check('DELETE /note/*path 200', r.status === 200, r.json);
      const after = await api('GET', `/api/project/${projectId}/note/${encodeURI(notePath)}`);
      check('删除后 404', after.status === 404);
    }

    {
      const r = await api('DELETE', `/api/library/${projectId}`);
      check('DELETE /api/library/:id 200', r.status === 200);
      check('返回 movedTo 含 .trash', String(r.json?.data?.movedTo ?? '').includes('.trash'), r.json?.data);
      const after = await api('GET', '/api/library');
      check('列表已移除', after.json?.data?.projects?.length === 0);
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

main().catch((err) => {
  console.error('测试崩溃：', err);
  process.exit(1);
});
