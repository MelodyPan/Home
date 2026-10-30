const {test}=require('node:test'),assert=require('node:assert/strict');
const data=require('../Javascript/growth-data.js');
const {createDriveStore}=require('../Javascript/growth-drive.js');
const {fakeDrive}=require('./fixtures/growth-drive-api.cjs');
const photo='12345678-1234-1234-1234-123456789abc.png';
const png=()=>new Blob([Uint8Array.from([137,80,78,71,13,10,26,10,...Array(24).fill(0)])],{type:'image/png'});
const album=(name='孩子')=>({schemaVersion:1,updatedAt:null,children:[{id:'child',name,birthday:''}],records:[]});
const store=(api,now=()=>Date.parse('2026-10-26T07:00Z'))=>createDriveStore({request:api.request,token:()=> 'test-token',uuid:()=> '12345678-1234-1234-1234-123456789abc',now});
const snapshots=api=>[...api.files.values()].filter(x=>x.meta.mimeType==='application/json');
test('portable validation preserves legacy fields, normalizes text and validates photo mappings',()=>{
 const doc=album('  孩子  ');doc.children[0].avatar=photo;doc.photoFiles={[photo]:'drive-1'};
 assert.equal(data.validate(doc).children[0].name,'孩子');assert.deepEqual(data.photoIds(doc),[photo]);assert.deepEqual(data.empty(),{schemaVersion:1,updatedAt:null,children:[],records:[]});
 for(const bad of [{...doc,photoFiles:{'../photo':'drive-1'}},{...doc,photoFiles:{[photo]:'../bad'}},{...doc,children:[{id:'child',name:'x',birthday:'2026-02-30'}]}])assert.throws(()=>data.validate(bad));
});
test('same Taiwan month updates one file; boundary creates complete snapshot and preserves prior content',async()=>{
 let time=Date.parse('2026-10-31T15:59:59Z');const api=fakeDrive(),a=store(api,()=>time),first=await a.create(album());
 const updated=await a.write(first.datasetId,album('October'),first.revision),original=JSON.stringify(snapshots(api)[0].content);
 assert.equal(snapshots(api).length,1);time+=1000;const next=await a.write(first.datasetId,album('November'),updated.revision);
 assert.deepEqual(snapshots(api).map(x=>x.meta.name),['growth-2026-10.json','growth-2026-11.json']);assert.equal(JSON.stringify(snapshots(api)[0].content),original);assert.equal((await a.read(next.datasetId)).document.children[0].name,'November');
 await assert.rejects(a.write(first.datasetId,album(),updated.revision),e=>e.code==='conflict');
});
test('same-month simultaneous saves reject losing draft and resolve against selected head',async()=>{
 const api=fakeDrive(),a=store(api),b=store(api),first=await a.create(album());api.concurrent();
 const results=await Promise.allSettled([a.write(first.datasetId,album('A'),first.revision),b.write(first.datasetId,album('B'),first.revision)]);
 const error=results.find(x=>x.status==='rejected').reason;assert.equal(error.code,'conflict');assert.equal(snapshots(api).length,1);
 const head=await a.readHead(first.datasetId,error.heads[0].id);await a.resolve(first.datasetId,album('chosen'),head.revision);assert.equal((await b.read(first.datasetId)).document.children[0].name,'chosen');
});
test('cross-month concurrent creation reserves one shared ID',async()=>{
 let time=Date.parse('2026-10-31T15:59Z');const api=fakeDrive(),a=store(api,()=>time),b=store(api,()=>time),first=await a.create(album());time+=120000;api.concurrent();
 const results=await Promise.allSettled([a.write(first.datasetId,album('A'),first.revision),b.write(first.datasetId,album('B'),first.revision)]);
 assert.equal(snapshots(api).length,2);assert(results.some(x=>x.status==='rejected'&&x.reason.code==='conflict'));assert.equal((await a.read(first.datasetId)).revision.length,1);
});
test('uncertain update across month rollover retries original operation before creating next month',async()=>{
 let time=Date.parse('2026-10-31T15:59Z');const api=fakeDrive(),a=store(api,()=>time),first=await a.create(album());api.loseReply();
 await assert.rejects(a.write(first.datasetId,album('draft'),first.revision),e=>e.code==='network');time+=120000;
 await assert.rejects(a.write(first.datasetId,album('changed'),first.revision),e=>e.code==='pending');const retried=await a.write(first.datasetId,album('draft'),first.revision);
 assert.equal(snapshots(api).length,1);await a.write(first.datasetId,album('new month'),retried.revision);assert.equal(snapshots(api).length,2);
});
test('uncertain first create and cross-month creation reuse their original IDs',async()=>{
 let time=Date.parse('2026-10-31T15:59Z');const api=fakeDrive(),a=store(api,()=>time);api.loseReply();await assert.rejects(a.create(album()));time+=120000;
 const first=await a.create(album());assert.equal(snapshots(api).length,1);api.loseReply();await assert.rejects(a.write(first.datasetId,album('second'),first.revision));time+=31*86400000;
 await a.write(first.datasetId,album('second'),first.revision);assert.deepEqual(snapshots(api).map(x=>x.meta.name),['growth-2026-10.json','growth-2026-11.json']);
});
test('photos upload actual binary, retry by photo ID, download only authorized matching metadata',async()=>{
 const api=fakeDrive(),a=store(api),bytes=png();api.loseReply();await assert.rejects(a.uploadPhoto(bytes,photo));
 const uploaded=await a.uploadPhoto(bytes,photo);assert.equal(uploaded.id,photo);assert.equal([...api.files.values()].filter(x=>x.meta.mimeType==='image/png').length,1);
 const downloaded=await a.readPhoto(photo,uploaded.fileId);assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()),Buffer.from(await bytes.arrayBuffer()));
 api.files.get(uploaded.fileId).meta.appProperties.photo='different.png';await assert.rejects(a.readPhoto(photo,uploaded.fileId),e=>e.code==='invalid');
});
test('save verifies every referenced photo and rejects missing or unrelated mapping',async()=>{
 const api=fakeDrive(),a=store(api),doc=album();doc.children[0].avatar=photo;
 await assert.rejects(a.create(doc),e=>e.code==='photo');const uploaded=await a.uploadPhoto(png(),photo);doc.photoFiles={[photo]:uploaded.fileId};const first=await a.create(doc);
 assert.equal((await a.read(first.datasetId)).document.photoFiles[photo],uploaded.fileId);api.files.delete(uploaded.fileId);await assert.rejects(a.write(first.datasetId,doc,first.revision),e=>['photo','missing'].includes(e.code));
});
test('photo MIME, bytes, size and supplied photo ID are validated before upload',async()=>{
 const api=fakeDrive(),a=store(api);for(const [blob,id]of [[new Blob(['wrong'],{type:'image/png'}),photo],[png(),'../bad.png'],[new Blob(['x'],{type:'text/html'}),photo]])await assert.rejects(a.uploadPhoto(blob,id));assert.equal(api.files.size,0);
});
test('malformed envelopes and incomplete discovery fail closed',async()=>{
 const api=fakeDrive(),a=store(api),first=await a.create(album());snapshots(api)[0].content.datasetId='wrong';await assert.rejects(a.read(first.datasetId),e=>e.code==='invalid');
 const b=createDriveStore({token:()=> 'test-token',request:async()=>new Response(JSON.stringify({files:[],incompleteSearch:true}))});await assert.rejects(b.listLibraries(),e=>e.code==='invalid');
});
test('authentication and API errors are actionable; no anonymous access occurs',async()=>{
 const a=createDriveStore({token:()=>'',request:()=>assert.fail('anonymous request')});for(const fn of [()=>a.account(),()=>a.listLibraries(),()=>a.readPhoto(photo,'file')])await assert.rejects(fn(),e=>e.code==='auth');
 for(const [status,code]of [[401,'auth'],[403,'permission'],[429,'quota']]){const b=createDriveStore({token:()=> 'test-token',request:async()=>new Response('{}',{status})});await assert.rejects(b.account(),e=>e.code===code);}
});
test('shared folders are excluded; bookmarks folder may be reused while datasets stay separate',async()=>{
 const api=fakeDrive();api.files.set('folder-bookmarks',{meta:{id:'folder-bookmarks',name:'MelodyHome',mimeType:'application/vnd.google-apps.folder',shared:false,appProperties:{purpose:'melody-home-bookmarks-v1-folder'}}});
 const a=store(api),first=await a.create(album());assert.deepEqual(snapshots(api)[0].meta.parents,['folder-bookmarks']);assert.equal((await a.listLibraries()).length,1);assert.equal((await a.account()).id,'account-a');
});
test('large photos use resumable binary upload and retry an uncertain final response',async()=>{
 const api=fakeDrive(),a=store(api),bytes=new Uint8Array(6*1024*1024);bytes.set(new Uint8Array(await png().arrayBuffer()));const blob=new Blob([bytes],{type:'image/png'});
 api.loseReply();await assert.rejects(a.uploadPhoto(blob,photo),e=>e.code==='network');const uploaded=await a.uploadPhoto(blob,photo);
 assert(api.resumableUploads>0);assert.deepEqual(Buffer.from(await(await a.readPhoto(photo,uploaded.fileId)).arrayBuffer()),Buffer.from(bytes));assert.equal([...api.files.values()].filter(x=>x.meta.mimeType==='image/png').length,1);
});
test('missing conditional ETag stops update before any mutation',async()=>{
 const api=fakeDrive(),a=store(api),first=await a.create(album());let writes=0;
 const b=createDriveStore({token:()=> 'test-token',request:async(url,opts)=>{if(['PATCH','PUT'].includes(opts.method))writes++;const response=await api.request(url,opts);response.headers.delete('etag');if(new URL(url).pathname.startsWith('/drive/v2/')){const meta=await response.json();delete meta.etag;return new Response(JSON.stringify(meta));}return response;}});
 await assert.rejects(b.write(first.datasetId,album(),first.revision),e=>e.code==='conditional');assert.equal(writes,0);
});

