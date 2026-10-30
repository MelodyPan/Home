// Authorization, album synchronization and private photo URLs. Album data stays in memory.
(()=>{
 'use strict';
 function mount({onDocument,onState=()=>{},onClear=()=>{},onPhotos=()=>{},hasEdits=()=>false,getDraft=()=>null}){
  const $=id=>document.getElementById(id),config=globalThis.BookmarksConfig||{};
  let credential='',expires=0,lastActivity=0,session,working=false,generation=0,lastDocument=null,lastAccount=null,lastDataset=null,expiring=false,notice='';
  let photoFiles={},urls=new Map(),requests=new Map(),photoErrors=new Set(),uploadIds=new WeakMap(),photoBlobs=new Map(),pendingImport=null;
  let storage;try{storage=window.sessionStorage;}catch{}
  const login=BookmarkLogin.createLoginCache({storage,clientId:config.googleClientId});
  const token=()=>Date.now()<expires?credential:'';
  const store=GrowthDrive.createDriveStore({token});
  const clearAuthorization=()=>{credential='';expires=0;login.clear();};
  const connected=()=>!!token()&&!expiring;
  const editable=()=>connected()&&!working&&session.state.online&&session.state.phase==='ready';
  function message(text){notice=text;$('growth-cloud-message').textContent=text;}
  function clearPhotos(){generation++;for(const url of urls.values())URL.revokeObjectURL(url);urls.clear();requests.clear();photoErrors.clear();photoBlobs.clear();photoFiles={};uploadIds=new WeakMap();lastDocument=null;onClear();}
  function authorize({resume=false}={}){
   if(resume){const saved=login.read();if(!saved)return Promise.reject(new Error('登入已逾時，請重新連接 Google Drive。'));credential=saved.token;expires=saved.expires;lastActivity=Number.isFinite(saved.active)?saved.active:Date.now();expiring=false;return Promise.resolve();}
   if(!config.googleClientId)return Promise.reject(new Error('請先設定 Google OAuth Client ID，詳見成長相簿的 Google Drive 說明。'));
   if(!globalThis.google?.accounts?.oauth2)return Promise.reject(new Error('Google 登入元件尚未載入，請檢查網路後重試。'));
   return new Promise((resolve,reject)=>{
    const client=google.accounts.oauth2.initTokenClient({client_id:config.googleClientId,scope:'https://www.googleapis.com/auth/drive.file',callback:response=>{
     if(response.error||!response.access_token||!google.accounts.oauth2.hasGrantedAllScopes(response,'https://www.googleapis.com/auth/drive.file')){clearAuthorization();reject(new Error('Google 授權未完成；請允許網站存取它建立的 Drive 檔案。'));return;}
     credential=response.access_token;expires=Date.now()+Number(response.expires_in||3600)*1000-30000;lastActivity=Date.now();login.save(credential,expires);expiring=false;resolve();
    },error_callback:()=>reject(new Error('Google 登入視窗已關閉或被阻擋，請再試一次。'))});
    client.requestAccessToken({prompt:'select_account'});
   });
  }
  const openManager=()=>{if(!$('growth-drive-dialog').open)$('growth-drive-dialog').showModal();};
  function update(state){
   if(state.account&&lastAccount!==state.account.id){clearPhotos();lastAccount=state.account.id;}
   if(['disconnected','empty','choosing'].includes(state.phase)&&lastDocument){clearPhotos();}
   if(!connected()&&lastDocument){clearPhotos();}
   if(connected()&&state.document&&state.document!==lastDocument&&state.phase==='ready'){
    if(lastDataset&&lastDataset!==state.datasetId)clearPhotos();lastDataset=state.datasetId;
    photoFiles={...photoFiles,...state.document.photoFiles};lastDocument=state.document;onDocument(state.document);
   }
   const occupied=working||['connecting','loading','saving'].includes(state.phase)||state.pending>0;
   // 入口只開啟狀態視窗；同步時仍可查看進度，真正的雲端操作繼續由 occupied 鎖定。
   $('growth-login').textContent='登入';$('growth-login').disabled=false;
   $('growth-login').setAttribute('aria-busy',String(occupied));
   $('growth-cloud-account').textContent=state.error?.code==='account'?'請重新連接原帳號':state.account?.email||'尚未連接';
   $('growth-cloud-connect').disabled=occupied;$('growth-cloud-connect').textContent=connected()?'重新連接 Google Drive':'連接 Google Drive';
   $('growth-cloud-disconnect').hidden=!state.account;$('growth-cloud-disconnect').disabled=occupied;
   $('growth-cloud-refresh').disabled=!editable()||hasEdits();$('growth-cloud-retry').hidden=!state.draft&&state.phase!=='error'&&!pendingImport;
   $('growth-cloud-retry').disabled=occupied||!connected()||!state.online||state.phase==='conflict';
   $('growth-cloud-new').hidden=!['empty','choosing'].includes(state.phase);$('growth-cloud-new').disabled=occupied||!state.online;
   for(const id of ['growth-cloud-folder','growth-cloud-import'])$(id).disabled=occupied||!connected()||!state.online||!['empty','choosing','ready'].includes(state.phase)||hasEdits()||!!state.draft;
   $('growth-cloud-backup').disabled=occupied||!(state.document||state.draft||hasEdits()||pendingImport);
   $('growth-cloud-libraries').hidden=state.phase!=='choosing';const libraries=$('growth-cloud-library');
   if(!occupied){const selected=libraries.value;libraries.replaceChildren();for(const item of state.libraries)libraries.append(new Option(item.name+' · '+item.id.slice(0,8),item.id));if(state.libraries.some(item=>item.id===selected))libraries.value=selected;}
   $('growth-cloud-conflict').hidden=state.phase!=='conflict';const versions=$('growth-cloud-version'),selected=versions.value;versions.replaceChildren();
   for(const head of state.heads)versions.append(new Option((head.name||'雲端版本')+' · '+head.id.slice(0,10),head.id));
   if(state.draft)versions.append(new Option('目前分頁的未同步草稿','draft'));if([...versions.options].some(item=>item.value===selected))versions.value=selected;
   $('growth-cloud-use-version').disabled=occupied||!connected()||!state.online;
   const labels={disconnected:'請登入 Google Drive，載入你的私人相簿。',connecting:'正在連接 Google…',loading:'正在載入相簿…',empty:'尚無雲端相簿。可匯入原有相簿，或建立空白相簿。',choosing:'找到多份相簿，請選擇要開啟的一份。',ready:'已同步至 Google Drive。同月更新同一份紀錄檔，跨月保留舊檔。',saving:'正在同步至 Google Drive…',error:state.error?.message||'同步失敗，草稿仍在目前分頁。',conflict:state.error?.message||'其他裝置已修改資料，請選擇要繼續使用的版本。'};
   $('growth-cloud-message').textContent=!state.online?'目前離線，已暫停編輯；未同步草稿仍在此分頁。':notice||labels[state.phase]||'';
   $('growth-cloud-setup').hidden=!!config.googleClientId;onState({editable:editable(),phase:state.phase,error:state.error});
   if(state.phase==='conflict')openManager();
  }
  session=BookmarkCloud.createCloudSession({store,authorize,clearAuthorization,onChange:update,saveDelayMs:0});
  function assertConnected(){if(!connected()||!session.state.online)throw new Error('請先連接 Google Drive 並確認網路，再同步相簿。');}
  async function readPhoto(id){
   if(photoBlobs.has(id))return photoBlobs.get(id);
   assertConnected();const fileId=photoFiles[id];if(!fileId)throw new Error('找不到照片對應檔案：'+id);
   const current=generation,result=await store.readPhoto(id,fileId);if(current!==generation||!connected())throw new Error('登入或相簿已變動，請重新操作。');photoBlobs.set(id,result);return result;
  }
  function photoUrl(id){
   if(!connected()||!photoFiles[id])return '';if(urls.has(id))return urls.get(id);
   if(!requests.has(id)&&!photoErrors.has(id)){
    const current=generation;
    const task=readPhoto(id).then(blob=>{if(current!==generation)return;urls.set(id,URL.createObjectURL(blob));onPhotos();}).catch(error=>{if(current!==generation)return;photoErrors.add(id);message('照片暫時無法載入：'+error.message);}).finally(()=>{if(current===generation)requests.delete(id);});requests.set(id,task);
   }
   return '';
  }
  async function uploadPhoto(blob,id,child){
   assertConnected();const current=generation;
   if(!id){id=uploadIds.get(blob);if(!id){const ext=blob.type==='image/png'?'png':blob.type==='image/webp'?'webp':'jpg';id=crypto.randomUUID()+'.'+ext;uploadIds.set(blob,id);}}
   const result=await store.uploadPhoto(blob,id,child);if(current!==generation||!connected())throw new Error('登入或相簿已變動，請重新操作。');
   photoFiles[result.id]=result.fileId;photoBlobs.set(result.id,blob);return result;
  }
  async function save(next){
   assertConnected();if(!editable())throw new Error('請先完成同步或處理版本衝突，再儲存相簿。');
   const current=generation,snapshot=GrowthData.validate({...next,photoFiles:{...next.photoFiles,...photoFiles},updatedAt:new Date().toISOString()});
   await session.save(snapshot);if(current!==generation||!connected())throw new Error('登入或相簿已變動，請重新操作。');
   if(session.state.draft||session.state.phase!=='ready')throw session.state.error||new Error('相簿尚未同步，請保留表單並重試。');return session.state.document;
  }
  async function action(work){if(working)return;working=true;notice='';update(session.state);try{await work();}catch(error){message(error.message);}finally{working=false;update(session.state);}}
  async function backup(){
   const draft=await getDraft(),source=draft?.document||session.state.draft||pendingImport?.loaded.document||session.state.document;if(!source)throw new Error('尚無可備份的相簿。');
   const blob=await GrowthBackup.encode(source,id=>draft?.photos?.get(id)||pendingImport?.loaded.photos.get(id)||readPhoto(id));
   const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='growth-backup-'+new Date().toISOString().slice(0,10)+'.growth';a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);message('完整相簿備份已準備下載，包含紀錄與照片。');
  }
  async function importAlbum(loaded){
   assertConnected();if(!['empty','choosing','ready'].includes(session.state.phase)||session.hasUnsaved||hasEdits())throw new Error('請先完成同步並關閉編輯表單，再匯入。');
   pendingImport={loaded,account:session.state.account.id,generation,uploaded:new Map()};await continueImport();
  }
  async function continueImport(){
   const operation=pendingImport;if(!operation)return;assertConnected();
   if(operation.account!==session.state.account?.id||operation.generation!==generation)throw new Error('匯入帳號或相簿已變動，請重新選取備份。');
   const {loaded}=operation,owners=GrowthData.photoOwners(loaded.document);let done=0;
   for(const [id,blob] of loaded.photos){
    if(!operation.uploaded.has(id)){const result=await uploadPhoto(blob,id,owners.get(id)?.size===1?loaded.document.children.find(child=>child.id===[...owners.get(id)][0]):undefined);operation.uploaded.set(id,result.fileId);}
    message('正在匯入照片 '+(++done)+' / '+loaded.photos.size+'…');
   }
   operation.snapshot||={...loaded.document,photoFiles:Object.fromEntries(operation.uploaded),updatedAt:new Date().toISOString()};
   if(!operation.createdId)operation.createdId=(await store.create(operation.snapshot)).datasetId;
   await session.open(operation.createdId);
   if(session.state.phase!=='ready')throw session.state.error||new Error('相簿未完成同步，請按重試。');pendingImport=null;message('已匯入獨立雲端相簿，原有資料保持完整。');
  }
  async function selectImport(event,folder){
   const files=Array.from(event.target.files);event.target.value='';if(!files.length)return;
   await action(async()=>{
    const current=generation,account=session.state.account?.id,loaded=folder?await GrowthBackup.readFiles(files):await GrowthBackup.decode(files[0]);
    if(current!==generation||account!==session.state.account?.id)throw new Error('登入已變動，請重新選取檔案。');
    if(confirm('已讀取 '+loaded.document.children.length+' 位孩子、'+loaded.document.records.length+' 筆故事及 '+loaded.photos.size+' 張照片。要匯入成新的私人雲端相簿嗎？'))await importAlbum(loaded);
   });
  }
  $('growth-login').addEventListener('click',()=>{update(session.state);openManager();});
  document.querySelectorAll('[data-growth-manage]').forEach(button=>button.addEventListener('click',()=>{update(session.state);openManager();}));
  $('growth-cloud-close').addEventListener('click',()=>$('growth-drive-dialog').close());
  $('growth-cloud-connect').addEventListener('click',()=>{if(hasEdits()&&!session.hasUnsaved){message('請先儲存或取消目前表單，再重新連接。');return;}action(()=>session.connect());});
  $('growth-cloud-disconnect').addEventListener('click',()=>action(async()=>{
   if((hasEdits()||session.hasUnsaved||pendingImport)&&!confirm('尚有未同步內容，請先下載備份。確定放棄並登出嗎？'))return;
   await session.disconnect({discard:true});pendingImport=null;clearPhotos();lastAccount=null;message('已登出，私人相簿已從畫面清除。');
  }));
  $('growth-cloud-new').addEventListener('click',()=>action(async()=>{if(confirm('要在私人 Google Drive 建立空白相簿嗎？'))await session.create(GrowthData.empty());}));
  $('growth-cloud-refresh').addEventListener('click',()=>action(async()=>{if(hasEdits())throw new Error('請先儲存或取消目前表單。');photoErrors.clear();await session.refresh();onPhotos();}));
  $('growth-cloud-open').addEventListener('click',()=>action(()=>session.open($('growth-cloud-library').value)));
  $('growth-cloud-retry').addEventListener('click',()=>action(async()=>{
   if(session.state.draft){await session.retry();if(session.state.phase==='ready'){pendingImport=null;onClear();onDocument(session.state.document);}}else if(pendingImport)await continueImport();else await session.refresh();
  }));
  $('growth-cloud-use-version').addEventListener('click',()=>action(async()=>{
   if(confirm('要使用選取的版本更新本月紀錄檔嗎？若要保留其他內容，請先下載備份。')){await session.resolve($('growth-cloud-version').value);if(session.state.phase==='ready'){pendingImport=null;onClear();onDocument(session.state.document);}}
  }));
  $('growth-cloud-version-backup').addEventListener('click',()=>action(async()=>{
   const selected=$('growth-cloud-version').value;if(selected==='draft'){await backup();return;}
   const source=(await store.readHead(session.state.datasetId,selected)).document,blob=await GrowthBackup.encode(source,id=>store.readPhoto(id,source.photoFiles[id]));
   const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='growth-version.growth';a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);message('選取版本的完整備份已準備下載。');
  }));
  $('growth-cloud-folder').addEventListener('change',event=>selectImport(event,true));$('growth-cloud-import').addEventListener('change',event=>selectImport(event,false));
  $('growth-cloud-backup').addEventListener('click',()=>action(backup));
  const refresh=()=>{if(!working&&!hasEdits()&&!document.hidden&&connected())session.refresh();};
  window.addEventListener('online',()=>{session.setOnline(true);refresh();});window.addEventListener('offline',()=>session.setOnline(false));
  document.addEventListener('visibilitychange',refresh);window.addEventListener('focus',refresh);
  async function checkIdle(){
   if(!credential&&!expiring)return;if(!expiring&&Date.now()-lastActivity<600000&&Date.now()<expires)return;
   if(!expiring){expiring=true;clearAuthorization();pendingImport=null;clearPhotos();onState({editable:false,phase:'disconnected'});message('登入已逾時，請重新連接 Google Drive。');}
   if(working)return;try{await session.disconnect({discard:true});expiring=false;lastAccount=null;message('閒置 10 分鐘或授權已到期，請重新登入。');}catch{}
  }
  const activity=()=>{if(!credential||expiring)return;if(Date.now()-lastActivity>=600000||Date.now()>=expires){checkIdle();return;}lastActivity=Date.now();};
  for(const name of ['pointerdown','pointermove','keydown','scroll','touchstart'])document.addEventListener(name,activity,{passive:true,capture:true});
  document.addEventListener('visibilitychange',checkIdle);window.addEventListener('focus',checkIdle);setInterval(checkIdle,1000);
  session.setOnline(navigator.onLine);update(session.state);if(login.read())session.connect({resume:true});
  return {save,uploadPhoto,photoUrl,get editable(){return editable();},get hasUnsaved(){return session.hasUnsaved||working||!!pendingImport;}};
 }
 globalThis.GrowthCloudUI={mount};
})();
