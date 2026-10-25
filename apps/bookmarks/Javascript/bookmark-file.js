// 書籤 JSON 格式的共用入口，供瀏覽器建立快照、服務端驗證存檔內容。
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./bookmark-core.js'));else root.BookmarkFile=factory(root.BookmarkCore);})(typeof globalThis!=='undefined'?globalThis:this,function(core){
 const {CATEGORIES,STATUS,loadLibraryChanges,mergeLibrary}=core;
 // baseEntries、changes 與 favorites 是可還原資料；entries 是重新合併的衍生結果。
 // updatedAt 記錄快照建立時間，checkedAt 則保留最近一次完整檢查完成時間。
 function createDataFile(baseEntries,changes,favorites,checkedAt){
  const ids=[...new Set(favorites)];const pinned=new Set(ids);
  return {schemaVersion:1,updatedAt:new Date().toISOString(),checkedAt,baseEntries,changes,favorites:ids,entries:mergeLibrary(baseEntries,changes).map(e=>({...e,favorite:pinned.has(e.id)}))};
 }
 // 採嚴格驗證：格式、重複 ID、欄位型別與參照關係有誤就停止載入。
 // 不信任檔案附帶的 entries，而是回傳來源資料，交由核心重新合併。
 function readDataFile(text){
  const data=JSON.parse(text);const fail=()=>{throw new Error('書籤資料檔格式不正確，請還原備份後重試。');};
  if(!data||data.schemaVersion!==1||!Array.isArray(data.baseEntries)||!data.changes||!Array.isArray(data.favorites)||!Number.isFinite(Date.parse(data.checkedAt)))fail();
  const ids=new Set();const baseEntries=data.baseEntries.map(e=>{
   if(!e||typeof e.id!=='string'||!e.id||ids.has(e.id)||!CATEGORIES.some(c=>c.id===e.category)||!Object.hasOwn(STATUS,e.status)||!Number.isSafeInteger(e.sourceId)||!Number.isFinite(e.code))fail();
   for(const key of ['title','url','folder','domain','reason','finalUrl'])if(typeof e[key]!=='string')fail();
   ids.add(e.id);return {id:e.id,sourceId:e.sourceId,title:e.title,url:e.url,folder:e.folder,domain:e.domain,category:e.category,status:e.status,code:e.code,reason:e.reason,finalUrl:e.finalUrl};
  });
  const loaded=loadLibraryChanges({getItem(){return JSON.stringify(data.changes);}});if(loaded.warning)fail();
  for(const e of loaded.changes.added){if(ids.has(e.id))fail();ids.add(e.id);}
  if(Object.keys(loaded.changes.workSubcategoryAssignments||{}).some(id=>!ids.has(id)))fail();
  // 異動與收藏只能引用存在的基礎或手動新增項目；已刪除項目的來源仍保留以供復原。
  if(Object.keys(loaded.changes.entryOverrides||{}).some(id=>!ids.has(id)))fail();
  if(data.favorites.some(id=>typeof id!=='string'||!ids.has(id)))fail();
  return {baseEntries,changes:loaded.changes,favorites:[...new Set(data.favorites)],checkedAt:data.checkedAt};
 }
 return {createDataFile,readDataFile};
});