test('adding a child succeeds without browser-visible v3 ETags and keeps one monthly file',async()=>{
 const api=fakeDrive({browserMetadata:true}),a=store(api),first=await a.create(data.empty());
 const saved=await a.write(first.datasetId,album('新孩子'),first.revision);
 assert.equal((await a.read(first.datasetId)).document.children[0].name,'新孩子');assert.equal(snapshots(api).length,1);
 await assert.rejects(a.write(first.datasetId,album('過期'),first.revision),e=>e.code==='conflict');
 assert.notDeepEqual(saved.revision,first.revision);
});

test('hidden v3 ETags preserve concurrent-save conflicts and cross-month reservation',async()=>{
 let time=Date.parse('2026-10-31T15:59Z');const api=fakeDrive({browserMetadata:true}),a=store(api,()=>time),b=store(api,()=>time),first=await a.create(album());
 api.concurrent();const results=await Promise.allSettled([a.write(first.datasetId,album('A'),first.revision),b.write(first.datasetId,album('B'),first.revision)]);
 assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal(results.find(x=>x.status==='rejected').reason.code,'conflict');
 const current=await a.read(first.datasetId);time+=120000;api.concurrent();
 const rollover=await Promise.allSettled([a.write(first.datasetId,album('November A'),current.revision),b.write(first.datasetId,album('November B'),current.revision)]);
 assert.equal(rollover.filter(x=>x.status==='fulfilled').length,1);assert.equal(rollover.find(x=>x.status==='rejected').reason.code,'conflict');
 assert.deepEqual(snapshots(api).map(x=>x.meta.name),['growth-2026-10.json','growth-2026-11.json']);
});

