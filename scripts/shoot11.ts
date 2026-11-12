/** 第十一轮截图：导航、设置三栏、小说库、设定页 */

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
  let id = j?.data?.active ?? j?.data?.projects?.[0]?.id ?? '';
  if (id && !j?.data?.active) {
    await fetch(`${BASE}/api/library/${id}/activate`, { method: 'POST' });
  }
  console.log(`项目：${id}`);

  const browser = await chromium.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars'],
  });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, locale: 'zh-CN' });
  const page = await ctx.newPage();

  const shots: Array<{ name: string; url: string; full?: boolean }> = [
    { name: 'r11-01-nav', url: '/library' },
    { name: 'r11-02-library-detail', url: `/library/${id}` },
    { name: 'r11-03-settings-plain', url: '/settings/plain', full: true },
    { name: 'r11-04-settings-mcp', url: '/settings/mcp', full: true },
    { name: 'r11-05-settings-trash', url: '/settings/trash' },
    { name: 'r11-06-settings-types', url: '/settings/types' },
    { name: 'r11-07-project-settings', url: `/project/${id}/settings`, full: true },
  ];

  for (const s of shots) {
    try {
      await page.goto(BASE + s.url, { waitUntil: 'networkidle', timeout: 20000 });
      await page.waitForTimeout(700);
      await page.screenshot({ path: path.resolve(OUT, `${s.name}.png`), fullPage: s.full ?? false });
      console.log(`  ✔ ${s.name}.png`);
    } catch (e) {
      console.log(`  ✖ ${s.name} — ${(e as Error).message.slice(0, 80)}`);
    }
  }

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
