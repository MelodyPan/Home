const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {createBookmarkServer}=require('../scripts/server.cjs');
const {buildSite}=require('../scripts/home-site-build.cjs');
const {integrateHome}=require('../scripts/integrate-home.cjs');
const {createHomeServer}=require('../scripts/home-site-server.cjs');
test('書籤子路徑與根頁委派彼此隔離，目錄入口轉址正確',async t=>{
 const dataRoot=await fs.mkdtemp(path.join(os.tmpdir(),'home-data-'));
 const server=createBookmarkServer(path.resolve('.'),{basePath:'/bookmarks',dataRoot,serveRoot:async(req,res)=>{res.writeHead(req.url==='/'?200:404,{'Content-Type':'text/html'});res.end('HOME');}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(async()=>{await new Promise(r=>server.close(r));await fs.rm(dataRoot,{recursive:true,force:true});});
 const origin='http://127.0.0.1:'+server.address().port;
 assert.equal(await(await fetch(origin+'/')).text(),'HOME');
 assert.equal((await fetch(origin+'/bookmarks/growth.html')).status,404);
 const redirect=await fetch(origin+'/bookmarks/index.html',{redirect:'manual'});assert.equal(redirect.headers.get('location'),'/bookmarks/bookmarks.html');
 assert.equal((await fetch(origin+'/api/growth')).status,404);
});
test('公開建置只使用白名單，清除 HTML 內嵌個人書籤，不發布資料/API/原始匯出',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'home-build-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 await fs.mkdir(path.join(root,'apps/bookmarks'),{recursive:true});
 await fs.writeFile(path.join(root,'index.html'),'<html>HOME</html>');
 await fs.mkdir(path.join(root,'data/portfolio'),{recursive:true});
 await fs.copyFile(path.resolve(__dirname,'../../../data/portfolio/projects.json'),path.join(root,'data/portfolio/projects.json'));
 // 將實際專案當成來源，但不把個人資料複製到任何產物。
 const out=await buildSite(root,{appRoot:path.resolve('.'),output:path.join(root,'dist')});
 const html=await fs.readFile(path.join(out,'bookmarks/bookmarks.html'),'utf8');
 const payload=JSON.parse(html.match(/id="bookmark-data">([\s\S]*?)<\/script>/)[1]);assert.deepEqual(payload.entries,[]);assert.deepEqual(payload.icons,{});
 assert.equal(await fs.readFile(path.join(out,'index.html'),'utf8'),'<html>HOME</html>');
 for(const file of ['assets/bookmarks-data.txt','assets/growth-data.json','assets/growth-photos','scripts/server.cjs','src/home.html'])await assert.rejects(fs.access(path.join(out,'bookmarks',file)));
 assert.match(await fs.readFile(path.join(out,'bookmarks/Javascript/site-config.js'),'utf8'),/preview/);
});

test('Home 整合保留原首頁內容，可重複執行，產物不複製私人資產，真實 Home 服務可讀寫',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'home-install-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const original='<html><body>使用者原有修改<article class="project featured">既有作品</article></body></html>';
 await fs.writeFile(path.join(root,'index.html'),original);await fs.writeFile(path.join(root,'README.md'),'# Existing Home\n');
 await integrateHome(path.resolve('.'),root);const first=await fs.readFile(path.join(root,'index.html'),'utf8');
 assert.ok(first.includes('使用者原有修改'));assert.ok(first.includes('既有作品'));assert.ok(first.includes('growth/growth.html'));
 assert.match(first,/id="growth-subsystem"/);
 await integrateHome(path.resolve('.'),root);assert.equal(await fs.readFile(path.join(root,'index.html'),'utf8'),first);
 assert.match(await fs.readFile(path.join(root,'.github/workflows/static.yml'),'utf8'),/path: dist/);
 for(const file of ['assets/bookmarks-data.txt','assets/growth-data.json','assets/growth-photos','assets/source'])await assert.rejects(fs.access(path.join(root,'apps/bookmarks',file)));
 const server=await createHomeServer(root,{dataRoot:path.join(root,'private')});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{
  const origin='http://127.0.0.1:'+server.address().port;
  assert.equal(await(await fetch(origin+'/')).text(),first);
  const runtime=await(await fetch(origin+'/bookmarks/Javascript/site-config.js')).text();assert.match(runtime,/"mode":"local"/);assert.match(runtime,/homeUrl/);
  assert.equal((await fetch(origin+'/bookmarks/api/growth')).status,200);assert.equal((await fetch(origin+'/data/bookmarks/assets/growth-data.json')).status,404);
  assert.equal((await fetch(origin+'/.home-local.json')).status,404);assert.equal((await fetch(origin+'/apps/bookmarks/scripts/server.cjs')).status,404);
 }finally{await new Promise(r=>server.close(r));}
});