test('fallback ETag is paired with freshly read properties so a concurrent metadata change cannot be overwritten',async()=>{
 const api=fakeDrive({browserMetadata:true}),a=store(api),first=await a.create(album());let changed=false;
 const b=createDriveStore({token:()=> 'test-token',request:async(url,opts)=>{
  const response=await api.request(url,opts);
  if(!changed&&new URL(url).pathname.startsWith('/drive/v3/files/')&&new URL(url).searchParams.get('fields')==='id,parents,appProperties'){
   changed=true;await a.write(first.datasetId,album('另一台裝置'),first.revision);
  }
  return response;
 }});
 await assert.rejects(b.write(first.datasetId,album('舊表單'),first.revision),e=>e.code==='conflict');
 assert.equal((await a.read(first.datasetId)).document.children[0].name,'另一台裝置');
});
test('shared or wrongly named monthly snapshots cannot be loaded',async()=>{
 for(const mutate of [meta=>meta.shared=true,meta=>meta.name='growth-1999-01.json',meta=>delete meta.appProperties.month]){const api=fakeDrive(),a=store(api),first=await a.create(album());mutate(snapshots(api)[0].meta);await assert.rejects(a.read(first.datasetId),e=>e.code==='invalid');}
});
test('photo mappings cannot read another owner or shared photo',async()=>{
 for(const mutate of [meta=>meta.ownedByMe=false,meta=>meta.shared=true,meta=>meta.appProperties.purpose='other']){const api=fakeDrive(),a=store(api),uploaded=await a.uploadPhoto(png(),photo);mutate(api.files.get(uploaded.fileId).meta);await assert.rejects(a.readPhoto(photo,uploaded.fileId),e=>e.code==='invalid');}
});
test('reset stops stale asynchronous work before it can write into the next account',async()=>{
 const api=fakeDrive();let release,arrived;const gate=new Promise(r=>release=r),started=new Promise(r=>arrived=r);let writes=0,blocked=false;
 const a=createDriveStore({token:()=> 'test-token',request:async(url,options)=>{if(options.method)writes++;const response=await api.request(url,options);if(!blocked&&new URL(url).pathname==='/drive/v3/files'&&!options.method){blocked=true;const json=response.json.bind(response);response.json=async()=>{arrived();await gate;return json();};}return response;}});
 const stale=a.create(album());await started;a.reset();release();await assert.rejects(stale,e=>e.code==='auth');assert.equal(writes,0);assert.equal((await a.account()).id,'account-a');
});
test('large albums verify photo mappings with paginated metadata listing instead of one request per image',async()=>{
 const api=fakeDrive();let photoGets=0,photoLists=0;
 const a=createDriveStore({token:()=> 'test-token',request:(url,options)=>{const parsed=new URL(url);if(parsed.searchParams.get('q')?.includes("value='melody-home-growth-v1-photo'"))photoLists++;else if(parsed.searchParams.get('fields')?.includes('ownedByMe')&&parsed.pathname!=='/drive/v3/files')photoGets++;return api.request(url,options);}});
 const doc=album();doc.children=[];doc.photoFiles={};for(let i=0;i<9;i++){const id=photo.replace('12345678',String(i).padStart(8,'0')),uploaded=await a.uploadPhoto(png(),id);doc.children.push({id:'child-'+i,name:'Child',avatar:id});doc.photoFiles[id]=uploaded.fileId;}
 await a.create(doc);assert.equal(photoGets,0);assert(photoLists>0&&photoLists<9);
});

