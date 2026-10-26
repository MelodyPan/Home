// Home 與子系統共用一個本機服務；公開程式在 apps，私人資料位置由被 Git 忽略的設定決定。
const fs=require('node:fs/promises'),path=require('node:path');
const {createHash}=require('node:crypto');
async function getHomeVersion(homeRoot,appRoot=path.join(homeRoot,'apps/bookmarks')){
 const {getServerVersion}=require(path.join(appRoot,'scripts/server-version.cjs'));const hash=createHash('sha256').update(getServerVersion());
 for(const file of ['scripts/home-site-server.cjs','apps/growth/scripts/server.cjs','apps/growth/scripts/growth-store.cjs','apps/admin/server/handler.cjs','apps/admin/server/auth.cjs','apps/admin/server/config.cjs','apps/admin/server/store.cjs','apps/admin/server/public-config.cjs','apps/admin/public/project-model.js','apps/admin/projects.seed.json','portfolio.config.json','bookmarks.config.json','.home-portfolio.json','.home-local.json'])try{hash.update(await fs.readFile(path.join(homeRoot,file)));}catch(e){if(e.code!=='ENOENT')throw e;}
 for(const key of ['GOOGLE_CLIENT_ID','ADMIN_GOOGLE_SUBS','ADMIN_EMAILS','PUBLIC_ORIGIN','PROJECTS_BUCKET','PROJECTS_OBJECT','PORTFOLIO_API_BASE','BOOKMARKS_GOOGLE_CLIENT_ID'])hash.update(process.env[key]||'');
 return hash.digest('hex');
}
async function createHomeServer(homeRoot,options={}){
 homeRoot=path.resolve(homeRoot);const appRoot=options.appRoot||path.join(homeRoot,'apps/bookmarks');
 let config={};try{config=JSON.parse(await fs.readFile(path.join(homeRoot,'.home-local.json'),'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
 const dataRoot=options.dataRoot||path.resolve(homeRoot,config.bookmarksDataRoot||'data/bookmarks');
 // 缺省沿用原資料位置，因此拆站不需要搬移孩子紀錄或照片。
 const growthRoot=options.growthRoot||path.join(homeRoot,'apps/growth');
 const {createGrowthHandler}=require(path.join(growthRoot,'scripts/server.cjs'));
 const growth=createGrowthHandler(growthRoot,{basePath:'/growth',dataRoot:options.growthDataRoot||(config.growthDataRoot?path.resolve(homeRoot,config.growthDataRoot):dataRoot),runtimeConfig:{mode:'local',homeUrl:'../index.html'}});
 const {createBookmarkServer}=require(path.join(appRoot,'scripts/server.cjs'));
 const {createAdminHandler}=require(path.join(homeRoot,'apps/admin/server/handler.cjs'));
 const portfolio=await createAdminHandler({root:homeRoot,...options.portfolio,canShutdown:true});
 return createBookmarkServer(appRoot,{homeRoot,version:await getHomeVersion(homeRoot,appRoot),basePath:'/bookmarks',flush:growth.flush,handleAdditional:legacyGrowth,serveRoot:async(req,res,state)=>{
  if(await growth.handle(req,res,state))return;
  if(await portfolio(req,res))return;
  const send=(code,body,type='text/html; charset=utf-8')=>{res.writeHead(code,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(body);};
  if(req.method!=='GET'){send(404,'Not found');return;}
  let pathname;try{pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);}catch{send(404,'Not found');return;}
  let file,type='text/html; charset=utf-8';
  // 作品頁各自放在 apps，僅提供明確列出的頁面與圖示，舊網址保留轉址。
  const sites=[['cathflow','cathflow.html'],['dynasty-explorer','DynastyExplorer.html']];
  for(const [site,entry] of sites){
   if(pathname==='/'+entry){res.writeHead(302,{Location:`/${site}/${entry}`,'Cache-Control':'no-store'});res.end();return;}
   if([`/${site}`,`/${site}/`,`/${site}/index.html`,`/${site}/${entry}`].includes(pathname)){file=path.join(homeRoot,'apps',site,entry);break;}
  }
  if(file){/* 子網站入口已由上方白名單選定。 */}
  else if(pathname==='/dynasty-explorer/images/logo.png'){file=path.join(homeRoot,'apps/dynasty-explorer/images/logo.png');type='image/png';}
  else if(['/', '/index.html'].includes(pathname))file=path.join(homeRoot,pathname==='/'?'index.html':pathname.slice(1));
  else if(pathname.startsWith('/images/')){
   const imageRoot=path.join(homeRoot,'images'),candidate=path.resolve(homeRoot,'.'+pathname),types={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.svg':'image/svg+xml','.ico':'image/x-icon','.avif':'image/avif'};
   if(!candidate.startsWith(imageRoot+path.sep)||!types[path.extname(candidate).toLowerCase()]){send(404,'Not found');return;}
   try{const actual=await fs.realpath(candidate),actualRoot=await fs.realpath(imageRoot);if(!actual.startsWith(actualRoot+path.sep)){send(404,'Not found');return;}}catch{send(404,'Not found');return;}
   file=candidate;type=types[path.extname(file).toLowerCase()];
  }else{send(404,'Not found');return;}
  try{send(200,await fs.readFile(file),type);}catch(error){if(error.code!=='ENOENT')throw error;send(404,'Not found');}
 }});
 // 舊書籤中的相簿網址仍能使用；API／照片保留 HTTP 方法與請求內容。
 function legacyGrowth(req,res){
  const url=new URL(req.url,'http://127.0.0.1');
  let target,status=307;
  if(url.pathname==='/growth.html'){target='/growth/growth.html';status=302;}
  else if(url.pathname==='/api/growth'||url.pathname.startsWith('/api/growth/')||url.pathname.startsWith('/assets/growth-photos/'))target='/growth'+url.pathname;
  if(!target)return false;
  res.writeHead(status,{Location:target+url.search,'Cache-Control':'no-store'});res.end();return true;
 }
}
if(require.main===module)createHomeServer(path.resolve(__dirname,'..')).then(server=>{server.on('error',error=>{console.error(error.message);process.exitCode=1;});server.listen(4179,'127.0.0.1',()=>console.log('Home: http://127.0.0.1:4179/'));}).catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={createHomeServer,getHomeVersion};
