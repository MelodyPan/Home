const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {createGrowthServer:createBookmarkServer}=require('./fixtures/legacy-growth-server.cjs');
const {createGrowthServer}=require('../scripts/server.cjs');
// 每項測試使用獨立暫存目錄與隨機連接埠，結束後關閉服務並清除測試資料。
async function setup(t,{production=false}={}){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'growth-test-'));
 const server=(production?createGrowthServer:createBookmarkServer)(root);await new Promise(r=>server.listen(0,'127.0.0.1',r));
 t.after(async()=>{await new Promise(r=>server.close(r));await fs.rm(root,{recursive:true,force:true});});
 const origin='http://127.0.0.1:'+server.address().port;
 const request=(url,method='GET',body,tag,source=origin)=>fetch(origin+url,{method,headers:{Origin:source,'Content-Type':'application/json',...(tag?{'If-Match':tag}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
 return {root,origin,request};
}
const child={id:'child-1',name:'小星',birthday:'2022-06-15'};
const record={id:'entry-1',childId:'child-1',date:'2023-06-15',title:'第一個生日',story:'一起吹蠟燭',milestone:'生日',photos:[]};
test('growth chart sex persists per child, remains on other edits and can be cleared',async t=>{
 const {request}=await setup(t),initial=await request('/api/growth'),data=await initial.json();data.children=[{...child,growthSex:'male'},{...child,id:'other',name:'小月',growthSex:'female'}];
 assert.equal((await request('/api/growth','PUT',data,initial.headers.get('etag'))).status,200);
 const read=await request('/api/growth'),saved=await read.json();assert.equal(saved.children[0].growthSex,'male');assert.equal(saved.children[1].growthSex,'female');
 const invalid=structuredClone(saved);invalid.children[0].growthSex='unknown';assert.equal((await request('/api/growth','PUT',invalid,read.headers.get('etag'))).status,400);
 saved.children[0].growthSex='';assert.equal((await request('/api/growth','PUT',saved,read.headers.get('etag'))).status,200);
 const cleared=await(await request('/api/growth')).json();assert.equal(cleared.children[0].growthSex,undefined);assert.equal(cleared.children[1].growthSex,'female');
});
test('book settings and magazine layouts persist independently per child and validate cover files',async t=>{
 const {request,origin}=await setup(t),png=Buffer.alloc(24);Buffer.from([137,80,78,71,13,10,26,10]).copy(png);
 const upload=await fetch(origin+'/api/growth/photos',{method:'POST',headers:{Origin:origin,'Content-Type':'image/png'},body:png}),photo=await upload.json();
 const initial=await request('/api/growth'),data=await initial.json();
 data.children=[{...child,bookTitle:' 小星的成長書 ',bookDedication:'一路陪你長大',bookCover:photo.id},{...child,id:'child-2',name:'小月',bookTitle:'小月的書'}];
 data.records=[{...record,photos:[photo.id],photoLayout:'editorial'}];
 assert.equal((await request('/api/growth','PUT',data,initial.headers.get('etag'))).status,200);
 const loaded=await request('/api/growth'),saved=await loaded.json();assert.equal(saved.children[0].bookTitle,'小星的成長書');assert.equal(saved.children[0].bookCover,photo.id);assert.equal(saved.records[0].photoLayout,'editorial');
 const invalid=structuredClone(saved);invalid.children[0].bookCover='12345678-1234-1234-1234-123456789abc.jpg';
 assert.equal((await request('/api/growth','PUT',invalid,loaded.headers.get('etag'))).status,400);
 assert.equal((await request('/api/growth')).headers.get('etag'),loaded.headers.get('etag'));
 saved.children[0].bookCover=null;saved.children[0].bookTitle='';saved.children[0].bookDedication='';saved.records[0].photoLayout='full';
 assert.equal((await request('/api/growth','PUT',saved,loaded.headers.get('etag'))).status,200);
 const cleared=await(await request('/api/growth')).json();assert.equal(cleared.children[0].bookCover,undefined);assert.equal(cleared.children[0].bookTitle,undefined);assert.equal(cleared.children[1].bookTitle,'小月的書');assert.equal(cleared.records[0].photoLayout,'full');
 assert.equal((await fetch(origin+'/assets/growth-photos/'+photo.id)).status,200);
});
test('height and weight survive HTTP saves, partial edits and clearing without changing sibling data',async t=>{
 const {request}=await setup(t),initial=await request('/api/growth'),data=await initial.json();
 data.children=[child,{...child,id:'child-2',name:'小月'}];data.records=[{...record,heightCm:75.5,weightKg:9.125},{...record,id:'entry-2',childId:'child-2',heightCm:60}];
 assert.equal((await request('/api/growth','PUT',data,initial.headers.get('etag'))).status,200);
 const read=await request('/api/growth'),saved=await read.json();assert.equal(saved.records[0].heightCm,75.5);assert.equal(saved.records[0].weightKg,9.125);
 const invalid=structuredClone(saved);invalid.records[0].weightKg=-1;assert.equal((await request('/api/growth','PUT',invalid,read.headers.get('etag'))).status,400);
 const unchanged=await request('/api/growth');assert.equal(unchanged.headers.get('etag'),read.headers.get('etag'));
 saved.records[0].heightCm=null;saved.records[0].weightKg=9.25;
 assert.equal((await request('/api/growth','PUT',saved,read.headers.get('etag'))).status,200);
 const changed=await (await request('/api/growth')).json();assert.equal(changed.records[0].heightCm,undefined);assert.equal(changed.records[0].weightKg,9.25);assert.deepEqual(changed.records[1],data.records[1]);
});
// 真正透過 HTTP 寫入孕期紀錄，再補上生日及重新載入，驗證資料不會因生日下限而被拒絕或清除。
test('pregnancy stories persist before birth and survive adding the actual birthday',async t=>{
 const {root,request}=await setup(t);const initial=await request('/api/growth');
 const data=await initial.json();data.children=[{...child,birthday:''}];data.records=[{...record,date:'2022-01-01',title:'第一次產檢'}];
 assert.equal((await request('/api/growth','PUT',data,initial.headers.get('etag'))).status,200);
 const pregnant=await request('/api/growth'),saved=await pregnant.json();assert.equal(saved.children[0].birthday,'');assert.equal(saved.records[0].date,'2022-01-01');
 saved.children[0].birthday='2022-06-15';
 assert.equal((await request('/api/growth','PUT',saved,pregnant.headers.get('etag'))).status,200);
 const loaded=await (await request('/api/growth')).json();assert.equal(loaded.children[0].birthday,'2022-06-15');assert.deepEqual(loaded.records,saved.records);
 const disk=JSON.parse(await fs.readFile(path.join(root,'assets/growth-data.json'),'utf8'));assert.deepEqual(disk.records,saved.records);
 const backup=JSON.parse(await fs.readFile(path.join(root,'assets/growth-data.json.bak'),'utf8'));assert.equal(backup.children[0].birthday,'');assert.equal(backup.records[0].title,'第一次產檢');
});
// 電子書只開放明確列出的靜態檔案，內容與 MIME 正確，其他程式檔不對外提供。
test('growth serves local flipbook assets with the expected content types',async t=>{
 const {root,origin}=await setup(t,{production:true});
 for(const [file,type] of [['Javascript/growth-flipbook.js','application/javascript'],['src/growth-flipbook.css','text/css'],['Javascript/growth-metrics.js','application/javascript'],['src/growth-metrics.css','text/css'],['Javascript/growth-reference.js','application/javascript']]){
  await fs.mkdir(path.dirname(path.join(root,file)),{recursive:true});
  const source=await fs.readFile(path.resolve(file),'utf8');await fs.writeFile(path.join(root,file),source);
  const response=await fetch(origin+'/'+file);assert.equal(response.status,200);assert.ok(response.headers.get('content-type').startsWith(type));assert.equal(await response.text(),source);
 }
 assert.equal((await fetch(origin+'/Javascript/unknown.js')).status,404);
});
// 驗證初始化、多孩子保存、上一版備份、舊版本拒絕，以及服務重建後能讀回資料。
test('growth initializes, persists multiple children and records, backs up and rejects stale saves',async t=>{
 const {root,request}=await setup(t);
 const initial=await request('/api/growth');assert.equal(initial.status,200);
 const tag=initial.headers.get('etag'),data=await initial.json();assert.deepEqual(data.children,[]);assert.deepEqual(data.records,[]);
 data.children=[child,{id:'child-2',name:'小月',birthday:'2024-02-29'}];data.records=[record];
 const saved=await request('/api/growth','PUT',data,tag);assert.equal(saved.status,200);
 const updated=await request('/api/growth');assert.notEqual(updated.headers.get('etag'),tag);assert.equal((await updated.json()).records[0].story,'一起吹蠟燭');
 const disk=JSON.parse(await fs.readFile(path.join(root,'assets/growth-data.json'),'utf8'));assert.equal(disk.children.length,2);
 assert.deepEqual(JSON.parse(await fs.readFile(path.join(root,'assets/growth-data.json.bak'),'utf8')).children,[]);
 assert.equal((await request('/api/growth','PUT',data,tag)).status,409);
 const other=createBookmarkServer(root);await new Promise(r=>other.listen(0,'127.0.0.1',r));
 try{const loaded=await fetch('http://127.0.0.1:'+other.address().port+'/api/growth');assert.equal((await loaded.json()).records.length,1);}finally{await new Promise(r=>other.close(r));}
});
// 驗證來源、日期及關聯錯誤會被拒絕，而且不改變正式檔案版本。
test('growth rejects foreign writes, invalid dates, dangling children and photos without changing disk',async t=>{
 const {request}=await setup(t);const response=await request('/api/growth'),tag=response.headers.get('etag'),empty=await response.json();
 const valid={...empty,children:[child],records:[record]};
 assert.equal((await request('/api/growth','PUT',valid,tag,'https://foreign.test')).status,403);
 for(const bad of [{...valid,children:[{...child,birthday:'2022-02-30'}]},{...valid,records:[{...record,childId:'missing'}]},{...valid,records:[{...record,photos:['../../private.jpg']}]},{...valid,children:[child,child]}]){
  assert.equal((await request('/api/growth','PUT',bad,tag)).status,400);
 }
 assert.equal((await request('/api/growth')).headers.get('etag'),tag);
});
// 用 PNG 位元組驗證上傳與讀回，同時測試偽裝格式、超大內容及不安全路徑。
test('photos accept real raster bytes, survive reads and reject foreign, fake, oversized and unsafe paths',async t=>{
 const {origin,request}=await setup(t);
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==','base64');
 const upload=(body,type='image/png',source=origin)=>fetch(origin+'/api/growth/photos',{method:'POST',headers:{Origin:source,'Content-Type':type},body});
 assert.equal((await upload(png,'image/png','https://foreign.test')).status,403);
 assert.equal((await upload(Buffer.from('<svg/>'))).status,400);
 assert.equal((await upload(png,'image/svg+xml')).status,415);
 assert.equal((await upload(Buffer.alloc(12*1024*1024+1))).status,413);
 const added=await upload(png);assert.equal(added.status,201);const photo=await added.json();assert.match(photo.id,/^[a-f0-9-]+\.png$/);
 const image=await fetch(origin+'/assets/growth-photos/'+photo.id);assert.equal(image.status,200);assert.equal(image.headers.get('content-type'),'image/png');assert.deepEqual(Buffer.from(await image.arrayBuffer()),png);
 const loaded=await request('/api/growth'),tag=loaded.headers.get('etag'),data=await loaded.json();data.children=[child];data.records=[{...record,photos:[photo.id]}];assert.equal((await request('/api/growth','PUT',data,tag)).status,200);
 for(const url of ['/assets/growth-photos/unknown.png','/assets/growth-photos/%2e%2e%2fsecret','/assets/growth-data.json','/src/growth.css/../server.cjs'])assert.equal((await fetch(origin+url)).status,404);
});
// 破壞測試 JSON，確認服務保留原檔並報錯，不自動清空相簿。
test('corrupt growth file is reported and preserved',async t=>{
 const {root,request}=await setup(t);await request('/api/growth');await fs.writeFile(path.join(root,'assets/growth-data.json'),'broken');
 assert.equal((await request('/api/growth')).status,500);assert.equal(await fs.readFile(path.join(root,'assets/growth-data.json'),'utf8'),'broken');
});

// 驗證刪除孩子不影響其他孩子紀錄，且同版本併發寫入只有一筆成功。
test('growth deletion preserves sibling records and concurrent saves cannot overwrite each other',async t=>{
 const {request}=await setup(t);const first=await request('/api/growth');let tag=first.headers.get('etag');
 const data={schemaVersion:1,children:[child,{id:'child-2',name:'小月',birthday:'2024-02-29'}],records:[record,{...record,id:'entry-2',childId:'child-2',date:'2024-03-01'}]};
 assert.equal((await request('/api/growth','PUT',data,tag)).status,200);
 const loaded=await request('/api/growth');tag=loaded.headers.get('etag');
 const deleted={...data,children:data.children.slice(1),records:data.records.slice(1)};
 assert.equal((await request('/api/growth','PUT',deleted,tag)).status,200);
 const beforeRace=await request('/api/growth');tag=beforeRace.headers.get('etag');
 const edited={...deleted,children:deleted.children.map(c=>({...c,name:'小月編輯'}))};
 const results=await Promise.all([request('/api/growth','PUT',deleted,tag),request('/api/growth','PUT',edited,tag)]);
 assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
 const after=await request('/api/growth'),persisted=await after.json();assert.equal(persisted.children.length,1);assert.deepEqual(persisted.records.map(r=>r.childId),['child-2']);
 const unknownPhoto={...persisted,records:[{...persisted.records[0],photos:['00000000-0000-4000-8000-000000000000.jpg']}]};
 assert.equal((await request('/api/growth','PUT',unknownPhoto,after.headers.get('etag'))).status,400);
 const final=await request('/api/growth');assert.equal(final.headers.get('etag'),after.headers.get('etag'));
});
// 驗證相簿與指定前端資源可讀取，但後端儲存程式不能經 HTTP 下載。
test('growth page and only explicitly allowed assets are served',async t=>{
 const {root,request}=await setup(t,{production:true});
 for(const file of ['growth.html','src/growth.css','Javascript/growth.js']){await fs.mkdir(path.dirname(path.join(root,file)),{recursive:true});await fs.copyFile(file,path.join(root,file));}
 for(const [url,type] of [['/growth.html','text/html'],['/src/growth.css','text/css'],['/Javascript/growth.js','application/javascript']]){const result=await request(url);assert.equal(result.status,200);assert.ok(result.headers.get('content-type').startsWith(type));assert.ok((await result.text()).length>100);}
 assert.equal((await request('/scripts/growth-store.cjs')).status,404);
});

// 大頭貼需能與既有孩子資料相容，儲存、替換及移除都不影響其他孩子或故事。
test('child avatars persist, can be replaced and removed without affecting siblings or records',async t=>{
 const {origin,request,root}=await setup(t);
 const bytes=await fs.readFile(path.resolve(__dirname,'../../../images/logo.png'));
 const upload=async()=>{const response=await fetch(origin+'/api/growth/photos',{method:'POST',headers:{Origin:origin,'Content-Type':'image/png'},body:bytes});assert.equal(response.status,201);return (await response.json()).id;};
 const avatar=await upload(),replacement=await upload();
 let response=await request('/api/growth');let tag=response.headers.get('etag');
 let data={schemaVersion:1,children:[{...child,avatar},{id:'child-2',name:'小月',birthday:'2024-02-29'}],records:[record]};
 assert.equal((await request('/api/growth','PUT',data,tag)).status,200);
 response=await request('/api/growth');tag=response.headers.get('etag');data=await response.json();assert.equal(data.children[0].avatar,avatar);assert.ok(!data.children[1].avatar);assert.equal(data.records[0].title,'第一個生日');
 const disk=JSON.parse(await fs.readFile(path.join(root,'assets/growth-data.json'),'utf8'));assert.equal(disk.children[0].avatar,avatar);
 data.children[0].avatar=replacement;assert.equal((await request('/api/growth','PUT',data,tag)).status,200);
 response=await request('/api/growth');tag=response.headers.get('etag');data=await response.json();assert.equal(data.children[0].avatar,replacement);
 assert.equal((await fetch(origin+'/assets/growth-photos/'+avatar)).status,200);
 data.children[0].avatar=null;assert.equal((await request('/api/growth','PUT',data,tag)).status,200);
 response=await request('/api/growth');data=await response.json();assert.ok(!data.children[0].avatar);assert.equal(data.children[1].name,'小月');assert.equal(data.records.length,1);
});

test('invalid or missing child avatar files are rejected without altering saved data',async t=>{
 const {request}=await setup(t);const first=await request('/api/growth'),tag=first.headers.get('etag');
 for(const avatar of ['../../private.jpg','https://example.com/avatar.png',123,{},'00000000-0000-4000-8000-000000000000.jpg']){
  const data={schemaVersion:1,children:[{...child,avatar}],records:[]};
  assert.equal((await request('/api/growth','PUT',data,tag)).status,400);
  assert.equal((await request('/api/growth')).headers.get('etag'),tag);
 }
});

// 指定封面應獨立保存，不改變其餘照片順序；沒有指定的舊紀錄仍可讀取。
test('record cover photo persists without reordering photos and can be changed or cleared',async t=>{
 const {origin,request}=await setup(t);
 const bytes=await fs.readFile(path.resolve(__dirname,'../../../images/logo.png'));
 const upload=async()=>{const response=await fetch(origin+'/api/growth/photos',{method:'POST',headers:{Origin:origin,'Content-Type':'image/png'},body:bytes});return (await response.json()).id;};
 const a=await upload(),b=await upload();let response=await request('/api/growth'),tag=response.headers.get('etag');
 let data={schemaVersion:1,children:[child],records:[{...record,photos:[a,b],coverPhoto:b}]};
 assert.equal((await request('/api/growth','PUT',data,tag)).status,200);
 response=await request('/api/growth');tag=response.headers.get('etag');data=await response.json();assert.equal(data.records[0].coverPhoto,b);assert.deepEqual(data.records[0].photos,[a,b]);
 data.records[0].coverPhoto=a;assert.equal((await request('/api/growth','PUT',data,tag)).status,200);
 response=await request('/api/growth');tag=response.headers.get('etag');data=await response.json();assert.equal(data.records[0].coverPhoto,a);
 data.records[0].photos=[];data.records[0].coverPhoto=null;assert.equal((await request('/api/growth','PUT',data,tag)).status,200);
 response=await request('/api/growth');data=await response.json();assert.ok(!data.records[0].coverPhoto);assert.deepEqual(data.records[0].photos,[]);
});

test('cover photo must belong to the same record',async t=>{
 const {request}=await setup(t);const first=await request('/api/growth'),tag=first.headers.get('etag');
 for(const coverPhoto of ['../../private.jpg','00000000-0000-4000-8000-000000000000.jpg',123]){
  assert.equal((await request('/api/growth','PUT',{schemaVersion:1,children:[child],records:[{...record,coverPhoto}]},tag)).status,400);
 }
});
