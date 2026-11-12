/** 第十六轮验收：设定编辑弹窗简化+删除；类型管理底部恢复按钮+确认 */
import { chromium } from 'playwright-core';
import { mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = 'http://127.0.0.1:5178';
const OUT = 'shots';
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });
async function main(): Promise<void> {
  const r = await fetch(`${BASE}/api/library`);
  const id = ((await r.json()) as any).data.active;
  const b = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars'] });
  const p = await (await b.newContext({ viewport: { width: 1600, height: 1000 }, locale: 'zh-CN' })).newPage();

  // 设定页 → 点卡片 → 编辑弹窗
  await p.goto(`${BASE}/project/${id}/settings`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(1000);
  await p.locator('.entry-card-clickable').first().click();
  await p.waitForTimeout(500);
  await p.screenshot({ path: path.resolve(OUT, 'r16-entry-detail.png') });
  await p.locator('.entry-edit-pen').click();
  await p.waitForTimeout(400);
  await p.screenshot({ path: path.resolve(OUT, 'r16-entry-edit.png') });
  // 点删除这个设定 → 出现确认
  await p.locator('text=删除这个设定').click();
  await p.waitForTimeout(300);
  await p.screenshot({ path: path.resolve(OUT, 'r16-entry-del-confirm.png') });
  await p.keyboard.press('Escape');

  // 类型管理：滚到底部看恢复按钮
  await p.goto(`${BASE}/settings/types`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(900);
  await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await p.waitForTimeout(300);
  await p.screenshot({ path: path.resolve(OUT, 'r16-types-bottom.png') });
  // 点恢复 → 确认块
  const rb = p.locator('.type-restore-btn');
  if (await rb.count()) { await rb.click(); await p.waitForTimeout(400); await p.screenshot({ path: path.resolve(OUT, 'r16-types-confirm.png') }); }

  console.log('done');
  await b.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
