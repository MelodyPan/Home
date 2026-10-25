// 一鍵啟動 Home；保留原 Bookmarks 4178 埠，整合版使用 4179，不終止其他網站的程序。
const path=require('node:path'),{spawn}=require('node:child_process');
async function main(){
 const root=path.resolve(__dirname,'..'),app=path.join(root,'apps/bookmarks'),url='http://127.0.0.1:4179';
 const {ensureBookmarkServer}=require(path.join(app,'scripts/start-bookmarks.cjs')),{getHomeVersion}=require('./home-site-server.cjs');
 await ensureBookmarkServer({url,root:app,version:await getHomeVersion(root,app),launch(){const child=spawn(process.execPath,[path.join(root,'scripts/home-site-server.cjs')],{cwd:root,detached:true,stdio:'ignore',windowsHide:true});child.unref();}});
 if(!process.argv.includes('--no-browser')){const browser=spawn('powershell.exe',['-NoProfile','-Command',"Start-Process 'http://127.0.0.1:4179/'"],{windowsHide:true,stdio:'ignore'});browser.on('error',error=>{console.error(error.message);process.exitCode=1;});}
}
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={main};
