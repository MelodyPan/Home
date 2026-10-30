// Run explicitly with PLAYWRIGHT_MODULE if Playwright is supplied by the desktop runtime.
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs/promises');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {createGrowthServer}=require('../scripts/server.cjs');
const {fakeDrive}=require('./fixtures/growth-drive-api.cjs');
const {decode}=require('../Javascript/growth-backup.js');
const {createDriveStore}=require('../Javascript/growth-drive.js');
process.chdir(path.resolve(__dirname,'../../..'));
(async()=>{
 const server=createGrowthServer(path.resolve('apps/growth'));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 let browser,page;try{
  browser=await chromium.launch({headless:true,...(process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{})});
  const context=await browser.newContext({acceptDownloads:true}),api=fakeDrive({browserMetadata:true}),errors=[];page=await context.newPage();let failSaves=false;
  page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept());
  await context.route('https://accounts.google.com/gsi/client',route=>route.fulfill({contentType:'application/javascript',body:`window.google={accounts:{oauth2:{initTokenClient(options){return {requestAccessToken(){options.callback({access_token:'test-token',expires_in:3600});}}},hasGrantedAllScopes(){return true;}}}};`}));
  await context.route('**/Javascript/site-config.js',route=>route.fulfill({contentType:'application/javascript',body:'window.BookmarksConfig={mode:"drive",googleClientId:"123-browser.apps.googleusercontent.com"};'}));
  await context.route('https://www.googleapis.com/**',async route=>{
   const req=route.request(),headers=req.headers(),options={method:req.method(),headers:{Authorization:headers.authorization,...(headers['content-type']?{'Content-Type':headers['content-type']}:{ }),...(headers['if-match']?{'If-Match':headers['if-match']}:{})}};
   const bytes=req.postDataBuffer();if(bytes)options.body=headers['content-type']?.startsWith('multipart/')?new Blob([bytes]):bytes.toString();
   if(failSaves&&req.url().includes('/upload/')){await route.abort('failed');return;}
   try{const response=await api.request(req.url(),options);await route.fulfill({status:response.status,headers:{...Object.fromEntries(response.headers),'Access-Control-Expose-Headers':'etag,location'},body:Buffer.from(await response.arrayBuffer())});}catch{await route.abort('failed');}
  });
  const url='http://127.0.0.1:'+server.address().port+'/growth.html';await page.goto(url);
  await page.locator('#growth-login').waitFor();assert.equal(await page.locator('#add-child').isDisabled(),true);
  await page.locator('#growth-login').click();await page.locator('#growth-cloud-connect').click();await page.locator('#growth-cloud-new').waitFor({state:'visible'});
  await page.locator('#growth-cloud-new').click();await page.waitForFunction(()=>document.querySelector('#growth-cloud-message').textContent.includes('已同步'));
  await page.locator('#growth-cloud-close').click();await page.locator('#add-child').click();await page.locator('#child-name').fill('小星');await page.locator('#child-form button[type=submit]').click();await page.locator('#child-dialog').waitFor({state:'hidden'});
  assert.match(await page.locator('#child-summary').textContent(),/小星/);
  await page.locator('#add-record').click();await page.locator('#record-title').fill('第一個故事');await page.locator('#record-story').fill('一起散步');
  await page.locator('#record-photos').setInputFiles(path.resolve('images/logo.png'));await page.locator('#record-form button[type=submit]').click();await page.locator('#record-dialog').waitFor({state:'hidden'});
  await page.waitForFunction(()=>document.querySelector('#album-photo').src.startsWith('blob:'));
  assert.equal(await page.locator('#story-title').textContent(),'第一個故事');
  const originalAlbum=[...api.files.values()].find(file=>file.meta.mimeType==='application/json').content.data;
  const originalChild=originalAlbum.children[0].id,originalRecord=structuredClone(originalAlbum.records[0]);
  const photoFileId=originalAlbum.photoFiles[originalRecord.photos[0]],photoFolder=()=>api.files.get(api.files.get(photoFileId).meta.parents[0]).meta;
  assert.equal(photoFolder().name,'03');assert.equal(api.files.get(photoFolder().parents[0]).meta.name,'成長相簿照片');
  await page.locator('#add-child').click();await page.locator('#child-name').fill('小月');await page.locator('#child-birthday').fill('2020-01-01');await page.locator('#child-form button[type=submit]').click();await page.locator('#child-dialog').waitFor({state:'hidden'});
  const targetChild=[...api.files.values()].find(file=>file.meta.mimeType==='application/json').content.data.children.find(child=>child.name==='小月').id;
  await page.locator('#child-select').selectOption(originalChild,{force:true});await page.locator('#edit-current').click();
  assert.equal(await page.locator('#record-child-select').count(),1,'record editor must offer destination child');
  await page.locator('#record-child-select').selectOption(targetChild,{force:true});await page.locator('#record-form button[type=submit]').click();await page.locator('#record-dialog').waitFor({state:'hidden'});
  assert.equal(await page.locator('#child-select').inputValue(),targetChild);assert.equal(await page.locator('#story-title').textContent(),originalRecord.title);assert.match(await page.locator('#story-age').textContent(),/歲/);
  const moved=[...api.files.values()].find(file=>file.meta.mimeType==='application/json').content.data;
  assert.equal(moved.records.length,1);assert.deepEqual(moved.records[0],{...originalRecord,childId:targetChild});
  assert.equal(photoFolder().name,'04');assert.equal(moved.photoFiles[originalRecord.photos[0]],photoFileId);
  await page.locator('#child-select').selectOption(originalChild,{force:true});assert.equal(await page.locator('#album-view').isVisible(),false);
  await page.locator('#child-select').selectOption(targetChild,{force:true});await page.locator('#edit-current').click();await page.locator('#record-child-select').selectOption(originalChild,{force:true});await page.locator('#record-form button[type=submit]').click();await page.locator('#record-dialog').waitFor({state:'hidden'});
  const snapshots=()=>[...api.files.values()].filter(file=>file.meta.mimeType==='application/json');assert.equal(snapshots().length,1);assert.match(snapshots()[0].meta.name,/^growth-\d{4}-\d{2}\.json$/);
  await page.locator('#growth-login').click();const downloading=page.waitForEvent('download');await page.locator('#growth-cloud-backup').click();const download=await downloading,blob=new Blob([await fs.readFile(await download.path())]),backup=await decode(blob);
  assert.equal(backup.document.records[0].title,'第一個故事');assert.equal(backup.photos.size,1);
  await page.locator('#growth-cloud-close').click();await page.reload();await page.waitForFunction(()=>document.querySelector('#story-title').textContent==='第一個故事');
  // A remote change while an untouched edit dialog is open must produce conflict, not silently rebase old fields.
  await page.locator('#edit-current').click();const other=createDriveStore({request:api.request,token:()=> 'test-token'}),dataset=snapshots()[0].meta.appProperties.dataset,remote=await other.read(dataset);
  remote.document.records[0].story='另一台裝置故事';await other.write(dataset,remote.document,remote.revision);
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.locator('#record-milestone').fill('想保留的里程碑');await page.locator('#record-form button[type=submit]').click();
  await page.locator('#growth-cloud-conflict').waitFor({state:'visible'});assert.equal(await page.locator('#record-dialog').isVisible(),true);
  await page.locator('#growth-cloud-version').selectOption({index:0});
  await page.locator('#growth-cloud-use-version').click();await page.waitForFunction(()=>document.querySelector('#growth-cloud-message').textContent.includes('已同步'));await page.locator('#growth-cloud-close').click();
  assert.equal(await page.locator('#story-content').textContent(),'另一台裝置故事');
  await context.setOffline(true);await page.waitForFunction(()=>document.querySelector('#add-record').disabled);await context.setOffline(false);await page.waitForFunction(()=>!document.querySelector('#add-record').disabled);
  await page.locator('#edit-child').click();await page.locator('#child-name').fill('待同步名字');failSaves=true;await page.locator('#child-form button[type=submit]').click();await page.waitForFunction(()=>document.querySelector('#child-error').textContent.length>0);
  assert.equal(await page.locator('#child-dialog').isVisible(),true);assert.equal(await page.locator('#child-name').inputValue(),'待同步名字');
  await page.locator('#child-dialog [data-growth-manage]').click();failSaves=false;await page.locator('#growth-cloud-retry').click();await page.waitForFunction(()=>document.querySelector('#growth-cloud-message').textContent.includes('已同步'));
  await page.locator('#growth-cloud-close').click();assert.match(await page.locator('#child-summary').textContent(),/待同步名字/);assert.equal(await page.locator('#child-dialog').isVisible(),false);
  await page.locator('#growth-login').click();await page.locator('#growth-cloud-disconnect').click();assert.equal(await page.locator('#add-child').isDisabled(),true);assert.equal(await page.locator('#story-title').textContent(),'');assert.equal(await page.locator('img[src^="blob:"]').count(),0);
  // Import a complete portable backup as an independent album after reconnecting.
  await page.locator('#growth-cloud-connect').click();await page.waitForFunction(()=>!document.querySelector('#growth-cloud-import').disabled);
  await page.locator('#growth-cloud-import').setInputFiles({name:'restored.growth',mimeType:'application/octet-stream',buffer:Buffer.from(await blob.arrayBuffer())});
  await page.waitForFunction(()=>document.querySelector('#growth-cloud-message').textContent.includes('已匯入'));
  assert.equal(snapshots().length,2);assert.equal(backup.document.children[0].name,'小星');assert.equal(await page.locator('#growth-cloud-account').textContent(),'a@example.test');
  await page.locator('#growth-cloud-close').click();assert.match(await page.locator('#child-summary').textContent(),/小星/);assert.deepEqual(errors,[]);
  await page.setViewportSize({width:390,height:844});await page.locator('#growth-login').click();assert.equal(await page.locator('#growth-drive-dialog').isVisible(),true);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  console.log('Growth browser checks passed: login, monthly saves, photo bytes, full backup, reload, offline, failed draft retry, logout cleanup, separate import, mobile dialog.');
 }catch(error){if(page)console.error(await page.evaluate(()=>({child:document.querySelector('#child-error')?.textContent,record:document.querySelector('#record-error')?.textContent,cloud:document.querySelector('#growth-cloud-message')?.textContent})));throw error;}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
