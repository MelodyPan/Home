const fs=require('node:fs/promises'),path=require('node:path');
async function loadConfig(root,env=process.env){
 let local={};try{local=JSON.parse(await fs.readFile(path.join(root,'.home-portfolio.json'),'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
 const list=value=>Array.isArray(value)?value:String(value||'').split(',').map(item=>item.trim()).filter(Boolean);
 return {
  googleClientId:env.GOOGLE_CLIENT_ID||local.googleClientId||'',adminSubjects:list(env.ADMIN_GOOGLE_SUBS||local.adminSubjects),adminEmails:list(env.ADMIN_EMAILS||local.adminEmails),
  publicOrigin:env.PUBLIC_ORIGIN||local.publicOrigin||'http://127.0.0.1:4179',
  storageBucket:env.PROJECTS_BUCKET||local.storageBucket||'',storageObject:env.PROJECTS_OBJECT||local.storageObject||'projects.json',
  localFile:path.resolve(root,local.localFile||'data/portfolio/projects.json')
 };
}
module.exports={loadConfig};
