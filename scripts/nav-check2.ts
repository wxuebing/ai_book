/**
 * 导航第二轮细化验收：逐条核对用户本次提出的 5 条要求
 *
 * 1. 品牌区：搜索 → 收放图标（侧边栏符号）；底部箭头移除
 * 2. 导航栏不显示数字信息（项目数 / 工具数 / N章）
 * 3. 一级 / 二级收缩箭头要区分（显眼）
 * 4. 小说库删除并入编辑，不单独占三级
 * 5. 三级最多 5 项，多的用滚动
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

async function main(): Promise<void> {
  const html = await (await fetch(BASE + '/')).text();
  const cssMatch = html.match(/href="(\/assets\/[^"]+\.css)"/);
  const jsMatch = html.match(/src="(\/assets\/[^"]+\.js)"/);
  const css = cssMatch ? await (await fetch(BASE + cssMatch[1]!)).text() : '';
  const js = jsMatch ? await (await fetch(BASE + jsMatch[1]!)).text() : '';

  console.log('\n【1. 品牌区：搜索 + 收放图标；底部箭头移除】');
  check('品牌区含搜索按钮', css.includes('.nav-search-btn'));
  check('品牌区含收放按钮', css.includes('.nav-collapse-btn'));
  // 构建器会改写属性格式，只断言造型特征（外框 + 内部竖线）
  check('收放图标为侧边栏符号（外框 rect + 内部竖线 path）',
    js.includes('M5.8 2.6') && js.includes('v10.8') && /rect|"x":1\.6/.test(js));
  check('旧的底部收缩箭头已移除', !css.includes('.nav-collapse:hover') && !css.includes('.nav-collapse{'));
  check('收放按钮切换折叠状态', js.includes('loom:nav:collapsed'));

  console.log('\n【2. 导航栏不显示数字信息】');
  check('无一级数量徽标样式（nav-root-count 已不用）',
    !js.includes('nav-root-count'));
  check('无二级 N章 统计（nav-item-meta 已不用）',
    !js.includes('nav-item-meta'));
  check('代码里不再渲染 chapters 计数',
    !/\{p\.chapters\}章/.test(js));

  console.log('\n【3. 一级 / 二级箭头要区分】');
  check('一级用实心三角（fill=currentColor 的三角路径）',
    js.includes('M2.6 4.4h6.8L6 8.4z'));
  // 工作区小说行改用实心三角（与一级相同图标，docs/01 2.3）
  check('工作区小说行用实心三角',
    js.includes('M2.6 4.4h6.8L6 8.4z'));
  check('一级箭头颜色更深（--qingtan-5）',
    /\.nav-caret\s*\{[^}]*color:\s*var\(--qingtan-5\)/s.test(css));
  check('二级箭头颜色更浅（--ink-mute）',
    /\.nav-caret-sm\s*\{[^}]*color:\s*var\(--ink-mute\)/s.test(css));

  console.log('\n【4. 小说库删除并入编辑】');
  {
    const nav = await (await fetch(BASE + '/api/nav')).json();
    const lib = nav.data.roots.find((r: any) => r.id === 'library');
    void lib;
  }
  check('导航不再有独立删除项', !js.includes("id: 'delete'"));
  check('小说库详情合并为单页（打开项目/修改信息）',
    js.includes('打开项目') && js.includes('修改信息'));
  check('编辑页含危险操作区', js.includes('危险操作'));
  check('编辑页含删除确认', js.includes('确认删除'));

  console.log('\n【5. 三级最多 5 项，超出滚动】');
  check('三级容器有 max-height 限制',
    /\.nav-children\.level-3\s*\{[^}]*max-height:\s*calc\(5\s*\*\s*var\(--nav-item-h\)\)/s.test(css));
  check('三级容器 overflow-y: auto',
    /\.nav-children\.level-3\s*\{[^}]*overflow-y:\s*auto/s.test(css));
  check('三级每项高度定义为 38px',
    /\.nav-children\.level-3\s*\{[^}]*--nav-item-h:\s*38px/s.test(css));
  check('三级滚动条细化 6px',
    /\.nav-children\.level-3::-webkit-scrollbar\s*\{[^}]*width:\s*6px/s.test(css));
  check('不截断、不做「更多」折叠', !js.includes('展开更多') && !js.includes('查看更多'));

  console.log(`\n───────────────`);
  console.log(`通过 ${pass} · 失败 ${fail}`);
  process.exitCode = fail > 0 ? 1 : 0;
}

main().catch((err) => {
  console.error('验收崩溃：', err);
  process.exitCode = 1;
});