test('new photos upload directly into separate coded private child folders',async()=>{
 const api=fakeDrive(),a=store(api),other=photo.replace('12345678','87654321');
 const one=await a.uploadPhoto(png(),photo,{id:'child-a',name:'小星'}),two=await a.uploadPhoto(png(),other,{id:'child-b',name:'小月'});
 const folder=id=>api.files.get(api.files.get(id).meta.parents[0]).meta;
 assert.equal(folder(one.fileId).name,'03');assert.equal(folder(two.fileId).name,'04');assert.notEqual(folder(one.fileId).id,folder(two.fileId).id);
 const root=api.files.get(folder(one.fileId).parents[0]).meta;assert.equal(root.name,'成長相簿照片');assert.equal(root.shared,false);
});

test('loading legacy photos organizes them and record moves and child renames preserve file IDs and bytes',async()=>{
 const api=fakeDrive(),a=store(api),uploaded=await a.uploadPhoto(png(),photo),doc=album();doc.children.push({id:'other',name:'小月',birthday:''});
 doc.photoFiles={[photo]:uploaded.fileId};doc.records=[{id:'story',childId:'child',date:'2026-10-30',title:'回憶',story:'內容',milestone:'',photos:[photo]}];
 const first=await a.create(doc),image=api.files.get(uploaded.fileId),content=Buffer.from(image.content),root=snapshots(api)[0].meta.parents[0];image.meta.parents=[root];
 const loaded=await a.read(first.datasetId),folder=()=>api.files.get(image.meta.parents[0]).meta;assert.equal(folder().name,'03');
 loaded.document.records[0].childId='other';const moved=await a.write(first.datasetId,loaded.document,loaded.revision);assert.equal(folder().name,'04');
 moved.document.children[1].name='月月';await a.write(first.datasetId,moved.document,moved.revision);assert.equal(folder().name,'04');assert.deepEqual(image.content,content);assert.equal(image.meta.id,uploaded.fileId);
});

test('a photo referenced by multiple children stays in a shared photo folder',async()=>{
 const api=fakeDrive(),a=store(api),uploaded=await a.uploadPhoto(png(),photo),doc=album();doc.children[0].avatar=photo;doc.children.push({id:'other',name:'小月',birthday:'',avatar:photo});doc.photoFiles={[photo]:uploaded.fileId};
 await a.create(doc);assert.equal(api.files.get(api.files.get(uploaded.fileId).meta.parents[0]).meta.name,'共同照片');assert.equal([...api.files.values()].filter(x=>x.meta.mimeType==='image/png').length,1);
});

