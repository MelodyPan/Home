// Local development serves public bookmark assets only; bookmark data lives in Drive.
const http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path');
const {getServerVersion}=require('./server-version.cjs');
const {loadDriveConfig}=require('./drive-config.cjs');
const {createUrlCheckApi}=require('./url-check-api.cjs');
function createBookmarkServer(root=path.resolve(__dirname,'..'),options={}){
 const version=options.version||getServerVersion(),basePath=options.basePath||'';let stopping=false;
 const checks=createUrlCheckApi({check:options.checkUrl});
 const assets=['bookmark-core.js','bookmark-file.js','bookmark-drive.js','bookmark-cloud.js','bookmark-login.js','bookmark-cache.js','bookmark-drive-ui.js','bookmark-check.js','bookmark-quick.js','home.js'].map(name=>'/Javascript/'+name);
 const server=http.createServer(async(req,res)=>{
  const send=(code,body,type='application/json; charset=utf-8',headers={})=>{
   if(basePath&&headers.Location?.startsWith('/')&&!headers.Location.startsWith(basePath+'/'))headers={...headers,Location:basePath+headers.Location};
   res.writeHead(code,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers});res.end(body);
  };
  const host='127.0.0.1:'+req.socket.localPort;if(req.headers.host!==host){send(403,'{"error":"Invalid host"}');return;}
  try{
   if(basePath&&!['/api/health','/api/shutdown'].includes(req.url)){
    if(req.url===basePath){send(302,'','text/html; charset=utf-8',{Location:basePath+'/'});return;}
    if(req.url.startsWith(basePath+'/'))req.url=req.url.slice(basePath.length);
    else{if(options.serveRoot)await options.serveRoot(req,res,{stopping});else send(404,'{"error":"Not found"}');return;}
   }
   if(req.method==='GET'&&req.url==='/api/health'){send(200,JSON.stringify({app:'melody-pan-bookmarks',workspace:path.resolve(root),version,stopping}));return;}
   if(req.url==='/api/url-check'){await checks(req,res,{origin:'http://'+host,stopping});return;}
   if(req.method==='POST'&&req.url==='/api/shutdown'){
    if(req.headers.origin!=='http://'+host||!/^application\/json(?:;|$)/i.test(req.headers['content-type']||'')){send(403,'{"error":"Invalid origin or content type"}');return;}
    if(stopping){send(503,'{"error":"服務正在停止。"}');return;}
    stopping=true;await options.flush?.();res.once('finish',()=>{server.close();server.closeIdleConnections();});send(200,'{"stopped":true}');return;
   }
   if(req.method==='GET'&&req.url==='/Javascript/site-config.js'){
    const config={...await loadDriveConfig(options.homeRoot||path.resolve(__dirname,'../../..')),urlCheckAvailable:true};
    send(200,'window.BookmarksConfig='+JSON.stringify(config)+';','application/javascript; charset=utf-8');return;
   }
   if(req.method==='GET'&&req.url==='/Javascript/app-runtime.js'){send(200,await fs.readFile(path.join(__dirname,'../../shared/Javascript/app-runtime.js')),'application/javascript; charset=utf-8');return;}
   if(req.method==='GET'&&req.url==='/src/cozy-theme.css'){send(200,await fs.readFile(path.join(__dirname,'../../shared/src/cozy-theme.css')),'text/css; charset=utf-8');return;}
   if(!basePath&&req.method==='GET'&&req.url==='/images/logo.png'){send(200,await fs.readFile(path.resolve(__dirname,'../../../images/logo.png')),'image/png');return;}
   const iconTypes={'/images/icons/chatgpt.ico':'image/x-icon','/images/icons/gemini.png':'image/png'};
   if(req.method==='GET'&&Object.hasOwn(iconTypes,req.url)){send(200,await fs.readFile(path.join(root,req.url.slice(1))),iconTypes[req.url]);return;}
   if(req.method==='GET'&&assets.includes(req.url)){send(200,await fs.readFile(path.join(root,req.url.slice(1))),'application/javascript; charset=utf-8');return;}
   if(req.method==='GET'&&['/','/index.html'].includes(req.url)){send(302,'','text/html; charset=utf-8',{Location:'/bookmarks.html'});return;}
   if(req.method==='GET'&&req.url==='/bookmarks.html'){send(200,await fs.readFile(path.join(root,'bookmarks.html')),'text/html; charset=utf-8');return;}
   if(await options.handleAdditional?.(req,res,{stopping}))return;
   send(404,'{"error":"Not found"}');
  }catch(error){console.error(error.message);if(!res.headersSent)send(500,'{"error":"無法載入網站資源或設定，請檢查服務紀錄。"}');else res.end();}
 });return server;
}
if(require.main===module){const server=createBookmarkServer();server.on('error',e=>{console.error(e.message);process.exitCode=1;});server.listen(4178,'127.0.0.1',()=>console.log('Bookmarks: http://127.0.0.1:4178/bookmarks.html'));}
module.exports={createBookmarkServer};
