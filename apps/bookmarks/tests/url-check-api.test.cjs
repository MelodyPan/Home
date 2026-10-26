const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {createBookmarkServer}=require('../scripts/server.cjs');
test('cloud-only bookmarks cannot trigger local background URL checks',async t=>{
 const server=createBookmarkServer(path.resolve('.'),{checkUrl(){assert.fail('local checker must never run');}});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 const origin='http://127.0.0.1:'+server.address().port;
 for(const method of ['GET','POST'])assert.equal((await fetch(origin+'/api/url-check',{method,headers:{Origin:origin,'Content-Type':'application/json'},...(method==='POST'?{body:'{}'}:{})})).status,404);
});
