// 前後端共用資料格式；只接受純文字與安全連結，不把管理資料當成 HTML 執行。
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.ProjectModel=factory();})(typeof globalThis==='object'?globalThis:this,()=>{
 'use strict';
 const fail=message=>{throw Object.assign(new Error(message),{status:400});};
 function safeUrl(value){
  if(value==='')return '';
  if(typeof value!=='string'||value.length>2000||/[\s\\<>\u0000-\u001f]/.test(value))fail('作品連結格式不正確。');
  let decoded;try{decoded=decodeURIComponent(value);}catch{fail('作品連結編碼不正確。');}
  if(/[\u0000-\u001f\\]/.test(decoded))fail('作品連結格式不正確。');
  if(/^https?:\/\//i.test(value)){
   let url;try{url=new URL(value);}catch{fail('作品網址格式不正確。');}if(!url.hostname||url.username||url.password)fail('作品連結不能包含帳號密碼。');return value;
  }
  if(value.startsWith('/')||decoded.startsWith('/')||/[:]/.test(decoded.split(/[/?#]/)[0])||decoded.split(/[/?#]/).includes('..')||/^(?:api|admin)(?:\/|$)/i.test(decoded))fail('請填入 http(s) 網址或網站內的相對路徑。');
  const url=new URL(value,'https://home.invalid/Home/');if(url.origin!=='https://home.invalid'||!url.pathname.startsWith('/Home/'))fail('作品連結超出網站目錄。');
  return value;
 }
 function validateDocument(value){
  if(!value||value.schemaVersion!==1||!Array.isArray(value.projects)||value.projects.length>300)fail('作品 JSON 格式不正確，最多可保存 300 筆。');
  const ids=new Set();
  const text=(row,key,max,required=false)=>{if(typeof row[key]!=='string'||row[key].length>max||(required&&!row[key].trim()))fail('請檢查作品的 '+key+' 欄位。');return row[key].trim();};
  const projects=value.projects.map(row=>{
   if(!row||typeof row.id!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(row.id)||ids.has(row.id))fail('作品識別碼缺少或重複。');ids.add(row.id);
   if(!Number.isInteger(row.sortOrder)||row.sortOrder<0||row.sortOrder>100000)fail('顯示順序必須是 0 到 100000 的整數。');
   for(const key of ['published','featured','newTab'])if(typeof row[key]!=='boolean')fail('作品顯示設定不正確。');
   return {id:row.id,title:text(row,'title',160,true),description:text(row,'description',5000),category:text(row,'category',160),url:safeUrl(text(row,'url',2000)),linkText:text(row,'linkText',60),badge:text(row,'badge',20),sortOrder:row.sortOrder,published:row.published,featured:row.featured,newTab:row.newTab};
  });
  if(value.updatedAt!==null&&(typeof value.updatedAt!=='string'||!Number.isFinite(Date.parse(value.updatedAt))))fail('作品更新時間格式不正確。');
  return {schemaVersion:1,updatedAt:value.updatedAt,projects};
 }
 function publicDocument(value){const document=validateDocument(value);return {...document,projects:document.projects.filter(row=>row.published).sort((a,b)=>Number(b.featured)-Number(a.featured)||a.sortOrder-b.sortOrder||a.id.localeCompare(b.id))};}
 return {safeUrl,validateDocument,publicDocument};
});
