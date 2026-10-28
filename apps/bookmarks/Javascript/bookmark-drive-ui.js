// Google authorization and explicit import/conflict controls for the bookmark page.
(()=>{
 'use strict';
 function mount({onChange,download}){
  const $=id=>document.getElementById(id),config=globalThis.BookmarksConfig||{};
  let credential='',expires=0,session,importing=false,selectingImport=false;
  let tabStorage;try{tabStorage=window.sessionStorage;}catch{}
  const login=BookmarkLogin.createLoginCache({storage:tabStorage,clientId:config.googleClientId});
  let expiring=false,details=null;
  const store=BookmarkDrive.createDriveStore({token:()=>Date.now()<expires?credential:''});
  const clearAuthorization=()=>{credential='';expires=0;details=null;login.clear();renderTokenDetails();};
  function renderTokenDetails(){const node=$('cloud-token-details');node.hidden=!credential;node.textContent=!credential?'':details?'Google 回傳 expires_in：'+details.expiresIn+' 秒（約 '+(details.expiresIn/60).toFixed(1)+' 分鐘）。取得時間：'+new Date(details.receivedAt).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',hour12:false})+'（台灣時間）':'這次登入尚未記錄 Google 回傳的 expires_in；請重新連接後查看。';}
  function requestToken(prompt){
   if(!config.googleClientId)return Promise.reject(new Error('請先設定 Google OAuth Client ID，設定方式見專案的 Google Drive 操作說明。'));
   if(!globalThis.google?.accounts?.oauth2)return Promise.reject(new Error('Google 登入元件尚未載入，請檢查網路或阻擋設定後重試。'));
   return new Promise((resolve,reject)=>{
    const client=google.accounts.oauth2.initTokenClient({client_id:config.googleClientId,scope:'https://www.googleapis.com/auth/drive.file',callback:response=>{
     if(response.error||!response.access_token){reject(new Error('Google 授權未完成，請重新連接。'));return;}
     if(!google.accounts.oauth2.hasGrantedAllScopes(response,'https://www.googleapis.com/auth/drive.file')){reject(new Error('需要允許網站存取它建立的 Drive 書籤檔案。'));return;}
     resolve(response);
    },error_callback:()=>reject(new Error('Google 登入視窗已關閉或被阻擋，請再試一次。'))});
    client.requestAccessToken({prompt});
   });
  }
  const tokenExpiry=response=>{const details=BookmarkLogin.tokenDetails(response);if(!details)throw new Error('Google 未回傳有效的授權期限，請重新登入。');return details.receivedAt+details.expiresIn*1000;};
  async function authorize({resume=false}={}){
   if(resume){const saved=login.read();if(!saved)throw new Error('登入已逾時，請重新連接 Google Drive。');credential=saved.token;expires=saved.expires;details=saved.tokenDetails||null;renderTokenDetails();return;}
   let response;try{response=await requestToken('select_account');}catch(error){clearAuthorization();throw error;}
   expires=tokenExpiry(response);credential=response.access_token;details=BookmarkLogin.tokenDetails(response);login.save(credential,expires,undefined,details);expiring=false;renderTokenDetails();
  }
  function message(text){$('cloud-message').textContent=text;}
  function update(state){
   const occupied=importing||['connecting','loading','saving'].includes(state.phase)||state.pending>0;
   $('cloud-connect').disabled=occupied;$('cloud-connect').textContent=state.account?'重新連接 Google Drive':'連接 Google Drive';
   $('cloud-disconnect').hidden=!state.account;$('cloud-disconnect').disabled=occupied;
   $('cloud-sync').hidden=!state.account;$('cloud-sync').disabled=occupied||state.phase!=='ready'||!state.online;
   const connected=!!state.account&&!!credential;
   $('drive-login').textContent=connected?'登出':'登入';$('drive-login').title=connected?'中斷 Google Drive 連接':'登入 Google Drive';$('drive-login').disabled=occupied;
   $('drive-login').setAttribute('aria-haspopup',connected?'false':'dialog');
   $('drive-manage').hidden=!connected;
   $('cloud-account').textContent=state.error?.code==='account'?'請重新連接原帳號':state.account?.email||'尚未連接';
   $('cloud-setup').hidden=!!config.googleClientId;
   $('cloud-initialize').hidden=!['empty','choosing','ready'].includes(state.phase);
   $('cloud-new').hidden=state.phase==='ready';$('cloud-import').disabled=occupied||!state.online;
   $('cloud-import-title').textContent=state.phase==='ready'?'重新匯入書籤資料檔':'匯入書籤資料檔';
   $('cloud-import-note').textContent=state.phase==='ready'?'重新匯入會取代目前書籤內容，並更新當日的雲端檔案。':'選擇 bookmarks-data.txt，確認書籤數量後才會上傳。';
   $('reimport-data').hidden=!state.document;$('reimport-data').disabled=occupied||state.phase!=='ready'||!state.online;
   $('cloud-library-choice').hidden=state.phase!=='choosing';
   const select=$('cloud-library');select.replaceChildren();for(const library of state.libraries){const option=document.createElement('option');option.value=library.id;option.textContent=library.name+' · '+(library.createdTime?new Date(library.createdTime).toLocaleString('zh-TW'):'')+' · '+library.id.slice(0,8);select.append(option);}
   $('cloud-conflict').hidden=state.phase!=='conflict';
   const versions=$('cloud-version'),previous=versions.value;versions.replaceChildren();
   for(const head of state.heads){const option=document.createElement('option');option.value=head.id;option.textContent=(head.createdTime?new Date(head.createdTime).toLocaleString('zh-TW'):'雲端版本')+' · '+head.id.slice(0,10);versions.append(option);}
   if(state.draft){const option=document.createElement('option');option.value='draft';option.textContent='目前分頁的未同步草稿';versions.append(option);}
   if([...versions.options].some(x=>x.value===previous))versions.value=previous;
   const labels={disconnected:'請連接 Google Drive，載入你的私人書籤。',connecting:'正在連接 Google…',loading:'正在載入雲端書籤…',choosing:'找到多份書籤，請選擇要開啟的一份。',empty:'尚無雲端書籤。可匯入資料備份，或建立空白書籤。',ready:'已同步至 Google Drive。',saving:'正在同步至 Google Drive…',error:state.error?.message||'同步失敗；請重試或下載備份。',conflict:state.error?.message||'有多個版本，請選擇要繼續使用的內容。'};
   message(!state.online?'目前沒有網路連線，已暫停編輯；未同步內容仍在目前分頁。':labels[state.phase]);onChange(state);
   if(state.phase==='conflict'&&!$('drive-dialog').open)$('drive-dialog').showModal();
  }
  session=BookmarkCloud.createCloudSession({store,authorize,clearAuthorization,onChange:update});
  const openManager=()=>{if(!$('drive-dialog').open)$('drive-dialog').showModal();};
  $('drive-manage').addEventListener('click',openManager);
  $('drive-login').addEventListener('click',()=>{if(session.state.account&&credential)disconnect();else openManager();});
  $('close-drive-dialog').addEventListener('click',()=>$('drive-dialog').close());
  $('drive-dialog').addEventListener('click',event=>{if(event.target!==$('drive-dialog'))return;const rect=event.target.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)event.target.close();});
  $('cloud-connect').addEventListener('click',()=>session.connect());
  $('cloud-sync').addEventListener('click',()=>session.refresh());
  async function disconnect(){
   try{if(session.hasUnsaved&&!confirm('還有未同步內容。請先下載備份；確定要放棄草稿並中斷連接嗎？'))return;await session.disconnect({discard:true});}catch(error){message(error.message);}
  }
  $('cloud-disconnect').addEventListener('click',disconnect);
  $('cloud-open').addEventListener('click',()=>session.open($('cloud-library').value).catch(error=>message(error.message)));
  $('cloud-new').addEventListener('click',()=>{if(confirm('要在 Google Drive 建立一份空白書籤嗎？'))session.create(BookmarkFile.createDataFile([],{added:[],deletedIds:[]},[],'1970-01-01T00:00:00Z'));});
  $('reimport-data').addEventListener('click',()=>$('cloud-import').click());
  $('cloud-import').addEventListener('click',()=>{selectingImport=true;});
  $('cloud-import').addEventListener('cancel',()=>{selectingImport=false;});
  $('cloud-import').addEventListener('change',async event=>{
   selectingImport=false;
   const selected=event.target.files[0];event.target.value='';if(!selected)return;
   const account=session.state.account?.id,dataset=session.state.datasetId,replacing=session.state.phase==='ready';
   if(!['empty','choosing','ready'].includes(session.state.phase)||session.hasUnsaved||!session.state.online){message('請先完成同步並連線後再匯入。');return;}
   importing=true;update(session.state);
   try{if(selected.size>5*1024*1024)throw new Error('資料檔超過 5 MB，請先縮減資料。');const loaded=BookmarkFile.readDataFile(await selected.text()),snapshot=BookmarkFile.createDataFile(loaded.baseEntries,loaded.changes,loaded.favorites,loaded.checkedAt);
    if(session.state.account?.id!==account||session.state.datasetId!==dataset||session.hasUnsaved||!['empty','choosing','ready'].includes(session.state.phase))throw new Error('連線或資料已變動，請重新選取匯入檔。');
    const text='已讀取 '+snapshot.entries.length+' 個書籤、'+snapshot.favorites.length+' 個收藏。'+(replacing?'確認取代目前雲端書籤並更新當日檔案？':'確認匯入到你的私人 Google Drive 的 MelodyHome 資料夾？');
    if(confirm(text)){if(replacing)await session.replace(snapshot);else await session.create(snapshot);if(session.state.phase==='ready')document.dispatchEvent(new CustomEvent('bookmarks-imported'));}
   }catch(error){message(error.message);}finally{importing=false;$('cloud-import').disabled=!session.state.online;$('cloud-connect').disabled=['connecting','loading','saving'].includes(session.state.phase)||session.state.pending>0;$('cloud-disconnect').disabled=$('cloud-connect').disabled;$('reimport-data').disabled=session.state.phase!=='ready'||!session.state.online;}
  });
  $('cloud-use-version').addEventListener('click',()=>{if(confirm('要以選取版本更新當日檔案並繼續編輯嗎？其他內容如需留存，請先下載。'))session.resolve($('cloud-version').value);});
  $('cloud-download-version').addEventListener('click',async()=>{
   try{const id=$('cloud-version').value,data=id==='draft'?session.state.draft:(await store.readHead(session.state.datasetId,id)).document;download(JSON.stringify(data,null,2)+'\n','application/json;charset=utf-8','bookmarks-version.json');}catch(error){message(error.message);}
  });
  $('retry-file').addEventListener('click',()=>session.retry());
  window.addEventListener('online',()=>{session.setOnline(true);session.refresh();});window.addEventListener('offline',()=>session.setOnline(false));
  const refresh=()=>{if(!selectingImport&&!importing&&!document.hidden&&!document.querySelector('dialog[open]'))session.refresh();};
  document.addEventListener('visibilitychange',refresh);window.addEventListener('focus',refresh);
  async function checkExpiry(){
   if(!credential&&!expiring)return;
   if(!expiring&&Date.now()<expires)return;
   expiring=true;clearAuthorization();
   try{await session.disconnect({discard:true});expiring=false;message('Google 授權已到期，請重新登入。');}catch{/* Wait for an in-flight save before clearing the view. */}
  }
  document.addEventListener('visibilitychange',checkExpiry);window.addEventListener('focus',checkExpiry);setInterval(checkExpiry,1000);
  session.setOnline(navigator.onLine);session.initialLoad=login.read()?session.connect({resume:true}):Promise.resolve();return session;
 }
 globalThis.BookmarkDriveUI={mount};
})();
