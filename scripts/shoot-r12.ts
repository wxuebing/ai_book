/** 第十二轮验收截图：小说库详情页（关系网文字面板 + 统计并入 + 返回按钮） */
import { chromium } from 'playwright-core';
import { mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.env.LOOM_BASE ?? 'http://127.0.0.1:5178';
const OUT = 'shots';

if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

async function main(): Promise<void> {
  const r = await fetch(`${BASE}/api/library`);
  const j = (await r.json()) as { data?: { active?: string | null; projects?: Array<{ id: string }> } };
  const id = j?.data?.active ?? j?.data?.projects?.[0]?.id ?? '';
  console.log(`项目：${id}`);

  const browser = await chromium.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars'],
  });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1, locale: 'zh-CN' });
  const page = await ctx.newPage();

  const shots = [
    { name: 'r12-library-info', url: `/library/${id}/info`, full: true },
    { name: 'r12-library-info-fold', url: `/library/${id}/info` },
    { name: 'r12-project-home', url: `/project/${id}` },
  ];
  for (const s of shots) {
    try {
      await page.goto(BASE + s.url, { waitUntil: 'networkidle', timeout: 20000 });
      await page.waitForTimeout(900);
      await page.screenshot({ path: path.resolve(OUT, `${s.name}.png`), fullPage: s.full ?? false });
      console.log(`  ✔ ${s.name}.png`);
    } catch (e) {
      console.log(`  ✖ ${s.name} — ${(e as Error).message.slice(0, 100)}`);
    }
  }

  // 返回按钮存在性检查
  await page.goto(BASE + `/library/${id}/info`, { waitUntil: 'networkidle' });
  const backExists = await page.locator('.back-btn').count();
  console.log(`back-btn count on info page: ${backExists}`);

  await browser.close();
  console.log(`\n目录：${path.resolve(OUT)}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
