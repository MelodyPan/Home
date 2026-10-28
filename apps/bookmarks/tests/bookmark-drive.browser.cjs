const assert=require('node:assert/strict'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {createBookmarkServer}=require('../scripts/server.cjs');
const {createManualBookmark}=require('../Javascript/bookmark-core.js');
const {createDataFile}=require('../Javascript/bookmark-file.js');
process.chdir(path.resolve(__dirname,'../../..'));
(async()=>{
 let holdChecks=false;const checkedUrls=[];
 const server=createBookmarkServer(path.resolve('apps/bookmarks'),{checkUrl:async(url,{signal})=>{
  if(holdChecks)await new Promise((resolve,reject)=>{if(signal.aborted)reject(signal.reason);else signal.addEventListener('abort',()=>reject(signal.reason),{once:true});});
  checkedUrls.push(url);
  return {status:url.endsWith('/b')?'missing':'reachable',code:url.endsWith('/b')?404:200,reason:'browser test',finalUrl:url,checkedAt:new Date().toISOString()};
 }});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 let browser;try{
  browser=await chromium.launch({headless:true,...(process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{})});const context=await browser.newContext(),page=await context.newPage(),errors=[],files=new Map();let count=0,uploads=0,account='me',listFail=false,uploadGate=null,startupGate=null;
  page.on('pageerror',e=>errors.push(e.message));
  await context.route('https://accounts.google.com/gsi/client',route=>route.fulfill({contentType:'application/javascript',body:`window.google={accounts:{oauth2:{initTokenClient(options){return {requestAccessToken(){options.callback({access_token:'test-token',expires_in:3600});}}},hasGrantedAllScopes(){return true;}}}};`}));
  await context.route('**/Javascript/site-config.js',route=>route.fulfill({contentType:'application/javascript',body:'window.BookmarksConfig={mode:"drive",urlCheckAvailable:true,googleClientId:"123-browser.apps.googleusercontent.com"};'}));
  await context.route('https://www.googleapis.com/**',async route=>{
   const req=route.request(),url=new URL(req.url()),legacy=url.pathname.includes('/v2/');let method=req.method(),posted=req.postData(),body,status=200,etag='';
   if(legacy){
    url.pathname=url.pathname.replace('/v2/','/v3/');if(method==='PUT')method='PATCH';
    const convert=meta=>{assert(!meta.appProperties);assert((meta.properties||[]).every(p=>p.visibility==='PRIVATE'));const {title,properties,...rest}=meta;return {...rest,...(title?{name:title}:{}),appProperties:Object.fromEntries((properties||[]).map(p=>[p.key,p.value]))};};
    if(posted){if(url.pathname.startsWith('/upload/')){const lines=posted.split('\r\n'),index=lines.findIndex(line=>line.startsWith('{'));lines[index]=JSON.stringify(convert(JSON.parse(lines[index])));posted=lines.join('\r\n');}else posted=JSON.stringify(convert(JSON.parse(posted)));}
   }
   if(url.pathname.endsWith('/about')&&startupGate)await startupGate;
   if(url.pathname.endsWith('/about'))body={user:{permissionId:account,emailAddress:account+'@example.test'}};
   else if(url.pathname.endsWith('/generateIds'))body={ids:['file-'+(++count)]};
   else if(url.pathname==='/drive/v3/files'){
    if(method==='POST'){const meta={...JSON.parse(posted),shared:false};files.set(meta.id,{meta:{...meta,parents:['root'],createdTime:new Date().toISOString()}});body=meta;}
    else{const folders=(url.searchParams.get('q')||'').includes("mimeType = 'application/vnd.google-apps.folder'");body={files:[...files.values()].map(x=>x.meta).filter(meta=>folders?meta.mimeType==='application/vnd.google-apps.folder'&&meta.name==='MelodyHome':meta.appProperties?.purpose==='melody-home-bookmarks-v1')};}if(listFail)status=403;
   }
   else if(url.pathname.startsWith('/upload/drive/v3/files')){
    uploads++;
    const json=posted.split('\r\n').filter(x=>x.startsWith('{')),meta=JSON.parse(json[0]),content=JSON.parse(json[1]);
    if(uploadGate)await uploadGate();
    if(method==='PATCH'){
     const id=url.pathname.split('/').at(-1),prior=files.get(id);if(req.headers()['if-match']!==String(prior.version||1)){status=412;body={};}else{prior.meta={...prior.meta,...meta,...(url.searchParams.has('addParents')?{parents:[url.searchParams.get('addParents')]}:{})};prior.content=content;prior.version=(prior.version||1)+1;body={id};}
    }else if(files.has(meta.id)){status=409;body={};}else{files.set(meta.id,{meta:{...meta,createdTime:new Date().toISOString()},content,version:1});body={id:meta.id};}
   }else{const data=files.get(url.pathname.split('/').at(-1));if(data){if(method==='PATCH'){const patch=JSON.parse(posted);if(req.headers()['if-match']&&req.headers()['if-match']!==String(data.version||1)){status=412;body={};}else{if(patch.appProperties)data.meta.appProperties={...data.meta.appProperties,...patch.appProperties};if(url.searchParams.has('addParents'))data.meta.parents=[url.searchParams.get('addParents')];data.version=(data.version||1)+1;}}body=body|| (url.searchParams.get('alt')==='media'?data.content:data.meta);etag=String(data.version||1);}else{status=404;body={};}}
   if(legacy&&method==='GET'&&status===200)body={id:body.id,etag,parents:(body.parents||[]).map(id=>({id})),properties:Object.entries(body.appProperties||{}).map(([key,value])=>({key,value,visibility:'PRIVATE'}))};
   // Reproduce Google metadata responses whose ETag cannot be read by JS.
   await route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
  });
  const url='http://127.0.0.1:'+server.address().port+'/bookmarks.html';
  await page.goto(url);await page.waitForFunction(()=>document.querySelector('#cloud-message').textContent.includes('請連接'));
  assert.equal(await page.locator('#drive-dialog').isVisible(),false);await page.locator('#drive-login').click();await page.locator('#drive-dialog').waitFor({state:'visible'});
  assert.equal(await page.locator('main #save-indicator,main .cloud-panel,main #file-storage-bar').count(),0);
  assert.equal(await page.locator('#total-top').textContent(),'0');
  await page.locator('#cloud-connect').click();await page.locator('#cloud-initialize').waitFor({state:'visible'});
  page.on('dialog',d=>d.accept());await page.locator('#cloud-new').click();await page.waitForFunction(()=>document.querySelector('#cloud-message').textContent==='已同步至 Google Drive。');
  await page.locator('#close-drive-dialog').click();
  for(const parent of ['work','dev']){
   const button=page.locator('#categories .nav-button[data-category="'+parent+'"]'),subnav=page.locator('#categories .nav-button[data-category="'+parent+'"] + .work-subnavigation');
   await button.click();assert.equal(await subnav.isVisible(),true);const title=await page.locator('#library-title').textContent();
   await button.click();assert.equal(await subnav.isVisible(),false,'second click collapses subcategories');assert.equal(await button.getAttribute('aria-expanded'),'false');assert.equal(await page.locator('#library-title').textContent(),title,'collapse keeps the current bookmark results');
   await button.click();assert.equal(await subnav.isVisible(),true);assert.equal(await button.getAttribute('aria-expanded'),'true');
  }
  await page.locator('#home-link').click();
  await page.locator('#add-bookmark').click();await page.locator('#bookmark-title').fill('跨裝置書籤');await page.locator('#bookmark-url').fill('example.com');await page.locator('#add-form button[type=submit]').click();
  await page.waitForFunction(()=>document.querySelector('#cloud-message').textContent==='已同步至 Google Drive。');assert.equal(await page.locator('#total-top').textContent(),'1');assert.equal(await page.locator('.bookmark-card').count(),1);
  await page.locator('.favorite-button').first().click();await page.waitForFunction(()=>document.querySelector('#cloud-message').textContent==='已同步至 Google Drive。');
  assert.equal(await page.locator('#drive-login').textContent(),'登出');await page.locator('#drive-manage').click();
  await page.locator('#cloud-sync').click();await page.waitForFunction(()=>document.querySelector('#cloud-message').textContent==='已同步至 Google Drive。');
  assert.equal(await page.locator('#reimport-data').isVisible(),true);
  const currentSnapshots=[...files.values()].filter(x=>x.content),datasetId=currentSnapshots[0].content.datasetId;
  const imported=createDataFile([],{added:[createManualBookmark({title:'重新匯入書籤 A',url:'https://example.com/a',category:'dev'},'manual-import-a',1),createManualBookmark({title:'重新匯入書籤 B',url:'https://example.com/b',category:'life'},'manual-import-b',2)],deletedIds:[]},[],'1970-01-01T00:00:00Z');
  const chooserEvent=page.waitForEvent('filechooser');await page.locator('#reimport-data').click();const chooser=await chooserEvent;
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await chooser.setFiles({name:'bookmarks-data.txt',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(imported))});
  await page.waitForFunction(()=>document.querySelector('#total-top').textContent==='2'&&document.querySelector('#cloud-message').textContent==='已同步至 Google Drive。');
  assert.equal(await page.locator('.bookmark-card').count(),2,'reimport should clear the old category filter');
  assert.equal(new Set([...files.values()].filter(x=>x.content).map(x=>x.content.datasetId)).size,1);assert.equal([...files.values()].find(x=>x.content).content.datasetId,datasetId);
  const folder=[...files.values()].find(x=>x.meta.mimeType==='application/vnd.google-apps.folder');assert.equal(folder.meta.name,'MelodyHome');assert([...files.values()].filter(x=>x.content).every(x=>x.meta.parents?.[0]===folder.meta.id));
  assert.deepEqual(await page.evaluate(()=>Object.keys(localStorage)),[]);
  await page.locator('#close-drive-dialog').click();
  await page.locator('#primary-nav .nav-button[data-category="all"]').click();
  assert.equal(await page.locator('#bookmark-grid .simple-bookmark-link').count(),2,'upper navigation renders simple links');assert.equal(await page.locator('#bookmark-grid .bookmark-card').count(),0);assert.equal(await page.locator('.layout-switch').isVisible(),false);assert.equal(await page.locator('.selection-toolbar').isVisible(),false);
  await page.locator('#categories .nav-button[data-category="life"]').click();await page.locator('#sort').selectOption('favorite');await page.locator('.favorite-button').click();await page.waitForFunction(()=>document.querySelector('#cloud-message').textContent==='已同步至 Google Drive。');
  await page.locator('#primary-nav .nav-button[data-category="all"]').click();assert.deepEqual(await page.locator('#bookmark-grid .simple-bookmark-link').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('href'))),['https://example.com/a','https://example.com/b'],'all bookmarks sorts by URL even when later URL is a favorite');assert.equal(await page.locator('#sort').inputValue(),'url');
  await page.locator('#categories .nav-button[data-category="life"]').click();assert.equal(await page.locator('#sort').inputValue(),'favorite','category sort remains unchanged');await page.locator('.favorite-button').click();await page.waitForFunction(()=>document.querySelector('#cloud-message').textContent==='已同步至 Google Drive。');await page.locator('#sort').selectOption('original');await page.locator('#primary-nav .nav-button[data-category="all"]').click();
  const scrollFixture=await page.addStyleTag({content:'body{min-height:1800px}'});await page.evaluate(()=>window.scrollTo(0,0));assert.equal(await page.locator('#scroll-top').isVisible(),false);
  await page.evaluate(()=>window.scrollTo(0,400));await page.locator('#scroll-top').waitFor({state:'visible'});assert.equal(await page.locator('#scroll-top').textContent(),'上');
  const bounds=await page.locator('#scroll-top').boundingBox(),viewport=page.viewportSize();assert(bounds.x>viewport.width-100&&bounds.y>viewport.height-100,'button stays in lower right of viewport');
  await page.locator('#scroll-top').click();await page.waitForFunction(()=>window.scrollY<=1);await page.locator('#scroll-top').waitFor({state:'hidden'});
  await page.locator('#categories .nav-button[data-category="dev"]').click();await page.evaluate(()=>window.scrollTo(0,400));assert.equal(await page.locator('#scroll-top').isVisible(),false,'other category does not show all-bookmarks scroll button');
  await scrollFixture.evaluate(node=>node.remove());await page.locator('#primary-nav .nav-button[data-category="all"]').click();await page.evaluate(()=>window.scrollTo(0,0));
  const simple=page.locator('#bookmark-grid .simple-bookmark-link[data-bookmark="manual-import-a"]');assert.equal(await simple.getAttribute('target'),'_blank');assert.equal(await simple.locator('.quick-symbol').count(),1);assert.equal(await simple.locator('.quick-label').textContent(),'重新匯入書籤 A');assert.equal(await simple.locator('button,input,.card-folder,.card-domain').count(),0);
  await page.locator('#toggle-browse-search').click();await page.locator('#browse-search').fill('https://example.com/a');
  assert.equal(await page.locator('#bookmark-grid .bookmark-card').count(),1,'keyword results from upper navigation use detailed cards');assert.equal(await page.locator('#bookmark-grid .simple-bookmark-link').count(),0);assert.equal(await page.locator('.edit-details-button').isVisible(),true);assert.equal(await page.locator('.favorite-button').isVisible(),true);assert.equal(await page.locator('.recheck-button').isVisible(),true);assert.equal(await page.locator('.layout-switch').isVisible(),true);
  await page.locator('.bookmark-select').check();assert.equal(await page.locator('#selection-count').textContent(),'已選 1 筆');
  await page.locator('#clear-browse-search').click();assert.equal(await page.locator('#bookmark-grid .simple-bookmark-link').count(),2);assert.equal(await page.locator('.selection-toolbar').isVisible(),false);assert.equal(await page.locator('#selection-count').textContent(),'已選 0 筆');
  await page.locator('#categories .nav-button[data-category="dev"]').click();assert.equal(await page.locator('.selection-toolbar').isVisible(),true);await page.locator('.bookmark-select').first().check();assert.equal(await page.locator('#selection-count').textContent(),'已選 1 筆');
  await page.locator('#primary-nav .nav-button[data-category="favorites"]').click();assert.equal(await page.locator('.selection-toolbar').isVisible(),false);assert.equal(await page.locator('#selection-count').textContent(),'已選 0 筆');
  await page.locator('#categories .nav-button[data-category="dev"]').click();assert.equal(await page.locator('.bookmark-select').first().isChecked(),false);
  await page.locator('#primary-nav .nav-button[data-category="all"]').click();
  await page.locator('#check-info').click();holdChecks=true;await page.locator('#run-url-check').click();await page.locator('#cancel-url-check').waitFor({state:'visible'});await page.locator('#cancel-url-check').click();await page.waitForFunction(()=>document.querySelector('#url-check-message').textContent.includes('已取消'));
  assert.equal([...files.values()].find(x=>x.content).content.data.checkedAt,'1970-01-01T00:00:00Z');
  holdChecks=false;await page.locator('#run-url-check').click();await page.waitForFunction(()=>document.querySelector('#url-check-message').textContent==='檢查完成，已同步至 Google Drive。');
  assert.equal(await page.locator('#status-summary button').count(),2);const checkedDocument=[...files.values()].find(x=>x.content).content.data;assert.notEqual(checkedDocument.checkedAt,'1970-01-01T00:00:00Z');assert.equal(checkedDocument.changes.urlChecks['manual-import-b'].status,'missing');
  await page.locator('#dialog-done').click();
  await page.locator('#categories .nav-button[data-category="life"]').click();await page.locator('[data-bookmark="manual-import-b"] .recheck-button').click();assert.equal(await page.locator('#url-check-scope').inputValue(),'single');await page.locator('#run-url-check').click();await page.waitForFunction(()=>document.querySelector('#url-check-message').textContent==='檢查完成，已同步至 Google Drive。');assert.equal(checkedUrls.at(-1),'https://example.com/b');assert.equal([...files.values()].find(x=>x.content).content.data.checkedAt,checkedDocument.checkedAt,'partial checks do not change the last full-check timestamp');await page.locator('#dialog-done').click();
  await page.locator('#categories .nav-button[data-category="dev"]').click();await page.locator('[data-bookmark="manual-import-a"] .bookmark-select').check();await page.locator('#check-info').click();await page.locator('#url-check-scope').selectOption('selected');assert.match(await page.locator('#url-check-targets').textContent(),/共 1 筆/);await page.locator('#run-url-check').click();await page.waitForFunction(()=>document.querySelector('#url-check-message').textContent==='檢查完成，已同步至 Google Drive。');assert.equal(checkedUrls.at(-1),'https://example.com/a');await page.locator('#dialog-done').click();
  await page.locator('#categories .nav-button[data-category="life"]').click();await page.locator('#check-info').click();await page.locator('#url-check-scope').selectOption('filtered');assert.match(await page.locator('#url-check-targets').textContent(),/共 1 筆/);await page.locator('#url-check-scope').selectOption('abnormal');assert.match(await page.locator('#url-check-targets').textContent(),/共 1 筆/);await page.locator('#dialog-done').click();
  await page.locator('#home-link').click();await page.locator('#search').fill('重新匯入書籤');const beforeBurst=uploads;await page.locator('.favorite-button').nth(0).click();await page.locator('.favorite-button').nth(1).click();await page.waitForFunction(()=>document.querySelector('#cloud-message').textContent==='已同步至 Google Drive。');assert.equal(uploads-beforeBurst,1,'two quick edits coalesce into a single upload');
  await page.locator('#toggle-filters').click();await page.locator('#purpose-shortcuts [data-purpose="work"]').click();await page.locator('#status-shortcuts [data-status="missing"]').click();
  const folderValue=await page.locator('#original-folder-filter option').nth(1).getAttribute('value');await page.locator('#original-folder-filter').selectOption(folderValue);await page.locator('#duplicate-filter').check();
  await page.locator('#primary-nav .nav-button[data-category="all"]').click();await page.locator('#toggle-browse-search').click();await page.locator('#browse-search').fill('https://example.com/a');
  await page.locator('#primary-nav .nav-button[data-category="favorites"]').click();
  assert.equal(await page.locator('#bookmark-grid .simple-bookmark-link').count(),2,'favorites clears prior search and all filters');assert.equal(await page.locator('#search').inputValue(),'');assert.equal(await page.locator('#browse-search').inputValue(),'');assert.equal(await page.locator('#status-filter').inputValue(),'all');assert.equal(await page.locator('#original-folder-filter').inputValue(),'all');assert.equal(await page.locator('#duplicate-filter').isChecked(),false);assert.equal(await page.locator('#active-filters').isVisible(),false);
  await page.locator('#home-link').click();const originalQuick=await page.locator('.quick-label').allTextContents();await page.locator('#manage-quick-order').click();await page.locator('.quick-order-row').nth(1).locator('button').first().click();await page.locator('#close-quick-order').click();await page.waitForFunction(()=>document.querySelector('#cloud-message').textContent==='已同步至 Google Drive。');assert.deepEqual(await page.locator('.quick-label').allTextContents(),[originalQuick[1],originalQuick[0]]);
  let finishStartup;startupGate=new Promise(resolve=>finishStartup=resolve);await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('#bookmark-startup').waitFor({state:'visible'});assert.equal(await page.locator('.workspace').isVisible(),false,'startup hides empty counts and disconnected UI');
  finishStartup();startupGate=null;await page.waitForFunction(()=>!document.body.hasAttribute('data-bookmarks-loading')&&document.querySelector('#total-top').textContent==='2'&&document.querySelector('#cloud-message').textContent==='已同步至 Google Drive。');
  await page.locator('#bookmark-startup').waitFor({state:'hidden'});
  await page.evaluate(()=>{window.retainedQuickLink=document.querySelector('#quick-links a');});
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.waitForFunction(()=>document.querySelector('#cloud-message').textContent==='已同步至 Google Drive。');
  assert.equal(await page.evaluate(()=>window.retainedQuickLink===document.querySelector('#quick-links a')),true,'unchanged background refresh retains rendered links');
  assert.equal(await page.locator('#drive-dialog').isVisible(),false,'reload resumes without opening the login dialog');
  assert.deepEqual(await page.locator('.quick-label').allTextContents(),[originalQuick[1],originalQuick[0]],'quick order survives reload');
  await page.locator('#categories .nav-button[data-category="dev"]').click();
  const second=await context.newPage();second.on('pageerror',e=>errors.push(e.message));await second.goto(url);await second.locator('#drive-login').click();await second.locator('#cloud-connect').click();await second.waitForFunction(()=>document.querySelector('#total-top').textContent==='2');await second.locator('#close-drive-dialog').click();
  await second.locator('#categories .nav-button[data-category="dev"]').click();assert.equal(await second.locator('.bookmark-card').count(),1);
  second.on('dialog',d=>d.accept());
  for(const current of [page,second]){await current.locator('.edit-details-button').first().click();await current.locator('#edit-details-title').fill(current===page?'第一台修改':'第二台修改');}
  let arrivals=0,release;const gate=new Promise(r=>release=r);uploadGate=async()=>{if(++arrivals===2){uploadGate=null;release();}await gate;};
  await Promise.all([page.locator('#edit-details-form button[type=submit]').click(),second.locator('#edit-details-form button[type=submit]').click()]);
  await Promise.race([page.locator('#cloud-conflict').waitFor({state:'visible'}),second.locator('#cloud-conflict').waitFor({state:'visible'})]);
  const loser=await page.locator('#cloud-conflict').isVisible()?page:second,winner=loser===page?second:page;
  await loser.locator('#cloud-version').selectOption('draft');await loser.locator('#cloud-use-version').click();await loser.waitForFunction(()=>document.querySelector('#cloud-message').textContent==='已同步至 Google Drive。');
  await loser.locator('#close-drive-dialog').click();await winner.evaluate(()=>window.dispatchEvent(new Event('focus')));await winner.waitForFunction(()=>document.querySelector('#cloud-message').textContent==='已同步至 Google Drive。');assert.match(await winner.locator('.bookmark-card').first().textContent(),loser===page?/第一台修改/:/第二台修改/);
  assert.equal([...files.values()].filter(x=>x.content).length,1,'all same-day edits reuse one file');
  await second.locator('#drive-manage').click();account='other';listFail=true;await second.locator('#cloud-connect').click();await second.waitForFunction(()=>document.querySelector('#cloud-message').textContent.includes('拒絕存取'));assert.equal(await second.locator('#total-top').textContent(),'0');listFail=false;
  await page.locator('#drive-login').click();assert.equal(await page.locator('#drive-login').textContent(),'登入');assert.equal(await page.locator('#drive-manage').isVisible(),false);assert.equal(await page.locator('#total-top').textContent(),'0');assert.equal(await page.locator('#cloud-account').textContent(),'尚未連接');
  assert.equal(await page.evaluate(()=>sessionStorage.getItem('melody-drive-login-v1')),null);
  account='me';await page.locator('#drive-login').click();await page.locator('#cloud-connect').click();await page.waitForFunction(()=>document.querySelector('#total-top').textContent==='2');
  await page.evaluate(()=>{window.testTime=Date.now();Date.now=()=>window.testTime;window.testTime+=20*60000;window.dispatchEvent(new Event('focus'));});
  await page.waitForTimeout(1200);assert.equal(await page.locator('#total-top').textContent(),'2','idle time does not log out');
  await page.evaluate(()=>{window.testTime+=45*60000;window.dispatchEvent(new Event('focus'));});
  await page.waitForFunction(()=>document.querySelector('#total-top').textContent==='0');assert.equal(await page.evaluate(()=>sessionStorage.getItem('melody-drive-login-v1')),null);
  await page.reload();await page.waitForFunction(()=>document.querySelector('#cloud-message').textContent.includes('請連接'));await page.locator('#drive-login').click();
  await page.locator('#close-drive-dialog').click();await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.resolve('data/bookmarks-check-mobile.png'),fullPage:true});await page.locator('#drive-login').click();assert.equal(await page.locator('#drive-dialog').isVisible(),true);await page.screenshot({path:path.resolve('data/bookmarks-check-mobile-dialog.png'),fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  assert.deepEqual(errors,[]);console.log(JSON.stringify({browser:'pass',cases:['partial URL checks','quick entry order persists','burst edits upload once','connect/create','add/save','favorite','reimport existing dataset','MelodyHome folder','file picker focus guard','no private localStorage','reload restores authorization','no idle logout','token expiry logout survives reload','second device reload','concurrent edits/conflict resolution','account switch failure clears UI','disconnect clears UI','mobile width'],snapshots:[...files.values()].filter(x=>x.content).length}));
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
