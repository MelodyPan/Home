// Home 的公開建置：只複製白名單，從範本建立空白書籤頁，完全不讀取私人書籤／相簿資料。
const fs=require('node:fs/promises'),path=require('node:path');
const {publicDocument}=require('../apps/admin/public/project-model.js');
const BOOKMARK_JS=['bookmark-core.js','bookmark-file.js','bookmark-drive.js','bookmark-cloud.js','bookmark-login.js','bookmark-cache.js','bookmark-drive-ui.js','bookmark-check.js','bookmark-quick.js','home.js'];
const {loadDriveConfig}=require('../apps/bookmarks/scripts/drive-config.cjs');
const GROWTH_JS=['growth.js','growth-flipbook.js','growth-metrics.js','growth-reference.js'];
const GROWTH_CSS=['growth.css','growth-flipbook.css','growth-metrics.css'];
// The local source is ignored by Git; CI consumes this published-only snapshot.
async function loadPublicProjects(homeRoot){
 let raw;
 try{raw=await fs.readFile(path.join(homeRoot,'data/portfolio/projects.json'),'utf8');}
 catch(error){if(error.code!=='ENOENT')throw error;raw=await fs.readFile(path.join(homeRoot,'apps/admin/projects.public.json'),'utf8');}
 return publicDocument(JSON.parse(raw));
}
async function syncPublicProjects(homeRoot){
 let raw;
 try{raw=await fs.readFile(path.join(homeRoot,'data/portfolio/projects.json'),'utf8');}
 catch(error){if(error.code==='ENOENT')return false;throw error;}
 const projects=publicDocument(JSON.parse(raw)),snapshot=path.join(homeRoot,'apps/admin/projects.public.json');
 await fs.writeFile(snapshot,JSON.stringify(projects,null,2)+'\n');
 return true;
}
async function copyTree(source,destination){
 const stat=await fs.lstat(source);if(stat.isSymbolicLink())throw new Error('公開建置不跟隨符號連結：'+source);
 if(stat.isDirectory()){await fs.mkdir(destination,{recursive:true});for(const item of await fs.readdir(source)){if(/^(\.git|node_modules|\.home-local\.json)$|^\.env(?:\.|$)|\.tmp(?:\.|$)|\.bak$/.test(item))continue;await copyTree(path.join(source,item),path.join(destination,item));}}
 else{await fs.mkdir(path.dirname(destination),{recursive:true});await fs.copyFile(source,destination);}
}
async function emptyBookmarks(appRoot){
 let html=await fs.readFile(path.join(appRoot,'src/home.html'),'utf8');
 // Logo 使用相對網址連到 Home/images/logo.png，不再讀取或嵌入子網站的圖片副本。
 for(const [placeholder,content] of [['/* HOME_STYLES */',await fs.readFile(path.join(appRoot,'src/home.css'),'utf8')],['/* BOOKMARK_DATA */',JSON.stringify({entries:[],icons:{},checkedAt:'1970-01-01T00:00:00.000Z'})]])html=html.replace(placeholder,()=>content);
 return html;
}
async function buildSite(homeRoot,options={}){
 homeRoot=path.resolve(homeRoot);const appRoot=options.appRoot||path.join(homeRoot,'apps/bookmarks'),output=path.resolve(options.output||path.join(homeRoot,'dist'));
 const projects=await loadPublicProjects(homeRoot);
 const growthRoot=options.growthRoot||path.join(appRoot,'../growth'),sharedRoot=options.sharedRoot||path.join(appRoot,'../shared');
 // 只清理本工具自己產生的 Home/dist；先檢查絕對位置、目錄型態與標記，不刪除未知資料夾。
 if(output!==path.join(homeRoot,'dist'))throw new Error('公開產物必須位於 Home/dist。');
 let stat;try{stat=await fs.lstat(output);}catch(error){if(error.code!=='ENOENT')throw error;}
 if(stat){if(!stat.isDirectory()||stat.isSymbolicLink())throw new Error('dist 不是安全的建置目錄。');await fs.access(path.join(output,'.home-build.json'));await fs.rm(output,{recursive:true,force:true});}
 for(const site of ['bookmarks','growth']){
  await fs.mkdir(path.join(output,site,'Javascript'),{recursive:true});await fs.mkdir(path.join(output,site,'src'),{recursive:true});
  await fs.copyFile(path.join(sharedRoot,'Javascript/app-runtime.js'),path.join(output,site,'Javascript/app-runtime.js'));
  await fs.copyFile(path.join(sharedRoot,'src/cozy-theme.css'),path.join(output,site,'src/cozy-theme.css'));
  const config=site==='bookmarks'?await loadDriveConfig(homeRoot):{mode:'preview',homeUrl:'../index.html'};
  await fs.writeFile(path.join(output,site,'Javascript/site-config.js'),'window.BookmarksConfig='+JSON.stringify(config)+';\n');
 }
 // 公開首頁不列出私人的書籤與成長相簿入口；本機首頁維持原樣。
 const publicIndex=(await fs.readFile(path.join(homeRoot,'index.html'),'utf8')).replace(/[ \t]*<!-- BOOKMARKS_SUBSYSTEM -->\r?\n?/,'').replace(/[ \t]*<article class="project" id="(?:bookmarks|growth)-subsystem">[^]*?<\/article>\r?\n?/g,'');
 await fs.writeFile(path.join(output,'index.html'),publicIndex);
 await fs.mkdir(path.join(output,'portfolio'),{recursive:true});
 await fs.writeFile(path.join(output,'portfolio/projects.json'),JSON.stringify(projects));
 // 每個作品使用自己的公開目錄；保留根目錄的舊網址轉址，方便既有收藏繼續使用。
 for(const [site,entry,title] of [['cathflow','cathflow.html','CathFlow'],['dynasty-explorer','DynastyExplorer.html','DynastyExplorer']]){
  const source=path.join(appRoot,'..',site);
  await fs.mkdir(path.join(output,site),{recursive:true});
  await fs.copyFile(path.join(source,entry),path.join(output,site,entry));
  await fs.writeFile(path.join(output,site,'index.html'),redirectPage(entry,title));
  await fs.writeFile(path.join(output,entry),redirectPage(site+'/'+entry,title));
 }
 await fs.mkdir(path.join(output,'dynasty-explorer/images'),{recursive:true});
 await fs.copyFile(path.join(appRoot,'../dynasty-explorer/images/logo.png'),path.join(output,'dynasty-explorer/images/logo.png'));
 try{await copyTree(path.join(homeRoot,'images'),path.join(output,'images'));}catch(e){if(e.code!=='ENOENT')throw e;}
 await fs.writeFile(path.join(output,'bookmarks/bookmarks.html'),await emptyBookmarks(appRoot));
 await fs.copyFile(path.join(growthRoot,'growth.html'),path.join(output,'growth/growth.html'));
 await fs.mkdir(path.join(output,'bookmarks/images/icons'),{recursive:true});
 for(const icon of ['chatgpt.ico','gemini.png'])await fs.copyFile(path.join(appRoot,'images/icons',icon),path.join(output,'bookmarks/images/icons',icon));
 for(const file of BOOKMARK_JS)await fs.copyFile(path.join(appRoot,'Javascript',file),path.join(output,'bookmarks/Javascript',file));
 for(const file of GROWTH_JS)await fs.copyFile(path.join(growthRoot,'Javascript',file),path.join(output,'growth/Javascript',file));
 for(const file of GROWTH_CSS)await fs.copyFile(path.join(growthRoot,'src',file),path.join(output,'growth/src',file));
 for(const [site,title] of [['bookmarks','書籤工作台'],['growth','成長相簿']])await fs.writeFile(path.join(output,site,'index.html'),redirectPage(site+'.html',title));
 await fs.writeFile(path.join(output,'bookmarks/growth.html'),redirectPage('../growth/growth.html','成長相簿'));
 const adminRoot=path.join(appRoot,'../admin');
 const {buildAdminAssets}=require(path.join(adminRoot,'server/public-config.cjs'));
 await buildAdminAssets(homeRoot,adminRoot,output);
 await fs.writeFile(path.join(output,'.nojekyll'),'');await fs.writeFile(path.join(output,'.home-build.json'),JSON.stringify({format:1,mode:'preview'}));return output;
}
// 靜態託管無法設定 HTTP 轉址，保留舊入口並提供可點擊連結。
function redirectPage(url,title){return `<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=${url}"><title>${title}</title><a href="${url}">進入${title}</a></html>`;}
if(require.main===module){
 const root=path.resolve(__dirname,'..');
 syncPublicProjects(root).then(()=>buildSite(root)).then(output=>console.log('公開產物：'+output)).catch(error=>{console.error(error.message);process.exitCode=1;});
}
module.exports={buildSite,emptyBookmarks,copyTree,loadPublicProjects,syncPublicProjects};
