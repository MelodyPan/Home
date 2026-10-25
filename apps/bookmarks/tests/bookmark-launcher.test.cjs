const {test}=require('node:test');
const assert=require('node:assert/strict');
const {ensureBookmarkServer}=require('../scripts/start-bookmarks.cjs');
test('launcher reuses a matching server and restarts an outdated server before opening the page',async()=>{
 const root='test-root',version='new';let running='old',launched=0,stopped=0;
 const request=async(url,options={})=>{
  if(!running)throw new Error('offline');
  if(url.endsWith('/api/health'))return {ok:true,json:async()=>({app:'melody-pan-bookmarks',workspace:root,version:running})};
  if(url.endsWith('/api/shutdown')){assert.equal(options.method,'POST');stopped++;running=null;return {ok:true,json:async()=>({stopped:true})};}
  throw new Error('unexpected request');
 };
 const options={url:'http://127.0.0.1:4178',root,version,request,launch(){launched++;running='new';},delay:async()=>{}};
 await ensureBookmarkServer(options);assert.equal(launched,1);assert.equal(stopped,1);
 await ensureBookmarkServer(options);assert.equal(launched,1);assert.equal(stopped,1);
});
test('launcher starts an offline server and refuses to shut down another app or workspace',async()=>{
 let running=false,launched=0;
 const options={url:'http://127.0.0.1:4178',root:'root',version:'new',request:async()=>{if(!running)throw Error('offline');return {ok:true,json:async()=>({app:'melody-pan-bookmarks',workspace:'root',version:'new'})};},launch(){launched++;running=true;},delay:async()=>{}};
 await ensureBookmarkServer(options);assert.equal(launched,1);
 await assert.rejects(()=>ensureBookmarkServer({...options,request:async()=>({ok:true,json:async()=>({app:'other',workspace:'root'})})}),/another|另一/);
 await assert.rejects(()=>ensureBookmarkServer({...options,request:async()=>({ok:false,status:404})}),/舊版|older/);
});
