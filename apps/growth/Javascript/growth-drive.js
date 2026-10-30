// Private monthly snapshots; photos are separate authorized binary files.
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./growth-data.js'));else root.GrowthDrive=factory(root.GrowthData);})(globalThis,function(file){
 'use strict';
 const PURPOSE='melody-home-growth-v1',API='https://www.googleapis.com/drive/v3';
 class DriveError extends Error{constructor(code,message,details={}){super(message);this.name='DriveError';this.code=code;Object.assign(this,details);}}
 const invalid=()=>new DriveError('invalid','Drive 相簿版本不完整或格式錯誤，已停止載入；請保留備份，不要刪除版本檔。');
 const validId=value=>typeof value==='string'&&/^[a-zA-Z0-9_-]{1,200}$/.test(value);
 const same=(a,b)=>JSON.stringify([...a].sort())===JSON.stringify([...b].sort());
 function checked(document){try{return file.validate(document);}catch{throw invalid();}}
 const revisionKey=meta=>meta.appProperties.commit?meta.id+'~'+meta.appProperties.commit:meta.id;
 const taipeiMonth=time=>{const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit'}).formatToParts(new Date(time));return parts.find(p=>p.type==='year').value+'-'+parts.find(p=>p.type==='month').value;};
 const photoPattern=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.(png|jpg|webp)$/;
 const photoTypes={png:'image/png',jpg:'image/jpeg',webp:'image/webp'};
 const photoError=()=>new DriveError('photo','照片尚未完整上傳或內容不正確，已停止保存相簿。');
 function createSessionStore({request=globalThis.fetch.bind(globalThis),token,uuid=()=>globalThis.crypto.randomUUID(),now=Date.now}={}){
  let pending=null,folderId='',folderRequestId='',folderTask=null,epoch=0,closed=false;
  const photoPending=new Map();
  const childFolderPending=new Map(),childFolderTasks=new Map();
  async function call(url,options={}){
   const credential=token?.(),generation=epoch;if(closed||!credential)throw new DriveError('auth','請連接 Google Drive 後再試。');
   let response;try{response=await request(url,{...options,headers:{...options.headers,Authorization:'Bearer '+credential},signal:AbortSignal.timeout(30000)});}catch{throw new DriveError('network','無法連線 Google Drive；未同步內容仍在目前分頁，請重試或下載備份。');}
   if(generation!==epoch)throw new DriveError('auth','連線已重設，請重新連接。');
   if(response.ok)return response;
   let apiError={};try{apiError=(await response.clone().json()).error||{};}catch{}
   const reasons=[...(apiError.errors||[]),...(apiError.details||[])].map(item=>item?.reason).filter(value=>typeof value==='string');
   if(response.status===403&&reasons.some(reason=>['accessNotConfigured','SERVICE_DISABLED','API_DISABLED'].includes(reason)))throw new DriveError('apiDisabled','此 Google 專案尚未啟用 Google Drive API。請到 Google Cloud Console 的 API 程式庫啟用 Google Drive API，再重新連接；相簿仍儲存在你的 Google Drive。');
   if(response.status===403&&reasons.some(reason=>['insufficientPermissions','ACCESS_TOKEN_SCOPE_INSUFFICIENT'].includes(reason)))throw new DriveError('scope','Google Drive 授權範圍不足，請重新連接並允許網站存取它建立的相簿檔案。');
   if(response.status===401)throw new DriveError('auth','Google 授權已過期，請重新連接同一帳號。');
   if(response.status===429||reasons.some(reason=>/rateLimit|quota|storageQuota/i.test(reason)))throw new DriveError('quota','Google Drive 空間或請求額度不足，請稍後重試或檢查容量。');
   if(response.status===403)throw new DriveError('permission','Google Drive 拒絕存取，請確認已授予相簿檔案權限。');
   if(response.status===404)throw new DriveError('missing','找不到 Drive 相簿版本；請確認帳號、權限或垃圾桶。');
   if(response.status===409)throw new DriveError('exists','版本檔已存在。');
   if(response.status===412)throw new DriveError('changed','另一台裝置已更新當月相簿，請選擇要繼續使用的版本。');
   throw new DriveError('service','Google Drive 暫時無法完成操作，請重試。');
  }
  async function list(folderSearch=false,photoSearch=false){
   const files=[],pages=new Set();let pageToken='';
   do{
    const url=new URL(API+'/files');url.searchParams.set('q',"trashed = false and 'me' in owners and "+(folderSearch?"name = 'MelodyHome' and mimeType = 'application/vnd.google-apps.folder'":"appProperties has { key='purpose' and value='"+PURPOSE+(photoSearch?'-photo':'')+"' }"));
    url.searchParams.set('fields','nextPageToken,incompleteSearch,files(id,name,mimeType,parents,ownedByMe,shared,trashed,appProperties,createdTime)');url.searchParams.set('pageSize','1000');url.searchParams.set('spaces','drive');if(pageToken)url.searchParams.set('pageToken',pageToken);
    const result=await(await call(url.href)).json();if(!Array.isArray(result.files)||result.incompleteSearch)throw invalid();
    for(const meta of result.files){if(!validId(meta.id)||(folderSearch?meta.name!=='MelodyHome'||meta.mimeType!=='application/vnd.google-apps.folder':photoSearch?meta.appProperties?.purpose!==PURPOSE+'-photo':meta.appProperties?.purpose!==PURPOSE||!validId(meta.appProperties.dataset)||meta.shared!==false||meta.mimeType!=='application/json'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(meta.appProperties.month)||!validId(meta.appProperties.commit)||meta.name!=='growth-'+meta.appProperties.month+'.json'))throw invalid();files.push(meta);}
    pageToken=result.nextPageToken||'';if(pageToken&&pages.has(pageToken))throw invalid();pages.add(pageToken);
   }while(pageToken);
   if(new Set(files.map(x=>x.id)).size!==files.length)throw invalid();return files;
  }
  async function ensureFolder(){
   if(folderTask)return folderTask;
   folderTask=(async()=>{
    const isPrivate=meta=>meta?.shared===false&&[PURPOSE+'-folder','melody-home-bookmarks-v1-folder'].includes(meta.appProperties?.purpose)&&meta.mimeType==='application/vnd.google-apps.folder';
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
  // Drive folder names contain codes only; the stable child ID stays in private metadata.
  async function photoFolders(purpose){
   const folders=[],seen=new Set();let pageToken='';
   do{
    const url=new URL(API+'/files');url.searchParams.set('q',"trashed = false and 'me' in owners and appProperties has { key='purpose' and value='"+purpose+"' }");
    url.searchParams.set('fields','nextPageToken,incompleteSearch,files(id,name,mimeType,parents,ownedByMe,shared,trashed,appProperties)');url.searchParams.set('pageSize','1000');if(pageToken)url.searchParams.set('pageToken',pageToken);
    const result=await(await call(url.href)).json();if(!Array.isArray(result.files)||result.incompleteSearch)throw invalid();
    for(const meta of result.files){if(!validId(meta.id)||meta.mimeType!=='application/vnd.google-apps.folder'||meta.appProperties?.purpose!==purpose||seen.has(meta.id))throw invalid();seen.add(meta.id);folders.push(meta);}
    pageToken=result.nextPageToken||'';if(pageToken&&seen.has('page:'+pageToken))throw invalid();seen.add('page:'+pageToken);
   }while(pageToken);return folders;
  }
  async function managedPhotoFolder(purpose,childId,name,parent){
   const key=purpose+':'+(childId||'');if(childFolderTasks.has(key))return childFolderTasks.get(key);
   const task=(async()=>{
    const all=await photoFolders(purpose),matches=all.filter(meta=>(meta.appProperties.child||'')===(childId||''));
    const privateFolder=meta=>meta.shared===false&&meta.ownedByMe===true&&meta.trashed!==true;
    if(matches.some(meta=>!privateFolder(meta)))throw new DriveError('folderPrivacy','孩子的照片資料夾已分享或無法確認為私人，已停止整理照片。');
    let label=name;
    if(childId){
     const codeOf=meta=>/^\d{2,}$/.test(meta.appProperties.code||'')?meta.appProperties.code:/^\d{2,}$/.test(meta.name)?meta.name:'';
     const used=new Set(all.filter(meta=>meta.appProperties.child!==childId).map(codeOf).filter(Boolean));
     const assigned=matches.map(codeOf).find(Boolean),preferred=assigned||(name==='育銓'?'01':name.toLowerCase()==='baby'?'02':'');
     label=preferred&&!used.has(preferred)?preferred:'';
     if(!label){let number=3;while(used.has(String(number).padStart(2,'0')))number++;label=String(number).padStart(2,'0');}
    }
    let current=matches.sort((a,b)=>a.id.localeCompare(b.id))[0];
    if(!current){
     let requestId=childFolderPending.get(key);if(!requestId){requestId=(await(await call(API+'/files/generateIds?count=1&space=drive&type=files')).json()).ids?.[0];if(!validId(requestId))throw invalid();childFolderPending.set(key,requestId);}
     const meta={id:requestId,name:label,mimeType:'application/vnd.google-apps.folder',parents:[parent],appProperties:{purpose,...(childId?{child:childId,code:label}:{})}};
     try{current=await(await call(API+'/files?fields=id,name,mimeType,parents,shared,ownedByMe,trashed,appProperties',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(meta)})).json();}
     catch(error){if(error.code!=='exists')throw error;current=await(await call(API+'/files/'+encodeURIComponent(requestId)+'?fields=id,name,mimeType,parents,shared,ownedByMe,trashed,appProperties')).json();}
     if(current.id!==requestId||current.mimeType!==meta.mimeType||current.appProperties?.purpose!==purpose||(current.appProperties.child||'')!==(childId||'')||!privateFolder(current))throw invalid();
     // Converge on one folder if two clients created it at the same time.
     const candidates=(await photoFolders(purpose)).filter(meta=>(meta.appProperties.child||'')===(childId||'')&&privateFolder(meta));
     if(candidates.length)current=candidates.sort((a,b)=>a.id.localeCompare(b.id))[0];childFolderPending.delete(key);
    }
    if(current.name!==label||(childId&&current.appProperties.code!==label)||current.parents?.length!==1||current.parents[0]!==parent){
     const url=new URL(API+'/files/'+encodeURIComponent(current.id));url.searchParams.set('fields','id');
     if(!current.parents?.includes(parent))url.searchParams.set('addParents',parent);const remove=(current.parents||[]).filter(id=>id!==parent);if(remove.length)url.searchParams.set('removeParents',remove.join(','));
     await call(url.href,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:label,...(childId?{appProperties:{code:label}}:{})})});
    }
    return current.id;
   })().finally(()=>childFolderTasks.delete(key));childFolderTasks.set(key,task);return task;
  }
  async function childPhotoFolder(child){
   const root=await managedPhotoFolder(PURPOSE+'-photos-folder','','成長相簿照片',await ensureFolder());
   if(!child)return managedPhotoFolder(PURPOSE+'-shared-photos-folder','','共同照片',root);
   if(typeof child.id!=='string'||!/^[a-zA-Z0-9-]{1,80}$/.test(child.id)||typeof child.name!=='string'||!child.name.trim()||child.name.length>80)throw photoError();
   return managedPhotoFolder(PURPOSE+'-child-folder',child.id,child.name.trim(),root);
  }
  async function organizePhotos(document,verified){
   const owners=file.photoOwners(document),destinations=new Map(),children=new Map(document.children.map(child=>[child.id,child]));
   // Retained historical pictures still belong to their child's existing folder,
   // even when no current record references those pictures anymore.
   if(children.size)for(const folder of await photoFolders(PURPOSE+'-child-folder')){
    const child=children.get(folder.appProperties.child);if(child&&!destinations.has(child.id))destinations.set(child.id,await childPhotoFolder(child));
   }
   if(!owners.size)return;
   const inventory=verified||new Map((await list(false,true)).map(meta=>[meta.id,meta]));
   for(const [id,childIds]of owners){
    const fileId=document.photoFiles?.[id],meta=inventory.get(fileId);checkPhotoMetadata(meta,id,fileId);
    const child=childIds.size===1?children.get([...childIds][0]):null,key=child?.id||'__shared__';
    if(!destinations.has(key))destinations.set(key,await childPhotoFolder(child));const target=destinations.get(key);
    if(meta.parents?.length===1&&meta.parents[0]===target)continue;
    const url=new URL(API+'/files/'+encodeURIComponent(fileId));url.searchParams.set('fields','id');if(!meta.parents?.includes(target))url.searchParams.set('addParents',target);
    const remove=(meta.parents||[]).filter(parent=>parent!==target);if(remove.length)url.searchParams.set('removeParents',remove.join(','));
    await call(url.href,{method:'PATCH',headers:{'Content-Type':'application/json'},body:'{}'});
   }
  }
  async function download(meta){
   const envelope=await(await call(API+'/files/'+encodeURIComponent(meta.id)+'?alt=media')).json();
   const props=meta.appProperties;
   if(!!props.month!==!!props.commit)throw invalid();
   if(props.month&&(!/^\d{4}-(0[1-9]|1[0-2])$/.test(props.month)||!validId(props.commit)||envelope.commit!==props.commit))throw invalid();
   if(envelope?.format!==1||envelope.datasetId!==props.dataset||!Array.isArray(envelope.parents)||envelope.parents.some(x=>!validId(x)||x===meta.id)||new Set(envelope.parents).size!==envelope.parents.length)throw invalid();
   if(props.merge==='1'){if(envelope.parents.length<2||props.parent!==envelope.parents[0])throw invalid();}
   else if(!same(envelope.parents,props.parent?[props.parent]:[]))throw invalid();
   return {envelope,document:checked(envelope.data)};
  }
  async function photoMetadata(id,fileId){
   if(!photoPattern.test(id)||!validId(fileId))throw photoError();
   const meta=await(await call(API+'/files/'+encodeURIComponent(fileId)+'?fields=id,name,mimeType,parents,ownedByMe,shared,trashed,appProperties')).json();
   checkPhotoMetadata(meta,id,fileId);
   return meta;
  }
  async function validatePhoto(blob,id){
   const extension=id?.split('.').pop();
   if(!photoPattern.test(id)||!blob||typeof blob.arrayBuffer!=='function'||blob.type!==photoTypes[extension]||blob.size>12*1024*1024)throw photoError();
   const bytes=new Uint8Array(await blob.arrayBuffer());
   const valid=extension==='png'?bytes.length>=24&&[137,80,78,71,13,10,26,10].every((b,i)=>bytes[i]===b):extension==='jpg'?bytes.length>=4&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255:bytes.length>=16&&String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP';
   if(!valid)throw photoError();return bytes;
  }
  async function readPhoto(id,fileId){await photoMetadata(id,fileId);const blob=await(await call(API+'/files/'+encodeURIComponent(fileId)+'?alt=media')).blob();await validatePhoto(blob,id);return blob;}
  async function uploadPhoto(blob,id,child){
   const extension=Object.keys(photoTypes).find(ext=>photoTypes[ext]===blob?.type);id=id||uuid()+'.'+extension;
   const bytes=await validatePhoto(blob,id),signature=Array.from(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join(''),prior=photoPending.get(id);
   if(prior&&prior.signature!==signature)throw new DriveError('pending','同一照片識別碼有不同內容，請重試原照片。');
   const operation=prior||{signature};photoPending.set(id,operation);
   if(!operation.fileId){const generated=await(await call(API+'/files/generateIds?count=1&space=drive&type=files')).json();operation.fileId=generated.ids?.[0];if(!validId(operation.fileId))throw invalid();}
   const parent=child?await childPhotoFolder(child):await ensureFolder(),meta={id:operation.fileId,name:id,mimeType:blob.type,parents:[parent],appProperties:{purpose:PURPOSE+'-photo',photo:id}};
   const confirm=async()=>{const existing=new Uint8Array(await(await readPhoto(id,operation.fileId)).arrayBuffer());if(existing.length!==bytes.length||!existing.every((b,i)=>b===bytes[i]))throw invalid();operation.done=true;return {id,fileId:operation.fileId};};
   if(operation.location||operation.done){try{return await confirm();}catch(error){if(error.code!=='missing')throw error;operation.done=false;}}
   if(blob.size>5*1024*1024){
    if(!operation.location){
     let response;try{response=await call('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id',{method:'POST',headers:{'Content-Type':'application/json; charset=UTF-8','X-Upload-Content-Type':blob.type,'X-Upload-Content-Length':String(blob.size)},body:JSON.stringify(meta)});}catch(error){if(error.code==='exists')return confirm();throw error;}
     const location=response.headers.get('location');let address;try{address=new URL(location);}catch{throw invalid();}
     if(address.protocol!=='https:'||!['www.googleapis.com','content.googleapis.com'].includes(address.hostname)||address.pathname!=='/upload/drive/v3/files'||address.username||address.password)throw invalid();
     operation.location=address.href;
    }
    try{await call(operation.location,{method:'PUT',headers:{'Content-Type':blob.type},body:blob});}catch(error){if(error.code==='missing'){operation.location='';throw new DriveError('network','照片上傳已逾時，請重試原照片。');}throw error;}
    operation.done=true;return {id,fileId:operation.fileId};
   }
   const boundary='growth_photo_'+uuid(),body=new Blob(['--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'+JSON.stringify(meta)+'\r\n--'+boundary+'\r\nContent-Type: '+blob.type+'\r\n\r\n',blob,'\r\n--'+boundary+'--']);
   try{await call('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',{method:'POST',headers:{'Content-Type':'multipart/related; boundary='+boundary},body});}
   catch(error){if(error.code!=='exists')throw error;return confirm();}
   operation.done=true;
   return {id,fileId:operation.fileId};
  }
  function checkPhotoMetadata(meta,id,fileId){if(!meta||meta.id!==fileId||meta.name!==id||meta.appProperties?.purpose!==PURPOSE+'-photo'||meta.appProperties.photo!==id||meta.mimeType!==photoTypes[id.split('.').pop()]||meta.ownedByMe!==true||meta.shared!==false||meta.trashed===true)throw invalid();}
  async function verifyPhotos(document){
   const ids=file.photoIds(document);for(const id of ids)if(!document.photoFiles?.[id])throw photoError();
   // Large albums use a paginated metadata inventory rather than a round trip
   // for each picture. Recheck on every new save so deleted/shared files fail.
   const inventory=new Map();
   if(ids.length>8){const all=new Map((await list(false,true)).map(meta=>[meta.id,meta]));for(const id of ids){const meta=all.get(document.photoFiles[id]);checkPhotoMetadata(meta,id,document.photoFiles[id]);inventory.set(meta.id,meta);}}
   else for(const id of ids){const meta=await photoMetadata(id,document.photoFiles[id]);inventory.set(meta.id,meta);}
   return inventory;
  }
  async function graph(datasetId){
   if(!validId(datasetId))throw invalid();
   const nodes=(await list()).filter(x=>x.appProperties.dataset===datasetId);if(!nodes.length)throw new DriveError('missing','找不到這份雲端相簿；不會自動建立空資料覆蓋。');
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
  async function read(datasetId){const g=await graph(datasetId);if(g.heads.length!==1)throw conflict(g);const {document}=await download(g.heads[0]);await organizePhotos(document);return {datasetId,document,revision:g.revision,heads:choices(g)};}
  async function readHead(datasetId,id){const g=await graph(datasetId),meta=g.heads.find(x=>revisionKey(x)===id);if(!meta)throw conflict(g);return {datasetId,document:(await download(meta)).document,revision:g.revision,heads:choices(g)};}
  const privateProperties=props=>Object.entries(props).map(([key,value])=>({key,value,visibility:'PRIVATE'}));
  // 回傳的 meta 與 ETag 必須是同次讀取的一致快照，且條件式寫入要用同一 API 版本。
  async function conditionalFile(id){
   const response=await call(API+'/files/'+encodeURIComponent(id)+'?fields=id,parents,appProperties'),meta=await response.json(),etag=response.headers.get('etag');
   if(etag)return {meta,etag,version:'v3'};
   // Drive v3 does not always expose ETags to browser clients. v2 includes the
   // file ETag in JSON; use that same API version for the conditional write.
   // v3 讀不到 ETag 時，用 v2 JSON 取回；同時重讀私有屬性，不能拿新 ETag 配舊 commit。
   const legacy=await(await call('https://www.googleapis.com/drive/v2/files/'+encodeURIComponent(id)+'?fields=id,etag,parents(id),properties(key,value,visibility)')).json();
   if(typeof legacy.etag!=='string'||!legacy.etag||legacy.etag.startsWith('W/'))throw new DriveError('conditional','無法取得 Google Drive 檔案版本，已保留未同步資料；請稍後重試。');
   if(legacy.id!==id||!Array.isArray(legacy.properties)||!Array.isArray(legacy.parents))throw invalid();
   return {meta:{id:legacy.id,parents:legacy.parents.map(p=>p.id),appProperties:Object.fromEntries(legacy.properties.filter(p=>p.visibility==='PRIVATE').map(p=>[p.key,p.value]))},etag:legacy.etag,version:'v2'};
  }
  async function reserveMonth(operation){
   // Reserve the next month's ID on the current head so concurrent devices
   // create the same file instead of duplicate monthly names.
   for(let attempt=0;attempt<3;attempt++){
    const {meta:base,etag,version}=await conditionalFile(operation.baseId);
    if(revisionKey(base)!==operation.baseRevision){pending=null;throw conflict(await graph(operation.datasetId));}
    if(base.appProperties.nextMonth===operation.month&&validId(base.appProperties.nextFile)){operation.id=base.appProperties.nextFile;return;}
    const reservation={nextMonth:operation.month,nextFile:operation.commit};
    try{await call('https://www.googleapis.com/drive/'+version+'/files/'+encodeURIComponent(operation.baseId)+'?fields=id',{method:'PATCH',headers:{'Content-Type':'application/json','If-Match':etag},body:JSON.stringify(version==='v2'?{properties:privateProperties({...base.appProperties,...reservation})}:{appProperties:reservation})});operation.id=operation.commit;return;}
    catch(error){if(error.code!=='changed')throw error;}
   }
   throw new DriveError('network','其他裝置正在建立當月檔案，請稍後重試。');
  }
  async function upload(operation){
   const parentFolder=await ensureFolder();
   if(!operation.commit){const generated=await(await call(API+'/files/generateIds?count=1&space=drive&type=files')).json();operation.commit=generated.ids?.[0];if(!validId(operation.commit))throw invalid();}
   if(!operation.id&&operation.baseId)await reserveMonth(operation);
   if(!operation.id)operation.id=operation.commit;
   const props={purpose:PURPOSE,dataset:operation.datasetId,month:operation.month,commit:operation.commit,parent:operation.parents[0]||'',merge:operation.parents.length>1?'1':'0'};
   const meta={id:operation.id,name:'growth-'+operation.month+'.json',mimeType:'application/json',parents:[parentFolder],appProperties:props};
   const envelope={format:1,datasetId:operation.datasetId,commit:operation.commit,parents:operation.parents,data:operation.document};
   let etag='',moveQuery='',version='v3',currentProperties={};
   if(operation.update){
    const conditional=await conditionalFile(operation.id),current=conditional.meta;etag=conditional.etag;version=conditional.version;currentProperties=current.appProperties;
    if(current.appProperties?.commit===operation.commit){const stored=await download(current);if(JSON.stringify(stored.envelope)!==JSON.stringify(envelope))throw invalid();return meta;}
    if(revisionKey(current)!==operation.previous){pending=null;throw conflict(await graph(operation.datasetId));}
    if(current.appProperties.nextMonth&&current.appProperties.nextMonth>operation.month){pending=null;throw conflict(await graph(operation.datasetId));}
    if(!current.parents?.includes(parentFolder)){moveQuery='&addParents='+encodeURIComponent(parentFolder);if(current.parents?.length)moveQuery+='&removeParents='+encodeURIComponent(current.parents.join(','));}
   }
   // Drive updates cannot change id or parents through the multipart metadata body.
   const uploadMeta=version==='v2'?{title:meta.name,mimeType:meta.mimeType,properties:privateProperties({...currentProperties,...props})}:operation.update?{name:meta.name,mimeType:meta.mimeType,appProperties:props}:meta;
   const boundary='growth_'+uuid(),body='--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'+JSON.stringify(uploadMeta)+'\r\n--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'+JSON.stringify(envelope)+'\r\n--'+boundary+'--';
   if(new TextEncoder().encode(body).length>5*1024*1024)throw new DriveError('size','相簿資料超過 5 MB，請先下載備份並縮減資料。');
   try{await call('https://www.googleapis.com/upload/drive/'+version+'/files'+(operation.update?'/'+encodeURIComponent(operation.id):'')+'?uploadType=multipart&fields=id'+moveQuery,{method:version==='v2'?'PUT':operation.update?'PATCH':'POST',headers:{'Content-Type':'multipart/related; boundary='+boundary,...(etag?{'If-Match':etag}:{})},body});}
   catch(error){if(error.code==='changed'){pending=null;throw conflict(await graph(operation.datasetId));}if(error.code!=='exists')throw error;const existing=await(await call(API+'/files/'+encodeURIComponent(operation.id)+'?fields=id,appProperties')).json();const stored=await download(existing);if(JSON.stringify(stored.envelope)!==JSON.stringify(envelope)){pending=null;throw conflict(await graph(operation.datasetId));}}
   return meta;
  }
  async function commit(datasetId,document,expectedHeads,isCreate=false){
   const next=checked(document),normalized=JSON.stringify(file.validate(next));
   if(pending){if(pending.datasetId!==datasetId||!same(pending.expected,expectedHeads)||pending.normalized!==normalized)throw new DriveError('pending','前一次儲存尚未確認，請先重試原草稿。');}
   else{
    const photoInventory=await verifyPhotos(next);
    let current;if(!isCreate){current=await graph(datasetId);if(!same(current.revision,expectedHeads))throw conflict(current);}
    const month=taipeiMonth(now()),target=current?.heads.find(x=>x.appProperties.month===month);
    let parents=current?.heads.map(x=>x.id)||[];
    if(target){const prior=(await download(target)).envelope.parents;parents=[...new Set([...parents.filter(id=>id!==target.id),...prior])];}
    const base=current?.heads.slice().sort((a,b)=>a.id.localeCompare(b.id))[0];
    pending={datasetId,document:next,parents:parents.sort(),expected:[...expectedHeads],normalized,month,photoInventory,...(target?{id:target.id,update:true,previous:revisionKey(target)}:base?{baseId:base.id,baseRevision:revisionKey(base)}:{})};
   }
   const own=await upload(pending);const current=await graph(datasetId);
   if(!current.nodes.some(x=>x.id===own.id))throw new DriveError('network','Drive 尚未列出剛上傳的版本，請保留分頁並重試確認。');
   if(current.heads.length!==1||revisionKey(current.heads[0])!==revisionKey(own)){pending=null;throw conflict(current);}
   const inventory=pending.photoInventory;pending.photoInventory=null;await organizePhotos(next,inventory);pending=null;
   return {datasetId,document:next,revision:current.revision,heads:choices(current)};
  }
  return {
   async account(){const user=(await(await call(API+'/about?fields=user(permissionId,emailAddress,displayName)')).json()).user;if(!user?.permissionId)throw invalid();return {id:user.permissionId,email:user.emailAddress||'',name:user.displayName||''};},
   async listLibraries(){const all=await list();await organize(all);const groups=new Map();for(const meta of all){const id=meta.appProperties.dataset,group=groups.get(id)||{id,name:'我的相簿',createdTime:meta.createdTime};if(meta.createdTime<group.createdTime)group.createdTime=meta.createdTime;groups.set(id,group);}return [...groups.values()];},
   async create(document){const id=pending?.datasetId||uuid();try{return await commit(id,document,[],true);}catch(error){error.datasetId=id;throw error;}},
   read,readHead,readPhoto,uploadPhoto,write:(id,document,revision)=>commit(id,document,revision),resolve:(id,document,revision)=>commit(id,document,revision),
   reset(){closed=true;epoch++;pending=null;folderId='';folderRequestId='';folderTask=null;photoPending.clear();}
  };
 }
 function createDriveStore(options={}){
  let session=createSessionStore(options);
  const store={reset(){session.reset();session=createSessionStore(options);}};
  for(const name of ['account','listLibraries','create','read','readHead','readPhoto','uploadPhoto','write','resolve'])store[name]=async(...args)=>{const active=session,result=await active[name](...args);if(active!==session)throw new DriveError('auth','連線已重設，請重新連接。');return result;};
  return store;
 }
 return {createDriveStore,DriveError};
});
