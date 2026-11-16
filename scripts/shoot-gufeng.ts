/**
 * 古风主题改造验收截图：切主题 + 拍导航底部双钮特写。
 * 用法：node scripts/shoot-gufeng.ts   （需先启动 5178 服务）
 */

import { chromium } from 'playwright-core';
import { mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.env.LOOM_BASE ?? 'http://127.0.0.1:5178';
const OUT = 'shots/gufeng';

if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

async function shoot(page: import('playwright-core').Page, name: string, url: string, full = false) {
  await page.goto(BASE + url, { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.resolve(OUT, name), fullPage: full });
  console.log(`  ✔ ${name}`);
}

async function main() {
  // 清掉可能残留的主题，保证从默认开始
  const browser = await chromium.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars'],
  });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, locale: 'zh-CN' });
  const page = await ctx.newPage();

  // 只清一次残留主题（清完 reload 生效），之后切换的主题要能保留，不能再每次导航都清
  await page.goto(BASE + '/library', { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    try {
      localStorage.removeItem('loom:theme');
    } catch {
      /* ignore */
    }
  });
  await page.reload({ waitUntil: 'networkidle' });

  await shoot(page, '01-library-moyun.png', '/library');
  await shoot(page, '02-themes.png', '/settings/appearance');

  // 导航底部双钮特写
  try {
    await page.locator('.nav-bottom').screenshot({ path: path.resolve(OUT, '03-navbottom.png') });
    console.log('  ✔ 03-navbottom.png');
  } catch (e) {
    console.log('  ✖ navbottom — ' + (e as Error).message.slice(0, 80));
  }

  // 逐一切换主题并拍 /library 与主题页
  const themes: Array<[string, string]> = [
    ['青绿山水', 'qinglv'],
    ['烟雨江南', 'yanyu'],
    ['朱砂笺', 'zhusha'],
    ['月白霜天', 'yuebai'],
    ['竹影清风', 'zhuying'],
  ];
  await page.goto(BASE + '/settings/appearance', { waitUntil: 'networkidle' });
  for (const [name, id] of themes) {
    try {
      await page.locator('.theme-card', { hasText: name }).first().click();
      await page.waitForTimeout(350);
      await page.screenshot({ path: path.resolve(OUT, `theme-${id}-page.png`) });
      await shoot(page, `theme-${id}-library.png`, '/library');
      await page.goto(BASE + '/settings/appearance', { waitUntil: 'networkidle' });
      console.log(`  ✔ theme ${name}`);
    } catch (e) {
      console.log(`  ✖ theme ${name} — ${(e as Error).message.slice(0, 80)}`);
    }
  }

  // 收缩态导航（默认主题）
  try {
    await page.goto(BASE + '/library', { waitUntil: 'networkidle' });
    await page.click('.nav-collapse-btn');
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.resolve(OUT, '04-nav-collapsed.png') });
    await page.locator('.nav-bottom').screenshot({ path: path.resolve(OUT, '05-navbottom-collapsed.png') });
    console.log('  ✔ collapsed');
  } catch (e) {
    console.log('  ✖ collapsed — ' + (e as Error).message.slice(0, 80));
  }

  await browser.close();
  console.log(`\n截图目录：${path.resolve(OUT)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
