// 以作業系統的排他新建保護共用資料，讓不同連接埠／程序也只能依序比對版本並存檔。
const fs=require('node:fs/promises');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
async function withDataLock(filename,work,{timeoutMs=5000}={}){
 const lock=filename+'.lock',token=randomUUID(),started=Date.now();let handle;
 await fs.mkdir(path.dirname(filename),{recursive:true});
 while(!handle){
  try{handle=await fs.open(lock,'wx',0o600);}catch(error){
   if(error.code!=='EEXIST')throw error;
   // 不自動刪除可能仍由其他程序持有的鎖；逾時保留原資料並請使用者稍後重試。
   if(Date.now()-started>=timeoutMs)throw Object.assign(new Error('資料正在由另一個服務儲存，請稍後重試。若服務曾異常中止，請先停止兩個服務再清除對應的 .lock 檔。'),{status:503});
   await new Promise(resolve=>setTimeout(resolve,25));
  }
 }
 try{await handle.writeFile(JSON.stringify({pid:process.pid,token,createdAt:new Date().toISOString()}));return await work();}
 finally{
  await handle.close();
  // 僅移除自己建立的鎖，絕不移除其他程序的鎖或正式資料。
  const owner=await fs.readFile(lock,'utf8');
  if(JSON.parse(owner).token===token)await fs.unlink(lock);
 }
}
module.exports={withDataLock};
