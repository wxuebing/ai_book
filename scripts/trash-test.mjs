import { chromium } from 'playwright-core';
const CHROME='C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const B='http://127.0.0.1:5178';
// 1) 建一本临时书，归档它
const lib = await (await fetch(B+'/api/library')).json();
const tmpName = 'TRASH-TEST-'+Date.now();
const created = await (await fetch(B+'/api/library',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:tmpName,description:'test',packs:[]})})).json();
const tid = created.data.id;
console.log('created', tid);
await fetch(`${B}/api/library/${tid}/archive`,{method:'POST'});
const arch = await (await fetch(B+'/api/library/archived')).json();
console.log('archived count', arch.data.archived.length);
// 2) 截图回收站
const b=await chromium.launch({executablePath:CHROME,headless:true,args:['--no-sandbox','--disable-gpu']});
const p=await (await b.newContext({viewport:{width:1600,height:1000},locale:'zh-CN'})).newPage();
await p.goto(B+'/settings/trash',{waitUntil:'networkidle'});
await p.waitForTimeout(800);
await p.screenshot({path:'shots/r15-trash-withitem.png'});
const purgeAll = await p.locator('text=全部清除').count();
const delOne = await p.locator('text=彻底删除').count();
console.log('全部清除:', purgeAll, '彻底删除:', delOne);
await b.close();
// 3) 测试 purge-all 端点
const pa = await (await fetch(B+'/api/library/archived/purge-all',{method:'POST'})).json();
console.log('purge-all result', JSON.stringify(pa.data));
const arch2 = await (await fetch(B+'/api/library/archived')).json();
console.log('archived after purge', arch2.data.archived.length);
