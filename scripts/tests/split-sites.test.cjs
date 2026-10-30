// 拆站驗收使用暫存資料與隨機連接埠，避免讀寫正式書籤及孩子照片。
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {createHomeServer}=require('../home-site-server.cjs');
const {buildSite}=require('../home-site-build.cjs');
const home=path.resolve(__dirname,'../..');
async function addProjectSource(root){
 const directory=path.join(root,'data/portfolio');await fs.mkdir(directory,{recursive:true});
 await fs.copyFile(path.join(home,'apps/admin/projects.public.json'),path.join(directory,'projects.json'));
}

test('兩站有獨立入口與雲端資源，本機相簿 API 停用且保留原資料',async t=>{
 const dataRoot=await fs.mkdtemp(path.join(os.tmpdir(),'split-data-'));
 await fs.mkdir(path.join(dataRoot,'assets'));
 const original={schemaVersion:1,updatedAt:null,children:[{id:'child',name:'測試孩子',birthday:''}],records:[]};
 await fs.writeFile(path.join(dataRoot,'assets/growth-data.json'),JSON.stringify(original));
 const server=await createHomeServer(home,{dataRoot});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 t.after(async()=>{await new Promise(r=>server.close(r));await fs.rm(dataRoot,{recursive:true,force:true});});
 const origin='http://127.0.0.1:'+server.address().port;
 await assert.rejects(fs.access(path.join(dataRoot,'assets/bookmarks-data.txt')));
 assert.equal((await fetch(origin+'/bookmarks/assets/bookmarks-data.txt')).status,404);
 assert.equal((await fetch(origin+'/bookmarks/api/bookmarks',{method:'PUT'})).status,404);

 for(const [route,target] of [['/bookmarks/','/bookmarks/bookmarks.html'],['/growth/','/growth/growth.html'],['/bookmarks/growth.html','/growth/growth.html']]){
  const response=await fetch(origin+route,{redirect:'manual'});assert.equal(response.status,302,route);assert.equal(response.headers.get('location'),target);
 }
 for(const site of ['bookmarks','growth']){
  const html=await(await fetch(`${origin}/${site}/${site}.html`)).text();assert.match(html,/<!doctype html>/i);
  for(const match of html.matchAll(/(?:src|href)="((?:Javascript|src)\/[^"#]+)"/g))assert.equal((await fetch(`${origin}/${site}/${match[1]}`)).status,200,match[1]);
 }
 assert.equal((await fetch(origin+'/bookmarks/Javascript/growth.js')).status,404);
 assert.equal((await fetch(origin+'/growth/Javascript/home.js')).status,404);
 for(const route of ['/growth/api/growth','/growth/api/growth/photos','/growth/assets/growth-photos/private.png','/api/growth','/api/growth/photos','/assets/growth-photos/private.png','/bookmarks/api/growth']){
  for(const method of ['GET','PUT','POST'])assert.equal((await fetch(origin+route,{method})).status,404,method+' '+route);
 }
 assert.equal(await fs.readFile(path.join(dataRoot,'assets/growth-data.json'),'utf8'),JSON.stringify(original));
 assert.deepEqual(await fs.readdir(path.join(dataRoot,'assets')),['growth-data.json']);
 const bookmarkConfig=await(await fetch(origin+'/bookmarks/Javascript/site-config.js')).text();
 const growthConfig=await(await fetch(origin+'/growth/Javascript/site-config.js')).text();
 assert.match(growthConfig,/"mode":"drive"/);assert.match(growthConfig,/"homeUrl":"\.\.\/index.html"/);
 assert.equal(JSON.parse(growthConfig.slice(growthConfig.indexOf('=')+1,-1)).googleClientId,JSON.parse(bookmarkConfig.slice(bookmarkConfig.indexOf('=')+1,-1)).googleClientId);
 for(const name of ['growth-data.js','growth-drive.js','growth-cloud-ui.js','growth-backup.js','bookmark-cloud.js','bookmark-login.js'])assert.equal((await fetch(origin+'/growth/Javascript/'+name)).status,200,name);
 for(const route of ['/.home-local.json','/growth/scripts/growth-store.cjs','/growth/assets/growth-data.json','/apps/growth/growth.html'])assert.equal((await fetch(origin+route)).status,404,route);
});

test('CathFlow 與 DynastyExplorer 有獨立子站，舊網址轉址且公開產物包含標誌',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'portfolio-sites-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const server=await createHomeServer(home,{dataRoot:path.join(root,'private')});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 t.after(()=>new Promise(r=>server.close(r)));
 const origin='http://127.0.0.1:'+server.address().port;
 for(const [site,file] of [['cathflow','cathflow.html'],['dynasty-explorer','DynastyExplorer.html']]){
  const old=await fetch(origin+'/'+file,{redirect:'manual'});assert.equal(old.status,302);assert.equal(old.headers.get('location'),`/${site}/${file}`);
  const page=await fetch(`${origin}/${site}/${file}`);assert.equal(page.status,200);assert.match(await page.text(),/<!DOCTYPE html>/i);
  assert.equal((await fetch(`${origin}/${site}/`)).status,200);
 }
 const image=await fetch(origin+'/dynasty-explorer/images/logo.png');assert.equal(image.status,200);assert.match(image.headers.get('content-type'),/image\/png/);
 await fs.copyFile(path.join(home,'index.html'),path.join(root,'index.html'));
 await addProjectSource(root);
 const clientId='123456-growth.apps.googleusercontent.com';
 await fs.writeFile(path.join(root,'bookmarks.config.json'),JSON.stringify({googleClientId:clientId,privateSecret:'DO_NOT_PUBLISH'}));
 const out=await buildSite(root,{appRoot:path.join(home,'apps/bookmarks')});
 const growthConfig=await fs.readFile(path.join(out,'growth/Javascript/site-config.js'),'utf8');
 assert.match(growthConfig,/"mode":"drive"/);assert.match(growthConfig,/"homeUrl":"\.\.\/index.html"/);assert.ok(growthConfig.includes(process.env.BOOKMARKS_GOOGLE_CLIENT_ID||clientId));assert.ok(!growthConfig.includes('DO_NOT_PUBLISH'));
 for(const name of ['growth-data.js','growth-drive.js','growth-cloud-ui.js','growth-backup.js','bookmark-cloud.js','bookmark-login.js'])await fs.access(path.join(out,'growth/Javascript',name));
 for(const file of ['assets/growth-data.json','assets/growth-photos','scripts/growth-store.cjs'])await assert.rejects(fs.access(path.join(out,'growth',file)));
 for(const name of ['bookmark-cloud.js','bookmark-login.js'])assert.deepEqual(await fs.readFile(path.join(out,'growth/Javascript',name)),await fs.readFile(path.join(home,'apps/bookmarks/Javascript',name)));
 for(const [site,file] of [['cathflow','cathflow.html'],['dynasty-explorer','DynastyExplorer.html']]){
  await fs.access(path.join(out,site,file));assert.match(await fs.readFile(path.join(out,file),'utf8'),new RegExp(site+'/'+file));
 }
 await fs.access(path.join(out,'dynasty-explorer/images/logo.png'));
});
