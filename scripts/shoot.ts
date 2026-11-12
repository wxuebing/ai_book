/**
 * 用真实浏览器截图验收前端（playwright-core + 本机 Chrome）。
 *
 * 用户原话：「打开项目预览看，别一天到晚就知道逮着你的代码看，把项目前端用你的眼睛看！」
 */

import { chromium } from 'playwright-core';
import { mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.env.LOOM_BASE ?? 'http://127.0.0.1:5178';
const OUT = 'shots';

if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

async function getActiveProject(): Promise<string> {
  const r = await fetch(`${BASE}/api/library`);
  const j = (await r.json()) as { data?: { active?: string | null; projects?: Array<{ id: string }> } };
  // active 可能为 null（被归档测试清掉），用列表第一本兜底
  const id = j?.data?.active ?? j?.data?.projects?.[0]?.id ?? '';
  if (id && !j?.data?.active) {
    await fetch(`${BASE}/api/library/${id}/activate`, { method: 'POST' });
  }
  return id;
}

async function main(): Promise<void> {
  const id = await getActiveProject();
  console.log(`激活项目：${id}\n`);

  const browser = await chromium.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars'],
  });

  const ctx = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
    deviceScaleFactor: 1,
    locale: 'zh-CN',
  });
  const page = await ctx.newPage();

  const shots: Array<{ name: string; url: string; h?: number; full?: boolean }> = [
    { name: '01-library', url: '/library' },
    { name: '02-library-info', url: `/library/${id}/info` },
    { name: '03-library-stats', url: `/library/${id}/stats`, full: true },
    { name: '04-project', url: `/project/${id}` },
    { name: '05-project-settings', url: `/project/${id}/settings`, full: true },
    { name: '06-project-ideas', url: `/project/${id}/ideas` },
    { name: '07-tools-links', url: '/tools/links' },
    { name: '08-tools-stats', url: '/tools/stats', full: true },
    { name: '09-tools-types', url: '/tools/types' },
  ];

  for (const s of shots) {
    try {
      await page.goto(BASE + s.url, { waitUntil: 'networkidle', timeout: 20000 });
      await page.waitForTimeout(700);
      const file = path.resolve(OUT, `${s.name}.png`);
      await page.screenshot({ path: file, fullPage: s.full ?? false });
      console.log(`  ✔ ${s.name}.png`);
    } catch (e) {
      console.log(`  ✖ ${s.name} — ${(e as Error).message.slice(0, 90)}`);
    }
  }

  // 收缩态单独截一张（点击收放按钮）
  try {
    await page.goto(BASE + '/library', { waitUntil: 'networkidle' });
    await page.click('.nav-collapse-btn');
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.resolve(OUT, '10-nav-collapsed.png') });
    console.log('  ✔ 10-nav-collapsed.png');
  } catch (e) {
    console.log(`  ✖ 10-nav-collapsed — ${(e as Error).message.slice(0, 90)}`);
  }

  await browser.close();
  console.log(`\n截图目录：${path.resolve(OUT)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
