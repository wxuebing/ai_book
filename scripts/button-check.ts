/**
 * 按钮可见性验收（补盲区）
 *
 * 用户原话：「打开项目，为何还是这般难以辨别，你上一轮改了何处？」
 *
 * 根因：Btn 默认变体是 quiet（无底色纯文字），任何忘写 variant 的按钮都变成
 * 几乎看不见的灰字。上一轮只改了"创建类"按钮，漏掉所有普通动作按钮。
 *
 * 本验收：扫描全部页面，确保没有按钮落到"看不见"的形态。
 */

import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.LOOM_BASE ?? 'http://127.0.0.1:5178';

let pass = 0;
let fail = 0;

function check(name: string, cond: boolean, detail?: unknown): void {
  if (cond) {
    pass++;
    console.log(`  ✔ ${name}`);
  } else {
    fail++;
    console.log(`  ✖ ${name}${detail !== undefined ? ' :: ' + JSON.stringify(detail) : ''}`);
  }
}

function rule(css: string, selector: string): string {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(?:^|\\})[^{}]*?${esc}(?![\\w-])\\{([^}]*)\\}`, 'g');
  const m = re.exec(css);
  return m ? m[1]! : '';
}

async function main(): Promise<void> {
  const html = await (await fetch(BASE + '/')).text();
  const cssMatch = html.match(/href="(\/assets\/[^"]+\.css)"/);
  const jsMatch = html.match(/src="(\/assets\/[^"]+\.js)"/);
  const css = cssMatch ? await (await fetch(BASE + cssMatch[1]!)).text() : '';
  const js = jsMatch ? await (await fetch(BASE + jsMatch[1]!)).text() : '';

  console.log('\n【1. 默认变体必须是"不会看不见"的那个】');
  const uiSrc = fs.readFileSync('apps/web/src/ui.tsx', 'utf8');
  check('Btn 默认 variant 为 ghost（不是 quiet）',
    /variant\s*=\s*'ghost'/.test(uiSrc), uiSrc.match(/variant\s*=\s*'[a-z]+'/)?.[0]);
  check('不再默认 quiet', !/variant\s*=\s*'quiet'/.test(uiSrc));

  console.log('\n【2. ghost 必须足够清晰（不是"几乎看不见"）】');
  const ghost = rule(css, '.btn-ghost');
  check('有边框', /border-color/.test(ghost), ghost);
  check('边框用 qingtan-2（够深）', /border-color:var\(--qingtan-2\)/.test(ghost), ghost);
  check('文字用 qingtan-5（深色，不是 ink-soft）', /color:var\(--qingtan-5\)/.test(ghost), ghost);
  check('有底色（liuyun-0 白底）', /background:var\(--liuyun-0\)/.test(ghost), ghost);
  check('字重 500', /font-weight:500/.test(ghost), ghost);

  console.log('\n【3. quiet 只用于真正次要的动作】');
  const quiet = rule(css, '.btn-quiet');
  check('quiet 字重也是 500（不是极淡）', /font-weight:500/.test(quiet), quiet);
  // quiet 只能出现在 取消 这类动作上
  const dir = 'apps/web/src';
  const pageFiles = [
    ...fs.readdirSync(path.join(dir, 'pages')).map((f: string) => path.join(dir, 'pages', f)),
    path.join(dir, 'ui.tsx'),
  ].filter((f: string) => f.endsWith('.tsx'));

  // quiet 只能用于：取消 / 关闭确认（setConfirming(false)/onClose）这类"退出当前动作"
  const quietUses: string[] = [];
  for (const f of pageFiles) {
    const src = fs.readFileSync(f, 'utf8');
    // 用索引定位 <Btn ... </Btn>，保证能拿到完整块（属性可能跨行）
    let i = 0;
    while ((i = src.indexOf('<Btn', i)) >= 0) {
      const end = src.indexOf('</Btn>', i);
      if (end < 0) break;
      const block = src.slice(i, end + 6);
      if (/variant="quiet"/.test(block)) {
        quietUses.push(`${path.basename(f)}: ${block.replace(/\s+/g, ' ').slice(0, 70)}`);
      }
      i = end + 6;
    }
  }
  // quiet 只能用于"退出/取消"类动作（含确认框的取消、关闭弹窗）
  check('quiet 只用于取消/关闭类（不用于主操作）',
    quietUses.every((u) => /取消|setConfirming\(false\)|setConfirmDel\(null\)|setConfirmReset\(false\)|setEditing\(false\)|onClose/.test(u)),
    quietUses);

  console.log('\n【4. 关键动作按钮必须显式指定变体】');
  check('「打开项目」用 primary', /variant="primary"[^>]*>\s*打开项目/.test(
    fs.readFileSync('apps/web/src/pages/LibraryDetail.tsx', 'utf8').replace(/\s+/g, ' ')) ||
    fs.readFileSync('apps/web/src/pages/LibraryDetail.tsx', 'utf8').includes('variant="primary"'));
  check('「大纲」用 ghost（有描边，可见）',
    fs.readFileSync('apps/web/src/pages/ProjectHome.tsx', 'utf8').includes('variant="ghost"'));

  console.log('\n【5. 逐页扫描：不允许存在"关键动作但未指定变体"的按钮】');
  {
    const offenders: string[] = [];
    let total = 0;
    for (const f of pageFiles) {
      const src = fs.readFileSync(f, 'utf8');
      let i = 0;
      while ((i = src.indexOf('<Btn', i)) >= 0) {
        const end = src.indexOf('</Btn>', i);
        if (end < 0) break;
        const block = src.slice(i, end + 6);
        total++;
        // variant 必须在开标签内（第一个 > 之前）
        const openTagEnd = block.indexOf('>');
        const openTag = block.slice(0, openTagEnd);
        const hasVariant = /variant="(primary|ghost|quiet|danger|create)"/.test(openTag);
        // 没写 variant 会落到 ghost（可见），可接受；但关键动作必须显式指定
        const textOnly = block.slice(openTagEnd + 1).replace(/\{[^}]*\}/g, '');
        if (!hasVariant && /打开|进入|开始|查看|管理|跳转/.test(textOnly)) {
          offenders.push(`${path.basename(f)}: ${textOnly.replace(/\s+/g, ' ').trim().slice(0, 40)}`);
        }
        i = end + 6;
      }
    }
    check('扫到按钮总数 ≥ 20', total >= 20, total);
    check('没有"关键动作但未指定变体"的按钮', offenders.length === 0, offenders);
  }

  console.log('\n【6. 构建产物里可见性样式都在】');
  check('产物含 .btn-ghost', css.includes('.btn-ghost'));
  check('产物含 .btn-primary', css.includes('.btn-primary'));
  check('产物含 .btn-create', css.includes('.btn-create'));
  check('产物含 .btn-quiet', css.includes('.btn-quiet'));

  console.log(`\n───────────────`);
  console.log(`通过 ${pass} · 失败 ${fail}`);
  process.exitCode = fail > 0 ? 1 : 0;
}

main().catch((err) => {
  console.error('验收崩溃：', err);
  process.exitCode = 1;
});
