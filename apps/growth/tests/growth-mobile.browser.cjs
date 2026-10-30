const assert=require('node:assert/strict'),path=require('node:path'),os=require('node:os');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {createGrowthServer}=require('../scripts/server.cjs');
(async()=>{
 const server=createGrowthServer(path.resolve(__dirname,'..'));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
 try{
  browser=await chromium.launch({headless:true,...(process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{})});
  const context=await browser.newContext({hasTouch:true,isMobile:true,viewport:{width:390,height:844}}),page=await context.newPage();
  await context.route('https://accounts.google.com/gsi/client',route=>route.fulfill({contentType:'application/javascript',body:''}));
  await page.goto('http://127.0.0.1:'+server.address().port+'/growth.html');await page.waitForFunction(()=>document.querySelector('#child-select option')?.textContent==='尚未新增孩子');
  assert.equal(await page.locator('.site-header .back,.site-header .home-system-link').count(),0);assert.equal(await page.locator('#growth-login').count(),1);
  for(const width of [320,375,390,414,560,768]){
   await page.setViewportSize({width,height:844});
   for(const withAvatar of [false,true]){
    await page.evaluate(withAvatar=>{const avatar=document.querySelector('#selected-child-avatar');avatar.hidden=!withAvatar;avatar.textContent='育';document.querySelector('#child-select option').textContent='這是一個比較長的孩子暱稱';},withAvatar);
    const layout=await page.evaluate(()=>{
     const selectors=['.family-bar .field-label','#child-select','#preview-child','#edit-child','#add-child'];if(!document.querySelector('#selected-child-avatar').hidden)selectors.push('#selected-child-avatar');
     return {overflow:document.documentElement.scrollWidth>innerWidth,rects:selectors.map(selector=>{const r=document.querySelector(selector).getBoundingClientRect();return {selector,left:r.left,right:r.right,top:r.top,bottom:r.bottom};})};
    });
    assert.equal(layout.overflow,false,'page overflow at '+width);
    for(const rect of layout.rects){assert(rect.left>=0&&rect.right<=width+.5,'control exceeds viewport at '+width+': '+rect.selector);}
    for(let i=0;i<layout.rects.length;i++)for(let j=i+1;j<layout.rects.length;j++){
     const a=layout.rects[i],b=layout.rects[j],overlap=Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1;
     assert(!overlap,'overlap at '+width+': '+a.selector+' and '+b.selector);
    }
   }
  }
  await page.setViewportSize({width:390,height:844});await page.locator('.family-sidebar').screenshot({path:path.join(os.tmpdir(),'growth-mobile-family.png')});
  for(const width of [320,375,390,414,560,768]){
   await page.setViewportSize({width,height:844});
   for(const [dialog,date,text]of [['record-dialog','record-date','record-milestone'],['child-dialog','child-birthday','child-name']]){
    const sizes=await page.evaluate(({dialog,date,text})=>{const modal=document.getElementById(dialog);modal.showModal();document.getElementById(date).value='2026-10-30';const a=document.getElementById(date).getBoundingClientRect(),b=document.getElementById(text).getBoundingClientRect();const result={dateWidth:a.width,textWidth:b.width,overflow:modal.scrollWidth>modal.clientWidth};modal.close();return result;},{dialog,date,text});
    assert(Math.abs(sizes.dateWidth-sizes.textWidth)<1,'date width differs from text at '+width+': '+date);assert.equal(sizes.overflow,false,'dialog scrolls horizontally at '+width+': '+dialog);
   }
  }
  console.log('Date inputs match text input widths without horizontal overflow.');
  console.log('Mobile family controls: no overlap at 320, 375, 390, 414, 560, 768px with long names, avatars and touch styles.');
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
