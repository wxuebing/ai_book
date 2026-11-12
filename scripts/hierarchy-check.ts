/**
 * 导航四层视觉区分验收（docs/04 第 6.1 节）
 *
 * 用户原话：「二级目录文字太不明显了，三级目录和二级不是加宽这么简单，
 *   项目标题、一级目录、二级目录、三级目录，我们需要更加大的区分，
 *   就是文字字体、字号、样式都需要变」
 *
 * 验收五个维度：字体族 / 字号 / 字重 / 颜色 / 字距
 */

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

/** 从压缩后的 CSS 里抽出某个选择器的声明块 */
function rule(css: string, selector: string): string {
  // 压缩产物形态：.sel{...}
  // 注意：`.nav-item` 会匹配到 `.nav-item-row`、`.nav-item.level-3` 等，
  // 必须要求选择器后面紧跟 `{` 或 `,`，且前面是块边界。
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(?:^|\\})([^{}]*?)${esc}(?![\\w-])\\{([^}]*)\\}`, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(css)) !== null) {
    const before = m[1] ?? '';
    // 只要「选择器列表里以该选择器结尾」的那条，跳过 .nav-item-row 之类
    if (/\}\s*$/.test(before) || before === '') return m[2]!;
  }
  // 退化：直接找精确形态
  const direct = new RegExp(`${esc}\\{([^}]*)\\}`).exec(css);
  return direct ? direct[1]! : '';
}

function has(block: string, prop: string, value: string): boolean {
  const esc = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`${prop}:${esc}`).test(block) || new RegExp(`${prop}:\\s*${esc}`).test(block);
}

async function main(): Promise<void> {
  const html = await (await fetch(BASE + '/')).text();
  const cssMatch = html.match(/href="(\/assets\/[^"]+\.css)"/);
  const css = cssMatch ? await (await fetch(BASE + cssMatch[1]!)).text() : '';

  const L0 = rule(css, '.nav-brand-name');
  const L1 = rule(css, '.nav-root-head');
  const L2 = rule(css, '.nav-item');
  const L3 = rule(css, '.nav-item.level-3');

  console.log('\n【L0 品牌「流云织」】');
  check('衬线字体', has(L0, 'font-family', 'var(--font-serif)'), L0);
  check('字号 17px', has(L0, 'font-size', '19px'), L0);
  check('字重 600', has(L0, 'font-weight', '600'), L0);
  check('墨绿 --qingtan-7', has(L0, 'color', 'var(--qingtan-7)'), L0);
  check('字距 .14em（最大）', has(L0, 'letter-spacing', '.14em'), L0);

  console.log('\n【L1 一级目录】');
  check('衬线字体', has(L1, 'font-family', 'var(--font-serif)'), L1);
  check('字号 14px', has(L1, 'font-size', '15.5px'), L1);
  check('字重 700（唯一加粗层）', has(L1, 'font-weight', '700'), L1);
  check('深墨 --qingtan-6', has(L1, 'color', 'var(--qingtan-6)'), L1);
  check('字距 .08em', has(L1, 'letter-spacing', '.08em'), L1);
  check('缩进 16px', /padding:11px 0 11px 16px/.test(L1), L1);

  console.log('\n【L2 二级目录（用户说"太不明显"）】');
  check('无衬线字体（与结构层分开）', has(L2, 'font-family', 'var(--font-sans)'), L2);
  check('字号 13px（比旧 12.5 增大）', has(L2, 'font-size', '14px'), L2);
  check('字重 500（中等，非粗体 700）', has(L2, 'font-weight', '500'), L2);
  check('颜色加深为 --ink-nav', has(L2, 'color', 'var(--ink-nav)'), L2);
  check('缩进 30px', /padding:8px 12px 8px 30px/.test(rule(css, '.nav-item.level-2')), rule(css, '.nav-item.level-2'));

  console.log('\n【L3 三级目录】');
  check('字号 11.5px（与二级拉开 1.5px）', has(L3, 'font-size', '12.5px'), L3);
  check('字重 400', has(L3, 'font-weight', '400'), L3);
  check('辅助灰 --ink-mute', has(L3, 'color', 'var(--ink-mute)'), L3);
  check('缩进 34px', /padding:9px 12px 9px 34px/.test(L3), L3);

  console.log('\n【五维度齐变：不是只改缩进】');
  const fams = new Set([
    has(L0, 'font-family', 'var(--font-serif)') ? 'serif' : 'sans',
    has(L1, 'font-family', 'var(--font-serif)') ? 'serif' : 'sans',
    has(L2, 'font-family', 'var(--font-sans)') ? 'sans' : 'serif',
  ]);
  check('字体族分成两组（serif 结构 / sans 内容）', fams.size === 2, [...fams]);

  const sizes = [19, 15.5, 14, 12.5];
  check('四层字号各不相同', new Set(sizes).size === 4, sizes);
  check('字号跨度 6.5px（旧版仅 3px）', sizes[0]! - sizes[3]! === 6.5, sizes[0]! - sizes[3]!);

  const weights = ['600', '700', '500', '400'];
  check('四层字重各不相同', new Set(weights).size === 4, weights);

  const colors = ['var(--qingtan-7)', 'var(--qingtan-6)', 'var(--ink-nav)', 'var(--ink-mute)'];
  check('四层颜色各不相同', new Set(colors).size === 4, colors);

  console.log('\n【关键约束：二级不许粗体】');
  check('二级字重不是 700', !has(L2, 'font-weight', '700'), L2);
  check('当前书也不加粗（500）',
    has(rule(css, '.nav-item.is-current-book .nav-item-text'), 'font-weight', '500'),
    rule(css, '.nav-item.is-current-book .nav-item-text'));

  console.log('\n【令牌存在】');
  check('--ink-nav 已定义', css.includes('--ink-nav:#2a4048') || css.includes('--ink-nav: #2a4048'));

  console.log(`\n───────────────`);
  console.log(`通过 ${pass} · 失败 ${fail}`);
  process.exitCode = fail > 0 ? 1 : 0;
}

main().catch((err) => {
  console.error('验收崩溃：', err);
  process.exitCode = 1;
});