test('folder organization failure retries the confirmed monthly commit without duplicating records or pictures',async()=>{
 const api=fakeDrive();let rejectMove=false;
 const a=createDriveStore({token:()=> 'test-token',request:(url,options)=>{
  if(rejectMove&&new URL(url).searchParams.has('addParents')){rejectMove=false;throw Error('move temporarily failed');}return api.request(url,options);
 }}),uploaded=await a.uploadPhoto(png(),photo),doc=album();doc.children[0].avatar=photo;doc.photoFiles={[photo]:uploaded.fileId};
 rejectMove=true;await assert.rejects(a.create(doc),e=>e.code==='network');assert.equal(snapshots(api).length,1);
 const result=await a.create(doc);assert.equal((await a.read(result.datasetId)).document.children[0].avatar,photo);assert.equal(snapshots(api).length,1);
 assert.equal([...api.files.values()].filter(x=>x.meta.mimeType==='image/png').length,1);
});

test('shared child folders are rejected and same-name children retain separate folders',async()=>{
 const api=fakeDrive(),a=store(api),one=await a.uploadPhoto(png(),photo,{id:'one',name:'寶寶'}),other=photo.replace('12345678','87654321'),two=await a.uploadPhoto(png(),other,{id:'two',name:'寶寶'});
 const folder=id=>api.files.get(api.files.get(id).meta.parents[0]).meta;
 assert.notEqual(folder(one.fileId).id,folder(two.fileId).id);assert.notEqual(folder(one.fileId).name,folder(two.fileId).name);
 folder(one.fileId).shared=true;const third=photo.replace('12345678','98765432');await assert.rejects(a.uploadPhoto(png(),third,{id:'one',name:'寶寶'}),e=>e.code==='folderPrivacy');
 assert.equal([...api.files.values()].filter(x=>x.meta.mimeType==='image/png').length,2);
});

test('renaming a child preserves the coded folder of pictures retained only by older snapshots',async()=>{
 const api=fakeDrive(),a=store(api),doc=album(),uploaded=await a.uploadPhoto(png(),photo,{id:'child',name:'孩子'});doc.children[0].avatar=photo;doc.photoFiles={[photo]:uploaded.fileId};
 const saved=await a.create(doc);delete saved.document.children[0].avatar;saved.document.children[0].name='新名字';
 await a.write(saved.datasetId,saved.document,saved.revision);assert.equal(api.files.get(api.files.get(uploaded.fileId).meta.parents[0]).meta.name,'03');
});

test('Drive child folders use requested anonymous codes and keep the code after a child rename',async()=>{
 const api=fakeDrive(),a=store(api),second=photo.replace('12345678','87654321');
 const first=await a.uploadPhoto(png(),photo,{id:'child-one',name:'育銓'}),baby=await a.uploadPhoto(png(),second,{id:'child-two',name:'Baby'});
 const folder=id=>api.files.get(api.files.get(id).meta.parents[0]).meta;
 assert.equal(folder(first.fileId).name,'01');assert.equal(folder(baby.fileId).name,'02');
 assert.equal(folder(first.fileId).appProperties.code,'01');
 const third=photo.replace('12345678','98765432');await a.uploadPhoto(png(),third,{id:'child-one',name:'換了暱稱'});assert.equal(folder(first.fileId).name,'01');
});

test('existing named child folders are renamed in place to 01 and 02',async()=>{
 const api=fakeDrive(),a=store(api),second=photo.replace('12345678','87654321'),children=[{id:'one',name:'育銓',birthday:''},{id:'two',name:'Baby',birthday:''}];
 const first=await a.uploadPhoto(png(),photo,children[0]),baby=await a.uploadPhoto(png(),second,children[1]),folders=[first,baby].map(item=>api.files.get(api.files.get(item.fileId).meta.parents[0]).meta),ids=folders.map(meta=>meta.id);
 folders.forEach((meta,index)=>{meta.name=children[index].name;delete meta.appProperties.code;});
 await a.create({schemaVersion:1,children,records:[]});assert.deepEqual(folders.map(meta=>meta.name),['01','02']);assert.deepEqual(folders.map(meta=>meta.id),ids);
});
