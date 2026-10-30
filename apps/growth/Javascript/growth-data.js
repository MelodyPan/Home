// Portable schema shared by the browser and backups. No album contents are persisted here.
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.GrowthData=factory();})(globalThis,function(){
'use strict';
const photoPattern=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.(png|jpg|webp)$/;
const mime={png:'image/png',jpg:'image/jpeg',webp:'image/webp'};
// 用完整檔案內容計算 SHA-256 ETag，供前端辨識資料是否已被其他視窗或程式修改。
// 日期須符合格式並能原樣轉回，避免 JavaScript 把 2 月 30 日自動進位成合法日期。
const validDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
// 驗證欄位長度、唯一識別碼、日期及孩子／照片關聯；回傳時只保留支援的欄位。
// 同時檢查欄位長度、有效日期、孩子關聯及照片 ID；允許孕期紀錄早於生日。
function validateLegacy(data){
 const fail=()=>{throw Object.assign(new Error('成長資料格式不正確，請確認孩子、日期與照片。'),{status:400});};
 const text=(value,max,required=false)=>typeof value==='string'&&value.length<=max&&(!required||value.trim().length>0);
 const id=value=>typeof value==='string'&&/^[a-zA-Z0-9-]{1,80}$/.test(value);
 if(!data||data.schemaVersion!==1||!Array.isArray(data.children)||!Array.isArray(data.records)||data.children.length>100||data.records.length>10000)fail();
 // Map 檢查紀錄所屬孩子，Set 用來偵測重複紀錄識別碼。
 const children=new Map(),records=new Set();
 // avatar 是可省略的大頭貼照片 ID；舊孩子資料缺少欄位或傳 null 仍合法，有設定時則必須符合安全檔名規則。
 // 尚未出生時 birthday 可留空、null 或省略；有填寫仍須是有效日期，不接受其他型別。
 for(const c of data.children){if(!c||!id(c.id)||children.has(c.id)||!text(c.name,80,true)||(![undefined,null,''].includes(c.birthday)&&!validDate(c.birthday))||(![undefined,null,''].includes(c.dueDate)&&!validDate(c.dueDate))||(c.avatar!==undefined&&c.avatar!==null&&(typeof c.avatar!=='string'||!photoPattern.test(c.avatar))))fail();children.set(c.id,c);}
 // 每位孩子的書封設定各自保存；圖片使用本機產生的識別碼，書名與寄語仍為純文字。
 for(const c of children.values()){
  if(c.growthSex!=null&&!['','male','female'].includes(c.growthSex))fail();
  if((c.bookTitle!=null&&!text(c.bookTitle,120))||(c.bookDedication!=null&&!text(c.bookDedication,2000))||(c.bookCover!=null&&(typeof c.bookCover!=='string'||!photoPattern.test(c.bookCover))))fail();
 }
 // 孕期、出生後共用日期排序；每筆最多 20 張照片，照片檔名不能重複或超出允許格式。
 for(const r of data.records){
  if(!r||!id(r.id)||records.has(r.id)||!children.has(r.childId)||!validDate(r.date)||!text(r.title,160,true)||!text(r.story,20000)||!text(r.milestone,80)||!Array.isArray(r.photos)||r.photos.length>20||new Set(r.photos).size!==r.photos.length||r.photos.some(p=>typeof p!=='string'||!photoPattern.test(p)))fail();
  // 封面只能引用這一筆紀錄自己的照片；省略時沿用舊版第一張照片的行為。
  if(r.coverPhoto!==undefined&&r.coverPhoto!==null&&(typeof r.coverPhoto!=='string'||!r.photos.includes(r.coverPhoto)))fail();
  // 身高／體重為可選數字；空值不等於零。上下限只用來防止誤輸入，不代表健康標準。
  for(const [key,max] of [['heightCm',300],['weightKg',500],['maternalWeightKg',500],['maternalSystolic',400],['maternalDiastolic',400]])if(r[key]!==undefined&&r[key]!==null&&(typeof r[key]!=='number'||!Number.isFinite(r[key])||r[key]<=0||r[key]>max||(['maternalSystolic','maternalDiastolic'].includes(key)&&!Number.isInteger(r[key]))))fail();
  if(r.photoLayout!=null&&!['editorial','grid','full'].includes(r.photoLayout))fail();
  records.add(r.id);
 }
 // 只輸出支援欄位；未設定的大頭貼與封面不強制補欄位，因此維持 schemaVersion 1 與既有資料相容。
 return {schemaVersion:1,updatedAt:typeof data.updatedAt==='string'?data.updatedAt:null,children:data.children.map(c=>({id:c.id,name:c.name.trim(),birthday:c.birthday||'',...(c.dueDate?{dueDate:c.dueDate}:{}),...(c.growthSex?{growthSex:c.growthSex}:{}),...(c.avatar?{avatar:c.avatar}:{}),...(c.bookTitle?.trim()?{bookTitle:c.bookTitle.trim()}:{}),...(c.bookDedication?.trim()?{bookDedication:c.bookDedication}:{}),...(c.bookCover?{bookCover:c.bookCover}:{})})),records:data.records.map(r=>({id:r.id,childId:r.childId,date:r.date,title:r.title.trim(),story:r.story,milestone:r.milestone.trim(),photos:[...r.photos],...(r.photoLayout?{photoLayout:r.photoLayout}:{}),...(r.heightCm!=null?{heightCm:r.heightCm}:{}),...(r.weightKg!=null?{weightKg:r.weightKg}:{}),...Object.fromEntries(['maternalWeightKg','maternalSystolic','maternalDiastolic'].filter(key=>r[key]!=null).map(key=>[key,r[key]])),...(r.coverPhoto?{coverPhoto:r.coverPhoto}:{})}))};
}

function validate(data){
 const checked=validateLegacy(data);
 if(data.photoFiles!==undefined){
  const map=data.photoFiles;
  if(!map||typeof map!=='object'||Array.isArray(map)||![Object.prototype,null].includes(Object.getPrototypeOf(map)))throw new Error('照片對應格式不正確。');
  checked.photoFiles={};
  for(const [id,fileId]of Object.entries(map)){
   if(!photoPattern.test(id)||typeof fileId!=='string'||!/^[a-zA-Z0-9_-]{1,200}$/.test(fileId))throw new Error('照片對應格式不正確。');
   checked.photoFiles[id]=fileId;
  }
 }
 return checked;
}
function photoIds(data){const doc=validate(data);return [...new Set([...doc.children.flatMap(c=>[c.avatar,c.bookCover].filter(Boolean)),...doc.records.flatMap(r=>r.photos)])];}
function empty(){return {schemaVersion:1,updatedAt:null,children:[],records:[]};}
function photoOwners(data){
 const doc=validate(data),owners=new Map();
 const add=(photo,child)=>{if(!photo)return;if(!owners.has(photo))owners.set(photo,new Set());owners.get(photo).add(child);};
 for(const child of doc.children){add(child.avatar,child.id);add(child.bookCover,child.id);}
 for(const record of doc.records)for(const photo of record.photos)add(photo,record.childId);
 return owners;
}
return {validate,photoIds,photoOwners,empty};
});
