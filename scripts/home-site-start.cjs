// Home 統一啟動入口：由根目錄 start-home.cmd 或 npm start 呼叫，不終止其他網站的程序。
const path=require('node:path'),{spawn}=require('node:child_process');
// 僅沿用或重啟身分、專案路徑均符合的服務；保留既有健康檢查格式，兼容已啟動的 Home。
async function ensureHomeServer({url,root,version,request=(address,options={})=>fetch(address,{...options,signal:AbortSignal.timeout(3000)}),launch,delay=()=>new Promise(r=>setTimeout(r,200))}){
 const port=new URL(url).port;
 async function probe(){let response;try{response=await request(url+'/api/health');}catch{return null;}if(!response.ok)throw new Error('目前執行的是舊版服務。請先停止舊服務，再執行 start-home.cmd。');const data=await response.json();if(data.app!=='melody-pan-bookmarks'||data.workspace!==root)throw new Error(port+' 埠由另一個程式或另一份 Home 專案使用，未停止該程式。');return data;}
 let current=await probe();
 if(current&&current.version===version&&!current.stopping)return;
 if(current){
  if(!current.stopping){const stopped=await request(url+'/api/shutdown',{method:'POST',headers:{Origin:url,'Content-Type':'application/json'},body:'{}'});if(!stopped.ok||(await stopped.json()).stopped!==true)throw new Error('無法關閉舊版本機服務，請先停止舊服務。');}
  for(let i=0;i<40;i++){current=await probe();if(!current)break;await delay();}
  if(current)throw new Error('舊服務仍在停止中，請稍後再執行 start-home.cmd。');
 }
 // 背景啟動後等待新版就緒，避免過早開啟網頁。
 launch();
 for(let i=0;i<40;i++){current=await probe();if(current&&current.version===version&&!current.stopping)return;await delay();}
 throw new Error('無法啟動 Home，請檢查 '+port+' 埠並重新執行 start-home.cmd。');
}
async function main(){
 const root=path.resolve(__dirname,'..'),app=path.join(root,'apps/bookmarks'),url='http://127.0.0.1:4179';
 const {getHomeVersion}=require('./home-site-server.cjs');
 await ensureHomeServer({url,root:app,version:await getHomeVersion(root,app),launch(){const child=spawn(process.execPath,[path.join(root,'scripts/home-site-server.cjs')],{cwd:root,detached:true,stdio:'ignore',windowsHide:true});child.unref();}});
 if(!process.argv.includes('--no-browser')){const browser=spawn('powershell.exe',['-NoProfile','-Command',"Start-Process 'http://127.0.0.1:4179/'"],{windowsHide:true,stdio:'ignore'});browser.on('error',error=>{console.error(error.message);process.exitCode=1;});}
}
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={main,ensureHomeServer};
