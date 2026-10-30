const {test}=require('node:test'),assert=require('node:assert/strict');
const {readFiles,encode,decode}=require('../Javascript/growth-backup.js');
const id='00000000-0000-4000-8000-000000000001.png';
const bytes=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),Buffer.alloc(16)]);
const document=()=>({schemaVersion:1,updatedAt:null,children:[{id:'child',name:'小星',birthday:'',avatar:id}],records:[]});
function file(body,name,type='application/octet-stream'){const blob=new Blob([body],{type});blob.name=name;blob.webkitRelativePath='assets/'+name;return blob;}
test('folder import validates every referenced photo before returning and drops old Drive mappings',async()=>{
 const data={...document(),photoFiles:{[id]:'old-drive-id'}};
 const files=[file(JSON.stringify(data),'growth-data.json'),file(bytes,id,'image/png')];
 const imported=await readFiles(files);assert.equal(imported.document.children[0].name,'小星');assert.equal(imported.document.photoFiles,undefined);assert.deepEqual(Buffer.from(await imported.photos.get(id).arrayBuffer()),bytes);
 await assert.rejects(readFiles(files.slice(0,1)),/照片/);
 await assert.rejects(readFiles([...files,files[1]]),/重複/);
 await assert.rejects(readFiles([files[0],file('not a png',id,'image/png')]),/照片/);
});
test('full portable backup round trips photo bytes and all children without external Drive access',async()=>{
 const blob=await encode(document(),async photo=>{assert.equal(photo,id);return new Blob([bytes],{type:'image/png'});});
 const restored=await decode(blob);assert.deepEqual(restored.document,document());assert.deepEqual(Buffer.from(await restored.photos.get(id).arrayBuffer()),bytes);
 const altered=new Uint8Array(await blob.arrayBuffer());altered[altered.length-1]^=1;
 await assert.rejects(decode(new Blob([altered])),/校驗|損毀/);
 await assert.rejects(decode(blob.slice(0,-1)),/完整|損毀/);
});
test('backup fails if a photo cannot be read instead of returning an incomplete archive',async()=>{
 await assert.rejects(encode(document(),async()=>{throw new Error('missing photo');}),/missing photo/);
 const empty={schemaVersion:1,updatedAt:null,children:[],records:[]};const archive=await encode(empty,()=>assert.fail());assert.deepEqual((await decode(archive)).document,empty);
});
