// Portable album backups: a bounded JSON manifest followed by original photo bytes.
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./growth-data.js'));else root.GrowthBackup=factory(root.GrowthData);})(globalThis,function(data){
 'use strict';
 const magic=new TextEncoder().encode('MGROWTH1'),types={png:'image/png',jpg:'image/jpeg',webp:'image/webp'},limit=12*1024*1024;
 const damaged=()=>new Error('相簿備份不完整或已損毀，請使用原始備份。');
 const portable=document=>{const checked=data.validate(document);delete checked.photoFiles;return checked;};
 async function checkPhoto(id,blob){
  const type=types[id.split('.').pop()];if(!type||!blob||blob.size===0||blob.size>limit)throw new Error('照片格式或大小不正確：'+id);
  const bytes=new Uint8Array(await blob.slice(0,24).arrayBuffer());
  const ascii=(start,end)=>String.fromCharCode(...bytes.slice(start,end));
  const valid=type==='image/png'?bytes.length>=24&&magic.every((_,i)=>i>=8||bytes[i]===[137,80,78,71,13,10,26,10][i]):type==='image/jpeg'?bytes.length>=4&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255:bytes.length>=16&&ascii(0,4)==='RIFF'&&ascii(8,12)==='WEBP';
  if(!valid)throw new Error('照片內容與格式不符：'+id);return blob.slice(0,blob.size,type);
 }
 const digest=async blob=>Array.from(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256',await blob.arrayBuffer())),x=>x.toString(16).padStart(2,'0')).join('');
 async function readFiles(selection){
  const files=Array.from(selection),sources=files.filter(file=>file.name==='growth-data.json');
  if(sources.length!==1||sources[0].size>8*1024*1024)throw new Error('請選擇包含一份 growth-data.json 與 growth-photos 照片的資料夾。');
  const document=portable(JSON.parse(await sources[0].text())),photos=new Map();
  for(const id of data.photoIds(document)){
   const found=files.filter(file=>file.name===id);if(found.length!==1)throw new Error(found.length?'資料夾中有重複照片：'+id:'缺少照片：'+id+'；請選擇完整相簿資料夾。');
   photos.set(id,await checkPhoto(id,found[0]));
  }
  return {document,photos};
 }
 async function encode(source,readPhoto){
  const document=portable(source),photos=[],blobs=[];
  for(const id of data.photoIds(document)){
   const blob=await checkPhoto(id,await readPhoto(id));photos.push({id,type:blob.type,size:blob.size,sha256:await digest(blob)});blobs.push(blob);
  }
  const manifest=new TextEncoder().encode(JSON.stringify({format:1,document,photos}));if(manifest.length>16*1024*1024)throw new Error('相簿備份索引過大。');
  const size=new Uint8Array(4);new DataView(size.buffer).setUint32(0,manifest.length);
  return new Blob([magic,size,manifest,...blobs],{type:'application/octet-stream'});
 }
 async function decode(blob){
  if(blob.size<12)throw damaged();const header=new Uint8Array(await blob.slice(0,12).arrayBuffer());
  if(!magic.every((value,i)=>header[i]===value))throw damaged();const size=new DataView(header.buffer).getUint32(8);
  if(size>16*1024*1024||size>blob.size-12)throw damaged();
  let manifest;try{manifest=JSON.parse(await blob.slice(12,12+size).text());}catch{throw damaged();}
  if(manifest.format!==1||!Array.isArray(manifest.photos))throw damaged();const document=portable(manifest.document),ids=data.photoIds(document),photos=new Map();
  if(manifest.photos.length!==ids.length)throw damaged();let offset=12+size;
  for(const item of manifest.photos){
   if(!ids.includes(item.id)||photos.has(item.id)||!Number.isSafeInteger(item.size)||item.size<=0||item.size>limit||offset+item.size>blob.size||types[item.id.split('.').pop()]!==item.type)throw damaged();
   const photo=await checkPhoto(item.id,blob.slice(offset,offset+item.size,item.type));if(await digest(photo)!==item.sha256)throw new Error('照片校驗失敗，備份可能已損毀：'+item.id);
   photos.set(item.id,photo);offset+=item.size;
  }
  if(offset!==blob.size)throw damaged();return {document,photos};
 }
 return {readFiles,encode,decode,checkPhoto};
});
