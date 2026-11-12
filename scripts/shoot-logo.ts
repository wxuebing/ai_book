/** 只截导航品牌区，放大看 logo 细节 */

import { chromium } from 'playwright-core';
import path from 'node:path';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = 'http://127.0.0.1:5178';

async function main(): Promise<void> {
  const browser = await chromium.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox', '--disable-gpu'],
  });

  // 高倍率截品牌区，看清 32px logo 的圆角
  const ctx = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
    deviceScaleFactor: 4,
    locale: 'zh-CN',
  });
  const page = await ctx.newPage();
  await page.goto(BASE + '/library', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);

  await page.screenshot({
    path: path.resolve('shots', 'logo-zoom.png'),
    clip: { x: 0, y: 0, width: 180, height: 70 },
  });
  console.log('  ✔ logo-zoom.png（4x 放大品牌区）');

  // 收缩态
  await page.click('.nav-collapse-btn');
  await page.waitForTimeout(800);
  await page.screenshot({
    path: path.resolve('shots', 'logo-zoom-collapsed.png'),
    clip: { x: 0, y: 0, width: 120, height: 140 },
  });
  console.log('  ✔ logo-zoom-collapsed.png（收缩态）');

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
