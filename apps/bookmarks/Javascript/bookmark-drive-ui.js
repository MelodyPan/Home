// Google authorization and explicit import/conflict controls for the bookmark page.
(()=>{
 'use strict';
 function mount({onChange,download}){
  const $=id=>document.getElementById(id),config=globalThis.BookmarksConfig||{};
  let credential='',expires=0,session,importing=false,selectingImport=false;
  let tabStorage;try{tabStorage=window.sessionStorage;}catch{}
  const login=BookmarkLogin.createLoginCache({storage:tabStorage,clientId:config.googleClientId});
  let localStorage;try{localStorage=window.localStorage;}catch{}
  const cache=BookmarkCache.createBookmarkCache({storage:localStorage});
  let cached=cache.read(),lastCachedDocument=null,cacheNotice='',previousPhase='';
  const askedAccounts=new Set();
  // pendingAuthorization 是尚未完成的登入要求；credential 是成功後憑證，兩者不能混用。
  let expiring=false,details=null,pendingAuthorization=null,pendingWrite=null;
  function finishPendingWrite(allowed){const pending=pendingWrite;pendingWrite=null;if(pending)pending.resolve(allowed);}
  const store=BookmarkDrive.createDriveStore({token:()=>Date.now()<expires?credential:''});
  const clearAuthorization=()=>{credential='';expires=0;details=null;login.clear();renderTokenDetails();};
  function renderTokenDetails(){$('cloud-auth-details').hidden=!credential;const node=$('cloud-token-details');node.hidden=!credential;node.textContent=!credential?'':details?'Google 回傳 expires_in：'+details.expiresIn+' 秒（約 '+(details.expiresIn/60).toFixed(1)+' 分鐘）。取得時間：'+new Date(details.receivedAt).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',hour12:false})+'（台灣時間）':'這次登入尚未記錄 Google 回傳的 expires_in；請重新連接後查看。';}
  function requestToken(prompt){
   if(!config.googleClientId)return Promise.reject(new Error('請先設定 Google OAuth Client ID，設定方式見專案的 Google Drive 操作說明。'));
   if(!globalThis.google?.accounts?.oauth2)return Promise.reject(new Error('Google 登入元件尚未載入，請檢查網路或阻擋設定後重試。'));
   return new Promise((resolve,reject)=>{
    let settled=false,leftPage=false,returnTimer,timeout;
    // 無論成功、拒絕、取消或逾時，統一清理；避免上一輪監聽影響下一次登入。
    const cleanup=()=>{clearTimeout(returnTimer);clearTimeout(timeout);window.removeEventListener('blur',leave);window.removeEventListener('focus',returned);window.removeEventListener('pageshow',returned);document.removeEventListener('visibilitychange',visibility);};
    // 一次要求只能完成一次；取消後遲到的 callback 不可把舊 token 當成新登入。
    const finish=(error,response)=>{if(settled)return;settled=true;cleanup();if(pendingAuthorization===attempt)pendingAuthorization=null;if(error)reject(error);else resolve(response);};
    const attempt={cancel:()=>finish(new Error('已取消 Google 登入，可以再次連接 Google Drive。'))};
    const leave=()=>{leftPage=true;clearTimeout(returnTimer);};
    // iPhone 外部驗證頁可能沒有回報關閉；回頁後留 1.5 秒接正常回應，再解除等待。
    // 這是恢復策略，不代表確認 popup 已關閉；使用者主動切回也可能取消當次要求。
    const returned=()=>{if(!leftPage||document.hidden||settled)return;clearTimeout(returnTimer);returnTimer=setTimeout(attempt.cancel,1500);};
    const visibility=()=>{if(document.hidden)leave();else returned();};
    pendingAuthorization=attempt;
    window.addEventListener('blur',leave);window.addEventListener('focus',returned);window.addEventListener('pageshow',returned);document.addEventListener('visibilitychange',visibility);
    // 限制的是登入要求等待時間，不是登入成功後的 Google token 使用效期。
    timeout=setTimeout(()=>finish(new Error('Google 登入尚未完成，請再試一次。')),5*60*1000);
    try{
     const client=google.accounts.oauth2.initTokenClient({client_id:config.googleClientId,scope:'https://www.googleapis.com/auth/drive.file',callback:response=>{
      if(settled)return;
      if(response.error||!response.access_token){finish(new Error('Google 授權未完成，請重新連接。'));return;}
      if(!google.accounts.oauth2.hasGrantedAllScopes(response,'https://www.googleapis.com/auth/drive.file')){finish(new Error('需要允許網站存取它建立的 Drive 書籤檔案。'));return;}
      finish(null,response);
     },error_callback:()=>finish(new Error('Google 登入視窗已關閉或被阻擋，請再試一次。'))});
     client.requestAccessToken({prompt});
    }catch(error){finish(error);}
   });
  }
  // 僅採 Google 真正回傳的 expires_in，缺少有效值就停止；不猜一小時、不自動續期。
  const tokenExpiry=response=>{const details=BookmarkLogin.tokenDetails(response);if(!details)throw new Error('Google 未回傳有效的授權期限，請重新登入。');return details.receivedAt+details.expiresIn*1000;};
  // F5 只恢復同分頁未過期的授權；書籤內容仍須由 CloudSession 重新讀取 Drive。
  async function authorize({resume=false}={}){
   if(resume){const saved=login.read();if(!saved)throw new Error('登入已逾時，請重新連接 Google Drive。');credential=saved.token;expires=saved.expires;details=saved.tokenDetails||null;renderTokenDetails();return;}
   let response;try{response=await requestToken('select_account');}catch(error){clearAuthorization();throw error;}
   expires=tokenExpiry(response);credential=response.access_token;details=BookmarkLogin.tokenDetails(response);login.save(credential,expires,undefined,details);expiring=false;renderTokenDetails();
  }
  function message(text){$('cloud-message').textContent=text;}
  function update(state){
   $('cloud-message').dataset.phase=state.phase;
   if(['loading','saving'].includes(state.phase)&&previousPhase!==state.phase){cache.beginCheck();lastCachedDocument=null;}
   previousPhase=state.phase;
   // 快取只負責顯示，絕不交給 CloudSession 當作可寫入的遠端版本。
   if(cached&&state.account&&(state.account.id!==cached.accountId||state.datasetId&&state.datasetId!==cached.datasetId)||state.error?.code==='account'||['empty','choosing'].includes(state.phase)){cached=null;cache.clear();}
   if(state.phase==='ready'&&state.document&&!state.draft&&!state.pending&&state.account){
    const accountId=state.account.id;
    if(cache.choice(accountId)===null&&!askedAccounts.has(accountId)){askedAccounts.add(accountId);cache.choose(accountId,confirm('是否將書籤暫存在這個瀏覽器（localStorage）？\n同意後可快速開啟與重新整理；修改仍會先儲存 Google Drive。\n主動登出會清除書籤快取。'));}
    if(cache.choice(accountId)===true&&state.document!==lastCachedDocument){
     if(cache.write(accountId,state.datasetId,state.document,state.revision))cached={accountId,datasetId:state.datasetId,document:state.document};
     lastCachedDocument=state.document;
    }
   }
   const usingCache=!state.document&&!!cached;
   const localSource=usingCache||!!cached&&state.document===cached.document;
   const view={...state,...(usingCache?{document:cached.document,cacheReadonly:true}:cache.conflict?{cacheReadonly:true}:{}),dataSource:localSource?'local':'drive'};
   $('cache-status').textContent=cacheNotice||cache.warning;
   $('cache-status').hidden=!$('cache-status').textContent;
   $('cache-setting-status').textContent=cache.warning||(state.account?cache.choice(state.account.id)===true?'已開啟本機暫存。存檔成功後會更新快取，主動登出會清除快取。':'未開啟本機暫存，資料由 Google Drive 載入。':cached?'本機快取可供瀏覽；登入後可變更暫存設定。':'尚無書籤快取。');
   const cacheAccountId=state.account?.id||cached?.accountId,caching=!!cacheAccountId&&cache.choice(cacheAccountId)===true;
   $('cache-toggle').disabled=!!state.pending||!!state.draft||['connecting','loading','saving'].includes(state.phase)||!cacheAccountId||!caching&&state.phase!=='ready';
   $('cache-toggle').textContent=caching?'停用並清除暫存':'啟用本機暫存';
   const occupied=importing||['connecting','loading','saving'].includes(state.phase)||state.pending>0;
   $('cloud-connect').disabled=occupied;$('cloud-connect').textContent=state.account?'重新連接 Google Drive':'連接 Google Drive';
   $('cloud-disconnect').hidden=!state.account;$('cloud-disconnect').disabled=occupied;
   $('cloud-sync').hidden=!state.account;$('cloud-sync').disabled=occupied||state.phase!=='ready'||!state.online;
   const connected=!!state.account&&!!credential;
   // 連接中仍讓「登入」可點，以便取消卡住的授權；載入與寫入期間仍保留保護。
   $('drive-login').textContent=connected?'登出':'登入';$('drive-login').title=connected?'中斷 Google Drive 連接':'登入 Google Drive';$('drive-login').disabled=occupied&&state.phase!=='connecting';
   $('drive-login').setAttribute('aria-haspopup',connected?'false':'dialog');
   $('drive-manage').hidden=!connected&&!cached;
   $('cloud-account').textContent=state.error?.code==='account'?'請重新連接原帳號':state.account?.email||'尚未連接';
   $('cloud-setup').hidden=!!config.googleClientId;
   $('cloud-initialize').hidden=!['empty','choosing'].includes(state.phase);
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
   message(!state.online?'目前沒有網路連線，已暫停編輯；未同步內容仍在目前分頁。':labels[state.phase]);onChange(view);
   if(pendingWrite){
    const expected=pendingWrite;
    if(state.account&&expected.accountId&&state.account.id!==expected.accountId){finishPendingWrite(false);message('登入帳號不同，已取消原本的修改，請重新選擇書籤。');}
    else if(state.phase==='ready'&&state.online&&credential&&Date.now()<expires&&!view.cacheReadonly){
     if(expected.datasetId&&state.datasetId!==expected.datasetId){finishPendingWrite(false);message('書籤資料集已改變，已取消原本的修改。');}
     else{finishPendingWrite(true);$('drive-dialog').close();}
    }else if(['error','conflict','empty'].includes(state.phase)||!state.online)finishPendingWrite(false);
   }
   if(state.phase==='conflict'&&!$('drive-dialog').open)$('drive-dialog').showModal();
  }
  session=BookmarkCloud.createCloudSession({store,authorize,clearAuthorization,onChange:update});
  const openManager=()=>{if(!$('drive-dialog').open)$('drive-dialog').showModal();};
  // 修改只等待本次登入；確認原帳號及資料集後才通知入口接續操作。
  session.requiresLogin=()=>!credential||Date.now()>=expires||session.state.error?.code==='auth';
  session.ensureWriteAccess=()=>{
   if(!session.state.online)return Promise.resolve(false);
   if(!session.requiresLogin())return Promise.resolve(false);
   if(pendingWrite)return Promise.resolve(false);
   const accountId=session.state.account?.id||cached?.accountId,datasetId=session.state.datasetId||cached?.datasetId;
   const result=new Promise(resolve=>{pendingWrite={resolve,accountId,datasetId};});
   openManager();message('請連接 Google Drive；登入並確認原本書籤後，會接續剛才的操作。');
   if(credential&&Date.now()>=expires)checkExpiry();
   return result;
  };
  $('drive-dialog').addEventListener('close',()=>{if(pendingWrite){finishPendingWrite(false);pendingAuthorization?.cancel();}});
  $('drive-manage').addEventListener('click',openManager);
  $('drive-login').addEventListener('click',()=>{if(pendingAuthorization){pendingAuthorization.cancel();openManager();return;}if(session.state.account&&credential)disconnect();else openManager();});
  $('close-drive-dialog').addEventListener('click',()=>$('drive-dialog').close());
  $('drive-dialog').addEventListener('click',event=>{if(event.target!==$('drive-dialog'))return;const rect=event.target.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)event.target.close();});
  $('cloud-connect').addEventListener('click',()=>session.connect());
  $('cloud-sync').addEventListener('click',()=>session.refresh());
  $('cache-toggle').addEventListener('click',()=>{
   const state=session.state,accountId=state.account?.id||cached?.accountId;
   if(!accountId||state.pending||state.draft||['connecting','loading','saving'].includes(state.phase))return;
   const enabled=cache.choice(accountId)!==true;
   if(enabled&&state.phase!=='ready')return;
   if(enabled&&!confirm('將此帳號書籤暫存在這個瀏覽器？主動登出會清除快取。'))return;
   const changed=cache.choose(accountId,enabled);cached=null;lastCachedDocument=null;cacheNotice=changed?'':cache.warning;update(state);
  });
  // 另一分頁清除／停用快取時，不可再由本頁偷偷重建；內容更新仍由 Drive 確認。
  window.addEventListener('storage',event=>{
   if(![null,BookmarkCache.CACHE_KEY,BookmarkCache.PREFERENCES_KEY].includes(event.key))return;
   const latest=cache.read();if(!latest){
    if(event.key===BookmarkCache.CACHE_KEY&&event.newValue===null&&session.state.account)cache.suspend(session.state.account.id);
    cached=null;lastCachedDocument=session.state.document;update(session.state);
   }
  });
  async function disconnect(){
   try{if(session.hasUnsaved&&!confirm('還有未同步內容。請先下載備份；確定要放棄草稿並中斷連接嗎？'))return;await session.disconnect({discard:true});cache.clear();cached=null;lastCachedDocument=null;cacheNotice='';update(session.state);}catch(error){message(error.message);}
  }
  $('cloud-disconnect').addEventListener('click',disconnect);
  $('cloud-open').addEventListener('click',()=>session.open($('cloud-library').value).catch(error=>message(error.message)));
  $('cloud-new').addEventListener('click',()=>{if(confirm('要在 Google Drive 建立一份空白書籤嗎？'))session.create(BookmarkFile.createDataFile([],{added:[],deletedIds:[]},[],'1970-01-01T00:00:00Z'));});
  $('reimport-data').addEventListener('click',()=>$('cloud-import').click());
  $('cloud-import').addEventListener('click',()=>{selectingImport=true;});
  $('cloud-import').addEventListener('cancel',()=>{selectingImport=false;});
  // 選檔與確認可能跨越帳號／資料集變更；套用前重新核對，避免匯入到錯誤位置。
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
  // 效期結束時移除 token 與私人畫面；若有上傳仍在執行，下次檢查再嘗試完成清除。
  async function checkExpiry(){
   if(!credential&&!expiring)return;
   if(!expiring&&Date.now()<expires)return;
   expiring=true;clearAuthorization();
   try{await session.disconnect({discard:true});expiring=false;message('Google 授權已到期，請重新登入。');}catch{/* Wait for an in-flight save before clearing the view. */}
  }
  document.addEventListener('visibilitychange',checkExpiry);window.addEventListener('focus',checkExpiry);setInterval(checkExpiry,1000);
  session.hasCachedDocument=!!cached;
  session.setOnline(navigator.onLine);session.initialLoad=login.read()?session.connect({resume:true}):Promise.resolve();return session;
 }
 globalThis.BookmarkDriveUI={mount};
})();
