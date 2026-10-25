const fs=require('node:fs/promises'),path=require('node:path'),{createHash}=require('node:crypto');
const {withDataLock}=require('../../shared/scripts/data-lock.cjs');
const {validateDocument}=require('../public/project-model.js');
const conflict=()=>Object.assign(new Error('作品清單已在其他分頁更新，請先保留草稿，再重新載入。'),{status:409});
const revision=raw=>createHash('sha256').update(raw).digest('hex');
const stamp=document=>validateDocument({...document,updatedAt:new Date().toISOString()});
function decode(raw){try{return validateDocument(JSON.parse(raw));}catch{throw Object.assign(new Error('作品 JSON 無法讀取，請檢查資料或還原備份；原檔未覆蓋。'),{status:503});}}
function createLocalStore(filename,seed){
 async function read(){let raw;try{raw=await fs.readFile(filename,'utf8');}catch(error){if(error.code==='ENOENT')return {document:validateDocument(seed),revision:'0'};throw error;}return {document:decode(raw),revision:revision(raw)};}
 async function write(document,expectedRevision){
  const next=stamp(document);await fs.mkdir(path.dirname(filename),{recursive:true});
  return withDataLock(filename,async()=>{
   const current=await read();if(current.revision!==expectedRevision)throw conflict();
   if(current.revision!=='0')await fs.copyFile(filename,filename+'.bak');
   const raw=JSON.stringify(next,null,2)+'\n';await fs.writeFile(filename+'.tmp',raw);await fs.rename(filename+'.tmp',filename);return {document:next,revision:revision(raw)};
  });
 }
 return {read,write};
}
function createGcsStore({bucket,object='projects.json',seed,request=fetch,accessToken}){
 let auth;
 async function headers(){
  if(!accessToken){if(!auth){const {GoogleAuth}=require('google-auth-library');auth=new GoogleAuth({scopes:['https://www.googleapis.com/auth/devstorage.read_write']});}accessToken=()=>auth.getAccessToken();}
  const token=await accessToken();if(!token)throw new Error('Google Cloud 身分憑證尚未設定。');return {Authorization:'Bearer '+token};
 }
 const objectUrl=`https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(object)}`;
 async function read(){
  for(let attempt=0;attempt<3;attempt++){
   const authHeaders=await headers(),metadata=await request(objectUrl,{headers:authHeaders,signal:AbortSignal.timeout(15000)});
   if(metadata.status===404)return {document:validateDocument(seed),revision:'0'};
   if(!metadata.ok)throw new Error('無法讀取 Google Cloud Storage 作品資料。');
   const {generation}=await metadata.json();if(!/^\d+$/.test(generation))throw new Error('作品版本格式不正確。');
   // 固定讀取這一代，避免讀完版本後被其他請求換成另一份內容。
   const response=await request(objectUrl+'?alt=media&generation='+generation,{headers:authHeaders,signal:AbortSignal.timeout(15000)});
   if(response.status===404)continue;
   if(!response.ok)throw new Error('無法下載作品 JSON。');return {document:decode(await response.text()),revision:generation};
  }
  throw new Error('作品正在更新，請稍後再試。');
 }
 async function write(document,expectedRevision){
  if(!/^\d+$/.test(expectedRevision))throw conflict();const next=stamp(document);
  const url=new URL(`https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(bucket)}/o`);
  url.searchParams.set('uploadType','media');url.searchParams.set('name',object);url.searchParams.set('ifGenerationMatch',expectedRevision);
  const response=await request(url.href,{method:'POST',headers:{...await headers(),'Content-Type':'application/json; charset=utf-8'},body:JSON.stringify(next),signal:AbortSignal.timeout(15000)});
  if(response.status===412)throw conflict();if(!response.ok)throw new Error('Google Cloud Storage 存檔失敗，請重試。');
  const {generation}=await response.json();if(!/^\d+$/.test(generation))throw new Error('存檔完成，但無法確認版本，請重新載入。');return {document:next,revision:generation};
 }
 return {read,write};
}
module.exports={createLocalStore,createGcsStore};
