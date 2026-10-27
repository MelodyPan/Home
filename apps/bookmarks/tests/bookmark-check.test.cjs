const {test}=require('node:test'),assert=require('node:assert/strict');
const {runChecks,mergeResults,sensitiveReason}=require('../Javascript/bookmark-check.js');
const result={status:'reachable',code:200,reason:'ok',finalUrl:'https://example.com/',checkedAt:'2026-10-26T12:00:00Z'};
test('check scopes select only filtered, selected, abnormal or single items',()=>{
 const {selectCheckEntries}=require('../Javascript/bookmark-check.js'),entries=[{id:'a',status:'reachable'},{id:'b',status:'missing'},{id:'c',status:'unknown'}];
 assert.deepEqual(selectCheckEntries(entries,'filtered',{filtered:[entries[1]]}),[entries[1]]);
 assert.deepEqual(selectCheckEntries(entries,'selected',{selected:['a','c']}),[entries[0],entries[2]]);
 assert.deepEqual(selectCheckEntries(entries,'abnormal'),[entries[1],entries[2]]);
 assert.deepEqual(selectCheckEntries(entries,'single',{id:'a'}),[entries[0]]);
});
test('checking deduplicates requests, keeps query secrets off the service, and reports progress',async()=>{
 const calls=[],progress=[],entries=[{url:'https://example.com/'},{url:'https://example.com/'},{url:'https://example.com/?token=private'}];
 const results=await runChecks(entries,{request:async url=>{calls.push(url);return result;},onProgress:value=>progress.push(value)});
 assert.deepEqual(calls,['https://example.com/']);assert.equal(results.size,2);assert.equal(results.get(entries[2].url).status,'skipped');assert.deepEqual(progress.at(-1),{checked:2,total:2});
 assert(sensitiveReason('https://example.com/logout'));assert(sensitiveReason('https://example.com/'+('a1'.repeat(30))));
});
test('results only update current matching URLs and preserve other edits and manual overrides',()=>{
 const changes={added:[],deletedIds:[],statusOverrides:{a:'restricted'},urlChecks:{old:result}};
 const next=mergeResults([{id:'a',url:'https://example.com/'},{id:'b',url:'https://example.com/changed'}],changes,new Map([['https://example.com/',result]]));
 assert.equal(next.urlChecks.a.code,200);assert.equal(next.urlChecks.b,undefined);assert.deepEqual(next.statusOverrides,changes.statusOverrides);assert.equal(changes.urlChecks.a,undefined);assert(next.urlChecks.old);
});
test('cancelled checks and invalid service replies cannot be mistaken for a completed scan',async()=>{
 const controller=new AbortController();controller.abort();await assert.rejects(runChecks([{url:'https://example.com/'}],{signal:controller.signal,request:()=>assert.fail()}));
 await assert.rejects(runChecks([{url:'https://example.com/'}],{request:async()=>({status:'wrong'})}),/格式/);
});
