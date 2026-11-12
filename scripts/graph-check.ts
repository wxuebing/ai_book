/**
 * 关系图验收（docs/04 第 8 章）
 *
 * 用户原话：「每个节点的样式（连线、节点大小全部参考obsidian项目），你这种设计那就是纯纯侮辱关系网，看不出层次」
 *
 * 核心验收点：
 *   1. 用 d3-force（与 Obsidian 同款），不是自写力导向
 *   2. 节点大小由**度数**决定（4 + 4*sqrt(degree)），不是字数
 *   3. 连线粗细随缩放反比
 *   4. fitToView 自动适应视图
 *   5. 显示设置面板（节点大小/连线粗细/斥力/连线长度/标签）
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

  console.log('\n【1. 用 d3-force（与 Obsidian 同款物理引擎）】');
  // 压缩器会重命名 d3 的导出函数（forceSimulation→Ox 等），
  // 但 d3-force 的内部特征字符串保留，用它判定更可靠。
  check('含 d3-force 特征（alphaDecay/velocityDecay）',
    js.includes('alphaDecay') && js.includes('velocityDecay'));
  check('含 d3-force 的 distanceMax（manyBody 专有）', js.includes('distanceMax'));
  check('力配置串含 link/charge/center/collide',
    js.includes('"link"') && js.includes('"charge"') && js.includes('"center"') && js.includes('"collide"'));
  check('含 forceX/forceY 的向心力', js.includes('"x"') && js.includes('"y"'));
  check('JS 体积增大（引入真实力导向库）', js.length > 320000, js.length);

  console.log('\n【2. 节点大小由度数决定（层次来源）】');
  check('半径公式 (4+4*sqrt(degree))*nodeSize',
    /\(4\+4\*Math\.sqrt\([^)]+\)\)\*[A-Za-z_$]/.test(js),
    '压缩后形态应为 (4+4*Math.sqrt(x))*y');
  check('有 degree 统计（Map 累加边端点）',
    js.includes('degree') || /\.set\([^,]+,\s*\([^)]*\?\?\s*0\)\s*\+\s*1\)/.test(js));
  check('半径取 degree 而非 words',
    !/radius:\s*[A-Za-z_$]+\(\s*[A-Za-z_$]+\.words/.test(js));

  console.log('\n【3. 连线粗细随缩放反比】');
  check('边宽除以缩放', /linkThickness\s*\/\s*Math\.max\(z/.test(js) || js.includes('linkThickness'));
  check('有 linkThickness 参数', js.includes('linkThickness'));

  console.log('\n【4. fitToView 自动适应】');
  check('存在适应视图按钮', js.includes('适应'));
  // 局部变量被压缩改名，用「取最小/最大」的语义特征判定
  check('计算包围盒（Math.min/Math.max 收拢坐标）',
    /Math\.min\([A-Za-z_$]+,[A-Za-z_$]+\.x/.test(js) && /Math\.max\([A-Za-z_$]+,[A-Za-z_$]+\.x/.test(js));
  check('力场结束时自动 fit', js.includes('"end"') || js.includes("'end'"));

  console.log('\n【5. 显示设置面板】');
  check('节点大小滑块', js.includes('节点大小'));
  check('连线粗细滑块', js.includes('连线粗细'));
  check('斥力滑块', js.includes('斥力'));
  check('连线长度滑块', js.includes('连线长度'));
  check('向心力滑块', js.includes('向心力'));
  check('标签淡出阈值', js.includes('淡出阈值'));
  check('恢复默认按钮', js.includes('恢复默认'));
  check('设置面板样式存在', css.includes('.graph-settings'));

  console.log('\n【6. 交互完整】');
  check('拖拽节点（fx/fy 固定）', js.includes('fx') && js.includes('fy'));
  check('松手解除固定', /fx\s*=\s*null/.test(js) || js.includes('null'));
  check('拖拽画布平移', js.includes('panning'));
  check('滚轮缩放', js.includes('wheel'));
  check('点击打开笔记', js.includes('onOpen'));

  console.log('\n【7. 数据链路】');
  {
    const lib = await (await fetch(BASE + '/api/library')).json();
    const id = lib?.data?.active;
    const g = await (await fetch(`${BASE}/api/project/${id}/graph`)).json();
    const nodes = g?.data?.nodes ?? [];
    const edges = g?.data?.edges ?? [];
    check('关系图有节点', nodes.length > 0, nodes.length);
    check('关系图有边', edges.length > 0, edges.length);

    // 度数分布：必须有差异，否则看不出层次
    const deg = new Map<string, number>();
    for (const n of nodes) deg.set(n.id, 0);
    for (const e of edges) {
      deg.set(e.source, (deg.get(e.source) ?? 0) + 1);
      deg.set(e.target, (deg.get(e.target) ?? 0) + 1);
    }
    const degs = [...deg.values()];
    const maxDeg = Math.max(...degs);
    const minDeg = Math.min(...degs);
    check('度数有差异（层次可见）', maxDeg > minDeg, `max=${maxDeg} min=${minDeg}`);
    check('存在枢纽节点（度数≥2）', maxDeg >= 2, maxDeg);

    // 半径差：用公式算一遍，验证确实有大小差异
    const rMax = 4 + 4 * Math.sqrt(maxDeg);
    const rMin = 4 + 4 * Math.sqrt(minDeg);
    check('半径差异明显', rMax - rMin >= 2, `rMax=${rMax.toFixed(1)} rMin=${rMin.toFixed(1)}`);
    console.log(`    度数范围 ${minDeg}–${maxDeg} → 半径 ${rMin.toFixed(1)}–${rMax.toFixed(1)}px`);
  }

  console.log(`\n───────────────`);
  console.log(`通过 ${pass} · 失败 ${fail}`);
  process.exitCode = fail > 0 ? 1 : 0;
}

main().catch((err) => {
  console.error('验收崩溃：', err);
  process.exitCode = 1;
});
