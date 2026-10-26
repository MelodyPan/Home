// Private Drive storage. Reuse today's file, with conditional writes and explicit conflicts.
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./bookmark-file.js'));else root.BookmarkDrive=factory(root.BookmarkFile);})(globalThis,function(file){
 'use strict';
 const PURPOSE='melody-home-bookmarks-v1',API='https://www.googleapis.com/drive/v3';
 class DriveError extends Error{constructor(code,message,details={}){super(message);this.name='DriveError';this.code=code;Object.assign(this,details);}}
 const invalid=()=>new DriveError('invalid','Drive 書籤版本不完整或格式錯誤，已停止載入；請保留備份，不要刪除版本檔。');
 const validId=value=>typeof value==='string'&&/^[a-zA-Z0-9_-]{1,200}$/.test(value);
 const same=(a,b)=>JSON.stringify([...a].sort())===JSON.stringify([...b].sort());
 function checked(document){try{file.readDataFile(JSON.stringify(document));return structuredClone(document);}catch{throw invalid();}}
 const revisionKey=meta=>meta.appProperties.commit?meta.id+'~'+meta.appProperties.commit:meta.id;
 const taipeiDay=time=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(time));
 function createDriveStore({request=globalThis.fetch.bind(globalThis),token,uuid=()=>globalThis.crypto.randomUUID(),now=Date.now}={}){
  let pending=null,folderId='',folderRequestId='',folderTask=null;
  async function call(url,options={}){
   const credential=token?.();if(!credential)throw new DriveError('auth','請連接 Google Drive 後再試。');
   let response;try{response=await request(url,{...options,headers:{...options.headers,Authorization:'Bearer '+credential},signal:AbortSignal.timeout(30000)});}catch{throw new DriveError('network','無法連線 Google Drive；未同步內容仍在目前分頁，請重試或下載備份。');}
   if(response.ok)return response;
   let apiError={};try{apiError=(await response.clone().json()).error||{};}catch{}
   const reasons=[...(apiError.errors||[]),...(apiError.details||[])].map(item=>item?.reason).filter(value=>typeof value==='string');
   if(response.status===403&&reasons.some(reason=>['accessNotConfigured','SERVICE_DISABLED','API_DISABLED'].includes(reason)))throw new DriveError('apiDisabled','此 Google 專案尚未啟用 Google Drive API。請到 Google Cloud Console 的 API 程式庫啟用 Google Drive API，再重新連接；書籤仍儲存在你的 Google Drive。');
   if(response.status===403&&reasons.some(reason=>['insufficientPermissions','ACCESS_TOKEN_SCOPE_INSUFFICIENT'].includes(reason)))throw new DriveError('scope','Google Drive 授權範圍不足，請重新連接並允許網站存取它建立的書籤檔案。');
   if(response.status===401)throw new DriveError('auth','Google 授權已過期，請重新連接同一帳號。');
   if(response.status===429||reasons.some(reason=>/rateLimit|quota|storageQuota/i.test(reason)))throw new DriveError('quota','Google Drive 空間或請求額度不足，請稍後重試或檢查容量。');
   if(response.status===403)throw new DriveError('permission','Google Drive 拒絕存取，請確認已授予書籤檔案權限。');
   if(response.status===404)throw new DriveError('missing','找不到 Drive 書籤版本；請確認帳號、權限或垃圾桶。');
   if(response.status===409)throw new DriveError('exists','版本檔已存在。');
   if(response.status===412)throw new DriveError('changed','另一台裝置已更新當日書籤，請選擇要繼續使用的版本。');
   throw new DriveError('service','Google Drive 暫時無法完成操作，請重試。');
  }
  async function list(folderSearch=false){
   const files=[],pages=new Set();let pageToken='';
   do{
    const url=new URL(API+'/files');url.searchParams.set('q',"trashed = false and 'me' in owners and "+(folderSearch?"name = 'MelodyHome' and mimeType = 'application/vnd.google-apps.folder'":"appProperties has { key='purpose' and value='"+PURPOSE+"' }"));
    url.searchParams.set('fields','nextPageToken,incompleteSearch,files(id,name,mimeType,parents,shared,appProperties,createdTime)');url.searchParams.set('pageSize','1000');url.searchParams.set('spaces','drive');if(pageToken)url.searchParams.set('pageToken',pageToken);
    const result=await(await call(url.href)).json();if(!Array.isArray(result.files)||result.incompleteSearch)throw invalid();
    for(const meta of result.files){if(!validId(meta.id)||(folderSearch?meta.name!=='MelodyHome'||meta.mimeType!=='application/vnd.google-apps.folder':meta.appProperties?.purpose!==PURPOSE||!validId(meta.appProperties.dataset)))throw invalid();files.push(meta);}
    pageToken=result.nextPageToken||'';if(pageToken&&pages.has(pageToken))throw invalid();pages.add(pageToken);
   }while(pageToken);
   if(new Set(files.map(x=>x.id)).size!==files.length)throw invalid();return files;
  }
  async function ensureFolder(){
   if(folderTask)return folderTask;
   folderTask=(async()=>{
    const isPrivate=meta=>meta?.shared===false&&meta.appProperties?.purpose===PURPOSE+'-folder'&&meta.mimeType==='application/vnd.google-apps.folder';
    if(folderId){try{const current=await(await call(API+'/files/'+encodeURIComponent(folderId)+'?fields=id,name,mimeType,shared,appProperties')).json();if(isPrivate(current)&&current.name==='MelodyHome')return folderId;}catch(error){if(error.code!=='missing')throw error;}folderId='';}
    let folders=(await list(true)).filter(isPrivate);
    if(!folders.length){
     if(!folderRequestId){folderRequestId=(await(await call(API+'/files/generateIds?count=1&space=drive&type=files')).json()).ids?.[0];if(!validId(folderRequestId))throw invalid();}
     const meta={id:folderRequestId,name:'MelodyHome',mimeType:'application/vnd.google-apps.folder',appProperties:{purpose:PURPOSE+'-folder'}};
     let created;
     try{created=await(await call(API+'/files?fields=id,name,mimeType,shared,appProperties',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(meta)})).json();}
     catch(error){if(error.code!=='exists')throw error;created=await(await call(API+'/files/'+encodeURIComponent(folderRequestId)+'?fields=id,name,mimeType,shared,appProperties')).json();}
     if(!isPrivate(created)||created.name!==meta.name)throw new DriveError('folderPrivacy','無法確認 MelodyHome 資料夾為私人，已暫停移動與上傳。請確認資料夾未被分享。');
     // A second client may have created the same application folder concurrently.
     folders=(await list(true)).filter(isPrivate);if(!folders.length)folders=[created];
    }
    folderId=folders.map(x=>x.id).sort()[0];folderRequestId='';return folderId;
   })().finally(()=>{folderTask=null;});return folderTask;
  }
  async function organize(files){
   if(!files.length)return;const target=await ensureFolder();
   for(const meta of files){if(meta.parents?.includes(target))continue;
    const url=new URL(API+'/files/'+encodeURIComponent(meta.id));url.searchParams.set('addParents',target);url.searchParams.set('fields','id,parents');if(meta.parents?.length)url.searchParams.set('removeParents',meta.parents.join(','));
    await call(url.href,{method:'PATCH',headers:{'Content-Type':'application/json'},body:'{}'});
   }
  }
  async function download(meta){
   const envelope=await(await call(API+'/files/'+encodeURIComponent(meta.id)+'?alt=media')).json();
   const props=meta.appProperties;
   if(!!props.day!==!!props.commit)throw invalid();
   if(props.day&&(!/^\d{4}-\d{2}-\d{2}$/.test(props.day)||!validId(props.commit)||envelope.commit!==props.commit))throw invalid();
   if(envelope?.format!==1||envelope.datasetId!==props.dataset||!Array.isArray(envelope.parents)||envelope.parents.some(x=>!validId(x)||x===meta.id)||new Set(envelope.parents).size!==envelope.parents.length)throw invalid();
   if(props.merge==='1'){if(envelope.parents.length<2||props.parent!==envelope.parents[0])throw invalid();}
   else if(!same(envelope.parents,props.parent?[props.parent]:[]))throw invalid();
   return {envelope,document:checked(envelope.data)};
  }
  async function graph(datasetId){
   if(!validId(datasetId))throw invalid();
   const nodes=(await list()).filter(x=>x.appProperties.dataset===datasetId);if(!nodes.length)throw new DriveError('missing','找不到這份雲端書籤；不會自動建立空資料覆蓋。');
   const ids=new Set(nodes.map(x=>x.id)),parents=new Map();
   for(const meta of nodes){const p=meta.appProperties;let references=p.parent?[p.parent]:[];if(p.merge==='1')references=(await download(meta)).envelope.parents;
    if(references.some(id=>!validId(id)||id===meta.id||!ids.has(id)))throw invalid();parents.set(meta.id,references);
   }
   // Validate ancestry iteratively so a damaged graph cannot hide a branch or loop forever.
   const done=new Set();
   for(const meta of nodes){const visiting=new Set(),stack=[[meta.id,false]];while(stack.length){const [id,exit]=stack.pop();if(done.has(id))continue;if(exit){visiting.delete(id);done.add(id);continue;}if(visiting.has(id))throw invalid();visiting.add(id);stack.push([id,true]);for(const parent of parents.get(id))stack.push([parent,false]);}}
   const referenced=new Set([...parents.values()].flat()),heads=nodes.filter(x=>!referenced.has(x.id));if(!heads.length)throw invalid();
   return {nodes,heads,revision:heads.map(revisionKey).sort()};
  }
  const choices=g=>g.heads.map(x=>({id:revisionKey(x),name:x.name,createdTime:x.createdTime}));
  const conflict=g=>new DriveError('conflict','雲端有不同版本；請選擇雲端內容或目前分頁的未同步草稿繼續使用。',{heads:choices(g),revision:g.revision});
  async function read(datasetId){const g=await graph(datasetId);if(g.heads.length!==1)throw conflict(g);const {document}=await download(g.heads[0]);return {datasetId,document,revision:g.revision,heads:choices(g)};}
  async function readHead(datasetId,id){const g=await graph(datasetId),meta=g.heads.find(x=>revisionKey(x)===id);if(!meta)throw conflict(g);return {datasetId,document:(await download(meta)).document,revision:g.revision,heads:choices(g)};}
  async function reserveDay(operation){
   // Reserve tomorrow's ID on an existing head before creation. Two devices then
   // create the same Drive ID rather than two files with the same daily name.
   for(let attempt=0;attempt<3;attempt++){
    const response=await call(API+'/files/'+encodeURIComponent(operation.baseId)+'?fields=id,appProperties'),base=await response.json();
    if(revisionKey(base)!==operation.baseRevision){pending=null;throw conflict(await graph(operation.datasetId));}
    if(base.appProperties.nextDay===operation.day&&validId(base.appProperties.nextFile)){operation.id=base.appProperties.nextFile;return;}
    const etag=response.headers.get('etag');if(!etag)throw new DriveError('conditional','無法確認雲端版本，已暫停建立每日書籤檔，請重新連接後重試。');
    try{await call(API+'/files/'+encodeURIComponent(operation.baseId)+'?fields=id',{method:'PATCH',headers:{'Content-Type':'application/json','If-Match':etag},body:JSON.stringify({appProperties:{nextDay:operation.day,nextFile:operation.commit}})});operation.id=operation.commit;return;}
    catch(error){if(error.code!=='changed')throw error;}
   }
   throw new DriveError('network','其他裝置正在建立當日檔案，請稍後重試。');
  }
  async function upload(operation){
   const parentFolder=await ensureFolder();
   if(!operation.commit){const generated=await(await call(API+'/files/generateIds?count=1&space=drive&type=files')).json();operation.commit=generated.ids?.[0];if(!validId(operation.commit))throw invalid();}
   if(!operation.id&&operation.baseId)await reserveDay(operation);
   if(!operation.id)operation.id=operation.commit;
   const props={purpose:PURPOSE,dataset:operation.datasetId,day:operation.day,commit:operation.commit,parent:operation.parents[0]||'',merge:operation.parents.length>1?'1':'0'};
   const meta={id:operation.id,name:'bookmarks-'+operation.day+'.json',mimeType:'application/json',parents:[parentFolder],appProperties:props};
   const envelope={format:1,datasetId:operation.datasetId,commit:operation.commit,parents:operation.parents,data:operation.document};
   let etag='',moveQuery='';
   if(operation.update){
    const response=await call(API+'/files/'+encodeURIComponent(operation.id)+'?fields=id,parents,appProperties'),current=await response.json();
    if(current.appProperties?.commit===operation.commit){const stored=await download(current);if(JSON.stringify(stored.envelope)!==JSON.stringify(envelope))throw invalid();return meta;}
    if(revisionKey(current)!==operation.previous){pending=null;throw conflict(await graph(operation.datasetId));}
    if(current.appProperties.nextDay&&current.appProperties.nextDay>operation.day){pending=null;throw conflict(await graph(operation.datasetId));}
    etag=response.headers.get('etag');if(!etag)throw new DriveError('conditional','無法確認當日檔案版本，已暫停更新以免覆蓋其他裝置的修改。請重新連接後重試。');
    if(!current.parents?.includes(parentFolder)){moveQuery='&addParents='+encodeURIComponent(parentFolder);if(current.parents?.length)moveQuery+='&removeParents='+encodeURIComponent(current.parents.join(','));}
   }
   // Drive updates cannot change id or parents through the multipart metadata body.
   const uploadMeta=operation.update?{name:meta.name,mimeType:meta.mimeType,appProperties:props}:meta;
   const boundary='bookmark_'+uuid(),body='--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'+JSON.stringify(uploadMeta)+'\r\n--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'+JSON.stringify(envelope)+'\r\n--'+boundary+'--';
   if(new TextEncoder().encode(body).length>5*1024*1024)throw new DriveError('size','書籤資料超過 5 MB，請先下載備份並縮減資料。');
   try{await call('https://www.googleapis.com/upload/drive/v3/files'+(operation.update?'/'+encodeURIComponent(operation.id):'')+'?uploadType=multipart&fields=id'+moveQuery,{method:operation.update?'PATCH':'POST',headers:{'Content-Type':'multipart/related; boundary='+boundary,...(etag?{'If-Match':etag}:{})},body});}
   catch(error){if(error.code==='changed'){pending=null;throw conflict(await graph(operation.datasetId));}if(error.code!=='exists')throw error;const existing=await(await call(API+'/files/'+encodeURIComponent(operation.id)+'?fields=id,appProperties')).json();const stored=await download(existing);if(JSON.stringify(stored.envelope)!==JSON.stringify(envelope)){pending=null;throw conflict(await graph(operation.datasetId));}}
   return meta;
  }
  async function commit(datasetId,document,expectedHeads,isCreate=false){
   const next=checked(document),normalized=JSON.stringify(file.readDataFile(JSON.stringify(next)));
   if(pending){if(pending.datasetId!==datasetId||!same(pending.expected,expectedHeads)||pending.normalized!==normalized)throw new DriveError('pending','前一次儲存尚未確認，請先重試原草稿。');}
   else{
    let current;if(!isCreate){current=await graph(datasetId);if(!same(current.revision,expectedHeads))throw conflict(current);}
    const day=taipeiDay(now()),target=current?.heads.find(x=>x.appProperties.day===day);
    let parents=current?.heads.map(x=>x.id)||[];
    if(target){const prior=(await download(target)).envelope.parents;parents=[...new Set([...parents.filter(id=>id!==target.id),...prior])];}
    const base=current?.heads.slice().sort((a,b)=>a.id.localeCompare(b.id))[0];
    pending={datasetId,document:next,parents:parents.sort(),expected:[...expectedHeads],normalized,day,...(target?{id:target.id,update:true,previous:revisionKey(target)}:base?{baseId:base.id,baseRevision:revisionKey(base)}:{})};
   }
   const own=await upload(pending);const current=await graph(datasetId);
   if(!current.nodes.some(x=>x.id===own.id))throw new DriveError('network','Drive 尚未列出剛上傳的版本，請保留分頁並重試確認。');
   pending=null;if(current.heads.length!==1||revisionKey(current.heads[0])!==revisionKey(own))throw conflict(current);
   return {datasetId,document:next,revision:current.revision,heads:choices(current)};
  }
  return {
   async account(){const user=(await(await call(API+'/about?fields=user(permissionId,emailAddress,displayName)')).json()).user;if(!user?.permissionId)throw invalid();return {id:user.permissionId,email:user.emailAddress||'',name:user.displayName||''};},
   async listLibraries(){const all=await list();await organize(all);const groups=new Map();for(const meta of all){const id=meta.appProperties.dataset,group=groups.get(id)||{id,name:'我的書籤',createdTime:meta.createdTime};if(meta.createdTime<group.createdTime)group.createdTime=meta.createdTime;groups.set(id,group);}return [...groups.values()];},
   async create(document){const id=pending?.datasetId||uuid();try{return await commit(id,document,[],true);}catch(error){error.datasetId=id;throw error;}},
   read,readHead,write:(id,document,revision)=>commit(id,document,revision),resolve:(id,document,revision)=>commit(id,document,revision),
   reset(){pending=null;folderId='';folderRequestId='';folderTask=null;}
  };
 }
 return {createDriveStore,DriveError};
});
