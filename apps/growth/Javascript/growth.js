(()=>{
// 成長相簿前端：私人資料與照片透過 Google Drive 保存。
'use strict';
let cloud=null,cloudReady=false;
const $=id=>document.getElementById(id);
// 集中管理畫面狀態：revision 是檔案版本；page／photo 是從 0 起算的索引；busy 防重複儲存，dirty 標記未存編輯。
// busy 防止重複送出，dirty 標記未儲存表單；draft 同時容納既有照片及尚未上傳的檔案。
// mode 包含手帳、維護、時間軸、立體電子書與 metrics（成長數字）。
const state={data:null,revision:null,childId:'',page:0,photo:null,bookPosition:'cover',mode:'album',busy:false,dirty:false,childEdit:null,recordEdit:null,draft:[],avatarDraft:null,bookCoverDraft:null,coverDraft:null};
// JSON 只保存服務產生的照片 ID；顯示時才組合本機網址，不把圖片內容塞入資料快照。
const photoUrl=id=>cloud?.photoUrl(id)||'';
// 電子書翻完才同步頁碼；切回手帳時，仍會停在同一段故事並顯示指定封面。
// 電子書的跨頁含書封、目錄及照片續頁，不能直接當作原故事索引。
const ebook=new GrowthFlipbook.Flipbook($('ebook-view'),{magazine:true,photoUrl,ageAt,metricsLabel:GrowthMetrics.label,onChange:(index,key)=>{if(index!==null)state.page=index;state.bookPosition=key;state.photo=null;}});
// 用本地年月日填入表單，避免 UTC 日期轉換讓台灣使用者的日期少一天。
const today=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');};
const dateLabel=value=>value.replace(/-/g,' / ');
const child=()=>state.data?.children.find(c=>c.id===state.childId);
// 先限定目前孩子，再依日期及識別碼穩定排序，避免混入其他孩子的紀錄。
const allRecords=()=>state.data?.records.filter(r=>r.childId===state.childId).sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id))||[];
// 套用年份與關鍵字篩選；相簿頁碼以篩選後的紀錄計算。
function records(){const query=$('search').value.trim().toLocaleLowerCase();return allRecords().filter(r=>($('year').value==='all'||r.date.startsWith($('year').value))&&(!query||[r.title,r.story,r.milestone,r.date].some(v=>v.toLocaleLowerCase().includes(query))));}
// 未填生日先顯示孕期文字；出生前以相距天數呈現，不推算孕週。出生後沿用完整月齡／年齡。
function ageAt(birthday,date){
 if(!birthday)return '還在肚子裡';
 if(date<birthday)return '出生前 '+Math.round((Date.parse(birthday)-Date.parse(date))/86400000)+' 天';
 // 與圖表共用日曆月算法，月底或閏日生日在較短月份取最後一天，避免同筆紀錄顯示不同年齡。
 const months=Math.floor(GrowthMetrics.ageMonths(birthday,date));
 if(months<1){const days=Math.round((Date.parse(date)-Date.parse(birthday))/86400000);return days===0?'出生的這一天':days+' 天大';}
 const years=Math.floor(months/12),rest=months%12;return (years?years+' 歲':'')+(rest?(years?' ':'')+rest+' 個月':'');
}
// 一般載入與儲存訊息不顯示；只有錯誤時才展開提示，讓使用者知道需要處理。
function status(message,error=false){$('status').textContent=message;$('status').classList.toggle('error',error);$('status').hidden=!error;}
// 載入成功後才開放操作；儲存期間鎖住欄位，避免送出中的內容又被修改。
function controls(){
 const ready=!!state.data&&!state.busy&&cloudReady,hasChild=!!child();
 $('add-child').disabled=!ready;$('edit-child').disabled=!ready||!hasChild;$('add-record').disabled=!ready||!hasChild;$('child-select').disabled=!ready||!state.data.children.length;
 $('empty-action').disabled=!ready;$('preview-child').disabled=!ready||!hasChild;$('timeline-tab').disabled=!ready||!hasChild;$('ebook-tab').disabled=!ready||!hasChild;
 $('metrics-tab').disabled=!ready||!hasChild;
 $('ebook-settings').disabled=!ready||!hasChild;
 document.querySelectorAll('.child-choice,.child-preview').forEach(button=>button.disabled=!ready);
 document.querySelectorAll('#child-dialog button,#child-dialog input,#child-dialog textarea,#child-dialog select,#record-dialog button,#record-dialog input,#record-dialog textarea,#record-dialog select').forEach(el=>el.disabled=state.busy||(!cloudReady&&!el.matches('[data-close],.close-button,[data-growth-manage]')));
 document.querySelectorAll('#child-dialog .upload-button,#record-dialog .upload-button').forEach(el=>{el.style.pointerEvents=state.busy||!cloudReady?'none':'';});
}
// 切換顯示模式只重繪畫面，不變更孩子選擇、篩選條件或磁碟資料。
function setMode(mode){state.mode=mode;render();}
// 統一更新孩子選單、年份、統計、空狀態與目前的相簿／清單畫面。
// 先確認目前孩子與篩選條件，再同步相簿、管理清單、空狀態及可操作按鈕。
function render(){
 if(!state.data)return;
 if(!child())state.childId=state.data.children[0]?.id||'';
 $('child-select').replaceChildren();
 if(!state.data.children.length)$('child-select').append(new Option('尚未新增孩子',''));
 state.data.children.forEach(c=>$('child-select').append(new Option(c.name,c.id)));$('child-select').value=state.childId;
 fillAvatar($('selected-child-avatar'),child());$('selected-child-avatar').hidden=!child();
 // 桌面側欄的孩子快捷按鈕與手機下拉選單共用同一份選擇狀態。
 // 重新建立每位孩子的大頭貼、選取按鈕與獨立預覽按鈕；預覽會直接選取該孩子並開啟時間軸。
 $('child-list').replaceChildren();
 state.data.children.forEach(c=>{const button=document.createElement('button');button.type='button';button.className='child-choice';button.setAttribute('aria-pressed',c.id===state.childId);button.disabled=state.busy;const avatar=document.createElement('span');avatar.className='child-avatar';fillAvatar(avatar,c);avatar.setAttribute('aria-hidden','true');const name=document.createElement('span');name.textContent=c.name;button.append(avatar,name);button.onclick=()=>selectChild(c.id);const preview=actionButton('預覽',()=>selectChild(c.id,'timeline'),'child-preview');preview.setAttribute('aria-label','預覽'+c.name+'的成長時間軸');preview.disabled=state.busy;const row=document.createElement('div');row.className='child-choice-row';row.append(button,preview);$('child-list').append(row);});
 // 年份取自目前孩子的全部紀錄；重繪後，原選項若仍存在就繼續保留。
 const years=[...new Set(allRecords().map(r=>r.date.slice(0,4)))].sort().reverse(),selectedYear=$('year').value;
 $('year').replaceChildren(new Option('所有年份','all'));years.forEach(y=>$('year').append(new Option(y+' 年',y)));$('year').value=years.includes(selectedYear)?selectedYear:'all';
 const currentChild=child(),list=records(),count=allRecords().length;
 $('record-count').textContent=count;
 $('child-summary').textContent=currentChild?currentChild.name+' · '+(currentChild.birthday?dateLabel(currentChild.birthday)+' 出生':'孕期收藏 · 生日待補')+' · '+count+' 段成長故事':'每個小小的日常，都值得被記得。';
 // 五種模式共用同一份篩選結果；沒有紀錄時統一顯示空狀態，避免露出上一位孩子的內容。
 const empty=!list.length;$('empty').hidden=!empty;$('album-view').hidden=empty||state.mode!=='album';$('manage-view').hidden=empty||state.mode!=='manage';$('timeline-view').hidden=empty||state.mode!=='timeline';
 $('ebook-view').hidden=empty||state.mode!=='ebook';$('ebook-tab').classList.toggle('active',state.mode==='ebook');$('ebook-tab').setAttribute('aria-pressed',state.mode==='ebook');
 $('metrics-view').hidden=empty||state.mode!=='metrics';$('metrics-tab').classList.toggle('active',state.mode==='metrics');$('metrics-tab').setAttribute('aria-pressed',state.mode==='metrics');
 $('album-tab').classList.toggle('active',state.mode==='album');$('manage-tab').classList.toggle('active',state.mode==='manage');$('album-tab').setAttribute('aria-pressed',state.mode==='album');$('manage-tab').setAttribute('aria-pressed',state.mode==='manage');$('timeline-tab').classList.toggle('active',state.mode==='timeline');$('timeline-tab').setAttribute('aria-pressed',state.mode==='timeline');
 if(empty){
  const filtered=currentChild&&count>0;
  $('empty-title').textContent=!currentChild?'第一頁，留給最珍貴的你。':filtered?'這裡還沒有符合的故事。':currentChild.name+'的故事，從這一頁開始。';
  $('empty-copy').textContent=!currentChild?'先新增孩子的名字，從孕期開始收藏成長故事。':filtered?'試試其他年份或關鍵字，找回想念的那一天。':'上傳一張照片，記下一件小事，把今天變成回憶。';
  $('empty-action').textContent=!currentChild?'＋ 新增第一位孩子':filtered?'清除篩選':'＋ 寫下第一段故事';
 }
 // 刪除或篩選可能讓紀錄變少，先限制頁碼範圍，避免存取不存在的故事。
 state.page=Math.max(0,Math.min(state.page,list.length-1));
 // 切換模式、孩子或篩選時，清除未完成的紙張動畫，避免舊動畫改動新畫面頁碼。
 ebook.setRecords(state.mode==='ebook'?list:[],state.page,currentChild,state.bookPosition);
 // 從手帳切回上次閱讀跨頁時，原故事可能不同；先同步，確保「返回手帳」不跳到別筆。
 if(state.mode==='ebook'&&ebook.list[ebook.model.index]?.recordIndex!=null){state.page=ebook.list[ebook.model.index].recordIndex;state.photo=null;}
 $('ebook-title').textContent=currentChild?currentChild.name+'的成長電子書':'成長電子書';
 // 身高與體重分開繪圖；年份和搜尋會同步套用，沒有量測的故事不會被當作零值。
 GrowthMetrics.render($('metrics-view'),{records:state.mode==='metrics'?list:[],child:state.mode==='metrics'?currentChild:null,onEdit:r=>openRecord(r),onEditChild:()=>openChild(true)});
 if(list.length){renderBook(list);if(state.mode==='manage')renderList(list);if(state.mode==='timeline')renderTimeline(list);}
 controls();
}
// 每頁對應一筆紀錄；左頁切換該筆照片，右頁顯示故事與當時年齡。
// 單筆故事可有多張照片；重繪前限制頁碼與照片索引，避免刪除或篩選後越界。
function renderBook(list=records()){
 const r=list[state.page];if(!r)return;
 // 初次進入故事使用指定封面的索引；舊資料未指定封面時回退到第 1 張，手動切換後保留使用者選擇。
 state.photo=state.photo===null?Math.max(0,r.photos.indexOf(r.coverPhoto)):Math.max(0,Math.min(state.photo,r.photos.length-1));
 $('photo-date').textContent=r.date.slice(0,4)+' · OUR LITTLE STORY';$('photo-number').textContent=r.photos.length?(state.photo+1)+' / '+r.photos.length+' 張照片':'文字紀錄';
 $('album-photo').hidden=!r.photos.length;$('photo-placeholder').hidden=!!r.photos.length;
 if(r.photos.length){$('album-photo').src=photoUrl(r.photos[state.photo]);$('album-photo').alt=r.title+'，第 '+(state.photo+1)+' 張照片';}else $('album-photo').removeAttribute('src');
 $('photo-thumbs').replaceChildren();
 r.photos.forEach((id,index)=>{const b=document.createElement('button');b.type='button';b.setAttribute('aria-label','查看第 '+(index+1)+' 張照片');b.setAttribute('aria-pressed',index===state.photo);const img=document.createElement('img');img.src=photoUrl(id);img.alt='';img.loading='lazy';b.append(img);b.onclick=()=>{state.photo=index;renderBook();};$('photo-thumbs').append(b);});
 $('photo-caption').textContent=child().name+'的第 '+(state.page+1)+' 段小時光';$('story-age').textContent=ageAt(child().birthday,r.date)+' 的你';
 // 使用 textContent 顯示使用者輸入，讓故事保持純文字，不被當作 HTML 執行。
 $('story-title').textContent=r.title;$('story-milestone').textContent=r.milestone;$('story-milestone').hidden=!r.milestone;
 $('story-content').textContent=r.story||'這一天，值得被記得。';$('story-date').textContent=dateLabel(r.date);
 $('story-measurements').textContent=GrowthMetrics.label(r);$('story-measurements').hidden=!$('story-measurements').textContent;
 $('page-count').textContent=String(state.page+1).padStart(2,'0')+' / '+String(list.length).padStart(2,'0');
 $('prev-page').disabled=state.page===0;$('next-page').disabled=state.page===list.length-1;
}
function actionButton(label,handler,className='text-button'){const b=document.createElement('button');b.type='button';b.className=className;b.textContent=label;b.onclick=handler;return b;}
// 時間軸沿用目前孩子及篩選後的日期順序，只呈現日期、標題與封面，不更動紀錄資料。
// 資料已由 records() 依孩子、年份及關鍵字篩選並排序；此函式只負責呈現，不再排序或寫檔。
function renderTimeline(list){
 $('timeline-title').textContent=child().name+'的成長時間軸';$('timeline-count').textContent=list.length+' 個值得珍藏的時刻';$('timeline-list').replaceChildren();
 list.forEach((r,index)=>{
  const item=document.createElement('li');item.className='timeline-item';
  const date=document.createElement('div');date.className='timeline-date';
  // time 的 dateTime 保留機器可讀日期，畫面文字則使用統一格式；年齡依這筆故事的日期計算。
  const time=document.createElement('time');time.dateTime=r.date;time.textContent=dateLabel(r.date);
  const age=document.createElement('span');age.className='timeline-age';age.textContent=ageAt(child().birthday,r.date);date.append(time,age);
  const card=document.createElement('button');card.type='button';card.className='timeline-card';card.setAttribute('aria-label','翻閱'+r.title+'，'+dateLabel(r.date));
  // 優先使用指定封面，再回退到第一張照片；沒有任何照片的文字紀錄仍保留在時間軸上。
  let cover;const photo=r.coverPhoto||r.photos[0];
  if(photo){cover=document.createElement('img');cover.src=photoUrl(photo);cover.alt=r.title+'的封面照片';cover.loading='lazy';}else{cover=document.createElement('span');cover.textContent='尚未加入照片';}cover.className='timeline-cover';
  // 標題以 textContent 插入，確保輸入內容只作文字顯示；封面以 lazy loading 降低長時間軸的初始負擔。
  const body=document.createElement('span');body.className='timeline-card-body';const title=document.createElement('span');title.className='timeline-card-title';title.textContent=r.title;const more=document.createElement('span');more.className='timeline-more';more.textContent='翻閱故事 →';body.append(title,more);card.append(cover,body);
  // 頁碼對應同一份篩選結果，切回相簿後由封面照片開始顯示。
  card.onclick=()=>{if(state.busy)return;state.page=index;state.photo=null;setMode('album');};item.append(date,card);$('timeline-list').append(item);
 });
}
// 維護清單與時間軸採相同封面規則；點「翻到這一頁」以目前篩選清單的索引定位故事。
function renderList(list){
 $('record-list').replaceChildren();
 list.forEach((r,index)=>{
  const card=document.createElement('article');card.className='record-card';
  let cover;if(r.photos.length){cover=document.createElement('img');cover.src=photoUrl(r.coverPhoto||r.photos[0]);cover.alt=r.title;cover.loading='lazy';}else{cover=document.createElement('div');cover.textContent='♡';cover.setAttribute('aria-hidden','true');}cover.className='record-cover';
  const info=document.createElement('div');info.className='record-info';const date=document.createElement('small');date.textContent=dateLabel(r.date)+' · '+ageAt(child().birthday,r.date);const title=document.createElement('h3');title.textContent=r.title;const story=document.createElement('p');story.textContent=r.story||'文字紀錄';const meta=document.createElement('small');meta.textContent=[r.milestone,GrowthMetrics.label(r),r.photos.length+' 張照片'].filter(Boolean).join(' · ');info.append(date,title,story,meta);
  const actions=document.createElement('div');actions.className='record-actions';actions.append(actionButton('翻到這一頁',()=>{state.page=index;state.photo=null;setMode('album');}),actionButton('編輯',()=>openRecord(r),'outline-button'));
  card.append(cover,info,actions);$('record-list').append(card);
 });
}
// 翻頁後重設照片索引；讀取 offsetWidth 讓移除再加上的 CSS 動畫能重新播放。
function flip(delta){const next=state.page+delta;if(next<0||next>=records().length)return;state.page=next;state.photo=null;renderBook();$('book').classList.remove('turning');void $('book').offsetWidth;$('book').classList.add('turning');}
// Drive 確認存檔成功後才清除表單 dirty；失敗時保留表單和照片草稿。
async function commit(next){
 state.data=await cloud.save(next);state.dirty=false;
 status('已同步至私人 Google Drive');
}
// 集中管理非同步儲存：防止重複操作，失敗保留表單，最後一律解除鎖定。
// 集中管理儲存期間的按鈕鎖定與錯誤提示，結束後無論成功失敗都恢復操作。
async function busy(errorId,work){
 if(state.busy)return;if(!cloudReady){$(errorId).textContent='請先連接 Google Drive 並完成同步，再儲存相簿。';return;}state.busy=true;controls();$(errorId).textContent='';status('正在同步至 Google Drive，請稍候…');
 try{await work();}catch(error){$(errorId).textContent=error.message;status(error.message,true);}finally{state.busy=false;controls();}
}
// 關閉表單前確認是否放棄未儲存內容；照片表單關閉時也釋放暫時預覽資源。
function closeDialog(dialog,force=false){if(state.busy)return;if(!force&&state.dirty&&!confirm('這次編輯尚未儲存，確定要放棄嗎？'))return;state.dirty=false;dialog.close();if(dialog.id==='record-dialog')clearDraft();}
// 大頭貼顯示共用函式：未設定或載入失敗時退回孩子名字的第一個字。
function fillAvatar(container,c){
 container.replaceChildren();if(!c)return;
 const initial=()=>{container.textContent=Array.from(c.name)[0]||'♡';};
 if(!c.avatar){initial();return;}
 const img=document.createElement('img');img.src=photoUrl(c.avatar);img.alt='';img.onerror=initial;container.append(img);
}
// 更換或關閉草稿時釋放暫存網址，不刪除本機已保存的大頭貼照片。
function setChildAvatar(draft){
 if((state.avatarDraft?.localPreview||!state.avatarDraft?.id)&&state.avatarDraft?.preview?.startsWith('blob:'))URL.revokeObjectURL(state.avatarDraft.preview);
 state.avatarDraft=draft;$('child-avatar-file').value='';renderChildAvatar();
}
// 同步表單的大頭貼預覽、名字替代圖示與移除按鈕；此時仍是草稿，不會變更孩子的已保存資料。
function renderChildAvatar(){
 const draft=state.avatarDraft;$('child-avatar-preview').hidden=!draft;$('child-avatar-placeholder').hidden=!!draft;
 if(draft)$('child-avatar-preview').src=draft.preview;else $('child-avatar-preview').removeAttribute('src');
 $('child-avatar-placeholder').textContent=Array.from($('child-name').value.trim())[0]||'♡';$('remove-child-avatar').hidden=!draft;
}
// 新增與編輯共用表單；既有大頭貼只帶入照片 ID，只有另選照片時才需要重新上傳。
function openChild(edit=false){
 if(!cloudReady||state.busy)return;
 if(!state.data||state.busy)return;state.childEdit=edit?child().id:null;const c=edit?child():null;
 $('child-dialog-title').textContent=edit?'編輯孩子':'新增孩子';$('child-name').value=c?.name||'';$('child-birthday').value=c?.birthday||'';$('child-error').textContent='';$('delete-child').hidden=!edit;setChildAvatar(c?.avatar?{id:c.avatar,preview:photoUrl(c.avatar)}:null);state.dirty=false;$('child-dialog').showModal();
 $('child-book-title').value=c?.bookTitle||'';$('child-book-dedication').value=c?.bookDedication||'';setBookCover(c?.bookCover?{id:c.bookCover,preview:photoUrl(c.bookCover)}:null);
 $('child-growth-sex').value=c?.growthSex||'';
}
// 書封與大頭貼分開管理草稿；更換、關閉或放棄編輯時釋放暫存網址，不刪除保存照片。
function setBookCover(draft){
 if((state.bookCoverDraft?.localPreview||!state.bookCoverDraft?.id)&&state.bookCoverDraft?.preview?.startsWith('blob:'))URL.revokeObjectURL(state.bookCoverDraft.preview);
 state.bookCoverDraft=draft;$('child-book-cover-file').value='';$('child-book-cover-preview').hidden=!draft;
 if(draft)$('child-book-cover-preview').src=draft.preview;else $('child-book-cover-preview').removeAttribute('src');
 $('remove-book-cover').hidden=!draft;
}
// 釋放 blob 預覽網址及草稿，不刪除磁碟照片，避免影響已保存資料或備份。
// 草稿預覽的 Blob 網址需要手動釋放；既有照片的伺服器網址不做 revoke。
function clearDraft(){state.draft.forEach(p=>{if((p.localPreview||!p.id)&&p.preview?.startsWith('blob:'))URL.revokeObjectURL(p.preview);});state.draft=[];state.coverDraft=null;$('draft-photos').replaceChildren();$('record-photos').value='';}
// 建立編輯草稿；既有照片保留識別碼與網址，送出時不必重新上傳。
function openRecord(r=null){
 if(!cloudReady||state.busy)return;
 if(!child()||state.busy)return;clearDraft();state.recordEdit=r?.id||null;
 $('record-dialog-title').textContent=r?'編輯成長紀錄':'新增成長紀錄';$('record-child').textContent='更改所屬孩子後，照片、故事與成長數字會一起移動。';
 $('record-child-select').replaceChildren(...state.data.children.map(c=>new Option(c.name,c.id)));$('record-child-select').value=r?.childId||state.childId;
 // 孕期也能新增，日期不再以生日為下限；新故事預設今天，既有故事保留原日期。
 $('record-date').min='';$('record-date').value=r?.date||today();$('record-title').value=r?.title||'';$('record-story').value=r?.story||'';$('record-milestone').value=r?.milestone||'';$('record-error').textContent='';$('delete-record').hidden=!r;
 $('record-height').value=r?.heightCm??'';$('record-weight').value=r?.weightKg??'';
 $('record-photo-layout').value=r?.photoLayout||'editorial';
 // 封面草稿指向同一個照片物件；即使這張照片尚未上傳、還沒有 ID，也能先選為封面。
 state.draft=(r?.photos||[]).map(id=>({id,preview:photoUrl(id)}));state.coverDraft=state.draft.find(p=>p.id===r?.coverPhoto)||state.draft[0]||null;renderDraft();state.dirty=false;$('record-dialog').showModal();
}
// 顯示照片草稿、移除操作與指定封面；選擇封面不改變照片原有順序。
function renderDraft(){
 // 封面以照片物件追蹤，因此尚未上傳的檔案也能選；刪除封面時自動改用剩餘第一張。
 if(!state.draft.includes(state.coverDraft))state.coverDraft=state.draft[0]||null;
 $('draft-photos').replaceChildren();
 state.draft.forEach((p,index)=>{
  const wrap=document.createElement('div');wrap.className='draft-photo';
  const img=document.createElement('img');img.src=p.preview;img.alt='待儲存照片 '+(index+1);
  const remove=actionButton('×',()=>{if(state.busy)return;const [removed]=state.draft.splice(index,1);if((removed.localPreview||!removed.id)&&removed.preview.startsWith('blob:'))URL.revokeObjectURL(removed.preview);state.dirty=true;renderDraft();},'remove-photo');remove.setAttribute('aria-label','移除第 '+(index+1)+' 張照片');
  const selected=state.coverDraft===p;
  const cover=actionButton(selected?'✓ 封面照片':'設為封面',()=>{if(state.busy)return;state.coverDraft=p;state.dirty=true;renderDraft();},'set-cover');cover.setAttribute('aria-pressed',selected);cover.setAttribute('aria-label',(selected?'目前封面：':'設為封面：')+'第 '+(index+1)+' 張照片');
  const num=document.createElement('small');num.textContent=index+1;wrap.append(img,remove,num,cover);$('draft-photos').append(wrap);
 });
}
// 等比例縮圖：故事預設最長邊 1800 像素，大頭貼傳入 512；白底 JPEG 不修改原檔。
// 上傳前限制像素並將長邊縮至最多 1800，轉為 JPEG 以降低本機照片儲存量。
async function compressPhoto(file,maxEdge=1800){
 const bitmap=await createImageBitmap(file).catch(()=>{throw new Error('無法開啟照片「'+file.name+'」，請改用 JPG、PNG 或 WebP。');});
 try{
  // 限制解碼後的像素總數，避免過度佔用記憶體；無論成功或失敗都在 finally 釋放點陣圖。
  if(bitmap.width*bitmap.height>60000000)throw new Error('照片像素過大，請先縮小「'+file.name+'」。');
  const scale=Math.min(1,maxEdge/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
  return await new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('照片處理失敗，請換張照片再試。')),'image/jpeg',.88));
 }finally{bitmap.close();}
}
// 使用資料複本新增或修改孩子，儲存成功後才切換畫面；孕期紀錄不受生日下限限制。
// 選擇大頭貼只建立本機預覽，按下儲存孩子後才上傳。
$('child-avatar-file').addEventListener('change',event=>{
 const file=event.target.files[0];if(!file)return;
 if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size===0||file.size>12*1024*1024){$('child-error').textContent='請選擇 12 MB 以內的 JPG、PNG 或 WebP 大頭貼。';event.target.value='';return;}
 $('child-error').textContent='';setChildAvatar({file,localPreview:true,preview:URL.createObjectURL(file)});state.dirty=true;
});
$('remove-child-avatar').onclick=()=>{if(state.busy)return;setChildAvatar(null);state.dirty=true;};
$('child-name').addEventListener('input',renderChildAvatar);
// 關閉表單即釋放大頭貼草稿的預覽網址；磁碟上已上傳的檔案保留給重試或備份使用。
$('child-dialog').addEventListener('close',()=>setChildAvatar(null));
$('child-dialog').addEventListener('close',()=>setBookCover(null));
$('child-book-cover-file').addEventListener('change',event=>{
 const file=event.target.files[0];if(!file)return;
 if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size===0||file.size>12*1024*1024){$('child-error').textContent='請選擇 12 MB 以內的 JPG、PNG 或 WebP 書封照片。';event.target.value='';return;}
 $('child-error').textContent='';setBookCover({file,localPreview:true,preview:URL.createObjectURL(file)});state.dirty=true;
});
$('remove-book-cover').onclick=()=>{if(state.busy)return;setBookCover(null);state.dirty=true;};
$('child-form').addEventListener('submit',event=>{
 event.preventDefault();if(!$('child-name').value.trim()){$('child-error').textContent='請輸入孩子的名字。';return;}
 busy('child-error',async()=>{
  const c={id:state.childEdit||crypto.randomUUID(),name:$('child-name').value.trim(),birthday:$('child-birthday').value};
  c.growthSex=$('child-growth-sex').value;
  // 補上實際生日時，既有孕期故事保留原日期，由 ageAt() 自動更新顯示。
  // 已上傳的識別碼保留到儲存成功或放棄，JSON 寫入失敗時可直接重試。
  if(state.avatarDraft?.file){const blob=state.avatarDraft.uploadBlob||=await compressPhoto(state.avatarDraft.file,512);const body=await cloud.uploadPhoto(blob,undefined,c);state.avatarDraft.id=body.id;state.avatarDraft.file=null;}
  c.avatar=state.avatarDraft?.id||null;
  c.bookTitle=$('child-book-title').value.trim();c.bookDedication=$('child-book-dedication').value;
  if(state.bookCoverDraft?.file){const blob=state.bookCoverDraft.uploadBlob||=await compressPhoto(state.bookCoverDraft.file);const body=await cloud.uploadPhoto(blob,undefined,c);state.bookCoverDraft.id=body.id;state.bookCoverDraft.file=null;}
  c.bookCover=state.bookCoverDraft?.id||null;
  const next=structuredClone(state.data),index=next.children.findIndex(v=>v.id===c.id);if(index<0)next.children.push(c);else next.children[index]=c;
  await commit(next);state.childId=c.id;state.page=0;state.photo=null;state.bookPosition='cover';$('year').value='all';$('search').value='';$('child-dialog').close();render();
 });
});
// 儲存分兩階段：先上傳新照片，再將照片識別碼連同故事寫入 JSON。
// 先上傳尚無 ID 的照片，再提交故事與照片 ID；重試時沿用已上傳的 ID。
$('record-form').addEventListener('submit',event=>{
 event.preventDefault();if(!$('record-title').value.trim()){$('record-error').textContent='請為這段回憶填上標題。';return;}
 busy('record-error',async()=>{
  const photoChild=state.data.children.find(c=>c.id===$('record-child-select').value);if(!photoChild)throw new Error('請選擇這筆紀錄所屬的孩子。');
  // 在上傳照片前先檢查量測；留白可清除原數字，避免為無效表單產生照片檔案。
  const heightCm=GrowthMetrics.parseInput($('record-height').value,'heightCm'),weightKg=GrowthMetrics.parseInput($('record-weight').value,'weightKg');
  for(let i=0;i<state.draft.length;i++){
   // 已上傳的識別碼保留在草稿，JSON 儲存失敗重試時可略過該照片，避免重複上傳。
   const p=state.draft[i];if(p.id)continue;status('正在處理照片 '+(i+1)+' / '+state.draft.length+'…');const blob=p.uploadBlob||=await compressPhoto(p.file);
   const body=await cloud.uploadPhoto(blob,undefined,photoChild);p.id=body.id;p.file=null;
  }
  const r={id:state.recordEdit||crypto.randomUUID(),childId:$('record-child-select').value,date:$('record-date').value,title:$('record-title').value.trim(),story:$('record-story').value,milestone:$('record-milestone').value.trim(),photos:state.draft.map(p=>p.id),coverPhoto:state.coverDraft?.id||null};
  if(heightCm!==null)r.heightCm=heightCm;if(weightKg!==null)r.weightKg=weightKg;
  r.photoLayout=$('record-photo-layout').value;
  const next=structuredClone(state.data),index=next.records.findIndex(v=>v.id===r.id);if(index<0)next.records.push(r);else next.records[index]=r;
  await commit(next);state.childId=r.childId;state.bookPosition='cover';$('record-dialog').close();clearDraft();$('year').value='all';$('search').value='';state.page=allRecords().findIndex(v=>v.id===r.id);state.photo=null;render();
 });
});
// 選照片時先驗證張數、型別與大小；先產生本機預覽，縮圖和上傳留到儲存時執行。
$('record-photos').addEventListener('change',event=>{
 const files=[...event.target.files];$('record-error').textContent='';
 if(state.draft.length+files.length>20){$('record-error').textContent='每筆紀錄最多可放 20 張照片。';event.target.value='';return;}
 const bad=files.find(f=>!['image/jpeg','image/png','image/webp'].includes(f.type)||f.size>12*1024*1024||f.size===0);
 if(bad){$('record-error').textContent='「'+bad.name+'」無法使用。請選擇 12 MB 以內的 JPG、PNG 或 WebP 照片。';event.target.value='';return;}
 files.forEach(file=>state.draft.push({file,localPreview:true,preview:URL.createObjectURL(file)}));if(files.length)state.dirty=true;event.target.value='';renderDraft();
});
// 刪除前再次確認；移除該孩子及其故事，保留其他孩子資料，磁碟照片仍留供備份還原。
$('delete-child').onclick=()=>{
 const c=child(),count=allRecords().length;if(!confirm('確定刪除「'+c.name+'」及所屬的 '+count+' 筆成長紀錄嗎？這會從相簿移除全部故事。'))return;
 busy('child-error',async()=>{const next=structuredClone(state.data);next.children=next.children.filter(v=>v.id!==c.id);next.records=next.records.filter(r=>r.childId!==c.id);await commit(next);state.childId='';state.page=0;state.photo=null;$('child-dialog').close();render();});
};
// 只刪除故事的 JSON 關聯，不刪照片實體，以免上一版備份失去圖片。
$('delete-record').onclick=()=>{
 const r=state.data.records.find(v=>v.id===state.recordEdit);if(!r||!confirm('確定刪除「'+r.title+'」這筆成長紀錄嗎？'))return;
 busy('record-error',async()=>{const next=structuredClone(state.data);next.records=next.records.filter(v=>v.id!==r.id);await commit(next);$('record-dialog').close();clearDraft();state.photo=null;render();});
};
$('add-child').onclick=()=>openChild();$('edit-child').onclick=()=>openChild(true);$('add-record').onclick=()=>openRecord();$('edit-current').onclick=()=>openRecord(records()[state.page]);
// 切換孩子時清除年份與搜尋條件，並從該孩子的第一筆紀錄及第一張照片開始。
// 兩種孩子選擇方式共用重設流程，切換後清除上一位孩子的篩選與頁碼。
// 一般切換沿用目前模式；傳入 timeline 則直接預覽。清除上一位孩子的搜尋、年份及照片索引，避免條件互相干擾。
function selectChild(id,mode=state.mode){if(state.busy)return;state.childId=id;state.mode=mode;state.page=0;state.photo=null;state.bookPosition='cover';$('year').value='all';$('search').value='';render();}
$('child-select').onchange=event=>selectChild(event.target.value);
$('empty-action').onclick=()=>{if(!child())openChild();else if(allRecords().length){$('year').value='all';$('search').value='';render();}else openRecord();};
// 手機與側欄的預覽入口共用孩子切換流程；時間軸頁籤只切換目前孩子的顯示模式。
$('preview-child').onclick=()=>selectChild(state.childId,'timeline');
$('timeline-tab').onclick=()=>setMode('timeline');$('timeline-back').onclick=()=>setMode('album');
$('ebook-tab').onclick=()=>setMode('ebook');$('ebook-open-story').onclick=()=>{state.photo=null;setMode('album');};
$('ebook-settings').onclick=()=>openChild(true);
$('metrics-tab').onclick=()=>setMode('metrics');
$('album-tab').onclick=()=>setMode('album');$('manage-tab').onclick=()=>setMode('manage');
$('year').onchange=$('search').oninput=()=>{state.page=0;state.photo=null;state.bookPosition='cover';render();};
$('prev-page').onclick=()=>flip(-1);$('next-page').onclick=()=>flip(1);
// 相簿取得焦點時可用左右鍵翻頁；按鈕保留本身的鍵盤操作。
$('book').addEventListener('keydown',event=>{if(event.target.closest('button'))return;if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();flip(event.key==='ArrowLeft'?-1:1);}});
// 記錄單指滑動起點；只接受超過 65 像素且明顯水平的滑動，避免垂直捲動誤觸翻頁。
let touch=null;
// 滑動翻頁只處理明顯的水平手勢，略過按鈕與故事文字，降低與捲動操作的衝突。
$('book').addEventListener('touchstart',event=>{if(event.touches.length!==1||event.target.closest('button,.story-content')){touch=null;return;}touch={x:event.touches[0].clientX,y:event.touches[0].clientY};},{passive:true});
$('book').addEventListener('touchend',event=>{if(!touch)return;const end=event.changedTouches[0],dx=end.clientX-touch.x,dy=end.clientY-touch.y;touch=null;if(Math.abs(dx)>65&&Math.abs(dx)>Math.abs(dy)*1.5)flip(dx<0?1:-1);},{passive:true});
// 關閉按鈕與 Esc 共用未儲存確認；欄位變動時標記 dirty。
document.querySelectorAll('[data-close]').forEach(button=>button.onclick=()=>closeDialog(button.closest('dialog')));
document.querySelectorAll('#child-dialog,#record-dialog').forEach(dialog=>{dialog.addEventListener('cancel',event=>{event.preventDefault();closeDialog(dialog);});dialog.addEventListener('input',()=>state.dirty=true);});
// 離開或重新整理時，若仍有未儲存編輯或正在存檔，請瀏覽器顯示內建提醒。
// 儲存中或表單尚未儲存時提示離開；這是防誤關閉提醒，並非自動保存草稿。
window.addEventListener('beforeunload',event=>{if(state.busy||state.dirty||cloud?.hasUnsaved){event.preventDefault();event.returnValue='';}});
function clearPrivateView(){
 clearDraft();setChildAvatar(null);setBookCover(null);state.dirty=false;state.childId='';state.page=0;state.photo=null;state.bookPosition='cover';
 for(const id of ['child-dialog','record-dialog']){$(id).close();$(id).querySelector('form').reset();}
 for(const id of ['record-list','timeline-list','story-content','story-title','photo-thumbs','story-age','story-date','story-milestone','story-measurements','photo-date','photo-caption','photo-number','timeline-title','timeline-count','record-child','record-child-select'])$(id).replaceChildren();
 document.querySelectorAll('img').forEach(img=>{if(img.getAttribute('src')?.startsWith('blob:'))img.removeAttribute('src');});
 state.data=GrowthData.empty();render();
}
// Include current valid form fields and unuploaded photos in a portable backup.
async function backupDraft(){
 if(!state.dirty)return null;const next=structuredClone(state.data),photos=new Map();
 const photo=draft=>{if(!draft)return null;if(draft.id)return draft.id;const ext=draft.file.type==='image/png'?'png':draft.file.type==='image/webp'?'webp':'jpg';draft.backupId||=crypto.randomUUID()+'.'+ext;photos.set(draft.backupId,draft.file);return draft.backupId;};
 if($('child-dialog').open){
  const c={id:state.childEdit||crypto.randomUUID(),name:$('child-name').value.trim(),birthday:$('child-birthday').value,growthSex:$('child-growth-sex').value,avatar:photo(state.avatarDraft),bookCover:photo(state.bookCoverDraft),bookTitle:$('child-book-title').value.trim(),bookDedication:$('child-book-dedication').value};
  const index=next.children.findIndex(item=>item.id===c.id);if(index<0)next.children.push(c);else next.children[index]=c;
 }
 if($('record-dialog').open){
  const r={id:state.recordEdit||crypto.randomUUID(),childId:$('record-child-select').value,date:$('record-date').value,title:$('record-title').value.trim(),story:$('record-story').value,milestone:$('record-milestone').value.trim(),photos:state.draft.map(photo),coverPhoto:photo(state.coverDraft),photoLayout:$('record-photo-layout').value};
  const height=GrowthMetrics.parseInput($('record-height').value,'heightCm'),weight=GrowthMetrics.parseInput($('record-weight').value,'weightKg');if(height!==null)r.heightCm=height;if(weight!==null)r.weightKg=weight;
  const index=next.records.findIndex(item=>item.id===r.id);if(index<0)next.records.push(r);else next.records[index]=r;
 }
 try{return {document:GrowthData.validate(next),photos};}catch{throw new Error('表單尚未完整，請先填寫名字／故事標題與日期，再下載含草稿的完整備份。');}
}
state.data=GrowthData.empty();render();
function refreshPhotoPreviews(){
 if(state.avatarDraft?.id&&!state.avatarDraft.localPreview){state.avatarDraft.preview=photoUrl(state.avatarDraft.id);renderChildAvatar();}
 if(state.bookCoverDraft?.id&&!state.bookCoverDraft.localPreview){state.bookCoverDraft.preview=photoUrl(state.bookCoverDraft.id);setBookCover(state.bookCoverDraft);}
 for(const draft of state.draft)if(draft.id&&!draft.localPreview)draft.preview=photoUrl(draft.id);
 if($('record-dialog').open)renderDraft();render();
}
cloud=GrowthCloudUI.mount({onDocument:document=>{state.data=document;render();},onState:current=>{cloudReady=current.editable;controls();if(current.error)status(current.error.message,true);else status('');},onClear:clearPrivateView,onPhotos:refreshPhotoPreviews,hasEdits:()=>state.dirty||state.busy||$('child-dialog').open||$('record-dialog').open,getDraft:backupDraft});
})();
