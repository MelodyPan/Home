const fs=require('node:fs/promises'),path=require('node:path');
// Client IDs are public; never forward arbitrary local configuration to the browser.
async function loadDriveConfig(homeRoot,env=process.env){
 let config={};try{config=JSON.parse(await fs.readFile(path.join(homeRoot,'bookmarks.config.json'),'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
 const googleClientId=env.BOOKMARKS_GOOGLE_CLIENT_ID||config.googleClientId||'';
 if(typeof googleClientId!=='string'||googleClientId&&!/^\d+-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(googleClientId))throw new Error('書籤 Google OAuth Client ID 格式不正確。');
 return {mode:'drive',googleClientId};
}
module.exports={loadDriveConfig};
