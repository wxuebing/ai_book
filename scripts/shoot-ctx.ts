/** 专门验证右键菜单：在项目库的书名上右键 */

import { chromium } from 'playwright-core';
import path from 'node:path';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = 'http://127.0.0.1:5178';
const OUT = 'shots';

async function main(): Promise<void> {
  const browser = await chromium.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars'],
  });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, locale: 'zh-CN' });
  const page = await ctx.newPage();

  await page.goto(BASE + '/library', { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);

  // 直接派发 contextmenu 事件到项目库二级书名（第二个 .nav-item.level-2）
  const items = page.locator('.nav-item.level-2');
  const n = await items.count();
  console.log(`二级节点数：${n}`);

  // 打印每个节点的文本，确认哪个是项目库的书
  for (let i = 0; i < n; i++) {
    const t = (await items.nth(i).innerText()).replace(/\s+/g, ' ').trim();
    console.log(`  [${i}] ${t}`);
  }

  // 项目库的书是最后一个（导航顺序：小说库的书 → 项目库的书）
  const target = items.nth(1); // [0]=小说库的书, [1]=项目库的书
  const box = await target.boundingBox();
  console.log(`目标位置：${JSON.stringify(box)}`);

  if (box) {
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' });
    await page.waitForTimeout(600);
    const menuCount = await page.locator('.ctx-menu').count();
    console.log(`菜单出现：${menuCount > 0 ? '是' : '否'}`);
    await page.screenshot({ path: path.resolve(OUT, '11-ctx-menu.png') });
  }

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
