const fs=require('node:fs/promises'),path=require('node:path');
async function publicConfigScript(root){
 let config={};try{config=JSON.parse(await fs.readFile(path.join(root,'portfolio.config.json'),'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
 const apiBaseUrl=process.env.PORTFOLIO_API_BASE||config.apiBaseUrl||'';
 if(apiBaseUrl){const url=new URL(apiBaseUrl);if(url.username||url.password||url.search||url.hash||url.pathname!=='/'||(url.protocol!=='https:'&&!(url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname))))throw new Error('作品 API 必須是 HTTPS 根網址，或本機開發網址。');}
 return 'window.PortfolioConfig='+JSON.stringify({apiBaseUrl})+';\n';
}
async function buildAdminAssets(root,adminRoot,output){
 for(const directory of ['admin','portfolio'])await fs.mkdir(path.join(output,directory),{recursive:true});
 for(const file of ['index.html','admin.css','admin.js','editor-state.js','project-model.js'])await fs.copyFile(path.join(adminRoot,'public',file),path.join(output,'admin',file));
 for(const file of ['project-model.js','projects.js'])await fs.copyFile(path.join(adminRoot,'public',file),path.join(output,'portfolio',file));
 await fs.writeFile(path.join(output,'portfolio/config.js'),await publicConfigScript(root));
}
module.exports={publicConfigScript,buildAdminAssets};
