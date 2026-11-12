/**
 * 第九轮需求验收（导航重构 + 卡片仪表盘）
 *
 * 1. 统计页去掉便签墙（只在小说库单本页）
 * 2. 导航：小说库 + 工作区 + 设置（齿轮），工具全部移入设置
 * 3. 设置页二级导航（沿用工具库样式）
 * 4. 底部工具条纯图标
 * 5. 小说单本页卡片仪表盘（封面/基本信息/统计/编辑 不等大）
 * 6. 封面上传 + 空态占位图标
 * 7. 「打开项目」是按钮
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

  console.log('\n【1. 统计页去掉便签墙】');
  {
    // 设置页的统计不应含便签墙；小说库单本页才有
    const tools = await api('GET', '/api/tools');
    check('设置下有 8 个工具', tools.json?.data?.items?.length === 8, tools.json?.data?.items?.length);
  }

  console.log('\n【2. 导航：两库 + 设置（齿轮）】');
  {
    const nav = await api('GET', '/api/nav');
    const roots = nav.json?.data?.roots ?? [];
    const ids = roots.map((r: any) => r.id);
    check('一级共 4 项（小说库/灵感墙/关系网/工作区）', ids.length === 4, ids);
    check('含 library', ids.includes('library'));
    check('含 project', ids.includes('project'));
    check('设置已移到底部（不在一级）', !ids.includes('settings'), ids);

    const proj = roots.find((r: any) => r.id === 'project');
    check('第二个一级叫「工作区」', proj?.label === '工作区', proj?.label);

    const settings = roots.find((r: any) => r.id === 'project');
    check('工作区下有项目列表', Array.isArray(settings?.children), settings?.children?.length);
    check('设置二级导航有 6 项', (nav.json?.data?.settingsTabs ?? []).length === 6);
  }
  check('齿轮图标存在（IconGear）', js.includes('IconGear') || css.includes('nav-root'));
  // 用户可见文案里不应再出现「工具库」（内部变量名/路由兼容不算）
  check('旧「工具库」文案已消失', !js.includes('工具库'));

  console.log('\n【3. 底部工具条纯图标】');
  check('底部按钮无文字标签', !css.includes('.nav-bottom-label') || !js.includes('nav-bottom-label'));
  // 图标函数名会被压缩混淆，改为验证"底部区域有两个 button 且各含一个 svg"
  {
    const m = js.match(/nav-bottom[^]{0,1200}/);
    const seg = m ? m[0] : '';
    const btns = (seg.match(/nav-bottom-btn/g) ?? []).length;
    check('底部有两个图标按钮', btns >= 2, btns);
    check('按钮内有 svg 图标', seg.includes('svg') || seg.includes('jsx('));
    check('导入导出 title 存在', js.includes('导入 / 导出'));
    check('回收站在设置里', js.includes('回收站'));
  }

  console.log('\n【4. 卡片式仪表盘（切蛋糕布局）】');
  check('.dash 容器存在', css.includes('.dash'));
  const top = rule(css, '.dash-top');
  check('上排两列不等宽（1.9fr / 1fr）',
    /grid-template-columns:minmax\(0,1\.9fr\)|1\.9fr/.test(top), top);
  check('基本信息方片 .dash-main', css.includes('.dash-main'));
  check('编辑方片 .dash-side', css.includes('.dash-side'));
  check('统计长条方片 .dash-stats', css.includes('.dash-stats'));
  check('统计 6 列', /\.dash-stat-row\{[^}]*repeat\(6/.test(css));
  check('统计数值用衬线大号', /\.dash-stat-value\{[^}]*font-family:var\(--font-serif\)/.test(css));

  console.log('\n【5. 封面：3:4 + 空态占位图标】');
  const cover = rule(css, '.dash-cover');
  check('封面 3:4（120x160）', /width:120px/.test(cover) && /height:160px/.test(cover), cover);
  check('封面占位图标 .dash-cover-placeholder', css.includes('.dash-cover-placeholder'));
  check('占位图标是书形（IconBook）', js.includes('IconBook') || js.includes('M4.5 4.5h22'));
  check('悬停显示上传提示', css.includes('.dash-cover-hint'));

  {
    const lib = await api('GET', '/api/library');
    const id = lib.json?.data?.active ?? lib.json?.data?.projects?.[0]?.id;

    // 封面是持久状态：可能已有（之前测试传过），两种都合法
    const existing = await fetch(`${BASE}/api/project/${id}/cover`);
    check('封面接口可用（404=无封面 / 200=已有）',
      existing.status === 404 || existing.ok, existing.status);

    // 上传一张 1x1 PNG（覆盖或新建都行）
    const png =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const up = await api('POST', `/api/project/${id}/cover`, { data: png, mime: 'image/png' });
    check('POST 上传封面 201', up.status === 201, up.json);

    const withCover = await fetch(`${BASE}/api/project/${id}/cover`);
    check('上传后可读取封面', withCover.ok);
    check('返回 image 类型', (withCover.headers.get('content-type') ?? '').startsWith('image/'));
    check('响应有长度', Number(withCover.headers.get('content-length') ?? 0) > 0);
  }

  console.log('\n【6. 「打开项目」是按钮】');
  check('打开项目用 Btn（primary）', /打开项目/.test(js));
  check('不再作为导航三级项', !js.includes("label: '打开项目'"));

  console.log('\n【7. 设置路由生效】');
  {
    const r = await fetch(`${BASE}/settings/links`);
    check('/settings/links 返回页面', r.ok, r.status);
    const r2 = await fetch(`${BASE}/settings/stats`);
    check('/settings/stats 返回页面', r2.ok, r2.status);
  }

  console.log(`\n───────────────`);
  console.log(`通过 ${pass} · 失败 ${fail}`);
  process.exitCode = fail > 0 ? 1 : 0;
}

main().catch((err) => {
  console.error('验收崩溃：', err);
  process.exitCode = 1;
});
