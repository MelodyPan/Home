const fs=require('node:fs/promises'),path=require('node:path');
const {authorizeGoogle,createGoogleVerifier,verificationFailure}=require('./auth.cjs');
const {createLocalStore,createGcsStore}=require('./store.cjs');
const {publicDocument,validateDocument}=require('../public/project-model.js');
const {loadConfig}=require('./config.cjs');
const {publicConfigScript}=require('./public-config.cjs');
const STATIC={'/admin/':['index.html','text/html'],'/admin/index.html':['index.html','text/html'],'/admin/admin.js':['admin.js','application/javascript'],'/admin/admin.css':['admin.css','text/css'],'/admin/project-model.js':['project-model.js','application/javascript'],'/portfolio/project-model.js':['project-model.js','application/javascript'],'/portfolio/projects.js':['projects.js','application/javascript']};
async function createAdminHandler({root,config,store,verifyToken,canShutdown=false}={}){
 root=root||path.resolve(__dirname,'../../..');config=config||await loadConfig(root);
 if(!store){const seed=JSON.parse(await fs.readFile(path.join(root,'apps/admin/projects.seed.json'),'utf8'));store=config.storageBucket?createGcsStore({bucket:config.storageBucket,object:config.storageObject,seed}):createLocalStore(config.localFile,seed);}
 const configured=Boolean(config.googleClientId&&((config.adminSubjects||[]).length||(config.adminEmails||[]).length));
 verifyToken=verifyToken||createGoogleVerifier(config.googleClientId);
 return async function handle(req,res){
  const pathname=new URL(req.url,'http://127.0.0.1').pathname;
  if(!Object.hasOwn(STATIC,pathname)&&!['/admin','/admin/editor-state.js','/portfolio/config.js','/api/projects','/api/admin/config','/api/admin/projects','/api/admin/me'].includes(pathname))return false;
  const send=(status,body,type='application/json',headers={})=>{res.writeHead(status,{'Content-Type':type+'; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin',...headers});res.end(typeof body==='string'||Buffer.isBuffer(body)?body:JSON.stringify(body));};
  try{
   if(req.method==='GET'&&pathname==='/portfolio/config.js'){send(200,await publicConfigScript(root),'application/javascript');return true;}
   if(req.method==='GET'&&pathname==='/admin/editor-state.js'){send(200,await fs.readFile(path.join(root,'apps/admin/public/editor-state.js')),'application/javascript');return true;}
   if(pathname==='/admin'&&req.method==='GET'){send(302,'','text/html',{Location:'/admin/'});return true;}
   if(req.method==='GET'&&Object.hasOwn(STATIC,pathname)){const [file,type]=STATIC[pathname];send(200,await fs.readFile(path.join(root,'apps/admin/public',file)),type,{'Content-Security-Policy':"frame-ancestors 'none'",'Cross-Origin-Opener-Policy':'same-origin-allow-popups'});return true;}
   if(pathname==='/api/admin/config'&&req.method==='GET'){send(200,{configured,googleClientId:configured?config.googleClientId:'',canShutdown});return true;}
   if(pathname==='/api/projects'&&req.method==='GET'){const data=await store.read();send(200,publicDocument(data.document),'application/json',{'Access-Control-Allow-Origin':'*'});return true;}
   if(!pathname.startsWith('/api/admin/')){send(405,{error:'不支援這個操作。'});return true;}
   if(!configured){send(503,{error:'尚未設定 Google 登入與管理員帳號。'});return true;}
   const token=req.headers.authorization?.match(/^Bearer ([^\s]{1,8192})$/)?.[1];if(!token){send(401,{error:'請先使用 Google 帳號登入。'});return true;}
   let payload;try{payload=await verifyToken(token);}catch(error){const failure=verificationFailure(error);send(failure.status,{error:failure.error});return true;}
   const user=authorizeGoogle(payload,config);
   if(pathname==='/api/admin/me'&&req.method==='GET'){send(200,user);return true;}
   if(pathname==='/api/admin/projects'&&req.method==='GET'){const data=await store.read();send(200,data.document,'application/json',{ETag:'"'+data.revision+'"'});return true;}
   if(pathname==='/api/admin/projects'&&req.method==='PUT'){
    const origin=typeof config.publicOrigin==='function'?config.publicOrigin():config.publicOrigin;
    if(req.headers.origin!==origin||!/^application\/json(?:;|$)/i.test(req.headers['content-type']||'')){send(403,{error:'來源或資料類型不正確。'});return true;}
    const expected=req.headers['if-match']?.match(/^"([a-f0-9]+)"$/)?.[1];if(!expected){send(428,{error:'請先載入作品版本再存檔。'});return true;}
    let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>2*1024*1024){send(413,{error:'作品資料超過 2 MB。'});return true;}chunks.push(chunk);}
    let document;try{document=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{send(400,{error:'JSON 格式不正確。'});return true;}
    const saved=await store.write(validateDocument(document),expected);send(200,saved.document,'application/json',{ETag:'"'+saved.revision+'"'});return true;
   }
   send(405,{error:'不支援這個操作。'});return true;
  }catch(error){send(error.status||503,{error:error.status?error.message:'作品服務暫時無法使用，請稍後重試。'});return true;}
 };
}
module.exports={createAdminHandler};
