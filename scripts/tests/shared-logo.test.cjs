// 用暫存目錄與隨機埠驗證共用 Logo，不依賴已刪除的子網站圖片。
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {buildSite}=require('../home-site-build.cjs');
const {createHomeServer}=require('../home-site-server.cjs');
const home=path.resolve(__dirname,'../..');

test('單站除錯服務也能讀取同一張 Home Logo',async t=>{
 const factories=[['bookmarks',require('../../apps/bookmarks/scripts/server.cjs').createBookmarkServer],['growth',require('../../apps/growth/scripts/server.cjs').createGrowthServer]];
 for(const [site,create] of factories){
  const dataRoot=await fs.mkdtemp(path.join(os.tmpdir(),'shared-logo-debug-')),server=create(path.join(home,'apps',site),{dataRoot});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{const origin='http://127.0.0.1:'+server.address().port,logo=await fetch(origin+'/images/logo.png');assert.equal(logo.status,200,site);assert.match(logo.headers.get('content-type'),/^image\/png(?:;|$)/);assert.deepEqual(Buffer.from(await logo.arrayBuffer()),await fs.readFile(path.join(home,'images/logo.png')));assert.equal((await fetch(origin+'/images/private.png')).status,404);}
  finally{await new Promise(resolve=>server.close(resolve));await fs.rm(dataRoot,{recursive:true,force:true});}
 }
});

test('公開建置的書籤與相簿共用 Home/images/logo.png，不再需要子網站圖片副本',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'home-logo-build-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 for(const file of ['index.html','images/logo.png','apps/admin/projects.public.json']){await fs.mkdir(path.dirname(path.join(root,file)),{recursive:true});await fs.copyFile(path.join(home,file),path.join(root,file));}
 const output=await buildSite(root,{appRoot:path.join(home,'apps/bookmarks')});
 assert.deepEqual(await fs.readFile(path.join(output,'images/logo.png')),await fs.readFile(path.join(home,'images/logo.png')));
 for(const site of ['bookmarks','growth']){
  const html=await fs.readFile(path.join(output,site,site+'.html'),'utf8');
  assert.match(html,/<img class="wordmark-logo" src="\.\.\/images\/logo\.png"/);
  await assert.rejects(fs.access(path.join(output,site,'assets/home-logo.png')));
 }
});

test('Home 本機服務提供兩個子網站共用的 Logo 路徑',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'home-logo-server-'));
 const server=await createHomeServer(home,{dataRoot:root,portfolio:{config:{googleClientId:'',adminEmails:[],adminSubjects:[],localFile:path.join(root,'projects.json')}}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(async()=>{await new Promise(resolve=>server.close(resolve));await fs.rm(root,{recursive:true,force:true});});
 const origin='http://127.0.0.1:'+server.address().port;
 for(const site of ['bookmarks','growth']){const html=await(await fetch(origin+'/'+site+'/'+site+'.html')).text();assert.match(html,/<img class="wordmark-logo" src="\.\.\/images\/logo\.png"/);}
 const logo=await fetch(origin+'/images/logo.png');assert.equal(logo.status,200);assert.match(logo.headers.get('content-type'),/image\/png/);assert.deepEqual(Buffer.from(await logo.arrayBuffer()),await fs.readFile(path.join(home,'images/logo.png')));
});
