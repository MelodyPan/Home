(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.BookmarkCheck=factory();})(globalThis,function(){
 'use strict';
 // 前端先擋敏感／操作型網址；伺服器仍會再驗證，不能只信任瀏覽器的過濾結果。
 function sensitiveReason(raw){try{const url=new URL(raw);if(url.search||url.username||url.password)return '含查詢參數或登入資訊，未送出，請人工確認';if(url.pathname.split('/').some(part=>part.length>40&&/[a-z]/i.test(part)&&/[0-9_-]/.test(part))||/@|%40/i.test(url.pathname))return '路徑可能含私人識別碼，未送出，請人工確認';if(/(?:^|\/)(?:logout|logoff|signout|sign-out|unsubscribe|delete|remove|reset-password)(?:\/|$)/i.test(url.pathname))return '操作型網址，為避免觸發變更而略過';}catch{}return '';}
 function valid(result){return result&&['reachable','restricted','missing','uncertain','skipped'].includes(result.status)&&Number.isSafeInteger(result.code)&&result.code>=0&&result.code<600&&typeof result.reason==='string'&&result.reason.length<=1000&&typeof result.finalUrl==='string'&&result.finalUrl.length<=8192&&Number.isFinite(Date.parse(result.checkedAt));}
 // 同網址只送一次，採固定數量工作迴圈；未完整成功的 Map 不交給畫面套用。
 async function runChecks(entries,{request,signal,onProgress=()=>{},concurrency=4}){
  const urls=[...new Set(entries.map(entry=>entry.url))],results=new Map();let cursor=0;
  const checkAbort=()=>signal?.throwIfAborted();checkAbort();onProgress({checked:0,total:urls.length});
  await Promise.all(Array.from({length:Math.min(concurrency,urls.length)},async()=>{while(cursor<urls.length){checkAbort();const url=urls[cursor++],reason=sensitiveReason(url),result=reason?{status:'skipped',code:0,reason,finalUrl:url,checkedAt:new Date().toISOString()}:await request(url,signal);checkAbort();if(!valid(result))throw new Error('檢查服務回傳格式不正確，未套用結果。');results.set(url,result);onProgress({checked:results.size,total:urls.length});}}));
  return results;
 }
 // 依目前有效 entries 的 URL 配對，避免編輯或刪除後仍套用舊網址結果；手動覆寫留在別欄位。
 function mergeResults(entries,changes,results){const urlChecks={...changes.urlChecks};for(const entry of entries){const result=results.get(entry.url);if(result)urlChecks[entry.id]={...result};}return {...changes,urlChecks};}
 function selectCheckEntries(entries,scope,{filtered=[],selected=[],id}={}){if(scope==='all')return [...entries];if(scope==='filtered'){const ids=new Set(filtered.map(e=>e.id));return entries.filter(e=>ids.has(e.id));}if(scope==='selected'){const ids=new Set(selected);return entries.filter(e=>ids.has(e.id));}if(scope==='abnormal')return entries.filter(e=>['missing','uncertain','restricted','unknown'].includes(e.status));if(scope==='single')return entries.filter(e=>e.id===id);return [];}
 return {runChecks,mergeResults,sensitiveReason,selectCheckEntries};
});
