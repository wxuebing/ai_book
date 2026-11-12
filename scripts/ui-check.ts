/**
 * 前端产物验收（docs/05 M5 视觉达标、M3 骨架可点通）
 *
 * 检查：页面可服务、资源可加载、视觉令牌与纹样真的进了产物、SPA 回退可用。
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
    console.log(`  ✖ ${name}${detail !== undefined ? ' :: ' + String(detail) : ''}`);
  }
}

async function main() {
  // ── 1. 首页 ────────────────────────────────────────────
  const htmlRes = await fetch(BASE + '/');
  const html = await htmlRes.text();
  check('GET / 200', htmlRes.status === 200, htmlRes.status);
  check('含 #root 挂载点', html.includes('id="root"'));
  check('含中文标题', html.includes('流云织小说工作台'));
  check('声明 lang=zh-CN', html.includes('lang="zh-CN"'));

  // ── 2. JS 产物 ─────────────────────────────────────────
  const jsMatch = html.match(/src="(\/assets\/[^"]+\.js)"/);
  check('引用 JS 产物', !!jsMatch);
  if (jsMatch) {
    const r = await fetch(BASE + jsMatch[1]);
    const js = await r.text();
    check('JS 可加载', r.status === 200 && js.length > 10000, `${r.status} ${js.length}`);
    check('JS 含 React 运行时', js.includes('react') || js.includes('createRoot'));
    check('JS 含导航两库+设置文案', js.includes('小说库') && js.includes('工作区') && js.includes('便签墙'));
    check('JS 含七视图之一「阶梯」', js.includes('阶梯'));
    // MCP 双通道文案来自 /api/tools 数据，不硬编码进 bundle —— 下面用接口验证
  }

  // ── 3. CSS 产物（视觉验收）─────────────────────────────
  const cssMatch = html.match(/href="(\/assets\/[^"]+\.css)"/);
  check('引用 CSS 产物', !!cssMatch);
  if (cssMatch) {
    const r = await fetch(BASE + cssMatch[1]);
    const css = await r.text();
    check('CSS 可加载', r.status === 200 && css.length > 5000, `${r.status} ${css.length}`);

    console.log('\n  【视觉令牌】');
    check('流云白主底色 --liuyun-0', css.includes('--liuyun-0:#fdfcfa') || css.includes('--liuyun-0: #fdfcfa'));
    check('流云白 6 档齐全', [0, 1, 2, 3, 4, 5].every((i) => css.includes(`--liuyun-${i}`)));
    check('清潭蓝主色 --qingtan-4 = #4e7f8c', /--qingtan-4:\s*#4e7f8c/i.test(css));
    check('清潭蓝 8 档齐全', [0, 1, 2, 3, 4, 5, 6, 7].every((i) => css.includes(`--qingtan-${i}`)));
    check('语义色 clue/payoff/danger', css.includes('--clue') && css.includes('--payoff') && css.includes('--danger'));
    check('标题衬线 / 正文无衬线', css.includes('--font-serif') && css.includes('--font-sans'));
    check('导航 280 / 68', css.includes('--nav-w:280px') || css.includes('--nav-w: 280px'));

    console.log('\n  【五种细纹】');
    check('① 云头纹（96px 周期）', css.includes('96px 96px'));
    check('② 织线（经纬 7px）', css.includes('repeating-linear-gradient') && css.includes('7px'));
    check('③ 水波纹（内联 SVG 正弦）', css.includes('M0 20 Q 15 8'));
    check('④ 纸纤维噪点（feTurbulence）', css.includes('feTurbulence'));
    check('⑤ 菱形回纹（M12 2 L22 12）', css.includes('M12 2 L22 12'));

    console.log('\n  【三层渐变】');
    check('纵深渐变（纸面→潭水）', css.includes('linear-gradient') && css.includes('180deg'));
    check('纹样随光（multiply）', css.includes('mix-blend-mode:multiply') || css.includes('mix-blend-mode: multiply'));
    check('径向光晕（顶部主光源）', css.includes('radial-gradient') && css.includes('ellipse'));
    check('呼吸动画', css.includes('@keyframes breathe'));
    check('尊重 prefers-reduced-motion', css.includes('prefers-reduced-motion'));

    console.log('\n  【零图片资源】');
    const pngRefs = (css.match(/url\([^)]*\.(png|jpg|jpeg|gif|webp)/gi) ?? []).length;
    check('CSS 里没有位图引用', pngRefs === 0, `发现 ${pngRefs} 处`);
    check('所有纹样为 SVG data-uri', css.includes('data:image/svg+xml'));

    console.log('\n  【零框架 UI】');
    check('没有引入 UI 框架类名', !css.includes('.ant-') && !css.includes('.Mui') && !css.includes('.chakra'));
  }

  // ── 4. SPA 回退（深链接可直接打开）────────────────────
  console.log('\n  【深链接】');
  for (const p of ['/library', '/project/ad02a01b', '/tools/links/graph']) {
    const r = await fetch(BASE + p);
    const t = await r.text();
    check(`${p} 回退到 index.html`, r.status === 200 && t.includes('id="root"'), r.status);
  }

  // ── 5. 目录穿越防护 ───────────────────────────────────
  console.log('\n  【安全】');
  {
    const r = await fetch(BASE + '/../package.json');
    const t = await r.text();
    check('不泄露 package.json', !t.includes('"devDependencies"'), r.status);
  }
  {
    const r = await fetch(BASE + '/%2e%2e/%2e%2e/package.json');
    const t = await r.text();
    check('编码穿越被挡', !t.includes('"devDependencies"'), r.status);
  }

  // ── 6. 数据链路（前端消费的真实数据）──────────────────
  console.log('\n  【数据链路】');
  {
    const lib = await (await fetch(BASE + '/api/library')).json();
    check('小说库有书', lib?.data?.projects?.length > 0, lib?.data?.projects?.length);

    const tools = await (await fetch(BASE + '/api/tools')).json();
    const ids = (tools?.data?.items ?? []).map((g: any) => g.id);
    check('工具库含 MCP（合并为一项）', ids.includes('mcp'), ids.join(','));
    check('知识链接排第一', ids[0] === 'links', ids[0]);

    const projectId = lib?.data?.active;
    if (projectId) {
      const g = await (await fetch(`${BASE}/api/project/${projectId}/graph`)).json();
      check('关系图有节点', g?.data?.nodes?.length > 0, g?.data?.nodes?.length);
      check('关系图有边', g?.data?.edges?.length > 0, g?.data?.edges?.length);

      const check1 = await (await fetch(`${BASE}/api/project/${projectId}/check`)).json();
      check('一致性检查有结果结构', Array.isArray(check1?.data?.broken));

      const nav = await (await fetch(BASE + '/api/nav')).json();
      check('导航四根', nav?.data?.roots?.length === 4);
      const proj = nav?.data?.roots?.find((r: any) => r.id === 'project');
      check('项目库三级含关系网与灵感共 7', proj?.children?.[0]?.children?.length === 7,
        proj?.children?.[0]?.children?.length);
    }
  }

  console.log(`\n───────────────`);
  console.log(`通过 ${pass} · 失败 ${fail}`);
  if (fail > 0) {
    process.exitCode = 1;
    return;
  }
  // 用 exitCode 而非 process.exit(0)：Windows 上 process.exit 与 undici
  // keep-alive 句柄关闭存在竞争，会触发 libuv 断言崩溃（0xC0000409）。
  // 让进程自然结束即可。
  process.exitCode = 0;
}

main().catch((err) => {
  console.error('验收崩溃：', err);
  process.exit(1);
});
