// 雲端只提供公開產物及作品管理 API，不掛載本機書籤／相簿存檔服務。
const http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path');
const {createAdminHandler}=require('../apps/admin/server/handler.cjs');
const {loadConfig}=require('../apps/admin/server/config.cjs');
async function createPortfolioServer(root=path.resolve(__dirname,'..'),options={}){
 const config=options.config||await loadConfig(root);
 if(options.production&&(!config.googleClientId||!config.storageBucket||!(config.adminSubjects.length||config.adminEmails.length)||!config.publicOrigin.startsWith('https://')))throw new Error('雲端啟動需要 Google Client ID、管理員、HTTPS 網址與私人 Storage bucket。');
 const handler=await createAdminHandler({root,config,...options.admin}),dist=path.join(root,'dist');
 return http.createServer(async(req,res)=>{
  try{
   if(await handler(req,res))return;
   if(req.method==='GET'&&req.url==='/healthz'){res.writeHead(200,{'Content-Type':'text/plain'});res.end('ok');return;}
   if(req.method!=='GET'){res.writeHead(404);res.end();return;}
   const pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
   if(pathname.split('/').some(segment=>segment.startsWith('.'))||pathname.startsWith('/api/')){res.writeHead(404);res.end();return;}
   let file=path.resolve(dist,'.'+pathname);if(file!==dist&&!file.startsWith(dist+path.sep)){res.writeHead(404);res.end();return;}
   if((await fs.stat(file)).isDirectory())file=path.join(file,'index.html');
   const real=await fs.realpath(file),realRoot=await fs.realpath(dist);if(!real.startsWith(realRoot+path.sep)){res.writeHead(404);res.end();return;}
   const type={'.html':'text/html','.css':'text/css','.js':'application/javascript','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.ico':'image/x-icon','.avif':'image/avif','.gif':'image/gif'}[path.extname(real)];
   if(!type){res.writeHead(404);res.end();return;}res.writeHead(200,{'Content-Type':type+'; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(await fs.readFile(real));
  }catch{if(!res.headersSent)res.writeHead(404);res.end();}
 });
}
if(require.main===module)createPortfolioServer(path.resolve(__dirname,'..'),{production:true}).then(server=>server.listen(Number(process.env.PORT)||8080,'0.0.0.0',()=>console.log('Home portfolio ready'))).catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={createPortfolioServer};
