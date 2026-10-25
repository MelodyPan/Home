// 成長相簿只處理自己的靜態資源、API 與照片；Home 可掛載這個處理器，共用一個連接埠。
const http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path');
const {createGrowthStore}=require('./growth-store.cjs');
const STATIC={
 '/growth.html':['growth.html','text/html'],
 '/Javascript/growth.js':['Javascript/growth.js','application/javascript'],
 '/Javascript/growth-flipbook.js':['Javascript/growth-flipbook.js','application/javascript'],
 '/Javascript/growth-metrics.js':['Javascript/growth-metrics.js','application/javascript'],
 '/Javascript/growth-reference.js':['Javascript/growth-reference.js','application/javascript'],
 '/src/growth.css':['src/growth.css','text/css'],
 '/src/growth-flipbook.css':['src/growth-flipbook.css','text/css'],
 '/src/growth-metrics.css':['src/growth-metrics.css','text/css']
};
function createGrowthHandler(root=path.resolve(__dirname,'..'),options={}){
 const store=createGrowthStore(options.dataRoot||root),basePath=options.basePath||'';
 const sharedRoot=options.sharedRoot||path.resolve(__dirname,'../../shared');
 async function handle(req,res,{stopping=false}={}){
  const send=(status,body,type='application/json',headers={})=>{res.writeHead(status,{'Content-Type':type+'; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers});res.end(body);};
  const original=req.url;
  const pathname=new URL(req.url,'http://127.0.0.1').pathname;
  if(basePath&&pathname!==basePath&&!pathname.startsWith(basePath+'/'))return false;
  if(req.headers.host!=='127.0.0.1:'+req.socket.localPort){send(403,'{"error":"Invalid host"}');return true;}
  req.url=basePath?pathname.slice(basePath.length)||'/':pathname;
  try{
   if(req.method==='GET'&&['/','/index.html'].includes(req.url)){send(302,'','text/html',{Location:basePath+'/growth.html'});return true;}
   if(req.method==='GET'&&req.url==='/Javascript/site-config.js'){send(200,'window.BookmarksConfig='+JSON.stringify(options.runtimeConfig||{mode:'local'})+';','application/javascript');return true;}
   const shared={'/Javascript/app-runtime.js':['Javascript/app-runtime.js','application/javascript'],'/src/cozy-theme.css':['src/cozy-theme.css','text/css']};
   const resource=STATIC[req.url]||shared[req.url];
   if(req.method==='GET'&&resource){send(200,await fs.readFile(path.join(shared[req.url]?sharedRoot:root,resource[0])),resource[1]);return true;}
   if(await store.handle(req,res,{stopping}))return true;
   if(basePath){send(404,'{"error":"Not found"}');return true;}
   return false;
  }catch(error){
   if(!res.headersSent)send(error.status||500,JSON.stringify({error:error.status?error.message:'無法讀寫成長相簿，請檢查檔案與資料夾權限。'}));else res.end();
   return true;
  }finally{req.url=original;}
 }
 return {handle,flush:()=>store.flush()};
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
