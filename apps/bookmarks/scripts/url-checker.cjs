// 網頁背景網址檢查器：先驗證目的位址，再檢查 HTTP 狀態，不下載完整頁面判斷內容。
const http=require('node:http');
const https=require('node:https');
const dns=require('node:dns').promises;
const net=require('node:net');
const {mergeLibrary}=require('../Javascript/bookmark-core.js');
const {sensitiveReason}=require('../Javascript/bookmark-check.js');
// 內部、回送、保留與特殊網段不發送請求；IPv4 與 IPv6 分別驗證。
const blocked4=new net.BlockList(),blocked6=new net.BlockList();
for(const [address,prefix]of [['0.0.0.0',8],['10.0.0.0',8],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.168.0.0',16],['100.64.0.0',10],['192.0.0.0',24],['192.0.2.0',24],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',4],['240.0.0.0',4]])blocked4.addSubnet(address,prefix,'ipv4');
for(const [address,prefix]of [['::',96],['::ffff:0:0',96],['64:ff9b::',96],['fc00::',7],['fe80::',10],['ff00::',8],['2001:db8::',32],['100::',64]])blocked6.addSubnet(address,prefix,'ipv6');
function isPrivateAddress(address){const family=net.isIP(address);return !family||(family===4?blocked4.check(address,'ipv4'):blocked6.check(address,'ipv6'));}
function skipped(message){return Object.assign(new Error(message),{skipped:true});}
// 每一跳重新導向都需重新驗證，並略過特殊協定、內部名稱與含帳密的網址。
function validateUrl(raw){
 let url;try{url=new URL(raw);}catch{throw skipped('網址格式無法解析');}
 const sensitive=sensitiveReason(raw);if(sensitive)throw skipped(sensitive);url.hash='';
 const host=url.hostname.replace(/^\[|\]$/g,'').replace(/\.$/,'').toLowerCase();
 if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw skipped('特殊協定或含登入資訊，未送出請求');
 if(host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local')||host.endsWith('.internal')||(!host.includes('.')&&!net.isIP(host))||(net.isIP(host)&&isPrivateAddress(host)))throw skipped('內部或特殊網址，未送出請求');
 return url;
}
function abortable(promise,signal){
 if(signal.aborted)return Promise.reject(signal.reason||new Error('已取消'));
 return new Promise((resolve,reject)=>{const abort=()=>reject(signal.reason||new Error('已取消'));signal.addEventListener('abort',abort,{once:true});promise.then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort));});
}
// 先解析並檢查所有 DNS 結果，再將實際連線固定到已驗證的位址。
async function probeHttp(url,{method,signal}){
 const host=url.hostname.replace(/^\[|\]$/g,'');
 const addresses=net.isIP(host)?[{address:host,family:net.isIP(host)}]:await abortable(dns.lookup(host,{all:true}),signal);
 if(!addresses.length||addresses.some(item=>isPrivateAddress(item.address)))throw skipped('網域指向內部或保留位址，未送出請求');
 return new Promise((resolve,reject)=>{
  // Pin the validated DNS results for the actual connection; validate redirects separately.
  const lookup=(name,options,callback)=>options.all?callback(null,addresses):callback(null,addresses[0].address,addresses[0].family);
  const req=(url.protocol==='https:'?https:http).request(url,{method,signal,lookup,headers:{'User-Agent':'PersonalBookmarkCheck/1.0',...(method==='GET'?{Range:'bytes=0-0'}:{})}},res=>{resolve({code:res.statusCode,location:res.headers.location});res.destroy();});
  req.on('error',reject);req.end();
 });
}
// 整筆檢查共用逾時與取消訊號；先 HEAD，必要時改 GET，仍只使用回應狀態。
// 登入限制、404／410、連線異常分開記錄，連線失敗不直接判定網站已失效。
async function checkUrl(raw,{probe=probeHttp,timeoutMs=12000,signal:parentSignal}={}){
 const timeout=AbortSignal.timeout(timeoutMs);const signal=parentSignal?AbortSignal.any([timeout,parentSignal]):timeout;
 let finalUrl=raw,code=0;
 const result=(status,reason)=>({status,code,reason,finalUrl,checkedAt:new Date().toISOString()});
 async function follow(method){let url=validateUrl(raw);for(let redirect=0;redirect<=6;redirect++){signal.throwIfAborted();finalUrl=url.href;const response=await abortable(probe(url,{method,signal}),signal);code=response.code||0;if([301,302,303,307,308].includes(code)&&response.location){url=validateUrl(new URL(response.location,url).href);continue;}return;}throw Error('重新導向次數過多');}
 try{
  let usedGet=false;try{await follow('HEAD');}catch(error){if(error.skipped||signal.aborted)throw error;usedGet=true;await follow('GET');}
  if(code>=400&&!usedGet)await follow('GET');
  if(code>=200&&code<300){if(/\/(?:login|signin|sign-in|auth)(?:[/?#.]|$)|accounts\.google\.com|login\.microsoftonline\.com/i.test(finalUrl))return result('restricted','重新導向至登入或驗證頁面');return result('reachable','HTTP 回應成功，未驗證完整頁面內容');}
  if([401,403,407,429,451].includes(code))return result('restricted','需要登入或受到存取限制');
  if([404,410].includes(code))return result('missing','頁面不存在或已移除，仍可能有網站端誤擋');
  return result('uncertain','伺服器回應異常，待人工確認');
 }catch(error){if(parentSignal?.aborted)throw parentSignal.reason||error;if(error.skipped){code=0;return result('skipped',error.message);}return result('uncertain',signal.aborted?'連線逾時，待稍後複查':'連線、網域或憑證問題，待人工確認');}
}
// 同網址只檢查一次；使用固定數量的工作迴圈限制並行數，逐筆回報進度。
async function runUrlChecks(entries,{check=checkUrl,onProgress=()=>{},concurrency=6,signal}={}){
 const urls=[...new Set(entries.map(e=>e.url))],results=new Map();let cursor=0;
 onProgress({checked:0,total:urls.length});
 await Promise.all(Array.from({length:Math.min(concurrency,urls.length)},async()=>{while(cursor<urls.length){signal?.throwIfAborted();const url=urls[cursor++];results.set(url,await check(url,{signal}));onProgress({checked:results.size,total:urls.length});}}));
 return results;
}
// 依最新有效網址合併結果；已修改為其他網址或已刪除的項目不套用舊結果。
// 保留手動狀態與其他異動，完整成功存檔後才採用新的檢查完成時間。
function applyCheckResults(loaded,results,completedAt){
 const urlChecks={...loaded.changes.urlChecks};
 for(const entry of mergeLibrary(loaded.baseEntries,loaded.changes)){const result=results.get(entry.url);if(result)urlChecks[entry.id]={status:result.status,code:result.code,reason:result.reason,finalUrl:result.finalUrl,checkedAt:result.checkedAt};}
 return {...loaded,changes:{...loaded.changes,urlChecks},checkedAt:completedAt};
}
module.exports={checkUrl,runUrlChecks,applyCheckResults,isPrivateAddress};
