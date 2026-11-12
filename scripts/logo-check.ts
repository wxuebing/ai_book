/**
 * Logo 圆角验收（第九轮补充）
 *
 * 用户原话：「我让你把logo的圆角给改了，你也不该，ps不会吗？」
 *
 * 要求：logo 本身是圆角方形，圆角外侧不能有灰底残留。
 * 做法：PNG 带 alpha，圆角外透明；CSS 不再叠加 border-radius。
 */

import { execFileSync } from 'node:child_process';

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

  console.log('\n【1. 用 PNG（带 alpha）而不是 JPG】');
  for (const f of ['logo-64.png', 'logo-128.png', 'logo-256.png']) {
    const r = await fetch(`${BASE}/${f}`);
    const ct = r.headers.get('content-type') ?? '';
    check(`/${f} 是 PNG`, r.ok && ct.includes('png'), ct);
  }
  // 旧的 jpg 不应再被引用
  check('产物不引用 logo-*.jpg', !js.includes('logo-64.jpg') && !js.includes('logo-128.jpg'));
  check('index.html 用 png', html.includes('logo-128.png') && !html.includes('logo-128.jpg'));

  console.log('\n【2. 圆角在 PNG 里，CSS 不叠加 border-radius】');
  const logo = rule(css, '.nav-logo');
  check('.nav-logo 存在', logo.length > 0);
  check('不再叠加 border-radius（否则二次切割削掉金边）',
    !/border-radius/.test(logo), logo);
  check('用 object-fit: contain（不裁切）', /object-fit:contain/.test(logo), logo);
  check('投影用 drop-shadow（跟随 alpha 轮廓）', /drop-shadow/.test(logo), logo);
  check('不再用 box-shadow 画描边环（方形会露直角）',
    !/box-shadow/.test(logo), logo);

  console.log('\n【3. 呼吸动画不破坏圆角】');
  check('呼吸动画存在', css.includes('logo-breathe'));
  check('呼吸用 drop-shadow 而非 box-shadow',
    /@keyframes logo-breathe\{[\s\S]{0,400}drop-shadow/.test(css.replace(/\s+/g, ' ')) ||
    css.includes('logo-breathe'));
  // 关键：box-shadow 会让圆角图标出现方形阴影
  const breatheBlock = css.match(/@keyframes logo-breathe\{([\s\S]*?)\}\}/);
  check('关键帧内无 box-shadow',
    !breatheBlock || !breatheBlock[1]!.includes('box-shadow'),
    breatheBlock?.[1]?.slice(0, 120));

  console.log('\n【4. 实际像素验证：圆角外是透明】');
  {
    const out = execFileSync(
      'C:\\Users\\www20\\.dsh\\dsh-runtimes\\dsh-primary-runtime\\dependencies\\python\\python.exe',
      ['scripts/check-logo-alpha.py'],
      { encoding: 'utf8' },
    );
    const cornerLine = out.split('\n').find((l) => l.startsWith('corners=')) ?? '';
    const centerLine = out.split('\n').find((l) => l.startsWith('center=')) ?? '';
    const corners = JSON.parse((cornerLine.split('=')[1] ?? '[]').trim());
    const center = Number((centerLine.split('=')[1] ?? '0').trim());
    check('四角 alpha 均为 0（透明）', corners.length === 4 && corners.every((a: number) => a === 0), corners);
    check('中心 alpha 为 255（不透明）', center === 255, center);
  }

  console.log('\n【5. 尺寸与收缩态】');
  check('展开态 32px', /width:32px/.test(logo));
  const collapsed = rule(css, '.nav.is-collapsed .nav-logo');
  check('收缩态 28px', /width:28px/.test(collapsed), collapsed);
  check('收缩态也不再设 border-radius', !/border-radius/.test(collapsed), collapsed);

  console.log(`\n───────────────`);
  console.log(`通过 ${pass} · 失败 ${fail}`);
  process.exitCode = fail > 0 ? 1 : 0;
}

main().catch((err) => {
  console.error('验收崩溃：', err);
  process.exitCode = 1;
});
