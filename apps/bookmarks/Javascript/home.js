// 書籤工作台前端入口：載入資料、維護篩選狀態、處理操作並排隊存檔。
// 畫面狀態只影響呈現；書籤異動透過共用核心合併後交給本機服務保存。
(async() => {
 'use strict';
 const preview=globalThis.BookmarksRuntime?.mode==='preview';
 // 同一份介面支援根目錄及 Home 子路徑；預覽模式不發出資料請求。
 const appFetch=(url,options)=>preview?Promise.reject(new Error('雲端儲存尚未設定，目前為網站預覽。')):fetch(globalThis.BookmarksRuntime?.url(url)||url,options);
 const {countDuplicateUrls,updateBookmarkDetails,batchUpdateBookmarkCategories,bookmarkIconSources,orderedCategories,moveCategory,CATEGORIES,STATUS,FAVORITES_KEY,LIBRARY_KEY,safeWebUrl,getBookmarkPurpose,countPurposes,selectBookmarks,listOriginalFolders,countStatuses,loadFavorites,createManualBookmark,loadLibraryChanges,mergeLibrary,updateBookmarkCategory,updateBookmarkStatus,createChromeBookmarkHtml,moveWorkSubcategory,prioritizeWorkSearchResults,createWorkSubcategory,renameWorkSubcategory,removeWorkSubcategory,assignWorkSubcategory}=BookmarkCore;
 let {entries:baseEntries,checkedAt,icons:bookmarkIcons={}}=JSON.parse(document.getElementById('bookmark-data').textContent);
 const categoryMap=new Map(CATEGORIES.map(c=>[c.id,c]));
 const purposeFor=category=>getBookmarkPurpose({category});
 const $=id=>document.getElementById(id);
 const paths={grid:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',star:'<path d="m12 3 2.8 5.7 6.3.9-4.6 4.4 1.1 6.3L12 17.4l-5.6 2.9 1.1-6.3L3 9.6l6.2-.9L12 3Z"/>',sparkles:'<path d="m12 3 2.2 6.8L21 12l-6.8 2.2L12 21l-2.2-6.8L3 12l6.8-2.2L12 3Z"/><path d="m20 2 .6 1.5L22 4l-1.4.5L20 6l-.5-1.5L18 4l1.5-.5L20 2Z"/>',briefcase:'<rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12c6 4 12 4 18 0M12 12v4"/>',code:'<path d="m8 6-6 6 6 6m8-12 6 6-6 6m-3-15-2 18"/>',languages:'<path d="M3 5h12M9 3v2M5 5c1 6 5 10 10 12M13 5c-1 5-5 10-10 12M14 21l4-10 4 10m-6-4h4"/>',compass:'<circle cx="12" cy="12" r="9"/><path d="m16 8-2 6-6 2 2-6 6-2Z"/>',coffee:'<path d="M4 8h13v9a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V8Zm13 1h2a3 3 0 0 1 0 6h-2M7 2v3m4-3v3m4-3v3"/>',chart:'<path d="M4 3v17h17M8 15l4-5 4 3 5-7M17 6h4v4"/>',book:'<path d="M12 5C9 3 6 3 3 4v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-3-1-6-1-9 1Zm0 0v15"/>',play:'<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m10 9 5 3-5 3V9Z"/>',camera:'<path d="M8 5 9 3h6l1 2h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h4Z"/><circle cx="12" cy="13" r="4"/>',sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',folder:'<path d="M3 6a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6Z"/>',heart:'<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',zap:'<path d="m13 2-9 12h7l-1 8 10-12h-7l1-8Z"/>',search:'<circle cx="10.8" cy="10.8" r="7.3"/><path d="m16 16 5 5"/>',filter:'<path d="M3 6h18M6 12h12M9 18h6"/>',sort:'<path d="M8 3v18m-4-4 4 4 4-4M14 5h7m-7 5h5m-5 5h3"/>',shield:'<path d="m12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6l9-4Z"/><path d="m8 12 3 3 5-6"/>'};
 paths.list='<path d="M9 6h12M9 12h12M9 18h12"/><path d="M3 6h1M3 12h1M3 18h1"/>';
 paths.trash='<path d="M3 6h18M9 6V4h6v2M5 6l1 15h12l1-15M10 10v7m4-7v7"/>';
 function icon(name){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('class','icon');svg.setAttribute('aria-hidden','true');svg.innerHTML=paths[name]||paths.folder;return svg;}
 function el(tag,className,text){const n=document.createElement(tag);if(className)n.className=className;if(text!==undefined)n.textContent=text;return n;}
 document.querySelectorAll('[data-icon]').forEach(n=>n.replaceWith(icon(n.dataset.icon)));
 let storage;try{storage=preview?{getItem(){return null;},setItem(){}}:window.localStorage;}catch{storage={getItem(){throw new Error('unavailable');},setItem(){throw new Error('unavailable');}};}
 const {createDataFile,readDataFile}=BookmarkFile;
 let stoppingService=false,checkingUrls=false,checkPollTimer,checkStatusRequest=false,appliedCheckId=null;
 let fileReady=false,fileRevision='',fileError='',fileConflict=false,saveQueue=Promise.resolve(),pendingSaves=0;
 // 正常模式以 assets 的 JSON 與 ETag 為準；載入失敗才使用初始資料／快取並禁止新異動。
 let initialFile;
 try{if(preview)throw new Error('雲端儲存尚未設定，目前可預覽網站介面。');if(!['http:','https:'].includes(location.protocol))throw new Error('請雙擊 start-bookmarks.cmd 開啟，才能自動讀寫 assets/bookmarks-data.txt。');const response=await appFetch('/assets/bookmarks-data.txt',{cache:'no-store'});if(!response.ok)throw new Error('讀取資料檔失敗，請檢查 assets/bookmarks-data.txt 後重新整理。');initialFile=readDataFile(await response.text());fileRevision=response.headers.get('ETag');if(!fileRevision)throw new Error('請透過 start-bookmarks.cmd 開啟本機服務。');baseEntries=initialFile.baseEntries;checkedAt=initialFile.checkedAt;fileReady=true;}catch(error){fileError=error.message;}
 const librarySaved=initialFile?{changes:initialFile.changes,warning:false}:loadLibraryChanges(storage);
 let changes=librarySaved.changes;
 let entries=mergeLibrary(baseEntries,changes);
 const byId=new Map(entries.map(e=>[e.id,e]));
 const saved=initialFile?{ids:initialFile.favorites,warning:false}:loadFavorites(storage);
 const knownIds=new Set([...baseEntries,...changes.added].map(e=>e.id));
 let favorites=new Set(saved.ids.filter(id=>knownIds.has(id)));
 let storageWarning=saved.warning||librarySaved.warning;
 // 首頁與清單同步顯示存檔結果；版本衝突不直接重試覆寫，先提供下載保留目前資料。
 function showFileStatus(message,tone=''){$('save-summary').textContent=message;$('save-indicator').dataset.tone=tone;$('retry-save-list').hidden=tone!=='error'||fileConflict||!fileReady||stoppingService;$('backup-unsaved').hidden=tone!=='error';const bar=$('file-status');bar.textContent=message;bar.dataset.tone=tone;if(tone==='error'&&$('home-overview').hidden)toast(message+'；請回書籤首頁重試儲存或匯出資料。');}
 // 每次寫入都建立完整快照，讓備份、匯出及服務端驗證使用同一種資料結構。
 function snapshot(){return createDataFile(baseEntries,changes,[...favorites],checkedAt);}
 // 先擷取本次快照，再依操作順序送出；每次使用上一筆成功回傳的新版本。
 // 錯誤會阻止後續排隊寫入，避免過期快照覆蓋其他視窗的資料。
 function queueFileSave(){
  if(!fileReady){showFileStatus(fileError||'尚未讀取資料檔，請重新整理。','error');return;}
  const body=JSON.stringify(snapshot());pendingSaves++;showFileStatus('正在儲存到 assets/bookmarks-data.txt…');
  saveQueue=saveQueue.then(async()=>{if(fileError)return;try{const response=await appFetch('/api/bookmarks',{method:'PUT',headers:{'Content-Type':'application/json','If-Match':fileRevision},body});const result=await response.json();if(!response.ok){fileConflict=response.status===409;throw new Error(result.error||'寫入資料檔失敗。');}fileRevision=result.revision;}catch(error){fileError=error.message;}}).finally(()=>{pendingSaves--;if(fileError){showFileStatus('尚未寫入檔案：'+fileError,'error');$('retry-file').hidden=fileConflict;}else if(!pendingSaves){showFileStatus('已儲存至 assets/bookmarks-data.txt · '+new Date().toLocaleTimeString('zh-TW',{timeZone:'Asia/Taipei',hour12:false}),'saved');$('retry-file').hidden=true;}});
 }
 $('retry-file').addEventListener('click',()=>{fileError='';queueFileSave();});
 $('retry-save-list').addEventListener('click',()=>$('retry-file').click());$('backup-unsaved').addEventListener('click',()=>$('export-json').click());
 $('stop-service').disabled=!fileReady;
 // 停止前先等待存檔佇列；若尚未成功保存就保留服務，讓使用者重試或下載資料。
 $('stop-service').addEventListener('click',async()=>{
  const button=$('stop-service');if(!fileReady||stoppingService||checkingUrls)return;stoppingService=true;button.disabled=true;button.textContent='正在停止…';
  try{await saveQueue;if(fileError)throw new Error('資料尚未存檔，請先重試儲存或匯出資料。');showFileStatus('正在停止本機服務…');const response=await appFetch('/api/shutdown',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});if(!response.ok){let detail='';try{detail=(await response.json()).error||'';}catch{}if(response.status===404)throw new Error('目前執行的是不支援停止功能的舊版服務（HTTP 404），請先停止舊服務再執行 start-bookmarks.cmd。');throw new Error('停止失敗（HTTP '+response.status+'）'+(detail?'：'+detail:'，請稍後再試。'));}const result=await response.json();if(result.stopped!==true)throw new Error('無法確認服務是否已停止。');fileReady=false;fileError='本機服務已停止；請雙擊 start-bookmarks.cmd 重新啟動。';button.textContent='服務已停止';$('retry-file').hidden=true;showFileStatus('本機服務已停止，資料已儲存。下次請雙擊 start-bookmarks.cmd 開啟。','saved');toast('本機服務已停止，可以關閉這個分頁。');}catch(error){stoppingService=false;button.disabled=false;button.textContent='停止服務';showFileStatus(error.message,'error');}
 });
 function downloadData(contents,type,filename){const url=URL.createObjectURL(new Blob([contents],{type}));const link=el('a');link.href=url;link.download=filename;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 $('export-data').addEventListener('click',()=>{downloadData(createChromeBookmarkHtml(entries),'text/html;charset=utf-8','bookmarks-chrome.html');toast('已匯出 '+entries.length+' 個書籤，可在 Chrome 書籤管理員選擇「匯入書籤」。');});
 $('export-json').addEventListener('click',()=>downloadData(JSON.stringify(snapshot(),null,2)+'\n','text/plain;charset=utf-8','bookmarks-data.txt'));
 // 在事件擷取階段阻擋異動入口，避免未載入、存檔出錯或檢查中仍修改資料。
 document.addEventListener('click',event=>{if((!fileReady||fileError||stoppingService||checkingUrls)&&event.target.closest('#add-bookmark,#undo-delete,.favorite-button,.delete-button,.edit-category-button,.edit-status-button,.edit-details-button,#batch-category,.bookmark-select,#select-results,.manage-work-subcategories,.work-subcategory-mutation,.category-order-mutation,#manage-category-order,#confirm-delete')){event.preventDefault();event.stopImmediatePropagation();toast(checkingUrls?'網址檢查進行中，完成後即可修改書籤。':stoppingService?'本機服務正在停止，暫時無法修改書籤。':fileError||'請先讀取書籤資料檔。');}},true);
 window.addEventListener('beforeunload',event=>{if(pendingSaves||(fileReady&&fileError)){event.preventDefault();event.returnValue='';}});
 showFileStatus(fileReady?'已從 assets/bookmarks-data.txt 載入 '+entries.length+' 個書籤':fileError,fileReady?'saved':preview?'':'error');
 const layoutKey='melody-pan-bookmark-layout';let savedLayout='grid';try{if(storage.getItem(layoutKey)==='list')savedLayout='list';}catch{}
 let duplicateUrlCounts=new Map();
 // home 為精簡首頁，browse 為左側分類清單，library 為保留首頁搜尋區的結果模式。
 // 此物件也保存目前篩選、排序與分頁上限；不會直接寫入書籤 JSON。
 const state={duplicatesOnly:false,layout:savedLayout,browseSearchOpen:false,view:'home',purpose:'all',originalFolder:'all',category:'all',workSubcategory:'all',query:'',status:'all',favoriteOnly:false,sort:'original',limit:36};
 for(const button of document.querySelectorAll('[data-purpose-filter]'))button.addEventListener('click',()=>{state.view='browse';state.purpose=state.purpose===button.dataset.purposeFilter?'all':button.dataset.purposeFilter;state.category='all';state.workSubcategory='all';state.limit=36;render();if(matchMedia('(max-width:740px)').matches){document.querySelector('.sidebar').classList.remove('mobile-open');$('mobile-toggle').setAttribute('aria-expanded','false');$('library-title').focus({preventScroll:true});$('library-title').scrollIntoView({block:'start'});}});
 const purposeChoices=[['all','全部用途'],['work','工作用途'],['personal','生活']];
 for(const [id,label]of purposeChoices){const button=el('button','purpose-chip');button.type='button';button.dataset.purpose=id;button.append(el('span','',label),el('span','status-count','0'));button.addEventListener('click',()=>{state.purpose=id;state.limit=36;render();});$('purpose-shortcuts').append(button);}
 $('toggle-filters').addEventListener('click',()=>{const expanded=$('advanced-filters').hidden;$('advanced-filters').hidden=!expanded;$('toggle-filters').setAttribute('aria-expanded',String(expanded));$('toggle-filters-label').textContent=expanded?'收起篩選':'更多篩選…';});
 function renderPurposeShortcuts(){for(const button of document.querySelectorAll('[data-purpose-filter]')){const selected=state.purpose===button.dataset.purposeFilter;button.setAttribute('aria-pressed',String(selected));button.title=selected?'取消用途篩選':'篩選'+button.textContent;}const counts=countPurposes(entries,{...state,favorites:[...favorites]});for(const button of $('purpose-shortcuts').children){const id=button.dataset.purpose;button.setAttribute('aria-pressed',String(state.purpose===id));button.querySelector('.status-count').textContent=counts[id];}const count=Number(state.purpose!=='all')+Number(state.originalFolder!=='all')+Number(state.status!=='all')+Number(state.duplicatesOnly);$('filter-count').hidden=!count;$('filter-count').textContent=count;$('toggle-filters').title=count?'已套用 '+count+' 項篩選':'展開用途、資料夾與網址狀態篩選';}
 const statusChoices=[['all','全部'],['reachable','可連線'],['uncertain','待確認'],['missing','可能失效'],['restricted','存取限制'],['skipped','內部網址'],['unknown','未檢查']];
 for(const [id,label]of statusChoices){const button=el('button','status-chip');button.type='button';button.dataset.status=id;button.append(el('span','',label),el('span','status-count','0'));button.addEventListener('click',()=>applyStatus(id));$('status-shortcuts').append(button);}
 function applyStatus(value){state.view='library';state.status=value;state.limit=36;$('status-filter').value=value;render();}
 function renderStatusShortcuts(){const counts=countStatuses(entries,{...state,favorites:[...favorites]});for(const button of $('status-shortcuts').children){const id=button.dataset.status;button.setAttribute('aria-pressed',String(state.status===id));button.querySelector('.status-count').textContent=counts[id];button.setAttribute('aria-label',statusChoices.find(c=>c[0]===id)[1]+'，'+counts[id]+' 個書籤');}}
 // 篩選選項保留原始完整路徑，顯示數量則依目前未刪除清單計算。
 function renderOriginalFolders(){
  const select=$('original-folder-filter');
  const visibleCounts=new Map(listOriginalFolders(entries).map(f=>[f.value,f.count]));
  const fragment=document.createDocumentFragment();
  const all=el('option','', '全部原始資料夾（'+entries.length+'）');all.value='all';fragment.append(all);
  for(const folder of listOriginalFolders([...baseEntries,...changes.added])){const option=el('option','',folder.label+'（'+(visibleCounts.get(folder.value)||0)+'）');option.value=folder.value;fragment.append(option);}
  select.replaceChildren(fragment);select.value=state.originalFolder;select.title=state.originalFolder==='all'?'全部原始書籤資料夾':state.originalFolder==='__root__'?'未分類（原始根目錄）':state.originalFolder;
 }
 $('original-folder-filter').addEventListener('change',()=>{state.view='library';state.originalFolder=$('original-folder-filter').value;state.limit=36;render();});
 let toastTimer;
 function toast(message){clearTimeout(toastTimer);$('toast').textContent=message;$('toast').hidden=false;toastTimer=setTimeout(()=>$('toast').hidden=true,4500);}
 function navButton(label,name,value,count){const b=el('button','nav-button');b.type='button';b.dataset.category=value;if(categoryMap.has(value))b.dataset.purpose=purposeFor(value);b.append(icon(name),el('span','',label),el('span','count',String(count)));b.addEventListener('click',()=>{state.browseSearchOpen=false;state.view='browse';state.category=value==='favorites'?'all':value;state.favoriteOnly=value==='favorites';state.workSubcategory='all';state.limit=36;render();if(matchMedia('(max-width:740px)').matches){document.querySelector('.sidebar').classList.remove('mobile-open');$('mobile-toggle').setAttribute('aria-expanded','false');$('library-title').scrollIntoView({block:'start'});$('library-title').tabIndex=-1;$('library-title').focus({preventScroll:true});}});return b;}
 $('primary-nav').append(navButton('所有書籤','grid','all',entries.length),navButton('常用收藏','star','favorites',favorites.size));
 for(const c of CATEGORIES)$('categories').append(navButton(c.name,c.icon,c.id,entries.filter(e=>e.category===c.id).length));

 // 兩個主分類共用子分類選單；只列出對應主分類的設定，其他主分類隱藏此欄位。
 function fillSubselect(id,category,value=''){
  const select=$(id);select.replaceChildren();const blank=el('option','','未分類');blank.value='';select.append(blank);
  for(const sub of (changes.workSubcategories||[]).filter(s=>(s.category||'work')===category)){const option=el('option','',sub.name);option.value=sub.id;select.append(option);}select.value=[...select.options].some(o=>o.value===value)?value:'';$(id+'-field').hidden=!['work','dev'].includes(category);
 }
 $('bookmark-category').addEventListener('change',()=>fillSubselect('add-work-subcategory',$('bookmark-category').value));
 $('edit-category-select').addEventListener('change',()=>{const value=$('edit-category-select').value;const entry=byId.get(editingCategoryId);const original=[...baseEntries,...changes.added].find(e=>e.id===editingCategoryId);fillSubselect('edit-work-subcategory',value==='original'?original?.category:value,entry?.workSubcategory);});
 let managingSubcategoryParent='work';
 const subnavs=new Map();for(const parent of ['work','dev']){const nav=el('div','work-subnavigation');$('categories').querySelector('[data-category="'+parent+'"]').after(nav);subnavs.set(parent,nav);}
 // 左側子分類依保存順序顯示，未分類固定最後；切換時保留其他有效篩選。
 function renderWorkSubnavigation(){
  const subs=(changes.workSubcategories||[]).filter(s=>(s.category||'work')===state.category);if(state.workSubcategory!=='all'&&state.workSubcategory!=='unassigned'&&!subs.some(s=>s.id===state.workSubcategory))state.workSubcategory='all';
  for(const [parent,subnav]of subnavs){subnav.hidden=state.category!==parent||state.view==='home';subnav.replaceChildren();if(subnav.hidden)continue;
   const manage=el('button','soft-button manage-work-subcategories','管理第二層分類');manage.type='button';manage.setAttribute('aria-label','管理'+categoryMap.get(parent).name+'第二層分類');manage.addEventListener('click',()=>{managingSubcategoryParent=parent;$('work-subcategory-title').textContent=categoryMap.get(parent).name+'・第二層分類';$('work-subcategory-name').value='';$('work-subcategory-error').hidden=true;renderSubcategoryManager();$('work-subcategory-dialog').showModal();});subnav.append(manage);
   for(const sub of [...subs,{id:'unassigned',name:'未分類'}]){const count=entries.filter(e=>e.category===parent&&(e.workSubcategory||'unassigned')===sub.id).length;const button=el('button','work-subcategory-button'+(state.workSubcategory===sub.id?' active':''),sub.name+' ('+count+')');button.type='button';button.setAttribute('aria-pressed',String(state.workSubcategory===sub.id));button.addEventListener('click',()=>{state.workSubcategory=sub.id;state.favoriteOnly=false;state.limit=36;render();if(matchMedia('(max-width:740px)').matches){document.querySelector('.sidebar').classList.remove('mobile-open');$('mobile-toggle').setAttribute('aria-expanded','false');}$('library-title').scrollIntoView({block:'start'});});subnav.append(button);}
  }
 }
 function subcategoryMutation(action){try{changes=action();persistLibrary();refreshLibrary();renderSubcategoryManager();$('work-subcategory-error').hidden=true;}catch(error){$('work-subcategory-error').textContent=error.message;$('work-subcategory-error').hidden=false;}}
 // 管理子分類名稱及同一主分類內的排序；刪除分類只解除對應，不刪除書籤。
 function renderSubcategoryManager(){
  const list=$('work-subcategory-list');list.replaceChildren();const subs=(changes.workSubcategories||[]).filter(s=>(s.category||'work')===managingSubcategoryParent);
  for(const [index,sub]of subs.entries()){
   const form=el('form','work-subcategory-row');const input=el('input');input.value=sub.name;input.maxLength=40;input.required=true;input.setAttribute('aria-label','分類名稱：'+sub.name);
   const save=el('button','soft-button work-subcategory-mutation','儲存名稱');save.type='submit';const remove=el('button','soft-button work-subcategory-mutation','刪除');remove.type='button';form.append(input,save);
   for(const [direction,label,disabled]of [[-1,'上移',index===0],[1,'下移',index===subs.length-1]]){const button=el('button','soft-button work-subcategory-mutation',label);button.type='button';button.disabled=disabled;button.setAttribute('aria-label',label+'：'+sub.name);button.addEventListener('click',()=>{subcategoryMutation(()=>moveWorkSubcategory(changes,sub.id,direction));const replacement=[...list.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')===label+'：'+sub.name);if(replacement&&!replacement.disabled)replacement.focus();else list.querySelector('input')?.focus();});form.append(button);}
   form.append(remove);form.addEventListener('submit',event=>{event.preventDefault();subcategoryMutation(()=>renameWorkSubcategory(changes,sub.id,input.value));});remove.addEventListener('click',()=>{subcategoryMutation(()=>removeWorkSubcategory(changes,sub.id));});list.append(form);
  }if(!list.childElementCount)list.append(el('p','dialog-note','尚未建立第二層分類。'));
 }
 $('work-subcategory-form').addEventListener('submit',event=>{event.preventDefault();subcategoryMutation(()=>createWorkSubcategory(changes,'work-sub-'+(globalThis.crypto?.randomUUID?.()||Date.now().toString(36)),$('work-subcategory-name').value,managingSubcategoryParent));if($('work-subcategory-error').hidden)$('work-subcategory-name').value='';});
 $('close-work-subcategories').addEventListener('click',()=>$('work-subcategory-dialog').close());
 function renderCategoryNavigationOrder(){const nav=$('categories');for(const category of orderedCategories(changes)){const button=nav.querySelector('[data-category="'+category.id+'"]');nav.append(button);if(subnavs.has(category.id))nav.append(subnavs.get(category.id));}}
 function renderCategoryOrderManager(){
  const list=$('category-order-list');list.replaceChildren();const categories=orderedCategories(changes);
  for(const [index,category]of categories.entries()){const row=el('div','category-order-row');row.append(icon(category.icon),el('span','',category.name));for(const [direction,label,disabled]of [[-1,'上移',index===0],[1,'下移',index===categories.length-1]]){const button=el('button','soft-button category-order-mutation',label);button.type='button';button.disabled=disabled;button.setAttribute('aria-label',label+'：'+category.name);button.addEventListener('click',()=>{changes=moveCategory(changes,category.id,direction);persistLibrary();render();renderCategoryOrderManager();const replacement=[...list.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')===label+'：'+category.name);if(replacement&&!replacement.disabled)replacement.focus();else list.querySelector('button:not(:disabled)')?.focus();});row.append(button);}list.append(row);}
 }
 $('manage-category-order').addEventListener('click',()=>{renderCategoryOrderManager();$('category-order-dialog').showModal();});
 $('close-category-order').addEventListener('click',()=>$('category-order-dialog').close());
 $('reset-category-order').addEventListener('click',()=>{const {categoryOrder,...rest}=changes;changes=rest;persistLibrary();render();renderCategoryOrderManager();toast('已恢復預設分類順序');});


 function toggleFavorite(id){if(favorites.has(id))favorites.delete(id);else favorites.add(id);try{storage.setItem(FAVORITES_KEY,JSON.stringify([...favorites]));storageWarning=false;}catch{storageWarning=true;}queueFileSave();const activeId=document.activeElement?.dataset.favorite;render();if(activeId){const replacement=document.querySelector('[data-favorite="'+activeId+'"]');if(replacement)replacement.focus({preventScroll:true});else $('library-title').focus({preventScroll:true});}toast(storageWarning?'已更新收藏；瀏覽器無法保存，本次開啟期間仍可使用。':favorites.has(id)?'已加入常用收藏':'已移除常用收藏');}
 function starButton(e){const b=el('button','favorite-button');b.type='button';b.dataset.favorite=e.id;b.setAttribute('aria-label',(favorites.has(e.id)?'移除收藏：':'加入收藏：')+e.title);b.setAttribute('aria-pressed',String(favorites.has(e.id)));b.title=favorites.has(e.id)?'移除收藏':'加入常用收藏';b.append(icon('star'));b.addEventListener('click',()=>toggleFavorite(e.id));return b;}
 let editingCategoryId=null;
 function editCategoryButton(entry){const button=el('button','category-label edit-category-button',categoryMap.get(entry.category).name+(entry.workSubcategoryName?' / '+entry.workSubcategoryName:'')+' ✎');button.type='button';button.setAttribute('aria-label','編輯分類：'+entry.title);button.title='編輯分類';button.addEventListener('click',()=>{editingCategoryId=entry.id;$('edit-category-bookmark').textContent=entry.title;const select=$('edit-category-select');select.replaceChildren();const locked=entry.folder.split(' / ').includes('中榮');for(const c of CATEGORIES){if(locked&&!['ai','work','dev'].includes(c.id))continue;const option=el('option','',(purposeFor(c.id)==='work'?'工作用途 · ':'生活 · ')+c.name);option.value=c.id;select.append(option);}const original=el('option','','恢復原始分類');original.value='original';select.append(original);select.value=entry.category;$('edit-category-note').textContent=locked?'原始資料夾位於「中榮」底下，依你的設定維持工作用途。':'修改後會同步更新分類、用途篩選與卡片底色，並自動寫入 assets/bookmarks-data.txt。';fillSubselect('edit-work-subcategory',entry.category,entry.workSubcategory);$('edit-category-error').hidden=true;$('edit-category-dialog').showModal();select.focus();});return button;}
 for(const id of ['close-edit-category','cancel-edit-category'])$(id).addEventListener('click',()=>$('edit-category-dialog').close());
 $('edit-category-form').addEventListener('submit',event=>{event.preventDefault();const entry=byId.get(editingCategoryId);if(!entry)return;try{let next=updateBookmarkCategory(changes,entry,$('edit-category-select').value);const updated=mergeLibrary(baseEntries,next).find(e=>e.id===entry.id);next=assignWorkSubcategory(next,updated,['work','dev'].includes(updated.category)?$('edit-work-subcategory').value:'');changes=next;}catch(error){$('edit-category-error').textContent=error.message;$('edit-category-error').hidden=false;return;}const persisted=persistLibrary();$('edit-category-dialog').close();refreshLibrary();const button=document.querySelector('[data-bookmark="'+entry.id+'"] .edit-category-button');(button||$('library-title')).focus({preventScroll:true});managementNotice('已更新「'+entry.title+'」的分類'+(button?'':'；書籤已移至新的分類，可清除篩選後查看。'),persisted);});
 let editingStatusId=null;
 function editStatusButton(entry){const status=STATUS[entry.status]||STATUS.unknown;const button=el('button','connection '+status.tone+' edit-status-button',status.short+' ✎');button.type='button';button.setAttribute('aria-label','編輯網址狀態：'+entry.title);button.title=(entry.reason||'')+(entry.code?' · HTTP '+entry.code:'')+' · 點選編輯狀態';button.addEventListener('click',()=>{editingStatusId=entry.id;$('edit-status-bookmark').textContent=entry.title;const select=$('edit-status-select');select.replaceChildren();for(const [id,value]of Object.entries(STATUS)){const option=el('option','',value.label);option.value=id;select.append(option);}const option=el('option','','恢復自動檢查結果');option.value='original';select.append(option);select.value=entry.status;$('edit-status-error').hidden=true;$('edit-status-dialog').showModal();select.focus();});return button;}
 for(const id of ['close-edit-status','cancel-edit-status'])$(id).addEventListener('click',()=>$('edit-status-dialog').close());
 $('edit-status-form').addEventListener('submit',event=>{event.preventDefault();const entry=byId.get(editingStatusId);if(!entry)return;try{changes=updateBookmarkStatus(changes,entry,$('edit-status-select').value);}catch(error){$('edit-status-error').textContent=error.message;$('edit-status-error').hidden=false;return;}const persisted=persistLibrary();$('edit-status-dialog').close();refreshLibrary();const button=document.querySelector('[data-bookmark="'+entry.id+'"] .edit-status-button');(button||$('library-title')).focus({preventScroll:true});managementNotice('已更新「'+entry.title+'」的網址狀態'+(button?'':'；書籤已不符合目前篩選條件。'),persisted);});

 // 編輯名稱／網址保留同一個書籤 ID，讓收藏與分類參照維持有效。
 let editingDetailsId=null;
 function editDetailsButton(entry){const button=el('button','soft-button edit-details-button','編輯');button.type='button';button.setAttribute('aria-label','編輯名稱與網址：'+entry.title);button.title='編輯名稱與網址';button.addEventListener('click',()=>{editingDetailsId=entry.id;$('edit-details-title').value=entry.title;$('edit-details-url').value=entry.url;$('edit-details-error').hidden=true;$('edit-details-dialog').showModal();$('edit-details-title').focus();});return button;}
 for(const id of ['close-edit-details','cancel-edit-details'])$(id).addEventListener('click',()=>$('edit-details-dialog').close());
 $('edit-details-form').addEventListener('submit',event=>{event.preventDefault();const entry=byId.get(editingDetailsId);if(!entry)return;try{changes=updateBookmarkDetails(changes,entry,{title:$('edit-details-title').value,url:$('edit-details-url').value});const persisted=persistLibrary();$('edit-details-dialog').close();refreshLibrary();managementNotice('已更新書籤；變更網址的項目已改為未檢查。',persisted);}catch(error){$('edit-details-error').textContent=error.message;$('edit-details-error').hidden=false;}});
 // 選取集合以 ID 記錄；currentResults 包含尚未展開的結果，批次確認時另存選取快照。
 const selectedBookmarks=new Set();let currentResults=[],pendingBatchIds=[];
 // 全選以全部符合篩選的結果為準；部分選取時使用原生 indeterminate 狀態。
 function updateSelectionUI(){const count=selectedBookmarks.size;$('selection-count').textContent='已選 '+count+' 筆';$('batch-category').disabled=!count;$('clear-selection').disabled=!count;const all=$('select-results');all.disabled=!currentResults.length;all.checked=!!count&&count===currentResults.length;all.indeterminate=count>0&&count<currentResults.length;for(const article of $('bookmark-grid').children){const selected=selectedBookmarks.has(article.dataset.bookmark);article.dataset.selected=String(selected);const input=article.querySelector('.bookmark-select');if(input)input.checked=selected;}}
 $('select-results').addEventListener('change',event=>{selectedBookmarks.clear();if(event.target.checked)for(const row of currentResults)selectedBookmarks.add(row.id);updateSelectionUI();});
 $('clear-selection').addEventListener('click',()=>{selectedBookmarks.clear();updateSelectionUI();});
 $('batch-category').addEventListener('click',()=>{pendingBatchIds=[...selectedBookmarks];if(!pendingBatchIds.length)return;const locked=pendingBatchIds.some(id=>String(byId.get(id)?.folder||'').split(' / ').includes('中榮'));const select=$('batch-category-select');select.replaceChildren();for(const c of CATEGORIES){if(locked&&!['ai','work','dev'].includes(c.id))continue;const option=el('option','',c.name);option.value=c.id;select.append(option);}select.value=[...select.options].some(o=>o.value===state.category)?state.category:'work';fillSubselect('batch-subcategory',select.value);$('batch-count').textContent='將移動選取的 '+pendingBatchIds.length+' 筆書籤。';$('batch-note').textContent=locked?'選取項目含「中榮」原始資料夾，僅能移到工作用途分類。':'只修改選取的書籤；收藏、名稱與網址會保留。';$('batch-error').hidden=true;$('batch-dialog').showModal();});
 $('batch-category-select').addEventListener('change',()=>fillSubselect('batch-subcategory',$('batch-category-select').value));
 for(const id of ['close-batch','cancel-batch'])$(id).addEventListener('click',()=>$('batch-dialog').close());
 $('batch-form').addEventListener('submit',event=>{event.preventDefault();try{const category=$('batch-category-select').value;changes=batchUpdateBookmarkCategories(changes,entries,pendingBatchIds,category,['work','dev'].includes(category)?$('batch-subcategory').value:'');const persisted=persistLibrary();const count=pendingBatchIds.length;selectedBookmarks.clear();$('batch-dialog').close();refreshLibrary();managementNotice('已移動 '+count+' 筆書籤至「'+categoryMap.get(category).name+'」',persisted);}catch(error){$('batch-error').textContent=error.message;$('batch-error').hidden=false;}});

 let pendingDelete=null;
 function deleteButton(e){const b=el('button','delete-button');b.type='button';b.setAttribute('aria-label','刪除書籤：'+e.title);b.title='刪除書籤';b.append(icon('trash'));b.addEventListener('click',()=>{pendingDelete=e.id;$('delete-title').textContent=e.title;$('delete-url').textContent=e.url;$('delete-dialog').showModal();$('cancel-delete').focus();});return b;}
 // 檔案存檔與瀏覽器快取分開處理；回傳值只代表 localStorage 是否成功，
 // 真正的檔案結果由 queueFileSave 更新畫面提示。
 function persistLibrary(){queueFileSave();try{storage.setItem(LIBRARY_KEY,JSON.stringify(changes));return true;}catch{return false;}}
 function managementNotice(message,persisted){toast(persisted?message:message+'；瀏覽器無法保存，這項變更僅在本次開啟期間有效。');}
 function refreshLibrary(){entries=mergeLibrary(baseEntries,changes);byId.clear();for(const e of entries)byId.set(e.id,e);render();}
 for(const c of CATEGORIES){const option=el('option','',c.name);option.value=c.id;$('bookmark-category').append(option);}
 $('add-bookmark').addEventListener('click',()=>{$('add-form').reset();$('add-error').hidden=true;$('bookmark-category').value=state.category==='all'?'auto':state.category;fillSubselect('add-work-subcategory',$('bookmark-category').value,state.workSubcategory);$('add-dialog').showModal();$('bookmark-title').focus();});
 for(const id of ['close-add','cancel-add'])$(id).addEventListener('click',()=>$('add-dialog').close());
 $('add-form').addEventListener('submit',event=>{
  event.preventDefault();let entry;
  try{const id='manual-'+(globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+'-'+Math.random().toString(36).slice(2));entry=createManualBookmark({title:$('bookmark-title').value,url:$('bookmark-url').value,category:$('bookmark-category').value},id,baseEntries.length+changes.added.length+1);}catch(error){$('add-error').textContent=error.message;$('add-error').hidden=false;(!String($('bookmark-title').value).trim()?$('bookmark-title'):$('bookmark-url')).focus();return;}
  changes={...changes,added:[...changes.added,entry]};if(['work','dev'].includes(entry.category))changes=assignWorkSubcategory(changes,entry,$('add-work-subcategory').value);const persisted=persistLibrary();$('add-dialog').close();Object.assign(state,{view:'library',purpose:'all',originalFolder:'all',category:entry.category,workSubcategory:'all',query:'',status:'all',favoriteOnly:false,sort:'original',limit:36});$('search').value='';$('status-filter').value='all';$('sort').value='original';refreshLibrary();$('library-title').focus({preventScroll:true});managementNotice('已新增「'+entry.title+'」',persisted);
 });
 for(const id of ['close-delete','cancel-delete'])$(id).addEventListener('click',()=>$('delete-dialog').close());
 $('confirm-delete').addEventListener('click',()=>{if(!pendingDelete||!byId.has(pendingDelete))return;const title=byId.get(pendingDelete).title;if(!changes.deletedIds.includes(pendingDelete))changes.deletedIds.push(pendingDelete);const persisted=persistLibrary();$('delete-dialog').close();pendingDelete=null;refreshLibrary();(state.view==='browse'?$('undo-delete-list'):$('undo-delete')).focus({preventScroll:true});managementNotice('已刪除「'+title+'」，可按「復原刪除」還原。',persisted);});
 $('undo-delete-list').addEventListener('click',()=>$('undo-delete').click());
 $('undo-delete').addEventListener('click',()=>{const id=changes.deletedIds.pop();if(!id)return;const persisted=persistLibrary();const restored=mergeLibrary(baseEntries,changes).find(e=>e.id===id);if(restored){Object.assign(state,{view:state.view==='browse'?'browse':'library',purpose:'all',originalFolder:'all',category:restored.category,workSubcategory:'all',query:'',status:'all',favoriteOnly:false,limit:36});$('search').value='';$('status-filter').value='all';}refreshLibrary();if($('undo-delete').hidden)$('add-bookmark').focus({preventScroll:true});managementNotice('已復原刪除的書籤',persisted);});
 function initial(e){if(/chatgpt/i.test(e.title))return 'G';if(/gemini/i.test(e.title))return '✧';if(/github/i.test(e.title))return 'GH';const name=e.title.replace(/^[\s\[【（(「『]+/,'');return [...name][0]?.toUpperCase()||'↗';}
 function attachLink(a,e){a.href=e.url;a.target='_blank';a.rel='noopener noreferrer';a.title=e.title+'\n'+e.url;}
 const failedIconSources=new Set();
 // 圖示載入失敗會嘗試下一個來源，最後保留文字替代，避免卡片出現破圖。
 function siteSymbol(entry,color){const symbol=el('span','site-symbol '+color);symbol.setAttribute('aria-hidden','true');const fallback=el('span','site-initial',initial(entry));symbol.append(fallback);const sources=bookmarkIconSources(entry.url,bookmarkIcons).filter(src=>!failedIconSources.has(src));if(!sources.length)return symbol;const img=el('img','site-favicon');img.alt='';img.loading='lazy';img.decoding='async';img.referrerPolicy='no-referrer';let current;
  const next=()=>{current=sources.shift();if(current)img.src=current;else img.remove();};
  img.addEventListener('load',()=>{fallback.hidden=true;img.classList.add('loaded');});img.addEventListener('error',()=>{failedIconSources.add(current);next();});symbol.append(img);next();return symbol;
 }
 // 以 DOM 與 textContent 組合卡片，避免把使用者輸入當成 HTML 執行。
 function card(e){const c=categoryMap.get(e.category),article=el('article','bookmark-card');article.dataset.bookmark=e.id;article.dataset.purpose=getBookmarkPurpose(e);const top=el('div','card-top');top.append(siteSymbol(e,c.color));const domain=el('span','card-domain',e.domain);domain.title=e.domain;const checkbox=el('input','bookmark-select');checkbox.type='checkbox';checkbox.checked=selectedBookmarks.has(e.id);checkbox.setAttribute('aria-label','選取書籤：'+e.title);checkbox.addEventListener('change',()=>{if(checkbox.checked)selectedBookmarks.add(e.id);else selectedBookmarks.delete(e.id);updateSelectionUI();});domain.prepend(checkbox);top.append(domain,starButton(e),deleteButton(e));article.append(top);if(safeWebUrl(e.url)){const a=el('a','card-link');attachLink(a,e);a.append(el('h3','',e.title||e.domain));article.append(a);}else{const h=el('h3','disabled-title',e.title||e.url);h.title='此網址使用特殊協定，請從原始書籤開啟。';article.append(h);}const folder=el('p','card-folder');folder.title=e.folder||'原始書籤根目錄';folder.append(icon('folder'),el('span','',e.folder.replace(/^書籤列\s*\/\s*/,'').replace(/^書籤列$/,'書籤列')||'原始書籤根目錄'));article.append(folder);const bottom=el('div','card-bottom');bottom.append(editDetailsButton(e),editCategoryButton(e));bottom.append(editStatusButton(e));if(state.duplicatesOnly&&(duplicateUrlCounts.get(e.url)||0)>1){const badge=el('span','duplicate-badge','同網址 '+duplicateUrlCounts.get(e.url)+' 筆');badge.title='依全部未刪除書籤比對；其他同網址書籤可能位於不同分類。';bottom.append(badge);}article.append(bottom);return article;}
 const quickDefinitions=[{match:e=>/^ChatGPT$/i.test(e.title),label:'ChatGPT',icon:'sparkles'}, {match:e=>/Google Gemini/i.test(e.title),label:'Gemini',icon:'sparkles'}, {match:e=>/員工入口網站/.test(e.title),label:'員工入口',icon:'briefcase'}, {match:e=>/^GitHub$/i.test(e.title),label:'GitHub',icon:'code'}, {match:e=>/Goodinfo!/i.test(e.title),label:'Goodinfo!',icon:'chart'}, {match:e=>/VoiceTube 看影片/i.test(e.title),label:'VoiceTube',icon:'languages'}];
 function renderQuick(){const container=$('quick-links');container.replaceChildren();const pinned=entries.filter(e=>favorites.has(e.id)&&safeWebUrl(e.url));let quick;if(pinned.length){quick=pinned.slice(0,6).map(e=>({entry:e,label:e.title,icon:categoryMap.get(e.category).icon}));$('quick-title').replaceChildren(icon('star'),document.createTextNode('常用收藏'));$('quick-hint').textContent=pinned.length>6?'前 6 個收藏 · 左側查看全部':'把喜歡的網站，放在最順手的地方';}else{quick=quickDefinitions.map(q=>({...q,entry:entries.find(q.match)})).filter(q=>q.entry);$('quick-title').replaceChildren(icon('zap'),document.createTextNode('快速入口'));$('quick-hint').textContent='點卡片上的 ☆，建立自己的常用入口';}for(const q of quick){const a=el('a','quick-link');a.dataset.purpose=getBookmarkPurpose(q.entry);attachLink(a,q.entry);const symbol=el('span','quick-symbol '+categoryMap.get(q.entry.category).color);symbol.append(icon(q.icon));a.append(symbol,el('span','quick-label',q.label));container.append(a);}}
 function reset(){Object.assign(state,{duplicatesOnly:false,purpose:'all',originalFolder:'all',category:'all',workSubcategory:'all',query:'',status:'all',favoriteOnly:false,limit:36});$('search').value='';$('status-filter').value='all';render();}
 for(const input of document.querySelectorAll('[data-duplicate-filter]'))input.addEventListener('change',()=>{state.duplicatesOnly=input.checked;state.view=state.view==='home'?'library':state.view;state.limit=36;render();});
 // 統一依目前狀態更新導覽、計數與卡片；只繪製 limit 內的項目以控制 DOM 數量。
 // 重複網址按整份有效清單計算，選取項目則會移除不再符合目前篩選的 ID。
 function render(){
  duplicateUrlCounts=countDuplicateUrls(entries);for(const input of document.querySelectorAll('[data-duplicate-filter]'))input.checked=state.duplicatesOnly;
  const duplicateMatches=selectBookmarks(entries,{...state,duplicatesOnly:true,favorites:[...favorites]});const duplicateGroups=new Set(duplicateMatches.map(e=>e.url));for(const node of document.querySelectorAll('[data-duplicate-count]'))node.textContent=duplicateMatches.length+' 筆／'+duplicateGroups.size+' 組';
  $('bookmark-grid').dataset.layout=state.layout;for(const value of ['grid','list'])$('layout-'+value).setAttribute('aria-pressed',String(state.layout===value));
  renderCategoryNavigationOrder();
  renderWorkSubnavigation();
  const isHome=state.view==='home',isBrowse=state.view==='browse';$('library-results').hidden=isHome;$('page-footer').hidden=isHome;document.querySelector('.topbar').hidden=isBrowse;$('home-breadcrumb-trail').hidden=isBrowse;$('home-overview').hidden=isBrowse;$('file-storage-bar').hidden=isBrowse;$('home-controls').hidden=isBrowse;document.querySelector('.library').dataset.mode=state.view;
  const browseAll=isBrowse&&state.category==='all'&&!state.favoriteOnly;
  $('browse-search-controls').hidden=!browseAll;$('browse-search-panel').hidden=!state.browseSearchOpen;
  $('toggle-browse-search').setAttribute('aria-expanded',String(state.browseSearchOpen));$('toggle-browse-search').querySelector('span').textContent=state.browseSearchOpen?'收起搜尋':'關鍵字搜尋';
  if($('browse-search').value!==state.query)$('browse-search').value=state.query;$('clear-browse-search').hidden=!state.query;
  renderOriginalFolders();
  updateLibrarySummary();
  renderStatusShortcuts();
  renderPurposeShortcuts();
  const current=state.favoriteOnly?'favorites':state.category;
  for(const b of document.querySelectorAll('.nav-button')){const active=!isHome&&b.dataset.category===current;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));b.querySelector('.count').textContent=b.dataset.category==='favorites'?entries.filter(e=>favorites.has(e.id)).length:b.dataset.category==='all'?entries.length:entries.filter(e=>e.category===b.dataset.category).length;}
  renderQuick();
  let rows=selectBookmarks(entries,{...state,favorites:[...favorites]});
  if(state.sort==='name')rows.sort((a,b)=>a.title.localeCompare(b.title,'zh-Hant'));
  if(state.sort==='favorite')rows.sort((a,b)=>Number(favorites.has(b.id))-Number(favorites.has(a.id))||a.sourceId-b.sourceId);
  rows=prioritizeWorkSearchResults(rows,state.query);
  currentResults=rows;const resultIds=new Set(rows.map(e=>e.id));for(const id of selectedBookmarks)if(!resultIds.has(id))selectedBookmarks.delete(id);
  const c=categoryMap.get(state.category);
  const subname=state.workSubcategory==='unassigned'?'未分類':(changes.workSubcategories||[]).find(s=>s.id===state.workSubcategory)?.name;
  const title=(state.favoriteOnly?'常用收藏':c?.name||'所有書籤')+(['work','dev'].includes(state.category)&&subname?' · '+subname:'');
  $('library-title').replaceChildren(document.createTextNode(title+' '),el('span','',String(rows.length)));
  $('library-description').textContent=state.favoriteOnly?'喜歡的網站，值得一個更順手的位置。':c?.description||'你的每一個收藏，都有自己的位置。';
  const fragment=document.createDocumentFragment();for(const e of (isHome?[]:rows.slice(0,state.limit)))fragment.append(card(e));$('bookmark-grid').replaceChildren(fragment);updateSelectionUI();
  const filtered=!!(state.duplicatesOnly||state.workSubcategory!=='all'||state.purpose!=='all'||state.query||state.status!=='all'||state.originalFolder!=='all');$('active-filters').hidden=!filtered;
  $('active-description').textContent=[state.duplicatesOnly?'僅顯示重複網址（全書籤比對）':'',subname?'第二層：'+subname:'',state.purpose!=='all'?(state.purpose==='work'?'工作用途':'生活'):'',state.originalFolder!=='all'?'原始資料夾：'+(state.originalFolder==='__root__'?'未分類（原始根目錄）':state.originalFolder.replaceAll(' / ',' › ')):'',state.query?'搜尋「'+state.query+'」':'',state.status!=='all'?(STATUS[state.status]?.label||''):null].filter(Boolean).join(' · ');
  $('clear-search').hidden=!state.query;
  $('empty-state').hidden=rows.length!==0;
  $('empty-title').textContent=state.favoriteOnly&&state.purpose==='all'&&!state.query&&state.status==='all'&&state.originalFolder==='all'?'還沒有常用收藏':'沒有找到符合的書籤';
  $('empty-description').textContent=state.favoriteOnly&&state.purpose==='all'&&!state.query&&state.status==='all'&&state.originalFolder==='all'?'點書籤卡片上的 ☆，把最常去的網站收藏起來。':'試試其他關鍵字，或調整用途、資料夾與網址狀態篩選。';
  $('load-more-wrap').hidden=rows.length===0;
  $('shown-count').textContent='已顯示 '+Math.min(state.limit,rows.length)+' / '+rows.length+' 個書籤';
  $('load-more').hidden=state.limit>=rows.length;
  $('screen-reader-status').textContent=isHome?'書籤首頁；選擇左側分類或搜尋即可查看書籤。':title+'，找到 '+rows.length+' 個書籤';
 }
 $('toggle-browse-search').addEventListener('click',()=>{state.browseSearchOpen=!state.browseSearchOpen;render();if(state.browseSearchOpen)$('browse-search').focus();});
 $('browse-search').addEventListener('input',()=>{state.query=$('browse-search').value.trim();$('search').value=state.query;state.limit=36;render();});
 $('clear-browse-search').addEventListener('click',()=>{state.query='';$('search').value='';state.limit=36;render();$('browse-search').focus();});
 $('browse-search').addEventListener('keydown',event=>{if(event.key==='Escape'){state.browseSearchOpen=false;render();$('toggle-browse-search').focus();}});
 $('search').addEventListener('input',()=>{state.query=$('search').value.trim();if(state.query)state.view='library';state.limit=36;render();});
 $('clear-search').addEventListener('click',()=>{state.query='';state.limit=36;$('search').value='';render();$('search').focus();});
 $('status-filter').addEventListener('change',()=>{state.view='library';state.status=$('status-filter').value;state.limit=36;render();});
 for(const value of ['grid','list'])$('layout-'+value).addEventListener('click',()=>{state.layout=value;try{storage.setItem(layoutKey,value);}catch{}render();});
 $('sort').addEventListener('change',()=>{state.sort=$('sort').value;render();});
 $('reset-filters').addEventListener('click',reset);$('empty-reset').addEventListener('click',reset);
 $('load-more').addEventListener('click',()=>{const previous=state.limit;state.limit+=36;render();const firstNew=$('bookmark-grid').children[previous]?.querySelector('a,button');firstNew?.focus({preventScroll:true});});
 function showHome(event){event.preventDefault();state.view='home';reset();$('advanced-filters').hidden=true;$('toggle-filters').setAttribute('aria-expanded','false');$('toggle-filters-label').textContent='更多篩選…';document.querySelector('.sidebar').classList.remove('mobile-open');$('mobile-toggle').setAttribute('aria-expanded','false');window.scrollTo({top:0,behavior:'smooth'});}
 $('home-link').addEventListener('click',showHome);$('home-breadcrumb').addEventListener('click',showHome);
 $('back-top').addEventListener('click',()=>window.scrollTo({top:0,behavior:'smooth'}));
 $('mobile-toggle').addEventListener('click',()=>{const expanded=document.querySelector('.sidebar').classList.toggle('mobile-open');$('mobile-toggle').setAttribute('aria-expanded',String(expanded));});
 document.addEventListener('keydown',e=>{const tag=e.target?.tagName;if(e.key==='/'&&!['INPUT','TEXTAREA','SELECT'].includes(tag)&&!e.target?.isContentEditable&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&!document.querySelector('dialog[open]')){e.preventDefault();if(state.view==='browse'){state.view='library';render();}$('search').focus();}if(e.key==='Escape'&&document.activeElement===$('search')){state.query='';$('search').value='';render();$('search').blur();}});
 function updateLibrarySummary(){
 const counts={};for(const e of entries)counts[e.status]=(counts[e.status]||0)+1;
 $('status-summary').replaceChildren();$('total-top').textContent=entries.length;$('undo-delete').hidden=changes.deletedIds.length===0;$('undo-delete-list').hidden=changes.deletedIds.length===0||state.view!=='browse';
 $('checked-date').textContent='最後完成檢查：'+new Date(checkedAt).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',hour12:false})+'（台灣時間）';
 for(const [key,count] of Object.entries(counts)){const status=STATUS[key]||STATUS.unknown;const row=el('button');row.type='button';row.setAttribute('aria-label','篩選'+status.label+'，'+count+' 筆');row.append(el('span','connection '+status.tone,status.label),el('b','',count+' 筆'));row.addEventListener('click',()=>{$('info-dialog').close();applyStatus(key);$('library-title').focus({preventScroll:true});$('library-title').scrollIntoView({block:'start'});});$('status-summary').append(row);}
 }
 // 檢查期間暫停目前分頁的編輯入口；關閉說明視窗不會終止背景工作。
 function setCheckBusy(value){checkingUrls=value;$('recheck-urls').disabled=!fileReady||value||stoppingService;$('recheck-urls').textContent=value?'正在檢查…':'重新檢查網址';$('stop-service').disabled=!fileReady||value||stoppingService;}
 // 檢查完成後重新讀取正式檔案與版本，避免只更新狀態而留下過期的存檔 ETag。
 async function reloadCheckedData(){const response=await appFetch('/assets/bookmarks-data.txt',{cache:'no-store'});if(!response.ok)throw new Error('檢查已完成，但讀取新資料失敗，請重新整理。');const loaded=readDataFile(await response.text());const nextRevision=response.headers.get('ETag');if(!nextRevision)throw new Error('缺少資料版本，請重新整理。');baseEntries=loaded.baseEntries;changes=loaded.changes;favorites=new Set(loaded.favorites);checkedAt=loaded.checkedAt;fileRevision=nextRevision;fileError='';fileConflict=false;try{storage.setItem(LIBRARY_KEY,JSON.stringify(changes));storage.setItem(FAVORITES_KEY,JSON.stringify([...favorites]));}catch{}refreshLibrary();showFileStatus('最新網址檢查結果已儲存至 assets/bookmarks-data.txt','saved');}
 // 以工作 ID 避免重複套用結果；只有完整完成的工作才更新最後檢查時間與資料。
 async function pollUrlCheck(){
  if(!fileReady||checkStatusRequest)return;checkStatusRequest=true;clearTimeout(checkPollTimer);
  try{const response=await appFetch('/api/url-check',{cache:'no-store'});if(!response.ok)throw new Error(response.status===404?'請重新執行 start-bookmarks.cmd，以載入支援網址檢查的新版服務。':'無法取得檢查進度，請稍後重新開啟此視窗。');const job=await response.json();$('recheck-message').dataset.tone='';setCheckBusy(job.state==='running'||(job.state==='completed'&&appliedCheckId!==job.id));$('recheck-progress').hidden=job.state!=='running';
   if(job.state==='running'){$('recheck-message').textContent='已檢查 '+job.checked+' / '+job.total+' 個不同網址'+(job.checked===job.total?'，正在儲存結果…':'，請稍候…');$('recheck-progress').max=Math.max(1,job.total);$('recheck-progress').value=job.checked;checkPollTimer=setTimeout(pollUrlCheck,1200);}
   else if(job.state==='completed'){if(appliedCheckId!==job.id){await saveQueue;await reloadCheckedData();appliedCheckId=job.id;}setCheckBusy(false);$('recheck-message').textContent='已完成 '+job.total+' 個不同網址的檢查，結果與完成時間已儲存。';}
   else if(job.state==='failed'||job.state==='cancelled'){$('recheck-message').textContent=job.error||'檢查未完成，最後完成時間維持不變。';}
  }catch(error){setCheckBusy(false);$('recheck-progress').hidden=true;$('recheck-message').textContent=error.message;$('recheck-message').dataset.tone='error';}finally{checkStatusRequest=false;}
 }
 function showCheckAvailability(){
  if(preview){$('recheck-urls').disabled=true;$('open-local-checker').hidden=true;$('recheck-message').textContent='雲端版本尚未啟用網址檢查。';return;}
  $('recheck-urls').disabled=!fileReady||checkingUrls||stoppingService;$('open-local-checker').hidden=fileReady;
  if(!fileReady){$('recheck-urls').textContent='請先開啟本機版';$('recheck-message').textContent=(fileError||'尚未連線到本機服務。')+' 請先雙擊 start-bookmarks.cmd 啟動，再按「開啟本機版」。';$('recheck-message').dataset.tone='error';}
 }
 $('open-local-checker').addEventListener('click',event=>{if(location.origin==='http://127.0.0.1:4178'){event.preventDefault();history.replaceState(null,'','#url-check');location.reload();}});
 showCheckAvailability();
 $('recheck-urls').addEventListener('click',async()=>{
  if(!fileReady||checkingUrls||stoppingService)return;setCheckBusy(true);$('recheck-message').dataset.tone='';$('recheck-message').textContent='正在準備檢查…';
  try{await saveQueue;if(fileError)throw new Error('請先處理存檔錯誤後再重新檢查。');const response=await appFetch('/api/url-check',{method:'POST',headers:{'Content-Type':'application/json','If-Match':fileRevision},body:'{}'});const result=await response.json();if(!response.ok)throw new Error(result.error||'無法開始網址檢查。');await pollUrlCheck();}catch(error){setCheckBusy(false);$('recheck-message').textContent=error.message;}
 });
 document.addEventListener('submit',event=>{if((checkingUrls||stoppingService||!fileReady||fileError)&&event.target.matches('#edit-details-form,#batch-form,#add-form,#edit-category-form,#edit-status-form,#work-subcategory-form,.work-subcategory-row')){event.preventDefault();event.stopImmediatePropagation();toast(checkingUrls?'網址檢查進行中，完成後即可修改書籤。':fileError||'服務暫時無法存檔。');}},true);
 $('check-info').addEventListener('click',()=>{$('info-dialog').showModal();showCheckAvailability();if(fileReady)pollUrlCheck();});
 for(const id of ['close-dialog','dialog-done'])$(id).addEventListener('click',()=>$('info-dialog').close());
 $('info-dialog').addEventListener('click',e=>{if(e.target===$('info-dialog')){const rect=e.target.getBoundingClientRect();if(e.clientX<rect.left||e.clientX>rect.right||e.clientY<rect.top||e.clientY>rect.bottom)e.target.close();}});
 $('total-top').textContent=entries.length;
 $('library-title').tabIndex=-1;
 render();if(location.hash==='#url-check')$('info-dialog').showModal();if(fileReady)pollUrlCheck();if(storageWarning)toast('部分本機資料無法讀取；新增、刪除與收藏仍可於本次開啟期間使用。');
})();
