// 只使用暫存 JSON 與測試用已驗證身分，不接觸正式資料或 Google 帳號。
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),http=require('node:http');
const {validateDocument,publicDocument}=require('../public/project-model.js');
const {createLocalStore,createGcsStore}=require('../server/store.cjs');
const {authorizeGoogle}=require('../server/auth.cjs');
const {createAdminHandler}=require('../server/handler.cjs');
const seed={schemaVersion:1,updatedAt:null,projects:[{id:'one',title:'公開作品',description:'說明',category:'工具',url:'bookmarks/bookmarks.html',linkText:'開啟',badge:'01',sortOrder:1,published:true,featured:false,newTab:false},{id:'draft',title:'私人草稿',description:'尚未公開',category:'',url:'',linkText:'',badge:'02',sortOrder:0,published:false,featured:false,newTab:false}]};

test('作品 JSON 拒絕危險連結與重複 ID，公開資料不含草稿並按順序顯示',()=>{
 assert.deepEqual(publicDocument(seed).projects.map(p=>p.id),['one']);
 for(const url of ['javascript:alert(1)','data:text/html,x','//evil.test','../private','/api/admin/projects'])assert.throws(()=>validateDocument({...seed,projects:[{...seed.projects[0],url}]}));
 assert.throws(()=>validateDocument({...seed,projects:[seed.projects[0],seed.projects[0]]}));
 assert.throws(()=>validateDocument({...seed,projects:[{...seed.projects[0],published:'true'}]}));
 assert.equal(validateDocument(seed).projects[0].title,'公開作品');
});

test('Google 授權檢查驗證後的身分、有效期及管理員白名單',()=>{
 const now=1700000000000,payload={sub:'123',email:'owner@gmail.com',email_verified:true,exp:1700001000,iss:'https://accounts.google.com',aud:'client'};
 const config={googleClientId:'client',adminEmails:['owner@gmail.com'],adminSubjects:[]};
 assert.equal(authorizeGoogle(payload,config,now).sub,'123');
 for(const changes of [{email:'other@gmail.com'},{email_verified:false},{exp:1699999999},{aud:'other'},{iss:'evil'},{sub:''}])assert.throws(()=>authorizeGoogle({...payload,...changes},config,now));
 assert.throws(()=>authorizeGoogle({...payload,email:'owner@example.com'}, {...config,adminEmails:['owner@example.com']},now));
 assert.equal(authorizeGoogle({...payload,email:'owner@example.com'}, {...config,adminEmails:[],adminSubjects:['123']},now).sub,'123');
});

test('本機 JSON 在相同版本的並行存檔只接受一筆，損壞檔案不能當作空資料',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'portfolio-store-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const filename=path.join(root,'projects.json'),store=createLocalStore(filename,seed),first=await store.read();assert.equal(first.revision,'0');
 const next=structuredClone(seed);next.projects[0].title='新版';
 const results=await Promise.allSettled([store.write(next,first.revision),store.write(seed,first.revision)]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.status,409);
 assert.ok((await store.read()).revision!=='0');await fs.writeFile(filename,'broken');await assert.rejects(store.read(),/JSON/);
});

test('GCS 以固定 generation 讀取，條件寫入拒絕過期版本，generation 不轉成不精確數字',async()=>{
 const requests=[],generation='99999999999999999';
 const store=createGcsStore({bucket:'private-test',object:'projects.json',seed,accessToken:async()=> 'server-only',request:async(url,options={})=>{
  const u=new URL(url);requests.push({url:u,options});
  if(u.pathname.startsWith('/upload/'))return new Response('{}',{status:412});
  if(u.searchParams.get('alt')==='media')return Response.json(seed);
  return Response.json({generation});
 }});
 const loaded=await store.read();assert.equal(loaded.revision,generation);assert.equal(requests[1].url.searchParams.get('generation'),generation);
 await assert.rejects(store.write(seed,generation),error=>error.status===409);
 assert.equal(requests[2].url.searchParams.get('ifGenerationMatch'),generation);
});

test('私人 HTTP API 拒絕未登入及非管理員；合法管理員可編輯，公開端僅讀已公開作品',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'portfolio-api-'));let origin;
 const config={googleClientId:'client',adminEmails:['owner@gmail.com'],adminSubjects:[],publicOrigin:()=>origin};
 const handler=await createAdminHandler({root:path.resolve(__dirname,'../../..'),config,store:createLocalStore(path.join(root,'projects.json'),seed),verifyToken:async token=>{
  if(token==='invalid')throw Error('bad signature');
  if(token==='offline')throw Object.assign(new Error('Failed to retrieve verification certificates: private diagnostic'),{code:'EACCES'});
  return {sub:token,email:token==='owner'?'owner@gmail.com':'other@gmail.com',email_verified:true,exp:Math.floor(Date.now()/1000)+3600,iss:'https://accounts.google.com',aud:'client'};
 }});
 const server=http.createServer(async(req,res)=>{if(!await handler(req,res)){res.writeHead(404);res.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+server.address().port;
 t.after(async()=>{await new Promise(r=>server.close(r));await fs.rm(root,{recursive:true,force:true});});
 for(const [token,status] of [['',401],['invalid',401],['other',403]])assert.equal((await fetch(origin+'/api/admin/projects',{headers:token?{Authorization:'Bearer '+token}:{}})).status,status);
 const unavailable=await fetch(origin+'/api/admin/me',{headers:{Authorization:'Bearer offline'}});assert.equal(unavailable.status,503);const diagnostic=await unavailable.json();assert.match(diagnostic.error,/Google.*連線/);assert.doesNotMatch(diagnostic.error,/失效|private diagnostic/);
 const headers={Authorization:'Bearer owner',Origin:origin,'Content-Type':'application/json'};
 const read=await fetch(origin+'/api/admin/projects',{headers}),doc=await read.json();assert.equal(doc.projects.length,2);headers['If-Match']=read.headers.get('etag');
 doc.projects[0].title='管理員更新';
 assert.equal((await fetch(origin+'/api/admin/projects',{method:'PUT',headers,body:JSON.stringify(doc)})).status,200);
 assert.equal((await fetch(origin+'/api/admin/projects',{method:'PUT',headers,body:JSON.stringify(doc)})).status,409);
 assert.equal((await fetch(origin+'/api/admin/projects',{method:'PUT',headers:{...headers,Origin:'https://evil.test'},body:JSON.stringify(doc)})).status,403);
 const publicRead=await fetch(origin+'/api/projects'),published=await publicRead.json();assert.equal(published.projects.length,1);assert.equal(published.projects[0].title,'管理員更新');assert.equal(publicRead.headers.get('access-control-allow-origin'),'*');
 assert.equal((await fetch(origin+'/admin/projects.json')).status,404);
});
