const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {createGrowthServer}=require('../scripts/server.cjs');
test('production growth never opens a local store, even when legacy options are supplied',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'growth-static-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const privateRoot=path.join(root,'private');
 const server=createGrowthServer(path.resolve(__dirname,'..'),{dataRoot:privateRoot,local:true});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
 const origin='http://127.0.0.1:'+server.address().port;
 for(const route of ['/api/growth','/api/growth/photos','/assets/growth-photos/00000000-0000-4000-8000-000000000000.png','/assets/growth-data.json']){
  for(const method of ['GET','PUT','POST'])assert.equal((await fetch(origin+route,{method})).status,404,method+' '+route);
 }
 await assert.rejects(fs.access(privateRoot));
 assert.match(await(await fetch(origin+'/Javascript/site-config.js')).text(),/"mode":"drive"/);
 for(const name of ['growth-data.js','growth-drive.js','growth-cloud-ui.js','growth-backup.js','bookmark-cloud.js','bookmark-login.js']){
  const response=await fetch(origin+'/Javascript/'+name);assert.equal(response.status,200,name);
  const source=path.resolve(__dirname,name.startsWith('bookmark-')?'../../bookmarks/Javascript':'../Javascript',name);
  assert.equal(await response.text(),await fs.readFile(source,'utf8'));
 }
 assert.equal((await fetch(origin+'/Javascript/bookmark-drive.js')).status,404);
});
