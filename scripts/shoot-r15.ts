/** 第十五轮验收：设定检索结果条目卡片 + 详情/编辑弹窗 + 回收站按钮 */
import { chromium } from 'playwright-core';
import { mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = 'http://127.0.0.1:5178';
const OUT = 'shots';
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });
async function main(): Promise<void> {
  const r = await fetch(`${BASE}/api/library`);
  const j = (await r.json()) as { data?: { active?: string | null } };
  const id = j?.data?.active ?? '';
  const b = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars'] });
  const p = await (await b.newContext({ viewport: { width: 1600, height: 1000 }, locale: 'zh-CN' })).newPage();

  // 设定页
  await p.goto(`${BASE}/project/${id}/settings`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(1200);
  await p.screenshot({ path: path.resolve(OUT, 'r15-settings.png') });
  const cards = await p.locator('.entry-card-clickable').count();
  console.log('entry cards:', cards);

  // 点第一张卡片 → 详情弹窗
  if (cards > 0) {
    await p.locator('.entry-card-clickable').first().click();
    await p.waitForTimeout(700);
    await p.screenshot({ path: path.resolve(OUT, 'r15-entry-detail.png') });
    // 点笔图标 → 编辑
    const pen = p.locator('.entry-edit-pen');
    if (await pen.count()) {
      await pen.click();
      await p.waitForTimeout(500);
      await p.screenshot({ path: path.resolve(OUT, 'r15-entry-edit.png') });
    }
    await p.keyboard.press('Escape');
  }

  // 回收站
  await p.goto(`${BASE}/settings/trash`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(700);
  await p.screenshot({ path: path.resolve(OUT, 'r15-trash.png') });
  const purgeAll = await p.locator('text=全部清除').count();
  console.log('purge-all button:', purgeAll);
  await b.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
