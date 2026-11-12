/** 第十三轮验收：便签墙（书详情/独立页+下拉）、关系网检索底板 */
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
  console.log('项目:', id);

  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars'] });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, locale: 'zh-CN' });
  const page = await ctx.newPage();

  // 1) 书详情页（便签墙 + 编辑/删除按钮 hover）
  await page.goto(`${BASE}/library/${id}/info`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.resolve(OUT, 'r13-detail-top.png') });
  // 滚到底部便签墙
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(500);
  // hover 第一张便签显示操作按钮
  const sticky = page.locator('.sticky').first();
  if (await sticky.count()) { await sticky.hover(); await page.waitForTimeout(300); }
  await page.screenshot({ path: path.resolve(OUT, 'r13-detail-wall.png') });

  // 2) 点便签弹窗
  if (await sticky.count()) {
    await page.locator('.sticky-main').first().click();
    await page.waitForTimeout(700);
    await page.screenshot({ path: path.resolve(OUT, 'r13-sticky-dialog.png') });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  }

  // 3) 独立便签墙页 + 小说下拉
  await page.goto(`${BASE}/ideas`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.resolve(OUT, 'r13-notes-page.png') });
  const trig = page.locator('.book-switch-trigger');
  if (await trig.count()) {
    await trig.click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.resolve(OUT, 'r13-notes-dropdown.png') });
    await page.keyboard.press('Escape').catch(() => {});
  }

  // 4) 关系网（检索底板）
  await page.goto(`${BASE}/project/${id}/graph`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.resolve(OUT, 'r13-graph.png') });

  // 结构断言
  await page.goto(`${BASE}/ideas`, { waitUntil: 'networkidle' });
  const checks = {
    bookSwitch: await page.locator('.book-switch-trigger').count(),
    wallBar: await page.locator('.idea-wall-bar').count(),
  };
  console.log('checks:', JSON.stringify(checks));
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
