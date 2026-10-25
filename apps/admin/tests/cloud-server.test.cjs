const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {createPortfolioServer}=require('../../../scripts/portfolio-server.cjs');
const {buildSite}=require('../../../scripts/home-site-build.cjs');
test('雲端入口只提供公開產物與作品 API，不暴露本機書籤、相簿或來源程式',async t=>{
 const source=path.resolve(__dirname,'../../..'),root=await fs.mkdtemp(path.join(os.tmpdir(),'cloud-home-'));
 await fs.copyFile(path.join(source,'index.html'),path.join(root,'index.html'));
 await buildSite(root,{appRoot:path.join(source,'apps/bookmarks')});
 const config={googleClientId:'',adminSubjects:[],adminEmails:[]};
 const seed=JSON.parse(await fs.readFile(path.join(source,'apps/admin/projects.seed.json'),'utf8'));
 const server=await createPortfolioServer(root,{config,admin:{root:source,config,store:{read:async()=>({document:seed,revision:'0'})}}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 t.after(async()=>{await new Promise(r=>server.close(r));await fs.rm(root,{recursive:true,force:true});});const origin='http://127.0.0.1:'+server.address().port;
 for(const route of ['/','/admin/','/portfolio/projects.js','/growth/growth.html','/api/projects'])assert.equal((await fetch(origin+route)).status,200,route);
 for(const route of ['/api/bookmarks','/bookmarks/assets/bookmarks-data.txt','/growth/api/growth','/api/shutdown','/apps/admin/server/config.cjs','/.home-portfolio.json'])assert.equal((await fetch(origin+route)).status,404,route);
});
