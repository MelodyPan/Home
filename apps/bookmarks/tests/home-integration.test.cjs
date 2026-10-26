const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {createBookmarkServer}=require('../scripts/server.cjs');
const {buildSite}=require('../scripts/home-site-build.cjs');
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
 await fs.copyFile(path.resolve(__dirname,'../../admin/projects.public.json'),path.join(root,'data/portfolio/projects.json'));
 // 將實際專案當成來源，但不把個人資料複製到任何產物。
 const out=await buildSite(root,{appRoot:path.resolve('.'),output:path.join(root,'dist')});
 const html=await fs.readFile(path.join(out,'bookmarks/bookmarks.html'),'utf8');
 const payload=JSON.parse(html.match(/id="bookmark-data">([\s\S]*?)<\/script>/)[1]);assert.deepEqual(payload.entries,[]);assert.deepEqual(payload.icons,{});
 assert.equal(await fs.readFile(path.join(out,'index.html'),'utf8'),'<html>HOME</html>');
 for(const name of ['bookmark-drive.js','bookmark-cloud.js','bookmark-drive-ui.js'])await fs.access(path.join(out,'bookmarks/Javascript',name));
 for(const file of ['assets/bookmarks-data.txt','assets/growth-data.json','assets/growth-photos','scripts/server.cjs','src/home.html'])await assert.rejects(fs.access(path.join(out,'bookmarks',file)));
 assert.match(await fs.readFile(path.join(out,'bookmarks/Javascript/site-config.js'),'utf8'),/\"mode\":\"drive\"/);
});
