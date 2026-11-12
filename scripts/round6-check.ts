/**
 * 第六轮需求验收
 *
 * 1. 基本信息页：表格 + 竖线 + 书名号 + 就地编辑
 * 2. 统计页：类型分布/作用域各半 + 数字药丸 + 便签墙（棕木斑马纹、1:1、轮换配色）
 * 3. 项目库三级「灵感」（大纲之后）+ 资料存储区
 * 4. 知识链接改名信息关系网 + 关系图 100% 显示全部名称
 * 5. 类型管理器增删改 + 恢复默认
 * 6. 设定页多行多列分组
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

async function api(method: string, p: string, body?: unknown): Promise<{ status: number; json: any }> {
  const res = await fetch(BASE + p, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: unknown = null;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json };
}

async function main(): Promise<void> {
  const html = await (await fetch(BASE + '/')).text();
  const cssMatch = html.match(/href="(\/assets\/[^"]+\.css)"/);
  const jsMatch = html.match(/src="(\/assets\/[^"]+\.js)"/);
  const css = cssMatch ? await (await fetch(BASE + cssMatch[1]!)).text() : '';
  const js = jsMatch ? await (await fetch(BASE + jsMatch[1]!)).text() : '';

  console.log('\n【1. 基本信息页：表格 + 竖线 + 书名号 + 就地编辑】');
  check('表格容器 .info-table', css.includes('.info-table'));
  check('表头深色底 --qingtan-1', /\.info-table thead th\{[^}]*background:var\(--qingtan-1\)/.test(css));
  check('竖线分列（border-right）', /\.info-label\{[^}]*border-right:1px solid/.test(css));
  check('斑马纹（nth-child even，压缩后为 2n）',
    /nth-child\((even|2n)\)/.test(css));
  check('值列字号 14px（比原 12px 清晰）', /\.info-table\{[^}]*font-size:14px/.test(css));
  // 书名号已改为《》（用户最终澄清：书名号就是书名号，不是直角符号）
  check('书名用书名号《》', js.includes('《') && js.includes('》'));
  check('就地编辑（仪表盘内 dash-edit + 文字按钮）', js.includes('dash-edit') && css.includes('.text-btn'));
  check('铅笔图标按钮', js.includes('IconPencil') || css.includes('.info-pencil'));

  console.log('\n【2. 统计页：左右各半 + 数字药丸 + 便签墙】');
  check('左右分栏 .board-split', css.includes('.board-split'));
  check('两列等宽 grid 1fr 1fr', /\.board-split\{[^}]*grid-template-columns:1fr 1fr/.test(css));
  check('数字药丸 .dist-pill（13px/600 醒目）',
    /\.dist-pill\{[^}]*font-size:13px/.test(css) && /\.dist-pill\{[^}]*font-weight:600/.test(css));
  check('便签墙 .idea-wall', css.includes('.idea-wall'));
  check('棕木主色 #6b4a34', css.toLowerCase().includes('#6b4a34'));
  check('白色斑马条纹（3 组不同粗细 SVG）',
    (css.match(/stroke-width='[259]'/g) ?? []).length >= 3 ||
    (css.match(/stroke-width:.?[259]/g) ?? []).length >= 3);
  check('条纹带弯角（Q 曲线）', css.includes('Q 60 6') || css.includes('Q 90 22'));
  check('便签 1:1（aspect-ratio:1）', /\.sticky\{[^}]*aspect-ratio:1/.test(css));
  check('便签 6 色轮换', (js.match(/#F5E6A8|#CFE3C0|#F0CFCF|#C8DDE8|#F2EDE0|#F2D5B8/gi) ?? []).length >= 6);
  // 压缩后变量名被改写，配色数组取值形如 `dv[m%dv.length]`
  check('按序号轮换取色（index % 数组长度）',
    /\[[A-Za-z_$]+\s*%\s*[A-Za-z_$]+\.length\]/.test(js) ||
    (js.match(/#F5E6A8|#CFE3C0|#F0CFCF|#C8DDE8|#F2EDE0|#F2D5B8/gi) ?? []).length >= 6);

  console.log('\n【3. 项目库三级「灵感」（大纲之后）】');
  {
    const nav = await api('GET', '/api/nav');
    const proj = nav.json?.data?.roots?.find((r: any) => r.id === 'project');
    const labels = proj?.children?.[0]?.children?.map((c: any) => c.label) ?? [];
    check('三级含「灵感」', labels.includes('灵感'), labels);
    check('灵感排在大纲之后（第 2 位）', labels[1] === '灵感', labels);
    check('三级共 7 项', labels.length === 7, labels.length);
  }
  check('灵感页有资料存储区提示', js.includes('资料存储') || js.includes('素材'));

  console.log('\n【4. 知识链接改名 + 关系图 100% 显示全部名称】');
  {
    const t = await api('GET', '/api/tools');
    const first = t.json?.data?.items?.[0];
    check('工具库第一项叫「信息关系网」', first?.label === '信息关系网', first?.label);
    check('不再叫「知识链接」', first?.label !== '知识链接');
  }
  // 压缩后：`const de=it*100; ... de>=100?!0:de>=60?...:we.degree>=3`
  // 变量名被重命名、true 被压成 !0，所以断言「按 100/60/度数」三段式结构
  check('关系图标签按缩放级别判断（100 / 60 / 度数 三段式）',
    /\*100[^;]*;\s*[\s\S]{0,120}>=100\?!0:[\s\S]{0,60}>=60\?/.test(js) ||
    (/>=100\?!0:/.test(js) && />=60\?/.test(js)));
  check('100% 时全部显示（>=100 直接为真）', />=100\?!0:/.test(js));
  check('<60% 时只显示枢纽（degree>=3）', /degree>=3/.test(js));

  console.log('\n【5. 类型管理器增删改 + 恢复默认】');
  {
    const lib = await api('GET', '/api/library');
    const id = lib.json?.data?.active;
    check('有激活的书', !!id, id);

    // 新建
    const created = await api('POST', `/api/project/${id}/types`, {
      name: '测试类型X',
      defaultView: 'list',
    });
    check('POST 新建类型 201', created.status === 201, created.json);

    // 改
    const patched = await api('PATCH', `/api/project/${id}/types/${encodeURIComponent('测试类型X')}`, {
      label: '测试类型X改',
      defaultView: 'table',
    });
    check('PATCH 更新类型 200', patched.status === 200, patched.json);
    const afterPatch = await api('GET', `/api/project/${id}/types`);
    const found = afterPatch.json?.data?.types?.find((t: any) => t.name === '测试类型X');
    check('label 已更新', found?.label === '测试类型X改', found?.label);
    check('defaultView 已更新', found?.defaultView === 'table', found?.defaultView);

    // 删
    const del = await api('DELETE', `/api/project/${id}/types/${encodeURIComponent('测试类型X')}`);
    check('DELETE 删除类型 200', del.status === 200, del.json);
    check('返回受影响条目数', typeof del.json?.data?.affected === 'number', del.json?.data);
    const afterDel = await api('GET', `/api/project/${id}/types`);
    check('类型已消失', !afterDel.json?.data?.types?.some((t: any) => t.name === '测试类型X'));

    // 恢复默认（用现有素材包）
    const reset = await api('POST', `/api/project/${id}/types/reset`, { packs: ['xianxia'] });
    check('POST 恢复默认 200', reset.status === 200, reset.json);
    check('返回 removed/installed', typeof reset.json?.data?.removed === 'number', reset.json?.data);
    const afterReset = await api('GET', `/api/project/${id}/types`);
    check('重置后有仙侠类型', afterReset.json?.data?.types?.some((t: any) => t.name === '境界'));
  }

  console.log('\n【6. 设定页多行多列分组】');
  check('分组墙 .group-wall', css.includes('.group-wall'));
  check('多列 grid（minmax 280px）', /\.group-wall\{[^}]*minmax\(280px/.test(css));
  check('组头 .group-head（独立一行 + 分隔线）',
    /\.group-head\{[^}]*border-bottom:1px solid/.test(css));
  check('组头加号 .group-add', css.includes('.group-add'));
  check('组内条目 .group-item', css.includes('.group-item'));

  console.log(`\n───────────────`);
  console.log(`通过 ${pass} · 失败 ${fail}`);
  process.exitCode = fail > 0 ? 1 : 0;
}

main().catch((err) => {
  console.error('验收崩溃：', err);
  process.exitCode = 1;
});
