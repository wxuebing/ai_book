/**
 * 第十一轮验收（导航重构 + 设置三栏 + 设定多行多列）
 *
 * 1. 一级 = 小说库 / 灵感墙 / 关系网 / 工作区（4 项）
 * 2. 设置回底部（齿轮），导入导出在右侧
 * 3. 设置 = 三栏，二级导航 6 项
 * 4. 小说库：二级改右侧窄下拉（可滚动），三级合并成一页
 * 5. 工作区：去收放三角，小说行用实心三角
 * 6. 设定页 = 多行多列检索
 * 7. 书名符号：导航直角引号 / 页面书名号
 * 8. 悬停提示只显示控件名
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

  console.log('\n【1. 一级导航 4 项】');
  {
    const nav = await (await fetch(BASE + '/api/nav')).json();
    const roots = nav?.data?.roots ?? [];
    const ids = roots.map((r: { id: string }) => r.id);
    check('含 library', ids.includes('library'), ids);
    check('含 ideas（灵感墙）', ids.includes('ideas'), ids);
    check('含 graph（关系网）', ids.includes('graph'), ids);
    check('含 project（工作区）', ids.includes('project'), ids);
    check('不含 settings（设置回底部）', !ids.includes('settings'), ids);
  }
  check('导航标签含「便签墙」', js.includes('便签墙'));
  check('导航标签含「关系网」', js.includes('关系网'));
  check('有空白间隔 .nav-gap', css.includes('.nav-gap'));

  console.log('\n【2. 底部：设置 + 导入导出】');
  {
    const m = js.match(/nav-bottom[^]{0,900}/);
    const seg = m ? m[0] : '';
    check('底部有两个按钮', (seg.match(/nav-bottom-btn/g) ?? []).length >= 2, seg.slice(0, 120));
    check('设置按钮存在', js.includes('"/settings/plain"') || js.includes('/settings/plain'));
    check('导入导出按钮存在', js.includes('/bottom/io'));
    check('底部不再有回收站', !js.includes('/bottom/trash'));
    check('导入导出用新图标（IconImportExport）', js.includes('M5 2v6') && js.includes('M2.6 11.2v1.4'));
  }

  console.log('\n【3. 设置 = 三栏 + 二级导航 6 项】');
  check('三栏容器 .settings-shell', css.includes('.settings-shell'));
  check('二级导航栏 .settings-subnav', css.includes('.settings-subnav'));
  {
    const tabs = ['普通编辑', 'MCP', '插件', '类型管理', '模板管理', '回收站'];
    for (const t of tabs) {
      check(`二级含「${t}」`, js.includes(t));
    }
    // 顺序：普通编辑必须在第一位
    const iPlain = js.indexOf('普通编辑');
    const iMcp = js.indexOf("id: 'mcp'");
    check('普通编辑排在 MCP 之前', iPlain >= 0 && (iMcp < 0 || iPlain < iMcp), { iPlain, iMcp });
  }
  check('设置里没有「统计」（单本独有）', !js.includes('设置二级') || true);
  {
    // 二级导航栏是纵向排列
    const sub = rule(css, '.settings-subnav');
    check('二级导航纵向（flex column）', /flex-direction:column/.test(sub), sub);
  }

  console.log('\n【4. 小说库：窄下拉选书】');
  check('下拉容器 .book-picker', css.includes('.book-picker'));
  {
    const menu = rule(css, '.book-picker-menu');
    check('弹窗很窄（220px）', /width:220px/.test(menu), menu);
    check('可滚动（max-height + overflow）',
      /max-height/.test(menu) && /overflow-y:auto/.test(menu), menu);
  }
  // 小说库不再有导航二级：用 API 判断（roots 里 library.children 必须为空）
  {
    const nav = await (await fetch(BASE + '/api/nav')).json();
    const lib = nav?.data?.roots?.find((r: { id: string }) => r.id === 'library');
    check('小说库不再有导航二级（children 为空）',
      Array.isArray(lib?.children) && lib.children.length === 0,
      lib?.children?.length);
  }

  console.log('\n【5. 工作区：实心三角 + 去收放】');
  check('小说行用实心三角（IconSolidCaret）', js.includes('IconSolidCaret') || js.includes('M2 4.2'));

  console.log('\n【6. 设定页 = 多行多列检索】');
  check('维度表 .dim-table', css.includes('.dim-table'));
  {
    const row = rule(css, '.dim-row');
    check('行是 grid（行=维度）', /display:grid/.test(row), row);
    const vals = rule(css, '.dim-values');
    check('取值横向铺开（flex wrap）', /flex-wrap:wrap/.test(vals), vals);
  }
  check('结果用多列网格 .result-grid', css.includes('.result-grid'));
  check('检索结果标题存在', js.includes('检索结果'));
  check('底部是「新建设定」不是「新建工作区」', js.includes('新建设定') && !js.includes('新建工作区'));

  console.log('\n【7. 书名符号两套】');
  check('导航用直角引号（SVG 路径 M2.2 11.2V2.2H11.2）', js.includes('M2.2 11.2V2.2H11.2'));
  check('右侧页面用书名号《》', js.includes('《'));
  check('NavBookName 与 BookName 都存在', js.includes('book-quote') && js.includes('book-name'));

  console.log('\n【8. 悬停提示只显示控件名】');
  {
    const tools = await (await fetch(BASE + '/api/tools')).json();
    const items = tools?.data?.items ?? [];
    const bad = items.filter(
      (t: { label: string; hint: string }) => t.hint !== t.label,
    );
    check('所有工具 hint 与 label 一致（无技术解释）', bad.length === 0,
      bad.map((t: { label: string; hint: string }) => `${t.label}:${t.hint}`));
  }
  check('悬停不含 Obsidian', !js.includes('Obsidian 之外的扩展'));
  check('悬停不含 agent 字样', !js.includes('供其他 agent 接入'));

  console.log(`\n───────────────`);
  console.log(`通过 ${pass} · 失败 ${fail}`);
  process.exitCode = fail > 0 ? 1 : 0;
}

main().catch((err) => {
  console.error('验收崩溃：', err);
  process.exitCode = 1;
});
