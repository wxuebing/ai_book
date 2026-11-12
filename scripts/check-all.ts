/** 跑全部验收套件，汇总通过/失败 */

import { execFileSync } from 'node:child_process';

const BASE = process.env.LOOM_BASE ?? 'http://127.0.0.1:5178';

/**
 * 每套测试前确保有激活的书。
 *
 * 教训：归档/恢复类测试会让 active 变 null，导致后续所有套件连锁失败
 * （表现为"找不到小说：null"）。测试之间必须自己把前置状态修好，
 * 不能依赖上一套留下的状态。
 */
async function ensureActive(): Promise<void> {
  try {
    const r = await fetch(`${BASE}/api/library`);
    const j = (await r.json()) as { data?: { active?: string | null; projects?: Array<{ id: string }> } };
    if (j?.data?.active) return;
    const first = j?.data?.projects?.[0];
    if (!first) return;
    await fetch(`${BASE}/api/library/${first.id}/activate`, { method: 'POST' });
    console.log(`（已恢复激活书：${first.id}）`);
  } catch {
    /* 服务没起来就交给各套件自己报错 */
  }
}

const suites = [
  'api-smoke',
  'mcp-smoke',
  'ui-check',
  'nav-check',
  'nav-check2',
  'board-check',
  'graph-check',
  'quote-check',
  'hierarchy-check',
  'plus-check',
  'button-check',
  'round6-check',
  'logo-check',
  'round8-check',
  'round9-check',
  'round11-check',
];

let failed = 0;
const results: Array<{ name: string; ok: boolean; out: string }> = [];

for (const s of suites) {
  await ensureActive();
  try {
    const out = execFileSync('node', [`scripts/${s}.ts`], { encoding: 'utf8', timeout: 120000 });
    const m = out.match(/通过 (\d+) · 失败 (\d+)/);
    results.push({ name: s, ok: true, out: m ? `${m[1]} 项` : 'ok' });
  } catch (e) {
    failed++;
    const err = e as { stdout?: string; stderr?: string };
    const m = (err.stdout ?? '').match(/通过 (\d+) · 失败 (\d+)/);
    const bad = (err.stdout ?? '')
      .split('\n')
      .filter((l) => l.includes('✖'))
      .slice(0, 3)
      .map((l) => l.trim());
    const crash = (err.stderr ?? '')
      .split('\n')
      .find((l) => l.includes('TypeError') || l.includes('Error:'));
    results.push({
      name: s,
      ok: false,
      out: (m ? `${m[1]} 项, 失败 ${m[2]}` : 'error') + ' | ' + (bad.join(' ; ') || crash || ''),
    });
  }
}

console.log('\n═══ 验收汇总 ═══');
for (const r of results) {
  console.log(`${r.ok ? '✔' : '✖'} ${r.name.padEnd(16)} ${r.out}`);
}

// 内核测试：Node 24 需要显式文件列表（传目录会当作单文件而失败）
// 输出格式是 `ℹ pass N` / `ℹ fail N`（不是 `# pass`）
function readCounts(out: string): { pass: string; fail: string } {
  const p = out.match(/[ℹ#]\s*pass\s+(\d+)/);
  const f = out.match(/[ℹ#]\s*fail\s+(\d+)/);
  return { pass: p?.[1] ?? '?', fail: f?.[1] ?? '?' };
}

try {
  const files = execFileSync(
    'node',
    [
      '-e',
      'console.log(require("node:fs").readdirSync("packages/core/test").filter(f=>f.endsWith(".test.ts")).map(f=>"packages/core/test/"+f).join(" "))',
    ],
    { encoding: 'utf8' },
  )
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const out = execFileSync('node', ['--test', ...files], {
    encoding: 'utf8',
    timeout: 180000,
  });
  const { pass, fail: failN } = readCounts(out);
  if (Number(failN) > 0) failed++;
  console.log(`${Number(failN) === 0 ? '✔' : '✖'} core             ${pass} pass / ${failN} fail`);
} catch (e) {
  failed++;
  const out = (e as { stdout?: string }).stdout ?? '';
  const { pass, fail: failN } = readCounts(out);
  console.log(`✖ core             ${pass} pass / ${failN} fail`);
}

console.log(`\n${failed === 0 ? '全部通过' : `${failed} 套失败`}`);
process.exitCode = failed > 0 ? 1 : 0;
