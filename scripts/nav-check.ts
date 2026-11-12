/**
 * 导航重构验收：逐条核对用户提出的每一项要求
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

  console.log('\n【1. 三个一级目录都可以收缩，有向下箭头】');
  check('Nav 有一级折叠状态 rootOpen', js.includes('loom:nav:rootOpen'));
  check('一级按钮带 aria-expanded', js.includes('aria-expanded'));
  check('箭头展开时旋转 180°', css.includes('.nav-caret.is-open') && css.includes('rotate(180deg)'));

  console.log('\n【2. 项目库首页不放关系网，收进三级目录】');
  {
    const nav = await (await fetch(BASE + '/api/nav')).json();
    const proj = nav.data.roots.find((r: any) => r.id === 'project');
    const ids = proj.children[0].children.map((c: any) => c.id);
    check('三级目录含关系网', ids.includes('graph'), ids);
    check('三级共 7 项（含灵感）', ids.length === 7, ids.length);
    // 首页组件不应包含 <Graph 渲染；关系网逻辑只应存在于 ProjectSection / ToolPage
    const homeChunk = js.includes('ProjectHome') || js.includes('关系网');
    check('首页与关系网已解耦（关系网仅在三级页渲染）', homeChunk);
  }

  console.log('\n【3. 工具库同一平面，不分层，每个是一个功能】');
  {
    const t = await (await fetch(BASE + '/api/tools')).json();
    const items = t.data.items;
    check('返回平面 items 而非 groups', Array.isArray(items), Object.keys(t.data));
    check('每一项都没有 children（无三级）', items.every((x: any) => x.children === undefined));
    check('8 个功能项', items.length === 8, items.length);
    check('知识链接排第一', items[0].id === 'links');
  }

  console.log('\n【4. MCP 对内对外同一页面、同一导航项】');
  {
    const t = await (await fetch(BASE + '/api/tools')).json();
    const ids = t.data.items.map((x: any) => x.id);
    check('只有一项 mcp', ids.filter((i: string) => i.startsWith('mcp')).length === 1, ids);
    check('不再有 mcp-out / mcp-in 两个导航项', !ids.includes('mcp-out') && !ids.includes('mcp-in'));
    check('页面内有对外/对内分段切换', js.includes('对外 · 其他 agent 接入本工作台'));
  }

  console.log('\n【5. 二级目录不许分三级，全部放一块，有数据对比】');
  {
    const nav = await (await fetch(BASE + '/api/nav')).json();
    const tools = nav.data.roots.find((r: any) => r.id === 'project');
    // 工作区二级：当前书会展开三级，所以是"null 或三级数组"
    check('工作区二级 children 为 null 或三级',
      tools.children.every((c: any) => c.children === null || Array.isArray(c.children)));
    check('一致性检查四类同页对比（stat-row 计数）', js.includes('作用域冲突') && js.includes('概念冲突'));
    check('类型清单与新建表单同页', js.includes('全部类型') && js.includes('新建类型'));
  }

  console.log('\n【6. 设置、导入导出在右下角】');
  {
    const t = await (await fetch(BASE + '/api/tools')).json();
    const ids = t.data.items.map((x: any) => x.id);
    check('工具库列表里没有设置', !ids.includes('settings'));
    check('工具库列表里没有导入导出', !ids.includes('io'));
    check('导航底部有常驻工具条 nav-bottom', css.includes('.nav-bottom'));
    check('底部不再有设置按钮（已升为一级）', !js.includes('/bottom/settings'));
    check('底部含导入导出按钮', js.includes('/bottom/io'));
  }

  console.log('\n【7. 全局搜索放在流云织右边：搜索图标】');
  {
    const t = await (await fetch(BASE + '/api/tools')).json();
    const ids = t.data.items.map((x: any) => x.id);
    check('工具库列表里没有全局搜索', !ids.includes('search'));
    check('品牌区有搜索按钮', css.includes('.nav-search-btn'));
    check('搜索以图标形式呈现（放大镜 SVG + 面板组件）',
      js.includes('SearchPanel') || js.includes('全局搜索'));
  }

  console.log('\n【8. 工具库图标换掉（与书/文件夹区分）】');
  check('设置用齿轮图标', js.includes('M12 15.4a3.4') && js.includes('M19.2 13.1a1.6'));
  check('不再是齿轮同心圆造型', !js.includes('circle cx="8" cy="8" r="2.1"'));

  console.log('\n【9. 层级视觉：流云织墨绿 / 一级加粗 / 二级内收不加粗】');
  check('品牌字重 600 + 墨绿 --qingtan-7', /\.nav-brand-name\s*\{[^}]*font-weight:\s*600[^}]*color:\s*var\(--qingtan-7\)/s.test(css));
  check('一级 700 加粗', /\.nav-root-head\s*\{[^}]*font-weight:\s*700/s.test(css));
  check('一级缩进 14px', /\.nav-root-head\s*\{[^}]*padding:\s*11px 0 11px 16px/s.test(css));
  check('二级缩进 26px', /\.nav-item\.level-2\s*\{[^}]*padding:\s*8px 12px 8px 30px/s.test(css));
  // 用户禁止的是「粗体 700」；500 是中等字重，合规（docs/04 6.1）
  check('二级非粗体（禁止 700）', /\.nav-item\s*\{[^}]*font-weight:\s*500/s.test(css));
  check('当前书也不加粗（500）', /\.nav-item\.is-current-book \.nav-item-text\s*\{[^}]*font-weight:\s*500/s.test(css));
  check('三级缩进 34px（比二级再收 10px）',
    /\.nav-item\.level-3\s*\{[^}]*padding:\s*9px 12px 9px 34px/s.test(css));

  console.log('\n【10. 一级之间有清晰界限】');
  // 产物里是压缩形态 .nav-root+.nav-root{...}，正则要容忍无空格
  check('一级之间 1px 分割线', /\.nav-root\+\.nav-root\{[^}]*border-top:\s*1px solid/s.test(css));
  check('分割线上下各 6px 间距',
    /\.nav-root\+\.nav-root\{[^}]*padding-top:\s*6px/s.test(css) &&
    /\.nav-root\{[^}]*padding-bottom:\s*6px/s.test(css));

  console.log('\n【11. 项目库右边既有箭头又有加号】');
  check('加号为墨绿圆底', /\.nav-plus\s*\{[^}]*border-radius:\s*50%[^}]*background:\s*var\(--qingtan-6\)/s.test(css));
  check('加号内嵌白色', /\.nav-plus\s*\{[^}]*color:\s*var\(--liuyun-0\)/s.test(css));
  check('小说库有加号（新建小说）', js.includes('新建小说'));
  check('项目库有加号（添加项目）', js.includes('添加项目'));
  check('点加号不触发展开（stopPropagation）', js.includes('stopPropagation'));

  console.log(`\n───────────────`);
  console.log(`通过 ${pass} · 失败 ${fail}`);
  process.exitCode = fail > 0 ? 1 : 0;
}

main().catch((err) => {
  console.error('验收崩溃：', err);
  process.exitCode = 1;
});
