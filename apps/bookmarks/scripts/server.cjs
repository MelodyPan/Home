// 本機 HTTP 服務：僅開放指定資源與 API，書籤存檔與背景檢查共用寫入佇列。
const http=require('node:http');
const fs=require('node:fs/promises');
const path=require('node:path');
const {createHash,randomUUID}=require('node:crypto');
const {mergeLibrary}=require('../Javascript/bookmark-core.js');
const {checkUrl,runUrlChecks,applyCheckResults}=require('./url-checker.cjs');
const {readDataFile,createDataFile}=require('../Javascript/bookmark-file.js');
const {getServerVersion}=require('./server-version.cjs');
const {withDataLock}=require('../../shared/scripts/data-lock.cjs');
const revision=text=>'"'+createHash('sha256').update(text).digest('hex')+'"';
// root 與檢查函式可由測試注入，讓測試使用暫存資料，不碰正式書籤或遠端網站。
function createBookmarkServer(root=path.resolve(__dirname,'..'),options={}){
 const version=options.version||getServerVersion();
 const basePath=options.basePath||'',dataRoot=options.dataRoot||root;
 const dataPath=path.join(dataRoot,'assets','bookmarks-data.txt');let writes=Promise.resolve(),stopping=false;
 let checkJob={id:null,state:'idle',checked:0,total:0},checkTask=Promise.resolve(),checkController;
 // 先驗證新快照、備份舊檔，再以暫存檔替換正式檔，降低直接覆寫時留下半份資料的風險。
 async function writeSnapshot(previous,loaded){const text=JSON.stringify(createDataFile(loaded.baseEntries,loaded.changes,loaded.favorites,loaded.checkedAt),null,2)+'\n';readDataFile(text);await fs.writeFile(dataPath+'.bak',previous,'utf8');await fs.writeFile(dataPath+'.tmp',text,'utf8');await fs.rename(dataPath+'.tmp',dataPath);return revision(text);}
 const server=http.createServer(async(req,res)=>{
  const send=(code,body,type='application/json; charset=utf-8',headers={})=>{if(basePath&&headers.Location?.startsWith('/')&&!headers.Location.startsWith(basePath+'/'))headers={...headers,Location:basePath+headers.Location};res.writeHead(code,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers});res.end(body);};
  const host='127.0.0.1:'+req.socket.localPort;
  // 僅接受本機主機名稱；寫入路由另驗證同來源與 JSON 類型。
  if(req.headers.host!==host){send(403,'{"error":"Invalid host"}');return;}
  try{
   // 子系統掛載時只處理自己的網址；Home 首頁由外層提供，私人資料根目錄與公開程式分開。
   if(basePath&&!['/api/health','/api/shutdown'].includes(req.url)){
    if(req.url===basePath){send(302,'','text/html; charset=utf-8',{Location:basePath+'/'});return;}
    if(req.url.startsWith(basePath+'/'))req.url=req.url.slice(basePath.length);
    else{if(options.serveRoot)await options.serveRoot(req,res,{stopping});else send(404,'{"error":"Not found"}');return;}
   }
   if(req.method==='GET'&&req.url==='/Javascript/site-config.js'){
    send(200,'window.BookmarksConfig='+JSON.stringify(options.runtimeConfig||{mode:'local'})+';','application/javascript; charset=utf-8');return;
   }
   if(req.method==='GET'&&req.url==='/Javascript/app-runtime.js'){send(200,await fs.readFile(path.join(__dirname,'../../shared/Javascript/app-runtime.js')),'application/javascript; charset=utf-8');return;}
   if(req.method==='GET'&&req.url==='/src/cozy-theme.css'){send(200,await fs.readFile(path.join(__dirname,'../../shared/src/cozy-theme.css')),'text/css; charset=utf-8');return;}
   if(req.method==='GET'&&req.url==='/api/health'){send(200,JSON.stringify({app:'melody-pan-bookmarks',workspace:path.resolve(root),version,stopping}));return;}
   // 單站除錯同樣使用 Home Logo，只允許此固定圖片，不開放其他上層檔案。
   if(!basePath&&req.method==='GET'&&req.url==='/images/logo.png'){send(200,await fs.readFile(path.resolve(__dirname,'../../../images/logo.png')),'image/png');return;}
   if(req.method==='GET'&&['/Javascript/bookmark-core.js','/Javascript/bookmark-file.js','/Javascript/home.js'].includes(req.url)){send(200,await fs.readFile(path.join(root,req.url.slice(1))),'application/javascript; charset=utf-8');return;}
   // 新書籤入口統一讀取 bookmarks.html；舊網址轉址，避免既有瀏覽器書籤失效。
   if(req.method==='GET'&&['/','/index.html'].includes(req.url)){send(302,'','text/html; charset=utf-8',{Location:'/bookmarks.html'});return;}
   if(req.method==='GET'&&req.url==='/bookmarks.html'){send(200,await fs.readFile(path.join(root,'bookmarks.html')),'text/html; charset=utf-8');return;}
   if(req.method==='GET'&&req.url==='/assets/bookmarks-data.txt'){const text=await fs.readFile(dataPath,'utf8');readDataFile(text);send(200,text,'text/plain; charset=utf-8',{'ETag':revision(text)});return;}
   if(req.method==='GET'&&req.url==='/api/url-check'){send(200,JSON.stringify(checkJob));return;}
   // 檢查以背景工作回覆 202，前端另外輪詢進度；讀取前先等待已接受的存檔完成。
   if(req.method==='POST'&&req.url==='/api/url-check'){
    if(req.headers.origin!=='http://'+host||!/^application\/json(?:;|$)/i.test(req.headers['content-type']||'')){send(403,'{"error":"Invalid origin or content type"}');return;}
    if(stopping){send(503,'{"error":"服務正在停止。"}');return;}
    if(checkJob.state==='running'){send(409,'{"error":"網址檢查已在進行中。"}');return;}
    await writes;const previous=await fs.readFile(dataPath,'utf8');
    if(req.headers['if-match']!==revision(previous)){send(409,'{"error":"書籤資料已更新，請重新整理後再檢查。"}');return;}
    if(checkJob.state==='running'){send(409,'{"error":"網址檢查已在進行中。"}');return;}
    if(stopping){send(503,'{"error":"服務正在停止。"}');return;}
    const loaded=readDataFile(previous),controller=new AbortController();checkController=controller;
    const job={id:randomUUID(),state:'running',checked:0,total:new Set(mergeLibrary(loaded.baseEntries,loaded.changes).map(e=>e.url)).size,startedAt:new Date().toISOString(),completedAt:null,error:''};checkJob=job;
    checkTask=(async()=>{
     const results=await runUrlChecks(mergeLibrary(loaded.baseEntries,loaded.changes),{check:options.checkUrl||checkUrl,signal:controller.signal,onProgress:value=>Object.assign(job,value)});
     controller.signal.throwIfAborted();const completedAt=new Date().toISOString();
     // 檢查結果寫回時重新讀取最新資料，保留檢查期間其他視窗的異動。
     const task=writes.then(()=>withDataLock(dataPath,async()=>{controller.signal.throwIfAborted();const latest=await fs.readFile(dataPath,'utf8');const updated=applyCheckResults(readDataFile(latest),results,completedAt);return writeSnapshot(latest,updated);}));writes=task.catch(()=>{});
     job.revision=await task;job.completedAt=completedAt;job.state='completed';
    })().catch(error=>{job.state=controller.signal.aborted?'cancelled':'failed';job.error=controller.signal.aborted?'服務停止，檢查已取消；最後完成時間未變更。':error.message;});
    send(202,JSON.stringify(job));return;
   }
   // 取消檢查並等待兩種資料的寫入完成，送出停止回應後才關閉監聽。
   if(req.method==='POST'&&req.url==='/api/shutdown'){
    if(req.headers.origin!=='http://'+host||!/^application\/json(?:;|$)/i.test(req.headers['content-type']||'')){send(403,'{"error":"Invalid origin or content type"}');return;}
    if(stopping){send(503,'{"error":"服務正在停止。"}');return;}
    // 先取消網址檢查並等待書籤與相簿已排隊的寫入，再關閉本機服務。
    stopping=true;checkController?.abort(new Error('服務停止'));await checkTask;await writes;await options.flush?.();
    res.once('finish',()=>{server.close();server.closeIdleConnections();});send(200,'{"stopped":true}');return;
   }
   // 接收完整快照並限制大小；版本檢查放在佇列內，避免兩筆並行寫入都通過舊版本。
   if(req.method==='PUT'&&req.url==='/api/bookmarks'){
    if(stopping){send(503,'{"error":"服務正在停止，請重新啟動後再儲存。"}');return;}
    if(req.headers.origin!=='http://'+host||!/^application\/json(?:;|$)/i.test(req.headers['content-type']||'')){send(403,'{"error":"Invalid origin or content type"}');return;}
    let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>5*1024*1024){send(413,'{"error":"File too large"}');return;}}
    if(stopping){send(503,'{"error":"服務正在停止，請重新啟動後再儲存。"}');return;}
    let loaded;try{loaded=readDataFile(body);}catch{send(400,'{"error":"Invalid bookmark data"}');return;}
    const task=writes.then(()=>withDataLock(dataPath,async()=>{
     const previous=await fs.readFile(dataPath,'utf8');
     if(req.headers['if-match']!==revision(previous)){send(409,'{"error":"資料檔已被其他視窗或程式修改，請重新整理後再操作。"}');return;}
     send(200,JSON.stringify({revision:await writeSnapshot(previous,loaded)}));
    }));writes=task.catch(()=>{});await task;return;
   }
   if(await options.handleAdditional?.(req,res,{stopping}))return;
   send(404,'{"error":"Not found"}');
  }catch(error){console.error(error.message);if(!res.headersSent)send(error.status||500,JSON.stringify({error:error.status?error.message:'無法讀寫書籤資料檔，請檢查檔案與資料夾權限。'}));else res.end();}
 });
 return server;
}
if(require.main===module){const server=createBookmarkServer();server.on('error',e=>{console.error(e.message);process.exitCode=1;});server.listen(4178,'127.0.0.1',()=>console.log('Bookmarks: http://127.0.0.1:4178/bookmarks.html'));}
module.exports={createBookmarkServer};
