// 將程式整合到既有 Home，保留使用者首頁修改；個人資料仍留在原目錄，設定檔不加入 Git。
const fs=require('node:fs/promises'),path=require('node:path');
const {emptyBookmarks,copyTree}=require('./home-site-build.cjs');
const WORKFLOW=`name: Build and deploy Home
on:
  push:
    branches: [main]
  workflow_dispatch:
permissions:
  contents: read
  pages: write
  id-token: write
concurrency:
  group: pages
  cancel-in-progress: false
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
      - run: npm install
      - run: npm test
      - run: npm run build
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: __DEPLOYMENT_URL__
    steps:
      - name: Deploy Home
        id: deployment
        uses: actions/deploy-pages@v5
`.replace('__DEPLOYMENT_URL__','$'+'{{ steps.deployment.outputs.page_url }}');
async function integrateHome(sourceRoot,homeRoot){
 sourceRoot=path.resolve(sourceRoot);homeRoot=path.resolve(homeRoot);
 if(sourceRoot===homeRoot)throw new Error('來源與 Home 不可為同一目錄。');
 const homepage=path.join(homeRoot,'index.html'),before=await fs.readFile(homepage,'utf8'),app=path.join(homeRoot,'apps/bookmarks');
 try{await fs.access(app);await fs.access(path.join(app,'.home-subsystem.json'));}catch(error){if(error.code!=='ENOENT')throw error;try{await fs.access(app);throw new Error('既有 apps/bookmarks 不是本工具管理的子系統，未覆蓋。');}catch(e){if(e.code!=='ENOENT')throw e;}}
 await fs.mkdir(app,{recursive:true});
 for(const dir of ['Javascript','src','scripts','tests','docs'])await copyTree(path.join(sourceRoot,dir),path.join(app,dir));
 // 新安裝共用 Home 圖片；已有 Logo 時保留使用者的版本。
 await fs.mkdir(path.join(homeRoot,'images'),{recursive:true});
 try{await fs.copyFile(path.resolve(sourceRoot,'../../images/logo.png'),path.join(homeRoot,'images/logo.png'),require('node:fs').constants.COPYFILE_EXCL);}catch(error){if(error.code!=='EEXIST')throw error;}
 await fs.writeFile(path.join(app,'bookmarks.html'),await emptyBookmarks(app));
 // Home 中的重建工具永遠只產生空白頁，個人資料由 API 載入，避免內嵌私人書籤。
 await fs.writeFile(path.join(app,'scripts/build-home.cjs'),"const fs=require('node:fs/promises'),path=require('node:path');const {emptyBookmarks}=require('./home-site-build.cjs');emptyBookmarks(path.resolve(__dirname,'..')).then(html=>fs.writeFile(path.join(__dirname,'../bookmarks.html'),html)).catch(e=>{console.error(e);process.exitCode=1;});\n");
 await fs.writeFile(path.join(app,'.home-subsystem.json'),'{"format":1}\n');
 // 拆站後同步相簿與共用程式；只複製明確的程式目錄與公開圖示。
 for(const name of ['growth','shared','cathflow','dynasty-explorer','admin']){
  const source=path.join(sourceRoot,'..',name),target=path.join(homeRoot,'apps',name);
  await fs.mkdir(target,{recursive:true});
  for(const dir of ['Javascript','src','scripts','tests','docs','public','server']){
   try{await copyTree(path.join(source,dir),path.join(target,dir));}catch(error){if(error.code!=='ENOENT')throw error;}
  }
  if(name==='growth'){
   await fs.copyFile(path.join(source,'growth.html'),path.join(target,'growth.html'));
  }
  if(name==='cathflow')await fs.copyFile(path.join(source,'cathflow.html'),path.join(target,'cathflow.html'));
  if(name==='admin')await fs.copyFile(path.join(source,'projects.seed.json'),path.join(target,'projects.seed.json'));
  if(name==='dynasty-explorer'){
   await fs.copyFile(path.join(source,'DynastyExplorer.html'),path.join(target,'DynastyExplorer.html'));
   await fs.mkdir(path.join(target,'images'),{recursive:true});await fs.copyFile(path.join(source,'images/logo.png'),path.join(target,'images/logo.png'));
  }
 }

 const marker='<!-- BOOKMARKS_SUBSYSTEM -->';let after=before;
 const current=await fs.readFile(path.join(sourceRoot,'../../index.html'),'utf8');
 const cards=current.slice(current.indexOf(marker),current.indexOf('<article class="project featured">',current.indexOf(marker)));
 if(!before.includes(marker)){
  const anchor='<article class="project featured">';if(!before.includes(anchor))throw new Error('Home 找不到作品卡片插入位置，首頁未修改。');
  after=before.replace(anchor,cards+anchor);
 }else if(!before.includes('id="growth-subsystem"')){
  after=before.replace(/<!-- BOOKMARKS_SUBSYSTEM -->[^]*?<\/article>/,cards);
 }
 if(after!==before)await fs.writeFile(homepage,after);
 const scriptDir=path.join(homeRoot,'scripts');await fs.mkdir(scriptDir,{recursive:true});
 for(const file of ['home-site-server.cjs','home-site-start.cjs','home-site-build.cjs'])await fs.copyFile(path.join(sourceRoot,'../../scripts',file),path.join(scriptDir,file));
 await fs.copyFile(path.join(sourceRoot,'../../scripts/test.cjs'),path.join(scriptDir,'test.cjs'));
 await copyTree(path.join(sourceRoot,'../../scripts/tests'),path.join(scriptDir,'tests'));
 const packageFile=path.join(homeRoot,'package.json');let pkg={name:'melody-home',version:'1.0.0',private:true};try{pkg=JSON.parse(await fs.readFile(packageFile,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
 pkg.scripts={...pkg.scripts,start:'node scripts/home-site-start.cjs',build:'node scripts/home-site-build.cjs',test:'node scripts/test.cjs'};pkg.engines={...pkg.engines,node:'>=22'};
 const sourcePackage=JSON.parse(await fs.readFile(path.join(sourceRoot,'../../package.json'),'utf8'));pkg.dependencies={...pkg.dependencies,'google-auth-library':sourcePackage.dependencies['google-auth-library']};await fs.writeFile(packageFile,JSON.stringify(pkg,null,2)+'\n');
 await fs.writeFile(path.join(homeRoot,'start-home.cmd'),'@echo off\r\ncd /d "%~dp0"\r\nnode "%~dp0scripts\\home-site-start.cjs"\r\nif errorlevel 1 pause\r\n');
 const ignoreFile=path.join(homeRoot,'.gitignore');let ignore='';try{ignore=await fs.readFile(ignoreFile,'utf8');}catch(e){if(e.code!=='ENOENT')throw e;}
 const rules=['data/','dist/','node_modules/','.home-local.json','.env','.env.*','!.env.example','apps/bookmarks/assets/bookmarks-data.txt*','apps/bookmarks/assets/growth-data.json*','apps/bookmarks/assets/growth-photos/','apps/growth/assets/growth-data.json*','apps/growth/assets/growth-photos/','apps/bookmarks/assets/source/','apps/bookmarks/assets/reports/','*.tmp'];
 await fs.writeFile(ignoreFile,ignore+'\n# 個人資料與建置產物不加入 Git\n'+rules.filter(rule=>!ignore.split(/\r?\n/).includes(rule)).join('\n')+'\n');
 const localFile=path.join(homeRoot,'.home-local.json');try{await fs.writeFile(localFile,JSON.stringify({bookmarksDataRoot:path.relative(homeRoot,sourceRoot)},null,2)+'\n',{flag:'wx'});}catch(e){if(e.code!=='EEXIST')throw e;}
 await fs.mkdir(path.join(homeRoot,'.github/workflows'),{recursive:true});await fs.writeFile(path.join(homeRoot,'.github/workflows/static.yml'),WORKFLOW);
 const readme=path.join(homeRoot,'README.md');let readmeText=await fs.readFile(readme,'utf8');if(!readmeText.includes('## 書籤與成長相簿子系統'))readmeText+='\n## 書籤與成長相簿子系統\n\n雙擊 `start-home.cmd` 或執行 `npm start`，開啟 `http://127.0.0.1:4179/`。\n\n- 程式：`apps/bookmarks/`（書籤）、`apps/growth/`（相簿）、`apps/shared/`（共用資源）。\n- 本機資料：由 `.home-local.json` 指定，該檔與私人資料不加入 Git。\n- 測試：`npm test`；公開建置：`npm run build`。GitHub Pages 只發布 `dist/`。\n- 公開站目前為唯讀預覽，雲端登入、照片上傳與儲存須待選定服務後接上。\n- 不要把孩子資料、照片或原始私人書籤複製到公開目錄。\n\n詳細說明見 `apps/bookmarks/docs/home-integration.md`。\n';await fs.writeFile(readme,readmeText);
 return {homeRoot,appRoot:app,homepageChanged:after!==before};
}
if(require.main===module)integrateHome(path.resolve(__dirname,'..'),path.resolve(process.argv[2]||path.join(__dirname,'../../Home'))).then(result=>console.log(JSON.stringify(result))).catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={integrateHome};
