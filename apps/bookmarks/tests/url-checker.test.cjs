const {test}=require('node:test');
const assert=require('node:assert/strict');
const {checkUrl,runUrlChecks,applyCheckResults,isPrivateAddress}=require('../scripts/url-checker.cjs');
const {createManualBookmark,mergeLibrary}=require('../Javascript/bookmark-core.js');
const {createDataFile,readDataFile}=require('../Javascript/bookmark-file.js');

test('HTTP checker pins verified public DNS addresses and skips private DNS results before connecting',async t=>{
 const dns=require('node:dns').promises,https=require('node:https'),{EventEmitter}=require('node:events');let addresses=[{address:'8.8.8.8',family:4}],calls=0;
 t.mock.method(dns,'lookup',async()=>addresses);
 t.mock.method(https,'request',(url,options,onResponse)=>{
  calls++;assert.equal(options.method,'HEAD');options.lookup('example.com',{all:true},(error,actual)=>{assert.equal(error,null);assert.deepEqual(actual,addresses);});
  const request=new EventEmitter();request.end=()=>{const response={statusCode:200,headers:{},destroy(){}};onResponse(response);};return request;
 });
 assert.equal((await checkUrl('https://example.com')).status,'reachable');assert.equal(calls,1);
 addresses=[{address:'10.1.1.1',family:4}];assert.equal((await checkUrl('https://example.com')).status,'skipped');assert.equal(calls,1);
});

test('URL checks classify responses and reject internal, credential and redirected private URLs',async()=>{
 for(const [code,status]of [[200,'reachable'],[404,'missing'],[410,'missing'],[403,'restricted'],[429,'restricted'],[500,'uncertain']]){
  const result=await checkUrl('https://example.com/',{probe:async()=>({code}),timeoutMs:1000});assert.equal(result.status,status);assert.equal(result.code,code);
 }
 let calls=0;const probe=async()=>{calls++;return {code:302,location:'http://127.0.0.1/admin'};};
 for(const url of ['http://localhost','http://10.1.1.1','http://[::1]/','http://[::ffff:7f00:1]/','file:///C:/secret','https://u:p@example.com'])assert.equal((await checkUrl(url,{probe})).status,'skipped');
 assert.equal(calls,0);assert.equal((await checkUrl('https://example.com',{probe})).status,'skipped');assert.equal(calls,1);
 assert.equal(isPrivateAddress('192.168.0.1'),true);assert.equal(isPrivateAddress('8.8.8.8'),false);
 assert.equal((await checkUrl('https://example.com',{probe:async()=>{throw Error('DNS failure');}})).status,'uncertain');
});

test('checking deduplicates URLs and records progress including skipped URLs',async()=>{
 const progress=[];let calls=0;const results=await runUrlChecks([{url:'https://example.com'},{url:'https://example.com'},{url:'http://localhost'}],{check:async url=>{calls++;return {status:'reachable',code:200,reason:'ok',finalUrl:url,checkedAt:new Date().toISOString()};},onProgress:value=>progress.push(value)});
 assert.equal(results.size,2);assert.equal(calls,2);assert.equal(progress.at(-1).checked,2);assert.equal(progress.at(-1).total,2);
});

test('URL checks honor cancellation and timeouts',async()=>{
 const controller=new AbortController();const probe=async(url,{signal})=>new Promise((resolve,reject)=>{signal.addEventListener('abort',()=>reject(signal.reason),{once:true});});
 const running=checkUrl('https://example.com',{probe,signal:controller.signal});controller.abort(new Error('cancelled'));await assert.rejects(running,/cancelled/);
 const keepAlive=setTimeout(()=>{},1000);try{const result=await checkUrl('https://example.com',{probe,timeoutMs:20});assert.equal(result.status,'uncertain');assert.match(result.reason,/逾時/);}finally{clearTimeout(keepAlive);}
});

test('fresh results survive JSON reload for original and added bookmarks while manual status remains authoritative',()=>{
 const baseEntries=[{id:'a',sourceId:1,title:'網站',url:'https://example.com/',folder:'書籤列',domain:'example.com',category:'dev',status:'reachable',code:200,reason:'old',finalUrl:'https://example.com/'}];
 const added=createManualBookmark({title:'新增',url:'https://example.com',category:'life'},'manual-check',2);
 const loaded={baseEntries,changes:{added:[added],deletedIds:[],statusOverrides:{a:'restricted'}},favorites:['a'],checkedAt:'2026-10-22T00:00:00Z'};
 const time='2026-10-23T02:00:00Z';const result={status:'missing',code:404,reason:'HTTP 404',finalUrl:'https://example.com/',checkedAt:time};
 const updated=applyCheckResults(loaded,new Map([[baseEntries[0].url,result]]),time);
 const data=createDataFile(updated.baseEntries,updated.changes,updated.favorites,updated.checkedAt);const restored=readDataFile(JSON.stringify(data));const rows=mergeLibrary(restored.baseEntries,restored.changes);
 assert.equal(restored.checkedAt,time);assert.equal(rows.find(e=>e.id==='a').status,'restricted');assert.equal(rows.find(e=>e.id===added.id).status,'missing');assert.equal(restored.changes.urlChecks.a.code,404);
 assert.deepEqual(restored.favorites,['a']);assert.equal(baseEntries[0].code,200);
 const auto=mergeLibrary(restored.baseEntries,{...restored.changes,statusOverrides:{}});assert.equal(auto.find(e=>e.id==='a').status,'missing');
});
