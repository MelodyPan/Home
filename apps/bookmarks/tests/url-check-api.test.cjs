const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {createBookmarkServer}=require('../scripts/server.cjs');
const {createDataFile}=require('../Javascript/bookmark-file.js');

test('recheck API reports progress, preserves concurrent edits and saves completed time',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'bookmark-check-api-'));await fs.mkdir(path.join(root,'assets'));
 const base=[{id:'a',sourceId:1,title:'網站',url:'https://example.com/',folder:'書籤列',domain:'example.com',category:'dev',status:'reachable',code:200,reason:'old',finalUrl:'https://example.com/'}];
 const oldTime='2026-10-22T00:00:00Z';const file=path.join(root,'assets/bookmarks-data.txt');await fs.writeFile(file,JSON.stringify(createDataFile(base,{added:[],deletedIds:[],statusOverrides:{a:'restricted'}},[],oldTime)));
 let release;const gate=new Promise(r=>release=r);let calls=0;
 const server=createBookmarkServer(root,{checkUrl:async url=>{calls++;await gate;return {status:'missing',code:404,reason:'HTTP 404',finalUrl:url,checkedAt:new Date().toISOString()};}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 t.after(async()=>{release();await new Promise(r=>server.close(r));assert.equal(path.dirname(root),path.resolve(os.tmpdir()));await fs.rm(root,{recursive:true,force:true});});
 const origin='http://127.0.0.1:'+server.address().port;const headers={Origin:origin,'Content-Type':'application/json'};
 const initial=await fetch(origin+'/assets/bookmarks-data.txt');const etag=initial.headers.get('etag');
 assert.equal((await fetch(origin+'/api/url-check',{method:'POST',headers:{...headers,Origin:'https://foreign.test'},body:'{}'})).status,403);
 assert.equal((await fetch(origin+'/api/url-check',{method:'POST',headers:{...headers,'If-Match':'"stale"'},body:'{}'})).status,409);
 const start=await fetch(origin+'/api/url-check',{method:'POST',headers:{...headers,'If-Match':etag},body:'{}'});assert.equal(start.status,202);const job=await start.json();assert.equal(job.state,'running');
 assert.equal((await fetch(origin+'/api/url-check',{method:'POST',headers:{...headers,'If-Match':etag},body:'{}'})).status,409);
 const changed=createDataFile(base,{added:[],deletedIds:[],statusOverrides:{a:'restricted'},categoryOverrides:{a:'life'}},['a'],oldTime);
 assert.equal((await fetch(origin+'/api/bookmarks',{method:'PUT',headers:{...headers,'If-Match':etag},body:JSON.stringify(changed)})).status,200);
 release();let progress;for(let i=0;i<100;i++){progress=await(await fetch(origin+'/api/url-check')).json();if(progress.state!=='running')break;await new Promise(r=>setTimeout(r,10));}
 assert.equal(progress.state,'completed');assert.equal(progress.checked,1);assert.equal(progress.total,1);assert.equal(calls,1);
 const stored=JSON.parse(await fs.readFile(file,'utf8'));assert.equal(stored.checkedAt,progress.completedAt);assert.notEqual(stored.checkedAt,oldTime);assert.equal(stored.entries[0].status,'restricted');assert.equal(stored.changes.urlChecks.a.status,'missing');assert.equal(stored.entries[0].category,'life');assert.deepEqual(stored.favorites,['a']);
 assert.equal((await fetch(origin+'/assets/bookmarks-data.txt')).headers.get('etag'),progress.revision);
});

test('stopping during recheck cancels requests without updating the last completed timestamp',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'bookmark-check-cancel-'));await fs.mkdir(path.join(root,'assets'));
 const base=[{id:'a',sourceId:1,title:'網站',url:'https://example.com/',folder:'書籤列',domain:'example.com',category:'dev',status:'reachable',code:200,reason:'old',finalUrl:'https://example.com/'}];
 const oldTime='2026-10-22T00:00:00Z';const file=path.join(root,'assets/bookmarks-data.txt');const original=JSON.stringify(createDataFile(base,{added:[],deletedIds:[]},[],oldTime));await fs.writeFile(file,original);
 let started;const checking=new Promise(resolve=>started=resolve);
 const server=createBookmarkServer(root,{checkUrl:async(url,{signal})=>{started();await new Promise((resolve,reject)=>{if(signal.aborted)reject(signal.reason);else signal.addEventListener('abort',()=>reject(signal.reason),{once:true});});}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 t.after(async()=>{await new Promise(r=>server.close(r));assert.equal(path.dirname(root),path.resolve(os.tmpdir()));await fs.rm(root,{recursive:true,force:true});});
 const origin='http://127.0.0.1:'+server.address().port;const initial=await fetch(origin+'/assets/bookmarks-data.txt');const headers={Origin:origin,'Content-Type':'application/json','If-Match':initial.headers.get('etag')};
 assert.equal((await fetch(origin+'/api/url-check',{method:'POST',headers,body:'{}'})).status,202);await checking;
 const closed=new Promise(r=>server.once('close',r));assert.equal((await fetch(origin+'/api/shutdown',{method:'POST',headers,body:'{}'})).status,200);await closed;
 assert.equal(await fs.readFile(file,'utf8'),original);
});
