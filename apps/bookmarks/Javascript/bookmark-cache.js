// 只快取使用者同意、且已由 Drive 確認的快照；不保存 token 或未同步草稿。
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./bookmark-file.js'));else root.BookmarkCache=factory(root.BookmarkFile);})(globalThis,function(file){
 'use strict';
 const CACHE_KEY='melody-bookmarks-cache-v1',PREFERENCES_KEY='melody-bookmarks-cache-consent-v1';
 function createBookmarkCache({storage}={}){
  let warning='',conflict=false,knownRaw;const disabled=new Set();
  try{knownRaw=storage?.getItem(CACHE_KEY)||null;}catch{}
  const fail=()=>{warning='無法使用本機暫存，雲端資料仍可正常使用。';return false;};
  function preferences(){try{const data=JSON.parse(storage?.getItem(PREFERENCES_KEY)||'{}');return data&&typeof data==='object'&&!Array.isArray(data)?data:{};}catch{return {};}}
  function choice(accountId){if(disabled.has(accountId))return false;const value=preferences()[accountId];return typeof value==='boolean'?value:null;}
  function clear(){try{storage?.removeItem(CACHE_KEY);knownRaw=null;conflict=false;return true;}catch{return fail();}}
  function choose(accountId,enabled){
   if(!accountId)return false;
   // 停用先釋放快照空間；即使偏好寫入失敗，本分頁仍不可重新快取。
   if(!enabled){disabled.add(accountId);if(!clear())return false;}
   try{if(!storage) return fail();const values=preferences();Object.defineProperty(values,accountId,{value:!!enabled,enumerable:true,configurable:true,writable:true});storage.setItem(PREFERENCES_KEY,JSON.stringify(values));if(enabled){disabled.delete(accountId);if(!clear())return false;}warning='';return true;}catch{return fail();}
  }
  function read(){
   try{
    const raw=storage?.getItem(CACHE_KEY);if(!raw)return null;const data=JSON.parse(raw);
    if(data.version!==1||typeof data.accountId!=='string'||!data.accountId||typeof data.datasetId!=='string'||!data.datasetId||!Array.isArray(data.revision)||!data.revision.every(x=>typeof x==='string')||!Number.isFinite(Date.parse(data.syncedAt))||choice(data.accountId)!==true)throw Error('invalid cache');
    file.readDataFile(JSON.stringify(data.document));return data;
   }catch{clear();return null;}
  }
  function write(accountId,datasetId,document,revision){
   if(choice(accountId)!==true)return false;
   try{
    file.readDataFile(JSON.stringify(document));
    // 單次 setItem 原子替換；配額不足時仍留下上一份成功快照。
    const current=storage.getItem(CACHE_KEY)||null;
    // 另一分頁已更新時，不讓延遲的舊 Drive 回應將快取回退；須重新確認雲端。
    if(current!==knownRaw&&current){const other=JSON.parse(current);if(other.accountId!==accountId||other.datasetId!==datasetId||JSON.stringify(other.revision)!==JSON.stringify(revision)||JSON.stringify(other.document)!==JSON.stringify(document)){conflict=true;warning='其他分頁已更新書籤快取，請重新同步 Google Drive 確認最新版本。';return false;}}
    const next=JSON.stringify({version:1,accountId,datasetId,document,revision:[...revision],syncedAt:new Date().toISOString()});
    storage.setItem(CACHE_KEY,next);knownRaw=next;conflict=false;warning='';return true;
   }catch{return fail();}
  }
  // 必須在新的雲端核對開始前呼叫；不可在舊回應到達後重設基準。
  function beginCheck(){try{knownRaw=storage?.getItem(CACHE_KEY)||null;}catch{fail();}}
  return {choice,choose,read,write,clear,beginCheck,suspend(accountId){disabled.add(accountId);},get warning(){return warning;},get conflict(){return conflict;}};
 }
 return {createBookmarkCache,CACHE_KEY,PREFERENCES_KEY};
});
