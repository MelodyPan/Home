const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {createHomeServer}=require('../home-site-server.cjs');
const {buildSite}=require('../home-site-build.cjs');
const home=path.resolve(__dirname,'../..');
test('Home 提供 Google 後台資源，未設定時維護 API 保持鎖定，公開作品保留原九筆',async t=>{
 const dataRoot=await fs.mkdtemp(path.join(os.tmpdir(),'admin-home-'));
 const server=await createHomeServer(home,{dataRoot,portfolio:{config:{googleClientId:'',adminEmails:[],adminSubjects:[],localFile:path.join(dataRoot,'projects.json')}}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 t.after(async()=>{await new Promise(r=>server.close(r));await fs.rm(dataRoot,{recursive:true,force:true});});const origin='http://127.0.0.1:'+server.address().port;
 const page=await fetch(origin+'/admin/');assert.equal(page.status,200);assert.match(await page.text(),/使用 Google 帳號登入/);
 for(const file of ['/admin/admin.css','/admin/admin.js','/admin/editor-state.js','/admin/project-model.js','/portfolio/projects.js','/portfolio/config.js'])assert.equal((await fetch(origin+file)).status,200,file);
 assert.equal((await(await fetch(origin+'/api/admin/config')).json()).configured,false);assert.equal((await fetch(origin+'/api/admin/projects')).status,503);
 assert.equal((await(await fetch(origin+'/api/projects')).json()).projects.length,9);
 for(const file of ['/.home-portfolio.json','/data/portfolio/projects.json','/admin/server/config.cjs'])assert.equal((await fetch(origin+file)).status,404);
});
test('公開建置包含後台與首頁腳本，不打包私有設定、Google 服務帳號或 JSON 草稿',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'admin-build-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));await fs.copyFile(path.join(home,'index.html'),path.join(root,'index.html'));
 await fs.writeFile(path.join(root,'.home-portfolio.json'),JSON.stringify({adminEmails:['private@example.com']}));
 const out=await buildSite(root,{appRoot:path.join(home,'apps/bookmarks')});
 for(const file of ['admin/index.html','admin/admin.js','admin/admin.css','admin/editor-state.js','admin/project-model.js','portfolio/projects.js','portfolio/config.js'])await fs.access(path.join(out,file));
 for(const file of ['.home-portfolio.json','admin/projects.seed.json','admin/server/auth.cjs','data/portfolio/projects.json'])await assert.rejects(fs.access(path.join(out,file)));
 assert.doesNotMatch(await fs.readFile(path.join(out,'portfolio/config.js'),'utf8'),/private@example.com/);
});
