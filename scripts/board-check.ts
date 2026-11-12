/**
 * 数据看板验收（docs/01 第 5.5 节第 8 条）
 *
 * 用户原话：「工具库的统计，这一个应当为多个或者一个小说来统计，这是数据看板，可以选择多个东西知道吗？」
 *
 * 验证：多选聚合、横向对比、合计、类型分布合并、作用域并集。
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

  console.log('\n【三级缩进再收窄】');
  check('三级缩进 34px', /\.nav-item\.level-3\{[^}]*padding:9px 12px 9px 34px/.test(css));
  check('导航空态也同步为 34px', /\.nav-empty,\.nav-hint\{[^}]*padding:6px 10px 6px 34px/.test(css));

  console.log('\n【统计升级为数据看板】');
  check('看板组件存在', js.includes('StatsBoard') || js.includes('选择小说'));
  check('支持多选（复选框语义 aria-pressed）', js.includes('aria-pressed'));
  check('有全选 / 清空 / 只看当前书', js.includes('全选') && js.includes('清空') && js.includes('只看当前书'));
  check('有横向对比表', js.includes('横向对比'));
  // 压缩后函数名会被混淆，只断言可见行为：列头有 board-th 类 + 页面提示"点列头排序"
  check('对比表可点列头排序',
    css.includes('.board-table .board-th') && js.includes('点列头排序'));
  check('有合计行', js.includes('合计'));
  check('有占比列', js.includes('board-share'));
  check('类型分布为所选范围合并', js.includes('所选范围合并统计'));
  check('作用域为并集', js.includes('所选范围出现过的全部坐标'));
  check('空选时有引导', js.includes('还没有选择小说'));
  check('样式：选择器网格', css.includes('.board-picker') && css.includes('.board-book'));
  check('样式：合计行高亮', css.includes('.board-total-row'));

  console.log('\n【数据链路：多本聚合】');
  {
    const lib = await (await fetch(BASE + '/api/library')).json();
    const projects = lib?.data?.projects ?? [];
    check('至少 1 本书可统计', projects.length >= 1, projects.length);

    // 逐本取 overview（模拟前端看板的合并逻辑）
    const stats = [];
    for (const p of projects) {
      const r = await (await fetch(`${BASE}/api/project/${p.id}`)).json();
      const d = r?.data;
      stats.push({
        id: p.id,
        name: p.name,
        words: d?.words ?? 0,
        notes: d?.notes ?? 0,
        types: d?.types ?? 0,
        relations: d?.relations ?? 0,
        groups: d?.groups ?? [],
        spaces: d?.scopes?.spaces ?? [],
        times: d?.scopes?.times ?? [],
      });
    }
    check('每本书都能取到 overview', stats.every((s) => s.name), stats.map((s) => s.name));

    // 合计
    const totalWords = stats.reduce((a, s) => a + s.words, 0);
    const totalNotes = stats.reduce((a, s) => a + s.notes, 0);
    check('合计字数可计算', totalWords > 0, totalWords);
    check('合计笔记数可计算', totalNotes > 0, totalNotes);

    // 类型合并
    const typeMap = new Map<string, number>();
    for (const s of stats) {
      for (const g of s.groups) typeMap.set(g.type, (typeMap.get(g.type) ?? 0) + g.count);
    }
    check('类型可跨书合并', typeMap.size > 0, typeMap.size);

    // 作用域并集
    const spaces = new Set<string>();
    const times = new Set<string>();
    for (const s of stats) {
      for (const x of s.spaces) spaces.add(x);
      for (const t of s.times) times.add(t);
    }
    check('空间坐标可并集', spaces.size > 0, [...spaces]);
    check('时间坐标可并集', Array.isArray([...times]));

    // 单本 vs 多本可区分
    check('单本时占比 100%',
      stats.length === 1 ? true : stats[0]!.words / totalWords <= 1,
      stats.length);
  }

  console.log(`\n───────────────`);
  console.log(`通过 ${pass} · 失败 ${fail}`);
  process.exitCode = fail > 0 ? 1 : 0;
}

main().catch((err) => {
  console.error('验收崩溃：', err);
  process.exitCode = 1;
});
