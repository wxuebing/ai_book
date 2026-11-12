import { chromium } from 'playwright-core';
const CHROME='C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const B='http://127.0.0.1:5178';
const b=await chromium.launch({executablePath:CHROME,headless:true,args:['--no-sandbox','--disable-gpu','--hide-scrollbars']});
const p=await (await b.newContext({viewport:{width:1600,height:1000},locale:'zh-CN'})).newPage();
for (const [name,url] of [['r17-library','/library'],['r17-ideas','/ideas'],['r17-trash','/settings/trash'],['r17-types','/settings/types']]) {
  await p.goto(B+url,{waitUntil:'networkidle'}); await p.waitForTimeout(800);
  await p.screenshot({path:'shots/'+name+'.png'}); console.log('✔',name);
}
await b.close();
