const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {createBookmarkServer}=require('../scripts/server.cjs');
async function setup(t,options={}){const server=createBookmarkServer(path.resolve('.'),options);await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));return 'http://127.0.0.1:'+server.address().port;}
const post=(origin,body,extra={})=>fetch(origin+'/api/url-check',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...extra},body:JSON.stringify(body)});
test('local check API validates origin and body, and only checks explicitly submitted URLs',async t=>{
 const calls=[],origin=await setup(t,{checkUrl:async url=>{calls.push(url);return {status:'reachable',code:200,reason:'ok',finalUrl:url,checkedAt:new Date().toISOString()};}});
 assert.equal((await(await fetch(origin+'/api/url-check')).json()).available,true);assert.deepEqual(calls,[]);
 assert.equal((await post(origin,{url:'https://example.com'},{Origin:'https://other.example'})).status,403);
 assert.equal((await post(origin,{})).status,400);assert.equal((await post(origin,{url:'https://example.com',token:'must not accept'})).status,400);
 const response=await post(origin,{url:'https://example.com'});assert.equal(response.status,200);assert.equal((await response.json()).status,'reachable');assert.deepEqual(calls,['https://example.com']);
 assert.equal((await fetch(origin+'/api/data')).status,404);
});
test('URL API does not connect to internal, sensitive or destructive destinations',async t=>{
 const origin=await setup(t);for(const url of ['http://127.0.0.1/admin','https://example.com/?token=secret','https://example.com/logout'])assert.equal((await(await post(origin,{url})).json()).status,'skipped');
});
test('disconnecting a check cancels the underlying request',async t=>{
 let begun,finished;const started=new Promise(r=>begun=r),aborted=new Promise(r=>finished=r),origin=await setup(t,{checkUrl:async(url,{signal})=>{begun();return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>{finished();reject(signal.reason);}));}});
 const controller=new AbortController(),request=fetch(origin+'/api/url-check',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({url:'https://example.com'}),signal:controller.signal});
 await started;controller.abort();await assert.rejects(request);await aborted;
});
