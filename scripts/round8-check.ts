/**
 * 第八轮需求验收（用户逐条纠正）
 *
 * 1. logo 裁剪掉灰边
 * 2. 书名号就是《》，不是直角符号
 * 3. 小说库统计：类型分布（带便签墙）+ 作用域（并排）
 * 4. 基本信息：书名/简介/目录名都能改，图标改常态文字按钮
 * 5. 项目右键菜单：改详情 / 归档（可恢复）/ 删除
 * 6. 三级目录间距加大
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

  console.log('\n【1. Logo 已裁剪（去掉灰边）】');
  {
    const r = await fetch(`${BASE}/logo-128.jpg`);
    const buf = Buffer.from(await r.arrayBuffer());
    check('logo-128.jpg 可访问', r.ok && buf.length > 0);
    // 裁剪后的 logo 四角应是内容色（深青/金），不是浅灰背景
    // 用文件大小间接判断：裁剪后细节占比更高
    check('裁剪版尺寸合理（>3KB 有细节）', buf.length > 3000, buf.length);
  }
  // SPA fallback 会让不存在的文件也返回 200（内容是 index.html），
  // 所以要看 content-type 与实际大小，不能只看状态码
  {
    const r = await fetch(`${BASE}/logo-original.jpg`);
    const ct = r.headers.get('content-type') ?? '';
    const len = Number(r.headers.get('content-length') ?? '0');
    const isRealImage = ct.startsWith('image/') && len > 100_000;
    check('public 里不再有 2MB 原图（返回的是 fallback HTML）', !isRealImage, { ct, len });
  }

  console.log('\n【2. 书名号是《》，不是直角符号】');
  check('产物含《', js.includes('《'));
  check('产物含》', js.includes('》'));
  check('不再有 ⌜⌟ 直角引号', !js.includes('\u231C') && !js.includes('\u231F'));
  check('导航栏保留中空 SVG 引号（页面用书名号）', js.includes('M2.2 11.2V2.2H11.2') && js.includes('《'));

  console.log('\n【3. 小说库统计：类型分布带便签墙 + 作用域并排】');
  check('左右分栏 .stats-pair', css.includes('.stats-pair'));
  check('作用域并排 .scope-inline（grid 1fr 1fr）',
    /\.scope-inline\{[^}]*grid-template-columns:1fr 1fr/.test(css));
  check('便签墙全宽（不在 stats-pair-main 内）',
    !/stats-pair-main[\s\S]{0,3000}idea-wall/.test(css));
  check('便签墙组件存在', js.includes('idea-wall'));
  check('数字药丸 .dist-pill', css.includes('.dist-pill'));

  console.log('\n【4. 基本信息：三字段可改 + 常态文字按钮】');
  check('书名可编辑（BookName + 修改按钮）', js.includes('book-name'));
  check('目录名可编辑（dirName 字段）', js.includes('dirName'));
  check('文字按钮 .text-btn（常态显示）', css.includes('.text-btn'));
  check('文字按钮不依赖悬停（无 opacity:0）',
    !/\.text-btn\{[^}]*opacity:0/.test(css));
  check('按钮文案是「修改」不是图标', js.includes('修改'));

  console.log('\n【5. 项目右键菜单 + 归档/恢复】');
  check('右键菜单组件 .ctx-menu', css.includes('.ctx-menu'));
  check('菜单含「修改详情」', js.includes('修改详情'));
  check('菜单含「归档项目」', js.includes('归档项目'));
  check('菜单含「删除项目」', js.includes('删除项目'));
  check('Nav 绑定 onContextMenu', js.includes('onContextMenu') || js.includes('contextmenu'));

  {
    // 归档 → 列出 → 恢复 全链路
    // 注意：active 可能为 null（上一轮测试归档后没恢复干净），用列表第一本兜底
    const lib = await api('GET', '/api/library');
    const projects = lib.json?.data?.projects ?? [];
    const id = lib.json?.data?.active ?? projects[0]?.id;
    check('能取到目标书', !!id, id);
    if (!id) {
      console.log('    （跳过归档链路测试）');
    } else {
      const before = projects.length;

      const arch = await api('POST', `/api/library/${id}/archive`);
      check('POST 归档 200', arch.status === 200, arch.json);

      const list = await api('GET', '/api/library/archived');
      check('归档列表含该书', list.json?.data?.archived?.some((x: any) => x.id === id), list.json?.data?.archived);

      const after = await api('GET', '/api/library');
      check('小说库列表已移除', (after.json?.data?.projects?.length ?? 0) === before - 1);

      const restore = await api('POST', `/api/library/archived/${id}/restore`);
      check('POST 恢复 200', restore.status === 200, restore.json);

      const final = await api('GET', '/api/library');
      check('恢复后回到列表', (final.json?.data?.projects?.length ?? 0) === before);
      check('恢复后 id 不变', final.json?.data?.projects?.some((x: any) => x.id === id));
    }
  }

  console.log('\n【6. 三级目录间距加大】');
  check('三级行高 38px（原 34px）', /--nav-item-h:38px/.test(css.replace(/\s+/g, '')));
  check('三级内边距 9px（原 6px）',
    /\.nav-item\.level-3\{[^}]*padding:9px/.test(css.replace(/\s+/g, ' ')) || css.includes('padding:9px 12px 9px 34px'));
  check('三级项之间有 margin', /\.nav-item\.level-3\{[^}]*margin-bottom:2px/.test(css.replace(/\s+/g, ' ')) || css.includes('margin-bottom:2px'));
  check('底部渐隐提示还有内容', css.includes('mask-image'));

  console.log('\n【7. 目录名可改（API 层）】');
  {
    const lib = await api('GET', '/api/library');
    const p = lib.json?.data?.projects?.[0];
    const oldDir = p?.dirName;
    // 改成一个临时目录名再改回
    const tmp = `${oldDir}-tmp`;
    const r1 = await api('PATCH', `/api/library/${p.id}`, { dirName: tmp });
    check('PATCH dirName 成功', r1.status === 200, r1.json);
    const afterRename = await api('GET', '/api/library');
    check('目录名已更新', afterRename.json?.data?.projects?.some((x: any) => x.dirName === tmp), afterRename.json?.data?.projects?.map((x: any) => x.dirName));

    const r2 = await api('PATCH', `/api/library/${p.id}`, { dirName: oldDir });
    check('改回原名成功', r2.status === 200, r2.json);
  }

  console.log(`\n───────────────`);
  console.log(`通过 ${pass} · 失败 ${fail}`);
  process.exitCode = fail > 0 ? 1 : 0;
}

main().catch((err) => {
  console.error('验收崩溃：', err);
  process.exitCode = 1;
});
