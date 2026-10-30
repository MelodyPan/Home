const assert=require('node:assert/strict');
function fakeDrive({browserMetadata=false}={}){
 const files=new Map(),sessions=new Map();let counter=0,fail=false,barrier=null,resumableUploads=0;
 const reply=(body,status=200,headers={})=>new Response(JSON.stringify(body),{status,headers});
 async function request(address,options={}){
  assert.equal(options.headers.Authorization,'Bearer test-token');const url=new URL(address);
  if(url.pathname.startsWith('/drive/v2/files/')||url.pathname.startsWith('/upload/drive/v2/files/')){
   const forwarded=new URL(url);forwarded.pathname=forwarded.pathname.replace('/v2/','/v3/');let body=options.body;
   const convert=meta=>{assert(!meta.appProperties,'v2 writes must use private properties');assert((meta.properties||[]).every(p=>p.visibility==='PRIVATE'));const {title,properties,...rest}=meta;return {...rest,...(title?{name:title}:{}),appProperties:Object.fromEntries((properties||[]).map(p=>[p.key,p.value]))};};
   if(body){if(url.pathname.startsWith('/upload/')){const lines=(body instanceof Blob?await body.text():body).split('\r\n'),index=lines.findIndex(line=>line.startsWith('{'));lines[index]=JSON.stringify(convert(JSON.parse(lines[index])));body=lines.join('\r\n');}else body=JSON.stringify(convert(JSON.parse(body)));}
   const response=await request(forwarded.href,{...options,...(body?{body}:{}),...(options.method==='PUT'?{method:'PATCH'}:{})});
   if(!response.ok||(options.method&&options.method!=='GET'))return response;
   const meta=await response.json(),stored=files.get(meta.id);return reply({id:meta.id,etag:String(stored.version||1),parents:(meta.parents||[]).map(id=>({id})),properties:Object.entries(meta.appProperties||{}).map(([key,value])=>({key,value,visibility:'PRIVATE'}))});
  }
  if(url.pathname.endsWith('/about'))return reply({user:{permissionId:'account-a',emailAddress:'a@example.test'}});
  if(url.pathname.endsWith('/generateIds'))return reply({ids:['file-'+(++counter)]});
  if(url.pathname==='/drive/v3/files'){
   if(options.method==='POST'){const meta=JSON.parse(options.body);if(files.has(meta.id))return reply({},409);const stored={...meta,parents:meta.parents||['root'],shared:false,ownedByMe:true,createdTime:new Date().toISOString()};files.set(meta.id,{meta:stored});return reply(stored);}
   const q=url.searchParams.get('q')||'',purpose=q.match(/key='purpose' and value='([^']+)'/)?.[1];
   const all=[...files.values()].map(x=>x.meta).filter(meta=>q.includes("mimeType = 'application/vnd.google-apps.folder'")?meta.mimeType==='application/vnd.google-apps.folder'&&meta.name==='MelodyHome':meta.appProperties?.purpose===purpose),offset=Number(url.searchParams.get('pageToken')||0),page=all.slice(offset,offset+2);
   return reply({files:page,...(offset+2<all.length?{nextPageToken:String(offset+2)}:{})});
  }
  if(url.pathname.startsWith('/upload/drive/v3/files')){
   if(url.searchParams.get('uploadType')==='resumable'){
    const meta=JSON.parse(options.body);if(files.has(meta.id))return reply({},409);sessions.set(meta.id,meta);resumableUploads++;return reply({},200,{location:'https://www.googleapis.com/upload/drive/v3/files?upload_id='+meta.id});
   }
   if(options.method==='PUT'){
    const id=url.searchParams.get('upload_id'),meta=sessions.get(id);if(!meta)return reply({},404);sessions.delete(id);files.set(id,{meta:{...meta,shared:false,ownedByMe:true,createdTime:new Date().toISOString()},content:Buffer.from(await options.body.arrayBuffer()),version:1});if(fail){fail=false;throw Error('connection lost after commit');}return reply({id});
   }
   const raw=Buffer.from(options.body instanceof Blob?await options.body.arrayBuffer():options.body),boundary=options.headers['Content-Type'].split('boundary=')[1],marker=Buffer.from('\r\n--'+boundary),headerEnd=Buffer.from('\r\n\r\n');
   const firstStart=raw.indexOf(headerEnd)+4,firstEnd=raw.indexOf(marker,firstStart),meta=JSON.parse(raw.subarray(firstStart,firstEnd).toString()),secondStart=raw.indexOf(headerEnd,firstEnd)+4,secondEnd=raw.indexOf(marker,secondStart),payload=raw.subarray(secondStart,secondEnd),content=meta.mimeType==='application/json'?JSON.parse(payload.toString()):Buffer.from(payload);
   if(barrier)await barrier();
   if(options.method==='PATCH'){
    const id=url.pathname.split('/').at(-1),prior=files.get(id);if(!prior)return reply({},404);if(options.headers['If-Match']!==String(prior.version||1))return reply({},412);
    files.set(id,{meta:{...prior.meta,...meta,...(url.searchParams.has('addParents')?{parents:[url.searchParams.get('addParents')]}:{})},content,version:(prior.version||1)+1});
   }else{if(files.has(meta.id))return reply({},409);files.set(meta.id,{meta:{...meta,shared:false,ownedByMe:true,createdTime:new Date().toISOString()},content,version:1});}
   if(fail){fail=false;throw Error('connection lost after commit');}return reply({id:meta.id});
  }
  const id=url.pathname.split('/').at(-1),file=files.get(id);if(!file)return reply({},404);
  if(options.method==='PATCH'){
   if(options.headers['If-Match']&&options.headers['If-Match']!==String(file.version||1))return reply({},412);const patch=JSON.parse(options.body);if(patch.name)file.meta.name=patch.name;if(patch.appProperties)file.meta.appProperties={...file.meta.appProperties,...patch.appProperties};file.version=(file.version||1)+1;file.meta.parents=(file.meta.parents||[]).filter(id=>!(url.searchParams.get('removeParents')||'').split(',').includes(id));if(url.searchParams.get('addParents'))file.meta.parents.push(url.searchParams.get('addParents'));return reply(file.meta);
  }
  if(url.searchParams.get('alt')==='media'&&Buffer.isBuffer(file.content))return new Response(file.content,{headers:{'Content-Type':file.meta.mimeType}});
  return reply(url.searchParams.get('alt')==='media'?file.content:file.meta,200,browserMetadata?{}:{etag:String(file.version||1)});
 }
 return {files,request,get resumableUploads(){return resumableUploads;},loseReply(){fail=true;},concurrent(){let arrivals=0,release;const gate=new Promise(r=>release=r);barrier=async()=>{if(++arrivals===2){barrier=null;release();}await gate;};}};
}
module.exports={fakeDrive};
