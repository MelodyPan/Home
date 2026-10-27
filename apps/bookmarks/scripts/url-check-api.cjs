// Stateless local URL checks: no bookmark documents, files, credentials or job storage.
const {checkUrl}=require('./url-checker.cjs');
function createUrlCheckApi({check=checkUrl,maxConcurrent=6}={}){
 let active=0;
 return async function handle(req,res,{origin,stopping=false}){
  const send=(status,body)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(body));};
  if(stopping){send(503,{error:'網站服務正在停止，請稍後再試。'});return;}
  if(req.method==='GET'){send(200,{available:true});return;}
  if(req.method!=='POST'){send(405,{error:'Method not allowed'});return;}
  if(req.headers.origin!==origin||!/^application\/json(?:;|$)/i.test(req.headers['content-type']||'')){send(403,{error:'Invalid origin or content type'});return;}
  if(active>=maxConcurrent){send(429,{error:'已有檢查進行中，請稍後再試。'});return;}
  active++;const controller=new AbortController(),abort=()=>controller.abort();res.on('close',abort);
  try{
   let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>16384){send(413,{error:'網址過長。'});return;}}
   let data;try{data=JSON.parse(body);}catch{send(400,{error:'無效的檢查要求。'});return;}
   if(!data||typeof data.url!=='string'||!data.url||data.url.length>8192||Object.keys(data).some(key=>key!=='url')){send(400,{error:'請提供一個有效網址。'});return;}
   const result=await check(data.url,{signal:controller.signal});if(!res.destroyed)send(200,result);
  }catch{if(!res.destroyed)send(500,{error:'檢查服務暫時無法完成，請重試。'});}
  finally{active--;res.off('close',abort);}
 };
}
module.exports={createUrlCheckApi};
