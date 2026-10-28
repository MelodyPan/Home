// 書籤工作台前端入口：載入資料、維護篩選狀態、處理操作並排隊存檔。
// 畫面狀態只影響呈現；書籤異動透過共用核心合併後同步至 Google Drive。
(async() => {
 'use strict';
 const {countDuplicateUrls,updateBookmarkDetails,batchUpdateBookmarkCategories,bookmarkIconSources,orderedCategories,moveCategory,CATEGORIES,STATUS,safeWebUrl,getBookmarkPurpose,countPurposes,selectBookmarks,listOriginalFolders,countStatuses,createManualBookmark,mergeLibrary,updateBookmarkCategory,updateBookmarkStatus,createChromeBookmarkHtml,moveWorkSubcategory,prioritizeWorkSearchResults,createWorkSubcategory,renameWorkSubcategory,removeWorkSubcategory,assignWorkSubcategory}=BookmarkCore;
 let baseEntries=[],checkedAt='1970-01-01T00:00:00Z',bookmarkIcons={};
 const categoryMap=new Map(CATEGORIES.map(c=>[c.id,c]));
 const purposeFor=category=>getBookmarkPurpose({category});
 const $=id=>document.getElementById(id);
 const paths={grid:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',star:'<path d="m12 3 2.8 5.7 6.3.9-4.6 4.4 1.1 6.3L12 17.4l-5.6 2.9 1.1-6.3L3 9.6l6.2-.9L12 3Z"/>',sparkles:'<path d="m12 3 2.2 6.8L21 12l-6.8 2.2L12 21l-2.2-6.8L3 12l6.8-2.2L12 3Z"/><path d="m20 2 .6 1.5L22 4l-1.4.5L20 6l-.5-1.5L18 4l1.5-.5L20 2Z"/>',briefcase:'<rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12c6 4 12 4 18 0M12 12v4"/>',code:'<path d="m8 6-6 6 6 6m8-12 6 6-6 6m-3-15-2 18"/>',languages:'<path d="M3 5h12M9 3v2M5 5c1 6 5 10 10 12M13 5c-1 5-5 10-10 12M14 21l4-10 4 10m-6-4h4"/>',compass:'<circle cx="12" cy="12" r="9"/><path d="m16 8-2 6-6 2 2-6 6-2Z"/>',coffee:'<path d="M4 8h13v9a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V8Zm13 1h2a3 3 0 0 1 0 6h-2M7 2v3m4-3v3m4-3v3"/>',chart:'<path d="M4 3v17h17M8 15l4-5 4 3 5-7M17 6h4v4"/>',book:'<path d="M12 5C9 3 6 3 3 4v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-3-1-6-1-9 1Zm0 0v15"/>',play:'<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m10 9 5 3-5 3V9Z"/>',camera:'<path d="M8 5 9 3h6l1 2h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h4Z"/><circle cx="12" cy="13" r="4"/>',sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',folder:'<path d="M3 6a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6Z"/>',heart:'<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',zap:'<path d="m13 2-9 12h7l-1 8 10-12h-7l1-8Z"/>',search:'<circle cx="10.8" cy="10.8" r="7.3"/><path d="m16 16 5 5"/>',filter:'<path d="M3 6h18M6 12h12M9 18h6"/>',sort:'<path d="M8 3v18m-4-4 4 4 4-4M14 5h7m-7 5h5m-5 5h3"/>',shield:'<path d="m12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6l9-4Z"/><path d="m8 12 3 3 5-6"/>'};
 paths.list='<path d="M9 6h12M9 12h12M9 18h12"/><path d="M3 6h1M3 12h1M3 18h1"/>';
 paths.trash='<path d="M3 6h18M9 6V4h6v2M5 6l1 15h12l1-15M10 10v7m4-7v7"/>';
 function icon(name){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('class','icon');svg.setAttribute('aria-hidden','true');svg.innerHTML=paths[name]||paths.folder;return svg;}
 function el(tag,className,text){const n=document.createElement(tag);if(className)n.className=className;if(text!==undefined)n.textContent=text;return n;}
 document.querySelectorAll('[data-icon]').forEach(n=>n.replaceWith(icon(n.dataset.icon)));
 // Only visual layout preferences use localStorage; all bookmark data comes from Drive.
 let storage;try{storage=window.localStorage;}catch{storage={getItem(){},setItem(){}};}
 const {createDataFile,readDataFile}=BookmarkFile;
 let cloud,fileReady=false,fileError='請先連接 Google Drive。',fileConflict=false;
 let changes={added:[],deletedIds:[]},entries=[],favorites=new Set();
 const byId=new Map();let lastCloudDocument=null;
 let checkJob=null,checkSingleId=null;
 function showFileStatus(message,tone=''){$('file-status').textContent=message;$('file-status').dataset.tone=tone;}
 function snapshot(){return createDataFile(baseEntries,changes,[...favorites],checkedAt);}
 function queueFileSave(){if(fileReady&&!fileError)cloud.save(snapshot());}
 function downloadData(contents,type,filename){const url=URL.createObjectURL(new Blob([contents],{type})),link=el('a');link.href=url;link.download=filename;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 $('export-data').addEventListener('click',()=>{downloadData(createChromeBookmarkHtml(entries),'text/html;charset=utf-8','bookmarks-chrome.html');toast('已匯出 '+entries.length+' 個書籤。');});
 $('export-json').addEventListener('click',()=>downloadData(JSON.stringify(cloud?.state.draft||snapshot(),null,2)+'\n','application/json;charset=utf-8','bookmarks-data.txt'));
 $('backup-unsaved').addEventListener('click',()=>$('export-json').click());
 const mutations='#add-bookmark,#undo-delete,#undo-delete-list,.favorite-button,.delete-button,.edit-category-button,.edit-status-button,.edit-details-button,.recheck-button,#manage-quick-order,.quick-order-mutation,#batch-category,.bookmark-select,#select-results,.manage-work-subcategories,.work-subcategory-mutation,.category-order-mutation,#manage-category-order,#confirm-delete';
 document.addEventListener('click',event=>{if((!fileReady||fileError)&&event.target.closest(mutations)){event.preventDefault();event.stopImmediatePropagation();toast(fileError||'請先連接 Google Drive。');}},true);
 window.addEventListener('beforeunload',event=>{if(cloud?.hasUnsaved){event.preventDefault();event.returnValue='';}});
 function cloudChanged(remote){
  if(checkJob&&(!remote.online||!remote.document||!['ready','saving'].includes(remote.phase)||remote.account?.id!==checkJob.account||remote.datasetId!==checkJob.dataset))checkJob.controller.abort();
  fileReady=!!remote.document;fileConflict=remote.phase==='conflict';
  fileError=(!remote.online?'目前離線，請連線後再編輯。':remote.phase==='saving'&&!remote.pending?'正在確認同步結果，完成後即可編輯。':!['ready','saving'].includes(remote.phase)?remote.error?.message||'請先連接並載入 Google Drive 書籤。':'');
  const active=!!remote.draft||remote.pending>0;
  if(!remote.document||remote.error?.code==='account'){
   baseEntries=[];changes={added:[],deletedIds:[]};favorites=new Set();checkedAt='1970-01-01T00:00:00Z';lastCloudDocument=null;selectedBookmarks.clear();
   for(const dialog of document.querySelectorAll('dialog[open]:not(#drive-dialog)'))dialog.close();refreshLibrary();
  }else if(remote.document&&!active&&remote.document!==lastCloudDocument){
   const data=readDataFile(JSON.stringify(remote.document));baseEntries=data.baseEntries;changes=data.changes;favorites=new Set(data.favorites);checkedAt=data.checkedAt;lastCloudDocument=remote.document;selectedBookmarks.clear();refreshLibrary();
  }
  const failed=['error','conflict'].includes(remote.phase),status=remote.phase==='saving'?'正在同步至 Google Drive…':fileError||'已同步至 Google Drive';
  showFileStatus(status,failed?'error':remote.phase==='ready'?'saved':'');
  const retry=remote.phase==='error'&&remote.error?.code!=='auth'&&remote.error?.code!=='account';
  $('retry-file').hidden=!retry;$('backup-unsaved').hidden=!remote.draft;
  $('export-data').disabled=!remote.document;$('export-json').disabled=!remote.document&&!remote.draft;
  updateCheckControls();
 }
 const layoutKey='melody-pan-bookmark-layout';let savedLayout='grid';try{if(storage.getItem(layoutKey)==='list')savedLayout='list';}catch{}
 let duplicateUrlCounts=new Map();
 // home 為精簡首頁，browse 為左側分類清單，library 為保留首頁搜尋區的結果模式。
 // 此物件也保存目前篩選、排序與分頁上限；不會直接寫入書籤 JSON。
 const state={simpleLinks:false,selectionEnabled:false,duplicatesOnly:false,layout:savedLayout,browseSearchOpen:false,view:'home',purpose:'all',originalFolder:'all',category:'all',workSubcategory:'all',query:'',status:'all',favoriteOnly:false,sort:'original',limit:36};
 for(const button of document.querySelectorAll('[data-purpose-filter]'))button.addEventListener('click',()=>{state.simpleLinks=false;state.selectionEnabled=true;state.view='browse';state.purpose=state.purpose===button.dataset.purposeFilter?'all':button.dataset.purposeFilter;state.category='all';state.workSubcategory='all';state.limit=36;render();if(matchMedia('(max-width:740px)').matches){document.querySelector('.sidebar').classList.remove('mobile-open');$('mobile-toggle').setAttribute('aria-expanded','false');$('library-title').focus({preventScroll:true});$('library-title').scrollIntoView({block:'start'});}});
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
 let expandedCategory=null;
 function navButton(label,name,value,count){const b=el('button','nav-button');b.type='button';b.dataset.category=value;if(categoryMap.has(value))b.dataset.purpose=purposeFor(value);b.append(icon(name),el('span','',label),el('span','count',String(count)));b.addEventListener('click',()=>{if(value==='favorites'){Object.assign(state,{query:'',purpose:'all',originalFolder:'all',status:'all',duplicatesOnly:false});$('search').value='';$('browse-search').value='';$('status-filter').value='all';selectedBookmarks.clear();}state.selectionEnabled=value!=='all'&&value!=='favorites';state.simpleLinks=!state.selectionEnabled;const expandable=['work','dev'].includes(value);if(expandable&&state.view!=='home'&&state.category===value&&!state.favoriteOnly){expandedCategory=expandedCategory===value?null:value;renderWorkSubnavigation();return;}expandedCategory=expandable?value:null;state.browseSearchOpen=false;state.view='browse';state.category=value==='favorites'?'all':value;state.favoriteOnly=value==='favorites';state.workSubcategory='all';state.limit=36;render();if(matchMedia('(max-width:740px)').matches){document.querySelector('.sidebar').classList.remove('mobile-open');$('mobile-toggle').setAttribute('aria-expanded','false');$('library-title').scrollIntoView({block:'start'});$('library-title').tabIndex=-1;$('library-title').focus({preventScroll:true});}});return b;}
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
 const subnavs=new Map();for(const parent of ['work','dev']){const nav=el('div','work-subnavigation');nav.id='subnavigation-'+parent;$('categories').querySelector('[data-category="'+parent+'"]').after(nav);subnavs.set(parent,nav);}
 // 左側子分類依保存順序顯示，未分類固定最後；切換時保留其他有效篩選。
 function renderWorkSubnavigation(){
  const subs=(changes.workSubcategories||[]).filter(s=>(s.category||'work')===state.category);if(state.workSubcategory!=='all'&&state.workSubcategory!=='unassigned'&&!subs.some(s=>s.id===state.workSubcategory))state.workSubcategory='all';
  for(const [parent,subnav]of subnavs){subnav.hidden=state.category!==parent||state.view==='home'||expandedCategory!==parent;const toggle=$('categories').querySelector('[data-category="'+parent+'"]');toggle.setAttribute('aria-controls',subnav.id);toggle.setAttribute('aria-expanded',String(!subnav.hidden));subnav.replaceChildren();if(subnav.hidden)continue;
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


 function toggleFavorite(id){if(favorites.has(id))favorites.delete(id);else favorites.add(id);queueFileSave();const activeId=document.activeElement?.dataset.favorite;render();if(activeId){const replacement=document.querySelector('[data-favorite="'+activeId+'"]');if(replacement)replacement.focus({preventScroll:true});else $('library-title').focus({preventScroll:true});}toast(favorites.has(id)?'已加入常用收藏':'已移除常用收藏');}
 function starButton(e){const b=el('button','favorite-button');b.type='button';b.dataset.favorite=e.id;b.setAttribute('aria-label',(favorites.has(e.id)?'移除收藏：':'加入收藏：')+e.title);b.setAttribute('aria-pressed',String(favorites.has(e.id)));b.title=favorites.has(e.id)?'移除收藏':'加入常用收藏';b.append(icon('star'));b.addEventListener('click',()=>toggleFavorite(e.id));return b;}
 let editingCategoryId=null;
 function editCategoryButton(entry){const button=el('button','category-label edit-category-button',categoryMap.get(entry.category).name+(entry.workSubcategoryName?' / '+entry.workSubcategoryName:'')+' ✎');button.type='button';button.setAttribute('aria-label','編輯分類：'+entry.title);button.title='編輯分類';button.addEventListener('click',()=>{editingCategoryId=entry.id;$('edit-category-bookmark').textContent=entry.title;const select=$('edit-category-select');select.replaceChildren();const locked=entry.folder.split(' / ').includes('中榮');for(const c of CATEGORIES){if(locked&&!['ai','work','dev'].includes(c.id))continue;const option=el('option','',(purposeFor(c.id)==='work'?'工作用途 · ':'生活 · ')+c.name);option.value=c.id;select.append(option);}const original=el('option','','恢復原始分類');original.value='original';select.append(original);select.value=entry.category;$('edit-category-note').textContent=locked?'原始資料夾位於「中榮」底下，依你的設定維持工作用途。':'修改後會同步更新分類、用途篩選與卡片底色，並自動寫入 Google Drive。';fillSubselect('edit-work-subcategory',entry.category,entry.workSubcategory);$('edit-category-error').hidden=true;$('edit-category-dialog').showModal();select.focus();});return button;}
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
 function simplePresentation(){return state.simpleLinks&&!state.query;}
 function selectionAvailable(){return state.selectionEnabled||(state.simpleLinks&&!!state.query);}
 function updateSelectionUI(){if(!selectionAvailable())selectedBookmarks.clear();document.querySelector('.selection-toolbar').hidden=!selectionAvailable();const count=selectedBookmarks.size;$('selection-count').textContent='已選 '+count+' 筆';$('batch-category').disabled=!count;$('clear-selection').disabled=!count;const all=$('select-results');all.disabled=!currentResults.length;all.checked=!!count&&count===currentResults.length;all.indeterminate=count>0&&count<currentResults.length;for(const article of $('bookmark-grid').children){const selected=selectedBookmarks.has(article.dataset.bookmark);article.dataset.selected=String(selected);const input=article.querySelector('.bookmark-select');if(input)input.checked=selected;}}
 $('select-results').addEventListener('change',event=>{selectedBookmarks.clear();if(event.target.checked)for(const row of currentResults)selectedBookmarks.add(row.id);updateSelectionUI();});
 $('clear-selection').addEventListener('click',()=>{selectedBookmarks.clear();updateSelectionUI();});
 $('batch-category').addEventListener('click',()=>{pendingBatchIds=[...selectedBookmarks];if(!pendingBatchIds.length)return;const locked=pendingBatchIds.some(id=>String(byId.get(id)?.folder||'').split(' / ').includes('中榮'));const select=$('batch-category-select');select.replaceChildren();for(const c of CATEGORIES){if(locked&&!['ai','work','dev'].includes(c.id))continue;const option=el('option','',c.name);option.value=c.id;select.append(option);}select.value=[...select.options].some(o=>o.value===state.category)?state.category:'work';fillSubselect('batch-subcategory',select.value);$('batch-count').textContent='將移動選取的 '+pendingBatchIds.length+' 筆書籤。';$('batch-note').textContent=locked?'選取項目含「中榮」原始資料夾，僅能移到工作用途分類。':'只修改選取的書籤；收藏、名稱與網址會保留。';$('batch-error').hidden=true;$('batch-dialog').showModal();});
 $('batch-category-select').addEventListener('change',()=>fillSubselect('batch-subcategory',$('batch-category-select').value));
 for(const id of ['close-batch','cancel-batch'])$(id).addEventListener('click',()=>$('batch-dialog').close());
 $('batch-form').addEventListener('submit',event=>{event.preventDefault();try{const category=$('batch-category-select').value;changes=batchUpdateBookmarkCategories(changes,entries,pendingBatchIds,category,['work','dev'].includes(category)?$('batch-subcategory').value:'');const persisted=persistLibrary();const count=pendingBatchIds.length;selectedBookmarks.clear();$('batch-dialog').close();refreshLibrary();managementNotice('已移動 '+count+' 筆書籤至「'+categoryMap.get(category).name+'」',persisted);}catch(error){$('batch-error').textContent=error.message;$('batch-error').hidden=false;}});

 let pendingDelete=null;
 function deleteButton(e){const b=el('button','delete-button');b.type='button';b.setAttribute('aria-label','刪除書籤：'+e.title);b.title='刪除書籤';b.append(icon('trash'));b.addEventListener('click',()=>{pendingDelete=e.id;$('delete-title').textContent=e.title;$('delete-url').textContent=e.url;$('delete-dialog').showModal();$('cancel-delete').focus();});return b;}
 function persistLibrary(){queueFileSave();return true;}
 function managementNotice(message){toast(message);}
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
 function card(e){const c=categoryMap.get(e.category),article=el('article','bookmark-card');article.dataset.bookmark=e.id;article.dataset.purpose=getBookmarkPurpose(e);const top=el('div','card-top');top.append(siteSymbol(e,c.color));const domain=el('span','card-domain',e.domain);domain.title=e.domain;const checkbox=el('input','bookmark-select');checkbox.type='checkbox';checkbox.checked=selectedBookmarks.has(e.id);checkbox.setAttribute('aria-label','選取書籤：'+e.title);checkbox.addEventListener('change',()=>{if(checkbox.checked)selectedBookmarks.add(e.id);else selectedBookmarks.delete(e.id);updateSelectionUI();});if(selectionAvailable())domain.prepend(checkbox);top.append(domain,starButton(e),deleteButton(e));article.append(top);if(safeWebUrl(e.url)){const a=el('a','card-link');attachLink(a,e);a.append(el('h3','',e.title||e.domain));article.append(a);}else{const h=el('h3','disabled-title',e.title||e.url);h.title='此網址使用特殊協定，請從原始書籤開啟。';article.append(h);}const folder=el('p','card-folder');folder.title=e.folder||'原始書籤根目錄';folder.append(icon('folder'),el('span','',e.folder.replace(/^書籤列\s*\/\s*/,'').replace(/^書籤列$/,'書籤列')||'原始書籤根目錄'));article.append(folder);const bottom=el('div','card-bottom');bottom.append(editDetailsButton(e),editCategoryButton(e));bottom.append(editStatusButton(e),recheckButton(e));if(state.duplicatesOnly&&(duplicateUrlCounts.get(e.url)||0)>1){const badge=el('span','duplicate-badge','同網址 '+duplicateUrlCounts.get(e.url)+' 筆');badge.title='依全部未刪除書籤比對；其他同網址書籤可能位於不同分類。';bottom.append(badge);}article.append(bottom);return article;}
 function simpleLink(entry){const category=categoryMap.get(entry.category),link=el(safeWebUrl(entry.url)?'a':'span','quick-link simple-bookmark-link');link.dataset.bookmark=entry.id;link.dataset.purpose=getBookmarkPurpose(entry);if(safeWebUrl(entry.url))attachLink(link,entry);else{link.setAttribute('aria-disabled','true');link.title='此網址使用特殊協定，請從原始書籤開啟。';}const symbol=el('span','quick-symbol '+category.color);symbol.append(icon(category.icon));link.append(symbol,el('span','quick-label',entry.title||entry.domain));return link;}
 const quickDefinitions=[{match:e=>/^ChatGPT$/i.test(e.title),label:'ChatGPT',icon:'sparkles'}, {match:e=>/Google Gemini/i.test(e.title),label:'Gemini',icon:'sparkles'}, {match:e=>/員工入口網站/.test(e.title),label:'員工入口',icon:'briefcase'}, {match:e=>/^GitHub$/i.test(e.title),label:'GitHub',icon:'code'}, {match:e=>/Goodinfo!/i.test(e.title),label:'Goodinfo!',icon:'chart'}, {match:e=>/VoiceTube 看影片/i.test(e.title),label:'VoiceTube',icon:'languages'}];
 function renderQuickManager(){const list=$('quick-order-list');list.replaceChildren();const ordered=BookmarkQuick.orderedFavorites(entries,[...favorites],changes.quickOrder);for(const [index,entry]of ordered.entries()){const row=el('div','quick-order-row');row.append(el('span','',entry.title));for(const [direction,label,disabled]of [[-1,'上移',index===0],[1,'下移',index===ordered.length-1]]){const button=el('button','soft-button quick-order-mutation',label);button.type='button';button.disabled=disabled;button.setAttribute('aria-label',label+'：'+entry.title);button.addEventListener('click',()=>{changes=BookmarkQuick.moveQuick(entries,[...favorites],changes,entry.id,direction);queueFileSave();renderQuick();renderQuickManager();[...list.querySelectorAll('button')].find(node=>node.getAttribute('aria-label')===label+'：'+entry.title&&!node.disabled)?.focus();});row.append(button);}list.append(row);}}
 $('manage-quick-order').addEventListener('click',()=>{renderQuickManager();$('quick-order-dialog').showModal();});
 $('close-quick-order').addEventListener('click',()=>$('quick-order-dialog').close());
 function checkTargets(){return BookmarkCheck.selectCheckEntries(entries,$('url-check-scope').value,{filtered:currentResults,selected:[...selectedBookmarks],id:checkSingleId});}
 function openCheck(scope='all',id=null){if(!checkJob){checkSingleId=id;$('url-check-single').hidden=scope!=='single';$('url-check-scope').value=scope;}updateCheckControls();if(!$('info-dialog').open)$('info-dialog').showModal();}
 function recheckButton(entry){const button=el('button','soft-button recheck-button','重查');button.type='button';button.setAttribute('aria-label','重新檢查：'+entry.title);button.addEventListener('click',()=>openCheck('single',entry.id));return button;}
 function renderQuick(){const container=$('quick-links');container.replaceChildren();const pinned=BookmarkQuick.orderedFavorites(entries,[...favorites],changes.quickOrder);$('manage-quick-order').disabled=pinned.length<2||!fileReady||!!fileError;let quick;if(pinned.length){quick=pinned.slice(0,6).map(e=>({entry:e,label:e.title,icon:categoryMap.get(e.category).icon}));$('quick-title').replaceChildren(icon('star'),document.createTextNode('常用收藏'));}else{quick=quickDefinitions.map(q=>({...q,entry:entries.find(q.match)})).filter(q=>q.entry);$('quick-title').replaceChildren(icon('zap'),document.createTextNode('快速入口'));}for(const q of quick){const a=el('a','quick-link');a.dataset.purpose=getBookmarkPurpose(q.entry);attachLink(a,q.entry);const symbol=el('span','quick-symbol '+categoryMap.get(q.entry.category).color);symbol.append(icon(q.icon));a.append(symbol,el('span','quick-label',q.label));container.append(a);}}
 function reset(){Object.assign(state,{duplicatesOnly:false,purpose:'all',originalFolder:'all',category:'all',workSubcategory:'all',query:'',status:'all',favoriteOnly:false,limit:36});$('search').value='';$('status-filter').value='all';render();}
 document.addEventListener('bookmarks-imported',()=>{state.view='library';reset();});
 for(const input of document.querySelectorAll('[data-duplicate-filter]'))input.addEventListener('change',()=>{state.duplicatesOnly=input.checked;state.view=state.view==='home'?'library':state.view;state.limit=36;render();});
 // 統一依目前狀態更新導覽、計數與卡片；只繪製 limit 內的項目以控制 DOM 數量。
 // 重複網址按整份有效清單計算，選取項目則會移除不再符合目前篩選的 ID。
 function render(){
  duplicateUrlCounts=countDuplicateUrls(entries);for(const input of document.querySelectorAll('[data-duplicate-filter]'))input.checked=state.duplicatesOnly;
  const duplicateMatches=selectBookmarks(entries,{...state,duplicatesOnly:true,favorites:[...favorites]});const duplicateGroups=new Set(duplicateMatches.map(e=>e.url));for(const node of document.querySelectorAll('[data-duplicate-count]'))node.textContent=duplicateMatches.length+' 筆／'+duplicateGroups.size+' 組';
  $('bookmark-grid').dataset.presentation=simplePresentation()?'simple':'detailed';document.querySelector('.layout-switch').hidden=simplePresentation();$('bookmark-grid').dataset.layout=simplePresentation()?'grid':state.layout;for(const value of ['grid','list'])$('layout-'+value).setAttribute('aria-pressed',String(state.layout===value));
  renderCategoryNavigationOrder();
  renderWorkSubnavigation();
  const isHome=state.view==='home',isBrowse=state.view==='browse';$('library-results').hidden=isHome;$('page-footer').hidden=isHome;document.querySelector('.topbar').hidden=false;$('home-breadcrumb-trail').hidden=isBrowse;$('home-overview').hidden=isBrowse;$('file-storage-bar').hidden=false;$('home-controls').hidden=isBrowse;document.querySelector('.library').dataset.mode=state.view;
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
  const fragment=document.createDocumentFragment();for(const e of (isHome?[]:rows.slice(0,state.limit)))fragment.append(simplePresentation()?simpleLink(e):card(e));$('bookmark-grid').replaceChildren(fragment);updateSelectionUI();
  const filtered=!!(state.duplicatesOnly||state.workSubcategory!=='all'||state.purpose!=='all'||state.query||state.status!=='all'||state.originalFolder!=='all');$('active-filters').hidden=!filtered;
  $('active-description').textContent=[state.duplicatesOnly?'僅顯示重複網址（全書籤比對）':'',subname?'第二層：'+subname:'',state.purpose!=='all'?(state.purpose==='work'?'工作用途':'生活'):'',state.originalFolder!=='all'?'原始資料夾：'+(state.originalFolder==='__root__'?'未分類（原始根目錄）':state.originalFolder.replaceAll(' / ',' › ')):'',state.query?'搜尋「'+state.query+'」':'',state.status!=='all'?(STATUS[state.status]?.label||''):null].filter(Boolean).join(' · ');
  $('clear-search').hidden=!state.query;
  $('empty-state').hidden=rows.length!==0;
  $('empty-title').textContent=state.favoriteOnly&&state.purpose==='all'&&!state.query&&state.status==='all'&&state.originalFolder==='all'?'還沒有常用收藏':'沒有找到符合的書籤';
  $('empty-description').textContent=state.favoriteOnly&&state.purpose==='all'&&!state.query&&state.status==='all'&&state.originalFolder==='all'?'點書籤卡片上的 ☆，把最常去的網站收藏起來。':'試試其他關鍵字，或調整用途、資料夾與網址狀態篩選。';
  $('load-more-wrap').hidden=rows.length===0;
  $('shown-count').textContent='已顯示 '+Math.min(state.limit,rows.length)+' / '+rows.length+' 個書籤';
  $('load-more').hidden=state.limit>=rows.length;
  $('screen-reader-status').textContent=isHome?'書籤首頁；選擇左側分類或搜尋即可查看書籤。':title+'，找到 '+rows.length+' 個書籤';updateScrollTop();
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
 function showHome(event){event.preventDefault();state.simpleLinks=false;state.view='home';reset();$('advanced-filters').hidden=true;$('toggle-filters').setAttribute('aria-expanded','false');$('toggle-filters-label').textContent='更多篩選…';document.querySelector('.sidebar').classList.remove('mobile-open');$('mobile-toggle').setAttribute('aria-expanded','false');window.scrollTo({top:0,behavior:'smooth'});}
 $('home-link').addEventListener('click',showHome);$('home-breadcrumb').addEventListener('click',showHome);
 $('back-top').addEventListener('click',()=>window.scrollTo({top:0,behavior:'smooth'}));
 function updateScrollTop(){ $('scroll-top').hidden=state.view==='home'||state.category!=='all'||state.favoriteOnly||window.scrollY<=1; }
 window.addEventListener('scroll',updateScrollTop,{passive:true});
 $('scroll-top').addEventListener('click',()=>{window.scrollTo({top:0,behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth'});$('main').focus({preventScroll:true});});
 $('mobile-toggle').addEventListener('click',()=>{const expanded=document.querySelector('.sidebar').classList.toggle('mobile-open');$('mobile-toggle').setAttribute('aria-expanded',String(expanded));});
 document.addEventListener('keydown',e=>{const tag=e.target?.tagName;if(e.key==='/'&&!['INPUT','TEXTAREA','SELECT'].includes(tag)&&!e.target?.isContentEditable&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&!document.querySelector('dialog[open]')){e.preventDefault();if(state.view==='browse'){state.view='library';render();}$('search').focus();}if(e.key==='Escape'&&document.activeElement===$('search')){state.query='';$('search').value='';render();$('search').blur();}});
 function updateLibrarySummary(){
 const counts={};for(const e of entries)counts[e.status]=(counts[e.status]||0)+1;
 $('status-summary').replaceChildren();$('total-top').textContent=entries.length;$('undo-delete').hidden=changes.deletedIds.length===0;$('undo-delete-list').hidden=changes.deletedIds.length===0||state.view!=='browse';
 $('checked-date').textContent=Date.parse(checkedAt)<=0?'尚未完成網址檢查':'最後完整檢查：'+new Date(checkedAt).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',hour12:false})+'（台灣時間）';
 for(const [key,count] of Object.entries(counts)){const status=STATUS[key]||STATUS.unknown;const row=el('button');row.type='button';row.setAttribute('aria-label','篩選'+status.label+'，'+count+' 筆');row.append(el('span','connection '+status.tone,status.label),el('b','',count+' 筆'));row.addEventListener('click',()=>{$('info-dialog').close();applyStatus(key);$('library-title').focus({preventScroll:true});$('library-title').scrollIntoView({block:'start'});});$('status-summary').append(row);}
 }
 document.addEventListener('submit',event=>{if((!fileReady||fileError)&&event.target.matches('#edit-details-form,#batch-form,#add-form,#edit-category-form,#edit-status-form,#work-subcategory-form,.work-subcategory-row')){event.preventDefault();event.stopImmediatePropagation();toast(fileError||'請先連接 Google Drive。');}},true);
 function updateCheckControls(){
  const available=globalThis.BookmarksConfig?.urlCheckAvailable===true,remote=cloud?.state;
  const targets=checkTargets();$('url-check-targets').textContent='此範圍共 '+targets.length+' 筆書籤、'+new Set(targets.map(e=>e.url)).size+' 個不同網址';$('url-check-scope').disabled=!!checkJob;
  $('run-url-check').disabled=!!checkJob||!available||remote?.phase!=='ready'||!remote.online||cloud.hasUnsaved||!targets.length;
  $('run-url-check').textContent=checkJob?(checkJob.stage==='saving'?'正在同步…':'正在檢查…'):'執行檢查連線狀態';$('cancel-url-check').hidden=!checkJob||checkJob.stage==='saving';
  if(!available)$('url-check-message').textContent='此網站未設定連線檢查服務，請使用本機網站執行。';
  else if(!remote?.account)$('url-check-message').textContent='請先登入 Google Drive 並載入書籤。';
 }
 $('run-url-check').addEventListener('click',async()=>{
  const remote=cloud?.state;if(checkJob||remote?.phase!=='ready'||cloud.hasUnsaved||!remote.online||!entries.length)return;
  const targets=checkTargets();if(!targets.length)return;const full=$('url-check-scope').value==='all';
  const controller=new AbortController(),job={controller,account:remote.account.id,dataset:remote.datasetId};checkJob=job;updateCheckControls();
  $('url-check-progress').hidden=false;
  try{
   const results=await BookmarkCheck.runChecks(targets,{signal:controller.signal,onProgress:({checked,total})=>{$('url-check-progress').max=total||1;$('url-check-progress').value=checked;$('url-check-message').textContent='已檢查 '+checked+' / '+total+' 個不同網址';},request:async(url,signal)=>{
    const response=await fetch(BookmarksRuntime.url('api/url-check'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url}),signal:AbortSignal.any([signal,AbortSignal.timeout(20000)])});
    if(!response.ok)throw new Error(response.status===404?'連線檢查服務尚未就緒，請重新啟動本機網站。':'檢查服務暫時無法完成，請稍後重試。');return response.json();
   }});
   controller.signal.throwIfAborted();if(cloud.state.account?.id!==job.account||cloud.state.datasetId!==job.dataset||fileError)throw new Error('連線或資料已變更，未套用檢查結果。');
   job.stage='saving';updateCheckControls();changes=BookmarkCheck.mergeResults(entries,changes,results);if(full)checkedAt=new Date().toISOString();refreshLibrary();$('url-check-message').textContent='檢查完成，正在同步至 Google Drive…';
   await cloud.save(snapshot());
   $('url-check-message').textContent=cloud.state.phase==='ready'?'檢查完成，已同步至 Google Drive。':'檢查完成，但同步尚未完成，請到「雲端管理」處理或下載備份。';
  }catch(error){controller.abort();$('url-check-message').textContent=error.name==='AbortError'?'已取消檢查，未套用本次結果。':error.message;}
  finally{if(checkJob===job)checkJob=null;updateCheckControls();}
 });
 $('cancel-url-check').addEventListener('click',()=>checkJob?.controller.abort());
 $('info-dialog').addEventListener('close',()=>checkJob?.controller.abort());
 $('url-check-scope').addEventListener('change',updateCheckControls);
 $('check-info').addEventListener('click',()=>openCheck());
 for(const id of ['close-dialog','dialog-done'])$(id).addEventListener('click',()=>$('info-dialog').close());
 $('info-dialog').addEventListener('click',e=>{if(e.target===$('info-dialog')){const rect=e.target.getBoundingClientRect();if(e.clientX<rect.left||e.clientX>rect.right||e.clientY<rect.top||e.clientY>rect.bottom)e.target.close();}});
 $('total-top').textContent=entries.length;
 $('library-title').tabIndex=-1;
 render();cloud=BookmarkDriveUI.mount({onChange:cloudChanged,download:downloadData});
 try{await cloud.initialLoad;}finally{document.body.removeAttribute('data-bookmarks-loading');$('bookmark-startup').setAttribute('aria-hidden','true');$('bookmark-startup').inert=true;}
})();
