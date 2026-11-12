import { chromium } from 'playwright-core';
const CHROME='C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const B='http://127.0.0.1:5178';
const lib = await (await fetch(B+'/api/library')).json();
const id = lib.data.projects[0].id;
const b=await chromium.launch({executablePath:CHROME,headless:true,args:['--no-sandbox','--disable-gpu','--hide-scrollbars']});
const ctx=await b.newContext({viewport:{width:1600,height:1000},locale:'zh-CN'});
await ctx.grantPermissions(['clipboard-read','clipboard-write']);
const p=await ctx.newPage();
await p.goto(`http://127.0.0.1:5178/project/${id}/manuscript`,{waitUntil:'networkidle'});
await p.waitForTimeout(900);
await p.screenshot({path:'shots/r19-manuscript-empty.png'});
// 新建章节
const newBtn = p.locator('text=新建章节').first();
if (await newBtn.count()) { await newBtn.click(); await p.waitForTimeout(1000); }
await p.screenshot({path:'shots/r19-manuscript-new.png'});
// 写内容
const body = p.locator('.writing-body');
if (await body.count()) {
  await body.fill('张凡缓缓睁开眼，四周是一片陌生的荒原。他摸了摸腰间的无字木牌，那是他唯一记得的东西。');
  await p.waitForTimeout(300);
}
// 改标题
const tt = p.locator('.writing-title-input');
if (await tt.count()) { await tt.fill('第一章 醒来'); await p.waitForTimeout(200); }
await p.screenshot({path:'shots/r19-manuscript-dirty.png'});
// 保存
const saveBtn = p.locator('button:has-text("保存")').last();
await saveBtn.click();
await p.waitForTimeout(900);
await p.screenshot({path:'shots/r19-manuscript-saved.png'});
// 验证接口
const g = await (await fetch(`${B}/api/project/${id}/group/${encodeURIComponent('章节')}`)).json();
console.log('chapters:', g.data.notes.length, 'first words:', g.data.notes[0]?.words, 'title:', g.data.notes[0]?.title);
await b.close();
