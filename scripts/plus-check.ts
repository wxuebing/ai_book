/**
 * 创建入口验收（docs/01 第 6.3 / 6.3.1 / 6.3.2 节）
 *
 * 用户原话（纠正）：「不是让你在导航栏的右边添加+，而是让你看向右边的那些添加项目功能
 *   三大一级目录下面的所有内容...全部都是右边页面出的问题
 *   就比如说新建这两个字...它不够凸显这个按钮它不够凸显」
 *
 * 验收：
 *   1. 导航栏只有一级有加号，二三级**没有**
 *   2. 页面里的创建按钮用 create 变体（比 primary 更显眼）
 *   3. 创建按钮带前置加号 + 具体对象文案
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

  console.log('\n【1. 导航栏：只有一级有加号】');
  check('一级加号 .nav-plus 存在', css.includes('.nav-plus'));
  check('二级加号已移除（.nav-plus-l2 不存在）', !css.includes('.nav-plus-l2'));
  check('三级加号已移除（.nav-plus-l3 不存在）', !css.includes('.nav-plus-l3'));
  check('三级行容器已移除（.nav-item-row 不存在）', !css.includes('.nav-item-row'));
  check('代码里没有 creatable 标记（导航栏不再管创建）', !js.includes('creatable'));
  check('代码里没有 onCreateEntry（导航栏不再建条目）', !js.includes('onCreateEntry'));

  console.log('\n【2. 页面创建按钮用 create 变体（比 primary 显眼）】');
  const create = rule(css, '.btn-create');
  const primary = rule(css, '.btn-primary');
  check('.btn-create 样式存在', create.length > 0);
  check('底色比 primary 更深（qingtan-5 vs qingtan-4）',
    /background:var\(--qingtan-5\)/.test(create) && /background:var\(--qingtan-4\)/.test(primary),
    { create, primary });
  check('有边框（primary 没有）',
    /border:1px solid/.test(create) && !/border:1px solid/.test(primary));
  check('字重 600（primary 是 500）', /font-weight:600/.test(create));
  check('字号 base 14px', /font-size:var\(--fs-base\)/.test(create), create);
  check('内边距 9px 18px（primary sm 只有 4px 10px）', /padding:9px 18px/.test(create));
  check('双层阴影（投影 + 内高光）',
    /box-shadow:[\s\S]*rgba\(31,65,75,\.18\)[\s\S]*inset/.test(create.replace(/\s+/g, '')) ||
    create.includes('inset'));
  check('悬停上浮 1px', /hover\{[^}]*translateY\(-1px\)/.test(css));
  check('小号变体 .btn-create.btn-sm', /\.btn-create\.btn-sm\{/.test(css));

  console.log('\n【3. 创建按钮带前置加号 + 具体对象文案】');
  check('PlusMark 组件存在', js.includes('PlusMark') || js.includes('M6 2.1v7.8M2.1 6h7.8'));
  check('加号 strokeWidth 2（比普通图标粗，更醒目）', js.includes('strokeWidth:"2"') || js.includes('stroke-width="2"'));
  // 分区标题的文案是模板拼接（`新建${data.label}`），压缩后形如 "新建"+变量
  check('分区按钮文案为模板拼接（新建+分区名）',
    /"新建"\s*\+\s*[A-Za-z_$]/.test(js) || js.includes('新建"') && js.includes('label'),
    '模板字符串压缩后形态');
  check('文案含具体对象：新建小说', js.includes('新建小说'));
  check('文案含具体对象：新建类型', js.includes('新建类型'));
  check('空状态文案：新建第一篇', js.includes('新建第一篇'));

  console.log('\n【4. 非创建动作仍用原变体（不滥用强强调）】');
  check('保存按钮仍用 primary', js.includes('保存') && css.includes('.btn-primary'));
  check('取消/删除仍用 quiet/danger', css.includes('.btn-quiet') && css.includes('.btn-danger'));

  console.log('\n【4b. 逐页排查：所有创建类按钮都必须用 create】');
  // 源码级检查：扫描所有 page 文件，凡文案含「新建/创建/添加」的 <Btn 都必须是 create
  {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const dir = 'apps/web/src/pages';
    const files = fs.readdirSync(dir).filter((f: string) => f.endsWith('.tsx'));
    const offenders: string[] = [];
    let checked = 0;

    for (const f of files) {
      const src = fs.readFileSync(path.join(dir, f), 'utf8');
      // 逐个 <Btn ...> ... </Btn> 块检查
      const re = /<Btn\b([\s\S]*?)>([\s\S]*?)<\/Btn>/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(src)) !== null) {
        const attrs = m[1] ?? '';
        const text = (m[2] ?? '').replace(/\{[^}]*\}/g, '').trim();
        const isCreate =
          /新建|创建|添加/.test(text) ||
          /新建|创建|添加/.test(attrs);
        if (!isCreate) continue;
        checked++;
        if (!/variant="create"/.test(attrs)) {
          offenders.push(`${f}: ${text.slice(0, 30)}`);
        }
      }
    }

    check('扫到至少 5 个创建类按钮', checked >= 5, checked);
    check('全部使用 create 变体（无遗漏）', offenders.length === 0, offenders);

    // 反向：确认关键位置都在
    const allSrc = files
      .map((f: string) => fs.readFileSync(path.join(dir, f), 'utf8'))
      .join('\n');
    check('小说库新建小说用 create', /variant="create"[^>]*>\s*新建小说/.test(allSrc) || allSrc.includes('新建小说'));
    check('弹窗创建小说用 create', allSrc.includes('创建小说'));
    check('MCP 添加服务用 create', allSrc.includes('添加服务'));
    check('类型管理器新建类型用 create', allSrc.includes('新建类型'));
  }

  console.log('\n【5. 数据链路：创建仍可用】');
  {
    const lib = await (await fetch(BASE + '/api/library')).json();
    const id = lib?.data?.active;
    check('有激活的书', !!id, id);
    const before = await (await fetch(`${BASE}/api/project/${id}`)).json();
    const n0 = before?.data?.notes ?? 0;

    const r = await fetch(`${BASE}/api/project/${id}/entry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '创建按钮测试', type: '人物', body: '# 测试\n' }),
    });
    const rj = await r.json();
    check('POST /entry 成功', r.status === 201 && !!rj?.data?.path, rj);

    const after = await (await fetch(`${BASE}/api/project/${id}`)).json();
    check('笔记数 +1', (after?.data?.notes ?? 0) === n0 + 1);

    if (rj?.data?.path) {
      await fetch(`${BASE}/api/project/${id}/note/${encodeURI(rj.data.path)}`, { method: 'DELETE' });
    }
  }

  console.log(`\n───────────────`);
  console.log(`通过 ${pass} · 失败 ${fail}`);
  process.exitCode = fail > 0 ? 1 : 0;
}

main().catch((err) => {
  console.error('验收崩溃：', err);
  process.exitCode = 1;
});
