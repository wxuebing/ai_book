/**
 * 性能基准（docs/03 第 9 章、docs/05 任务 1.18 / 1.20）
 *
 * 验收目标：
 *   全量索引 1000 篇 < 2s
 *   全文检索 1000 篇 < 200ms
 *   首屏加载  100 篇 < 800ms
 *   单篇打开          < 150ms
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { Workspace } from '../src/workspace.ts';

let root: string;
let ws: Workspace;
let projectId: string;

const N = 1000;

before(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'loom-perf-'));
  ws = new Workspace(root);
  await ws.init('性能测试');

  const p = await ws.create({ name: '规模书', packs: ['xianxia'] });
  projectId = p.id;

  // 直接写盘，绕开引擎逐篇 touch 的开销
  const dir = path.join(p.path, '05-人物');
  await fs.mkdir(dir, { recursive: true });
  const writes: Array<Promise<void>> = [];
  for (let i = 0; i < N; i++) {
    const body = [
      '---',
      'type: 人物',
      `title: 人物${i}`,
      `age: ${20 + (i % 40)}`,
      `order: ${i}`,
      'scope:',
      `  space: ${i % 2 === 0 ? '东域' : '西荒'}`,
      'relations:',
      `  - to: 人物${(i + 1) % N}`,
      '    kind: 情感',
      '---',
      '',
      `# 人物${i}`,
      '',
      `这是第 ${i} 个人物。他来自${i % 2 === 0 ? '东域' : '西荒'}，修为第 ${i % 9} 阶。`,
      '',
      `与[[人物${(i + 1) % N}]]有旧。伏笔关键词：缄默${i % 50}。`,
      '',
    ].join('\n');
    writes.push(fs.writeFile(path.join(dir, `人物${i}.md`), body, 'utf8'));
  }
  await Promise.all(writes);
});

after(async () => {
  await ws.releaseAll();
  await fs.rm(root, { recursive: true, force: true });
});

test(`全量索引 ${N} 篇 < 2000ms（任务 1.18）`, async () => {
  const engine = (await ws.engine(projectId))!;
  const t0 = Date.now();
  await engine.reindex();
  const ms = Date.now() - t0;
  console.log(`    索引 ${N} 篇耗时 ${ms}ms`);
  assert.ok(ms < 2000, `索引太慢：${ms}ms`);
});

test(`全文检索 ${N} 篇 < 200ms（任务 1.20）`, async () => {
  const engine = (await ws.engine(projectId))!;
  await engine.stats(); // 确保已加载

  // 预热
  await engine.search('缄默');

  const t0 = Date.now();
  const hits = await engine.search('缄默7', 50);
  const ms = Date.now() - t0;
  console.log(`    检索耗时 ${ms}ms，命中 ${hits.length} 条`);
  assert.ok(hits.length > 0, '应当能搜到内容');
  assert.ok(ms < 200, `检索太慢：${ms}ms`);
});

test('中文检索可用（trigram 或降级 LIKE）', async () => {
  const engine = (await ws.engine(projectId))!;
  await engine.stats();

  const two = await engine.search('缄默', 10);      // 2 字，trigram 需降级
  assert.ok(two.length > 0, '2 字查询应有结果');

  const three = await engine.search('缄默7', 10);   // 3 字，可走 FTS
  assert.ok(three.length > 0, '3 字查询应有结果');

  const long = await engine.search('人物', 10);
  assert.ok(long.length > 0, '长查询应有结果');
});

test('首屏统计（含分组）< 800ms（100 篇场景宽松验证）', async () => {
  const engine = (await ws.engine(projectId))!;
  const t0 = Date.now();
  await engine.stats();
  await engine.groups();
  const ms = Date.now() - t0;
  console.log(`    首屏统计耗时 ${ms}ms`);
  assert.ok(ms < 800, `首屏太慢：${ms}ms`);
});

test('单篇打开 < 150ms', async () => {
  const engine = (await ws.engine(projectId))!;
  await engine.stats();
  const t0 = Date.now();
  const n = await engine.note('05-人物/人物500.md');
  const ms = Date.now() - t0;
  console.log(`    单篇打开耗时 ${ms}ms`);
  assert.ok(n);
  assert.ok(ms < 150, `单篇太慢：${ms}ms`);
});

test(`关系图 ${N} 节点可构建 < 500ms`, async () => {
  const engine = (await ws.engine(projectId))!;
  await engine.stats();
  const t0 = Date.now();
  const g = await engine.graph();
  const ms = Date.now() - t0;
  console.log(`    关系图 ${g.nodes.length} 节点 / ${g.edges.length} 边，耗时 ${ms}ms`);
  assert.ok(g.nodes.length >= N);
  assert.ok(ms < 500, `关系图太慢：${ms}ms`);
});
