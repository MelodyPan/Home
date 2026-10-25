const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {createBookmarkServer}=require('../scripts/server.cjs');

test('bookmarks.html is served as the bookmark page and the old index URL redirects',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'bookmark-rename-'));
 await fs.writeFile(path.join(root,'bookmarks.html'),'<html>bookmark page</html>');
 const server=createBookmarkServer(root);await new Promise(r=>server.listen(0,'127.0.0.1',r));
 t.after(async()=>{await new Promise(r=>server.close(r));await fs.rm(root,{recursive:true,force:true});});
 const origin='http://127.0.0.1:'+server.address().port;
 for(const route of ['/','/bookmarks.html']){const response=await fetch(origin+route);assert.equal(response.status,200);assert.equal(await response.text(),'<html>bookmark page</html>');}
 const old=await fetch(origin+'/index.html',{redirect:'manual'});assert.equal(old.status,302);assert.equal(old.headers.get('location'),'/bookmarks.html');
 assert.equal(await(await fetch(origin+'/index.html')).text(),'<html>bookmark page</html>');
});

test('local service reads JSON, saves with backup, rejects conflicts and foreign writes',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'bookmark-test-'));
 await fs.mkdir(path.join(root,'assets'));
 await fs.mkdir(path.join(root,'Javascript'));
 await fs.writeFile(path.join(root,'Javascript','home.js'),'/* browser script fixture */');
 const filename=path.join(root,'assets','bookmarks-data.txt');
 const original=await fs.readFile('tests/fixtures/bookmarks-data.json','utf8');
 await fs.writeFile(filename,original);await fs.writeFile(path.join(root,'bookmarks.html'),'<html>test</html>');
 const server=createBookmarkServer(root);await new Promise(r=>server.listen(0,'127.0.0.1',r));
 t.after(async()=>{await new Promise(r=>server.close(r));await fs.rm(root,{recursive:true,force:true});});
 const origin='http://127.0.0.1:'+server.address().port;
 const response=await fetch(origin+'/assets/bookmarks-data.txt');
 assert.equal(response.status,200);const etag=response.headers.get('etag');
 const data=await response.json();data.favorites=[data.baseEntries[0].id];data.changes.categoryOverrides={[data.baseEntries[0].id]:'life'};data.changes.statusOverrides={[data.baseEntries[0].id]:'missing'};
 const put=(tag,requestOrigin=origin,body=data)=>fetch(origin+'/api/bookmarks',{method:'PUT',headers:{Origin:requestOrigin,'Content-Type':'application/json','If-Match':tag},body:JSON.stringify(body)});
 assert.equal((await put(etag,'https://foreign.test')).status,403);
 assert.equal((await put(etag,origin,{bad:true})).status,400);
 const saved=await put(etag);assert.equal(saved.status,200);const next=(await saved.json()).revision;
 assert.equal(await fs.readFile(filename+'.bak','utf8'),original);
 const disk=JSON.parse(await fs.readFile(filename,'utf8'));assert.equal(disk.entries[0].favorite,true);assert.equal(disk.entries[0].category,'life');assert.equal(disk.entries[0].status,'missing');assert.equal(disk.entries[0].statusSource,'manual');assert.equal(disk.changes.statusOverrides[data.baseEntries[0].id],'missing');
 assert.equal((await put(etag)).status,409);
 assert.equal((await fetch(origin+'/assets/bookmarks-data.txt')).headers.get('etag'),next);
 assert.equal((await fetch(origin+'/server.cjs')).status,404);
 const script=await fetch(origin+'/Javascript/home.js');assert.equal(script.status,200);assert.match(script.headers.get('content-type'),/javascript/);assert.equal(await script.text(),'/* browser script fixture */');
 assert.equal((await fetch(origin+'/Javascript/unknown.js')).status,404);
 assert.equal((await fetch(origin+'/api/shutdown',{method:'POST',headers:{Origin:'https://foreign.test','Content-Type':'application/json'},body:'{}'})).status,403);
 assert.equal((await fetch(origin+'/api/shutdown')).status,404);
 const closed=new Promise(resolve=>server.once('close',resolve));
 const stopped=await fetch(origin+'/api/shutdown',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:'{}'});
 assert.equal(stopped.status,200);assert.equal((await stopped.json()).stopped,true);
 await closed;assert.equal(server.listening,false);
 assert.equal(JSON.parse(await fs.readFile(filename,'utf8')).entries[0].status,'missing');
});
