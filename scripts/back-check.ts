/** 返回按钮功能验证：从 /library 进详情，点返回应回到 /library */
import { chromium } from 'playwright-core';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = 'http://127.0.0.1:5178';

async function main(): Promise<void> {
  const r = await fetch(`${BASE}/api/library`);
  const j = (await r.json()) as { data?: { active?: string | null; projects?: Array<{ id: string }> } };
  const id = j?.data?.active ?? j?.data?.projects?.[0]?.id ?? '';

  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  const page = await (await browser.newContext({ locale: 'zh-CN' })).newPage();

  // 1) 从小说库列表进入详情，点返回 → 应回 /library
  await page.goto(`${BASE}/library`, { waitUntil: 'networkidle' });
  await page.goto(`${BASE}/library/${id}/info`, { waitUntil: 'networkidle' });
  await page.locator('.back-btn').click();
  await page.waitForTimeout(400);
  console.log('返回后 URL(有历史):', new URL(page.url()).pathname);

  // 2) 深链直开（无历史），点返回 → 应回 fallback /library
  const page2 = await (await browser.newContext({ locale: 'zh-CN' })).newPage();
  await page2.goto(`${BASE}/library/${id}/info`, { waitUntil: 'networkidle' });
  await page2.locator('.back-btn').click();
  await page2.waitForTimeout(400);
  console.log('返回后 URL(深链):', new URL(page2.url()).pathname);

  // 3) 其它页面是否存在返回按钮
  for (const p of ['/project/' + id, '/project/' + id + '/settings', '/project/' + id + '/ideas']) {
    await page.goto(BASE + p, { waitUntil: 'networkidle' });
    const n = await page.locator('.back-btn').count();
    console.log(`back-btn @ ${p}: ${n}`);
  }

  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
