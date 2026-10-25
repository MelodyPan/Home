// 舊版命令列報告工具：執行時會用 curl 檢查原始匯出檔的網址並產生報告。
// 與網頁的背景檢查器不同，此工具不會直接更新既有 bookmarks-data.txt。
const fs = require('node:fs');
const path = require('node:path');
process.chdir(path.resolve(__dirname,'..'));
const {execFile} = require('node:child_process');
const source = fs.readFileSync('assets/source/bookmarks_2026_10_23.html', 'utf8');
function decode(s) { return s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (m,v) => {if(v[0]==='#') return String.fromCodePoint(v[1].toLowerCase()==='x'?parseInt(v.slice(2),16):Number(v.slice(1)));return ({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"})[v.toLowerCase()] || m;}); }
// 以資料夾堆疊解析原始匯出檔；同網址只發送一次檢查，再把結果對應回各筆書籤。
const entries=[]; const folders=[]; let pending=null;
for(const m of source.matchAll(/<H3\b[^>]*>([\s\S]*?)<\/H3>|<DL\b[^>]*>|<\/DL>|<A\b([^>]*)>([\s\S]*?)<\/A>/gi)) {
 if(m[1]!==undefined) pending=decode(m[1]);
 else if(/^<DL/i.test(m[0])) { folders.push(pending);pending=null; }
 else if(/^<\/DL/i.test(m[0])) folders.pop();
 else {const href=m[2].match(/\bHREF="([^"]*)"/i); if(href) entries.push({id:entries.length+1,title:decode(m[3]),url:decode(href[1]),folder:folders.filter(Boolean).join(' / ')});}
}
const unique=[...new Set(entries.map(x=>x.url))]; const results=new Map();
const names={reachable:'可連線',restricted:'需要登入或限制存取',missing:'可能失效（404／410）',uncertain:'無法判定',skipped:'未檢查（內部或特殊網址）'};
function privateHost(host) {return host==='localhost'||host==='[::1]'||host.endsWith('.local')||host.endsWith('.internal')||!host.includes('.')||/^(127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host);}
// 以獨立參數呼叫 curl，不拼接 shell 命令；設定連線與總逾時並限制回應大小。
function request(url, head) {return new Promise(resolve=>{ const args=['--silent','--show-error','--location','--max-redirs','6','--connect-timeout','5','--max-time','15','--proto','=http,https','--proto-redir','=http,https','--user-agent','Mozilla/5.0 (compatible; PersonalBookmarkCheck/1.0)','--output','NUL','--write-out','%{json}']; if(head)args.push('--head');else args.push('--max-filesize','262144');args.push('--url',url);execFile('curl.exe',args,{timeout:18000,maxBuffer:262144,windowsHide:true},(err,stdout,stderr)=>{let info={};try{info=JSON.parse(stdout);}catch{}resolve({code:Number(info.http_code||0),finalUrl:info.url_effective||url,exitCode:info.exitcode??err?.code??0,error:(info.errormsg||stderr||'').trim().slice(0,400)});});});}
// 依回應狀態與錯誤原因分類；先嘗試 HEAD，錯誤或無狀態碼時再用 GET 複查。
async function check(url){ let parsed;try{parsed=new URL(url);}catch{return {status:'skipped',reason:'網址格式無法解析'};}if(!['http:','https:'].includes(parsed.protocol)||privateHost(parsed.hostname)||parsed.username||parsed.password)return {status:'skipped',reason:'內部網址、特殊協定或含登入資訊，未送出請求'};
 let r=await request(url,true); let method='HEAD';
 if(r.code>=400 || !r.code) {r=await request(url,false);method='GET';}
 let status='uncertain',reason='伺服器錯誤或連線失敗，不能直接認定已失效';
 if(r.code>=200&&r.code<300){status='reachable';reason='HTTP 回應成功，未驗證完整頁面內容';}
 if([401,403,407,429,451].includes(r.code)){status='restricted';reason='登入、反機器人、流量或存取限制';}
 if([404,410].includes(r.code)){status='missing';reason='GET 回報頁面不存在或已移除，仍可能有網站端誤擋';}
 if(status==='reachable'&&/\/(?:login|signin|sign-in|auth)(?:[/?#.]|$)|accounts\.google\.com|login\.microsoftonline\.com/i.test(r.finalUrl)){status='restricted';reason='重新導向至登入或驗證頁面';}
 if(!r.code)reason=r.exitCode===6?'網域解析失敗，待人工複查':r.exitCode===28?'連線逾時，待稍後複查':/certificate|SSL|TLS/i.test(r.error)?'憑證或 TLS 連線問題，待人工複查':reason;
 return {...r,status,reason,method,redirected:r.finalUrl!==url,checkedAt:new Date().toISOString()};
}
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// 輸出 JSON 與供人工檢視的 HTML，尚未完成的項目保留 pending 狀態。
function save(done=false){const rows=entries.map(e=>({...e,...(results.get(e.url)||{status:'pending',reason:'尚未檢查'})}));const counts={};for(const r of rows)counts[r.status]=(counts[r.status]||0)+1; const report={completed:done,generatedAt:new Date().toISOString(),source:'assets/source/bookmarks_2026_10_23.html',total:rows.length,uniqueUrls:unique.length,checkedUnique:results.size,counts,entries:rows};fs.writeFileSync('assets/reports/bookmark-check-results.json',JSON.stringify(report,null,2));
 const order={missing:0,uncertain:1,restricted:2,skipped:3,reachable:4,pending:5};rows.sort((a,b)=>order[a.status]-order[b.status]||a.id-b.id);
 fs.writeFileSync('assets/reports/bookmark-check-report.html',`<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>書籤網址檢查</title><style>body{font:15px/1.6 system-ui;margin:0;background:#f5f7fb;color:#233047}main{max-width:1250px;margin:auto;padding:32px}h1{margin-bottom:4px}.summary{display:flex;flex-wrap:wrap;gap:10px;margin:20px 0}button,input{font:inherit;border:1px solid #b8c5d6;border-radius:8px;padding:8px 12px;background:white}button{cursor:pointer}button[aria-pressed=true]{background:#233047;color:white}input{width:min(90%,600px)}article{background:white;border:1px solid #dde3ed;border-radius:10px;padding:16px;margin:12px 0}a{color:#1855ad;overflow-wrap:anywhere}h3{margin:0 0 8px}p{margin:5px 0;overflow-wrap:anywhere}.tag{font-weight:650}.missing .tag{color:#b42318}.uncertain .tag{color:#9a6700}.reachable .tag{color:#147547}.muted{color:#607087;font-size:13px}</style><main><h1>書籤網址檢查</h1><p>546 筆書籤的本機連線檢查報告</p><p class="muted">檢查時間：${esc(new Date().toLocaleString('zh-TW',{timeZone:'Asia/Taipei'}))}（台灣時間） · ${done?'已完成':'檢查中'} · ${results.size}/${unique.length} 個不同網址</p><p>可連線表示 HTTP 回應成功，不保證內容仍相同。404／410 列為可能失效；存取限制、逾時及憑證問題不當作失效。原始書籤未被修改或刪除。</p><div class="summary"><button data-filter="all" aria-pressed="true">全部 ${rows.length}</button>${Object.entries(names).map(([k,v])=>`<button data-filter="${k}" aria-pressed="false">${v} ${counts[k]||0}</button>`).join('')}</div><input id="search" aria-label="搜尋書籤" placeholder="搜尋標題、網址、資料夾或錯誤原因"><p id="visible" class="muted"></p><section>${rows.map(r=>`<article class="${r.status}" data-status="${r.status}"><h3>${esc(r.title)}</h3><p class="tag">${esc(names[r.status]||'尚未檢查')} ${r.code?`· HTTP ${r.code}`:''}</p><p>${esc(r.reason)}</p><p>${/^https?:/i.test(r.url)?`<a href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">${esc(r.url)}</a>`:esc(r.url)}</p>${r.redirected?`<p class="muted">最終網址：${esc(r.finalUrl)}</p>`:''}<p class="muted">原始資料夾：${esc(r.folder||'未分類')}${r.method?` · ${esc(r.method)}`:''}</p>${r.error?`<p class="muted">${esc(r.error)}</p>`:''}</article>`).join('')}</section></main><script>let filter='all';const input=document.querySelector('#search'),cards=[...document.querySelectorAll('article')];function update(){let n=0;for(const c of cards){c.hidden=!((filter==='all'||c.dataset.status===filter)&&c.textContent.toLowerCase().includes(input.value.trim().toLowerCase()));if(!c.hidden)n++;}document.querySelector('#visible').textContent='顯示 '+n+' 筆';}for(const b of document.querySelectorAll('[data-filter]'))b.addEventListener('click',()=>{filter=b.dataset.filter;for(const x of document.querySelectorAll('[data-filter]'))x.setAttribute('aria-pressed',String(x===b));update();});input.addEventListener('input',update);update();</script></html>`);return counts;}
// 命令列執行時啟動固定數量的檢查迴圈，定期保存進度，全部完成後輸出最終報告。
(async()=>{console.log(JSON.stringify({total:entries.length,unique:unique.length}));let cursor=0;await Promise.all(Array.from({length:16},async()=>{while(cursor<unique.length){const url=unique[cursor++];results.set(url,await check(url));if(results.size%25===0){save();console.log('Checked '+results.size+'/'+unique.length);}}}));console.log(JSON.stringify(save(true)));})().catch(e=>{console.error(e);process.exitCode=1;});
