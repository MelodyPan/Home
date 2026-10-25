// 一鍵啟動入口：確認服務身分與版本，再開啟瀏覽器；不依程序名稱任意終止其他程式。
const {spawn}=require('node:child_process');
const path=require('node:path');
const {getServerVersion}=require('./server-version.cjs');
const url='http://127.0.0.1:4178';
// 身分、專案路徑及版本都符合時沿用；僅透過已確認的同專案服務 API 停止舊版。
async function ensureBookmarkServer({url,root,version,request=(address,options={})=>fetch(address,{...options,signal:AbortSignal.timeout(3000)}),launch,delay=()=>new Promise(r=>setTimeout(r,200))}){
 async function probe(){let response;try{response=await request(url+'/api/health');}catch{return null;}if(!response.ok)throw new Error('目前執行的是舊版服務。請先停止舊服務，再執行 start-bookmarks.cmd。');const data=await response.json();if(data.app!=='melody-pan-bookmarks'||data.workspace!==root)throw new Error('4178 埠由另一個程式或另一份書籤網站使用，未停止該程式。');return data;}
 let current=await probe();
 if(current&&current.version===version&&!current.stopping)return;
 if(current){
  if(!current.stopping){const stopped=await request(url+'/api/shutdown',{method:'POST',headers:{Origin:url,'Content-Type':'application/json'},body:'{}'});if(!stopped.ok||(await stopped.json()).stopped!==true)throw new Error('無法關閉舊版本機服務，請先停止舊服務。');}
  for(let i=0;i<40;i++){current=await probe();if(!current)break;await delay();}
  if(current)throw new Error('舊服務仍在停止中，請稍後再執行啟動檔。');
 }
 // 啟動是非同步的，因此輪詢健康檢查，確認新版就緒後才繼續。
 launch();
 for(let i=0;i<40;i++){current=await probe();if(current&&current.version===version&&!current.stopping)return;await delay();}
 throw new Error('Cannot start Bookmarks. Check port 4178.');
}
// 服務使用背景程序執行；檔案被測試 require 時不會自動啟動或開啟瀏覽器。
async function main(){
 await ensureBookmarkServer({url,root:path.resolve(__dirname,'..'),version:getServerVersion(),launch(){const child=spawn(process.execPath,[path.join(__dirname,'server.cjs')],{cwd:path.resolve(__dirname,'..'),detached:true,stdio:'ignore',windowsHide:true});child.unref();}});
 const browser=spawn('powershell.exe',['-NoProfile','-Command',"Start-Process 'http://127.0.0.1:4178/bookmarks.html'"],{windowsHide:true,stdio:'ignore'});browser.on('error',error=>{console.error(error.message);process.exitCode=1;});
}
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={ensureBookmarkServer};
