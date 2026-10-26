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

test('bookmark service exposes cloud assets only; private data routes are absent and shutdown stays secure',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'bookmark-cloud-server-'));await fs.mkdir(path.join(root,'assets'));await fs.mkdir(path.join(root,'Javascript'));
 const filename=path.join(root,'assets/bookmarks-data.txt'),original=await fs.readFile('tests/fixtures/bookmarks-data.json','utf8');await fs.writeFile(filename,original);
 await fs.writeFile(path.join(root,'Javascript/home.js'),'/* fixture */');await fs.writeFile(path.join(root,'bookmarks.html'),'<html>cloud</html>');
 const server=createBookmarkServer(root);await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(async()=>{await new Promise(r=>server.close(r));await fs.rm(root,{recursive:true,force:true});});
 const origin='http://127.0.0.1:'+server.address().port;
 for(const [route,method]of [['/assets/bookmarks-data.txt','GET'],['/api/bookmarks','PUT'],['/api/url-check','POST'],['/api/url-check','GET']])assert.equal((await fetch(origin+route,{method})).status,404,route);
 assert.equal(await fs.readFile(filename,'utf8'),original);await assert.rejects(fs.access(filename+'.bak'));
 assert.equal((await fetch(origin+'/server.cjs')).status,404);assert.equal((await fetch(origin+'/Javascript/home.js')).status,200);
 assert.equal((await fetch(origin+'/Javascript/unknown.js')).status,404);
 const config=await(await fetch(origin+'/Javascript/site-config.js')).text();assert.match(config,/'?mode"?:"drive"/);
 assert.equal((await fetch(origin+'/api/shutdown',{method:'POST',headers:{Origin:'https://foreign.test','Content-Type':'application/json'},body:'{}'})).status,403);
 const closed=new Promise(r=>server.once('close',r));assert.equal((await fetch(origin+'/api/shutdown',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:'{}'})).status,200);await closed;
});
