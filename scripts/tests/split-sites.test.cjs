// 拆站驗收使用暫存資料與隨機連接埠，避免讀寫正式書籤及孩子照片。
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {createHomeServer}=require('../home-site-server.cjs');
const {buildSite}=require('../home-site-build.cjs');
const home=path.resolve(__dirname,'../..');
async function addProjectSource(root){
 const directory=path.join(root,'data/portfolio');await fs.mkdir(directory,{recursive:true});
 await fs.copyFile(path.join(home,'data/portfolio/projects.json'),path.join(directory,'projects.json'));
}

test('兩站有獨立入口、資源與 API，舊相簿轉址且沿用原資料',async t=>{
 const dataRoot=await fs.mkdtemp(path.join(os.tmpdir(),'split-data-'));
 await fs.mkdir(path.join(dataRoot,'assets'));
 const original={schemaVersion:1,updatedAt:null,children:[{id:'child',name:'測試孩子',birthday:''}],records:[]};
 await fs.writeFile(path.join(dataRoot,'assets/growth-data.json'),JSON.stringify(original));
 const server=await createHomeServer(home,{dataRoot});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 t.after(async()=>{await new Promise(r=>server.close(r));await fs.rm(dataRoot,{recursive:true,force:true});});
 const origin='http://127.0.0.1:'+server.address().port;
 for(const [route,target] of [['/bookmarks/','/bookmarks/bookmarks.html'],['/growth/','/growth/growth.html'],['/bookmarks/growth.html','/growth/growth.html']]){
  const response=await fetch(origin+route,{redirect:'manual'});assert.equal(response.status,302,route);assert.equal(response.headers.get('location'),target);
 }
 for(const site of ['bookmarks','growth']){
  const html=await(await fetch(`${origin}/${site}/${site}.html`)).text();assert.match(html,/<!doctype html>/i);
  for(const match of html.matchAll(/(?:src|href)="((?:Javascript|src)\/[^"#]+)"/g))assert.equal((await fetch(`${origin}/${site}/${match[1]}`)).status,200,match[1]);
 }
 assert.equal((await fetch(origin+'/bookmarks/Javascript/growth.js')).status,404);
 assert.equal((await fetch(origin+'/growth/Javascript/home.js')).status,404);
 const initial=await fetch(origin+'/growth/api/growth'),data=await initial.json();assert.deepEqual(data,original);
 data.children[0].name='已更新';
 const options={method:'PUT',headers:{Origin:origin,'Content-Type':'application/json','If-Match':initial.headers.get('etag')},body:JSON.stringify(data)};
 assert.equal((await fetch(origin+'/growth/api/growth',options)).status,200);
 assert.equal((await fetch(origin+'/growth/api/growth',options)).status,409);
 assert.equal(JSON.parse(await fs.readFile(path.join(dataRoot,'assets/growth-data.json'))).children[0].name,'已更新');
 const png=Buffer.alloc(24);Buffer.from([137,80,78,71,13,10,26,10]).copy(png);
 const upload=await fetch(origin+'/growth/api/growth/photos',{method:'POST',headers:{Origin:origin,'Content-Type':'image/png'},body:png});assert.equal(upload.status,201);
 const photo=await upload.json();assert.equal((await fetch(origin+'/growth/assets/growth-photos/'+photo.id)).status,200);
 const legacy=await fetch(origin+'/bookmarks/api/growth',{redirect:'manual'});assert.equal(legacy.status,307);assert.equal(legacy.headers.get('location'),'/growth/api/growth');
 for(const route of ['/.home-local.json','/growth/scripts/growth-store.cjs','/growth/assets/growth-data.json','/apps/growth/growth.html'])assert.equal((await fetch(origin+route)).status,404,route);
});

test('公開建置分站、頁面資源完整且不包含私人資料',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'split-build-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 await fs.copyFile(path.join(home,'index.html'),path.join(root,'index.html'));
 await addProjectSource(root);
 const out=await buildSite(root,{appRoot:path.join(home,'apps/bookmarks'),growthRoot:path.join(home,'apps/growth'),sharedRoot:path.join(home,'apps/shared')});
 for(const site of ['bookmarks','growth']){
  const html=await fs.readFile(path.join(out,site,site+'.html'),'utf8');
  for(const match of html.matchAll(/(?:src|href)="((?:Javascript|src)\/[^"#]+)"/g))await fs.access(path.join(out,site,match[1]));
  assert.match(await fs.readFile(path.join(out,site,'Javascript/site-config.js'),'utf8'),/preview/);
  for(const file of ['assets/bookmarks-data.txt','assets/growth-data.json','assets/growth-photos','scripts/server.cjs'])await assert.rejects(fs.access(path.join(out,site,file)));
 }
 const html=await fs.readFile(path.join(out,'bookmarks/bookmarks.html'),'utf8');assert.deepEqual(JSON.parse(html.match(/id="bookmark-data">([\s\S]*?)<\/script>/)[1]).entries,[]);
 assert.match(await fs.readFile(path.join(out,'bookmarks/growth.html'),'utf8'),/\.\.\/growth\/growth.html/);
 const index=await fs.readFile(path.join(out,'index.html'),'utf8');assert.doesNotMatch(index,/id="(?:bookmarks|growth)-subsystem"|BOOKMARKS_SUBSYSTEM|href="(?:bookmarks|growth)\//);assert.match(index,/CathFlow/);
 assert.equal(JSON.parse(await fs.readFile(path.join(out,'portfolio/projects.json'),'utf8')).projects.some(project=>project.title==='探索台灣'),true);
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
 const out=await buildSite(root,{appRoot:path.join(home,'apps/bookmarks')});
 for(const [site,file] of [['cathflow','cathflow.html'],['dynasty-explorer','DynastyExplorer.html']]){
  await fs.access(path.join(out,site,file));assert.match(await fs.readFile(path.join(out,file),'utf8'),new RegExp(site+'/'+file));
 }
 await fs.access(path.join(out,'dynasty-explorer/images/logo.png'));
});
