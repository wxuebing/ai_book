/** 第十四轮验收：小说二级导航栏（右侧展开）+ 图标检查 */
import { chromium } from 'playwright-core';
import { mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = 'http://127.0.0.1:5178';
const OUT = 'shots';
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });
async function main(): Promise<void> {
  const r = await fetch(`${BASE}/api/library`);
  const j = (await r.json()) as { data?: { active?: string | null; projects?: Array<{ id: string }> } };
  const id = j?.data?.active ?? j?.data?.projects?.[0]?.id ?? '';
  const b = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars'] });
  const p = await (await b.newContext({ viewport: { width: 1600, height: 1000 }, locale: 'zh-CN' })).newPage();
  const shots = [
    { name: 'r14-project-home', url: `/project/${id}` },
    { name: 'r14-project-outline', url: `/project/${id}/outline` },
    { name: 'r14-project-graph', url: `/project/${id}/graph` },
  ];
  for (const s of shots) {
    await p.goto(BASE + s.url, { waitUntil: 'networkidle' });
    await p.waitForTimeout(1000);
    await p.screenshot({ path: path.resolve(OUT, `${s.name}.png`) });
    console.log('✔', s.name);
  }
  const subnavCount = await p.locator('.project-subnav .settings-subnav-item').count();
  console.log('subnav items:', subnavCount);
  await b.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
