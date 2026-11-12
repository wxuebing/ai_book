/**
 * 书名号验收（docs/04 第 6.1 节）
 *
 * 用户原话（最终澄清）：「书名号是书名号，不是直角符号，基本信息里的书名号错了」
 *
 * 结论：用中文书名号《》，不是直角引号 ⌜⌟，也不是中空 SVG。
 * 之前几轮我把「正反的 L」误解成直角引号，用户最终纠正为书名号。
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

  console.log('\n【1. 用中文书名号《》】');
  check('产物含《', js.includes('《'));
  check('产物含》', js.includes('》'));
  check('BookName 组件存在', js.includes('book-name'));

  console.log('\n【2. 不再用直角引号 / 中空 SVG】');
  check('没有 ⌜（U+231C）', !js.includes('\u231C'));
  check('没有 ⌟（U+231F）', !js.includes('\u231F'));
  check('导航栏有中空 SVG 开引号路径', js.includes('M2.2 11.2V2.2H11.2'));
  check('导航栏有中空 SVG 闭引号路径', js.includes('M0.8 9.8H9.8V0.8'));
  check('导航栏有 .book-quote 样式', css.includes('.book-quote'));

  console.log('\n【3. 书名样式：继承层级，不抢视觉权重】');
  const name = rule(css, '.book-name');
  check('颜色继承（不单独设色）', /color:inherit/.test(name), name);
  check('字重继承', /font-weight:inherit/.test(name), name);

  console.log('\n【4. 只包裹书名】');
  {
    const tools = await (await fetch(BASE + '/api/tools')).json();
    const label = tools?.data?.items?.[0]?.label;
    check('工具名不含书名号', !String(label).includes('《'), label);
  }
  {
    const nav = await (await fetch(BASE + '/api/nav')).json();
    const toolRoot = nav?.data?.roots?.find((r: { id: string }) => r.id === 'tools');
    const firstTool = toolRoot?.children?.[0]?.label;
    check('导航里的工具名不含书名号', !String(firstTool).includes('《'), firstTool);
  }

  console.log(`\n───────────────`);
  console.log(`通过 ${pass} · 失败 ${fail}`);
  process.exitCode = fail > 0 ? 1 : 0;
}

main().catch((err) => {
  console.error('验收崩溃：', err);
  process.exitCode = 1;
});
