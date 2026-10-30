// 成長相簿只提供公開靜態資源；私人相簿與照片由瀏覽器直接存取 Google Drive。
const http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path');
const {loadDriveConfig}=require('../../bookmarks/scripts/drive-config.cjs');
const STATIC={
 '/growth.html':['growth.html','text/html'],
 '/Javascript/growth.js':['Javascript/growth.js','application/javascript'],
 '/Javascript/growth-flipbook.js':['Javascript/growth-flipbook.js','application/javascript'],
 '/Javascript/growth-metrics.js':['Javascript/growth-metrics.js','application/javascript'],
 '/Javascript/growth-reference.js':['Javascript/growth-reference.js','application/javascript'],
 '/Javascript/growth-data.js':['Javascript/growth-data.js','application/javascript'],
 '/Javascript/growth-drive.js':['Javascript/growth-drive.js','application/javascript'],
 '/Javascript/growth-cloud-ui.js':['Javascript/growth-cloud-ui.js','application/javascript'],
 '/Javascript/growth-backup.js':['Javascript/growth-backup.js','application/javascript'],
 '/src/growth.css':['src/growth.css','text/css'],
 '/src/growth-flipbook.css':['src/growth-flipbook.css','text/css'],
 '/src/growth-metrics.css':['src/growth-metrics.css','text/css']
};
function createGrowthHandler(root=path.resolve(__dirname,'..'),options={}){
 const basePath=options.basePath||'';
 const sharedRoot=options.sharedRoot||path.resolve(__dirname,'../../shared');
 const bookmarkRoot=options.bookmarkRoot||path.resolve(__dirname,'../../bookmarks');
 const reused={'/Javascript/bookmark-cloud.js':['Javascript/bookmark-cloud.js','application/javascript'],'/Javascript/bookmark-login.js':['Javascript/bookmark-login.js','application/javascript']};
 async function handle(req,res,{stopping=false}={}){
  const send=(status,body,type='application/json',headers={})=>{res.writeHead(status,{'Content-Type':type+'; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers});res.end(body);};
  const original=req.url;
  const pathname=new URL(req.url,'http://127.0.0.1').pathname;
  if(basePath&&pathname!==basePath&&!pathname.startsWith(basePath+'/'))return false;
  if(req.headers.host!=='127.0.0.1:'+req.socket.localPort){send(403,'{"error":"Invalid host"}');return true;}
  req.url=basePath?pathname.slice(basePath.length)||'/':pathname;
  try{
   if(req.method==='GET'&&['/','/index.html'].includes(req.url)){send(302,'','text/html',{Location:basePath+'/growth.html'});return true;}
   if(req.method==='GET'&&req.url==='/Javascript/site-config.js'){const config=options.runtimeConfig||{...await loadDriveConfig(options.homeRoot||path.resolve(__dirname,'../../..')),homeUrl:'../index.html'};send(200,'window.BookmarksConfig='+JSON.stringify(config)+';','application/javascript');return true;}
   // Home 掛載時由外層供應圖片；單站除錯也只開放這張共用 Logo。
   if(!basePath&&req.method==='GET'&&req.url==='/images/logo.png'){send(200,await fs.readFile(path.resolve(__dirname,'../../../images/logo.png')),'image/png');return true;}
   const shared={'/Javascript/app-runtime.js':['Javascript/app-runtime.js','application/javascript'],'/src/cozy-theme.css':['src/cozy-theme.css','text/css']};
   const resource=STATIC[req.url]||shared[req.url]||reused[req.url];
   if(req.method==='GET'&&resource){send(200,await fs.readFile(path.join(shared[req.url]?sharedRoot:reused[req.url]?bookmarkRoot:root,resource[0])),resource[1]);return true;}
   if(basePath){send(404,'{"error":"Not found"}');return true;}
   return false;
  }catch(error){
   if(!res.headersSent)send(error.code==='ENOENT'?404:error.status||500,JSON.stringify({error:error.status?error.message:'無法載入成長相簿公開資源。'}));else res.end();
   return true;
  }finally{req.url=original;}
 }
 return {handle,flush:async()=>{}};
}

// 獨立服務供相簿測試及單站使用；正式 Home 由外層服務負責統一停止。
function createGrowthServer(root=path.resolve(__dirname,'..'),options={}){
 const growth=createGrowthHandler(root,options);let stopping=false;
 const server=http.createServer(async(req,res)=>{
  if(req.url==='/api/shutdown'&&req.method==='POST'){
   const origin='http://127.0.0.1:'+req.socket.localPort;
   if(req.headers.host!==origin.slice(7)||req.headers.origin!==origin||!/^application\/json(?:;|$)/i.test(req.headers['content-type']||'')){res.writeHead(403);res.end();return;}
   stopping=true;await growth.flush();res.once('finish',()=>{server.close();server.closeIdleConnections();});res.writeHead(200,{'Content-Type':'application/json'});res.end('{"stopped":true}');return;
  }
  if(!await growth.handle(req,res,{stopping})){res.writeHead(404);res.end('{"error":"Not found"}');}
 });
 return server;
}
module.exports={createGrowthHandler,createGrowthServer};
