// Token 必須先由 Google 官方函式庫驗簽，再交由這裡檢查管理員身分。
function authorizeGoogle(payload,config,now=Date.now()){
 const deny=()=>{throw Object.assign(new Error('這個 Google 帳號沒有管理權限。'),{status:403});};
 if(!payload||!payload.sub||payload.aud!==config.googleClientId||!['accounts.google.com','https://accounts.google.com'].includes(payload.iss)||!Number.isFinite(payload.exp)||payload.exp*1000<=now||payload.email_verified!==true)deny();
 const subjects=config.adminSubjects||[],emails=(config.adminEmails||[]).map(email=>email.toLowerCase());
 // Google sub 不隨 Email 改變。以 Email 初始設定時，僅接受 Google 權威管理的 Gmail／Workspace。
 const email=typeof payload.email==='string'?payload.email.toLowerCase():'';
 if(subjects.length){if(!subjects.includes(payload.sub))deny();}
 else if(!emails.includes(email)||(!email.endsWith('@gmail.com')&&!payload.hd))deny();
 return {sub:payload.sub,email:payload.email||'',name:payload.name||payload.email||'管理員'};
}
function createGoogleVerifier(clientId){
 let client;
 return async token=>{
  if(!client){const {OAuth2Client}=require('google-auth-library');client=new OAuth2Client(clientId);}
  const ticket=await client.verifyIdToken({idToken:token,audience:clientId});return ticket.getPayload();
 };
}
// 無法取得驗簽金鑰是服務連線問題，不能誤報為使用者憑證過期；兩者均不放行登入。
function verificationFailure(error){
 const networkCodes=new Set(['EACCES','EPERM','ENOTFOUND','EAI_AGAIN','ECONNRESET','ECONNREFUSED','ENETUNREACH','ETIMEDOUT','UND_ERR_CONNECT_TIMEOUT','CERT_HAS_EXPIRED','SELF_SIGNED_CERT_IN_CHAIN','MODULE_NOT_FOUND']);
 if(networkCodes.has(error?.code)||networkCodes.has(error?.cause?.code)||String(error?.message||'').startsWith('Failed to retrieve verification certificates:'))return {status:503,error:'後端無法與 Google 驗證服務連線，請確認服務的網路權限後重試。'};
 return {status:401,error:'Google 登入已失效或憑證不正確，請重新登入。'};
}
module.exports={authorizeGoogle,createGoogleVerifier,verificationFailure};
