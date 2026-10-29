// 共用書籤核心：同一份規則同時供瀏覽器畫面與 Node.js 服務使用。
// 此模組以純資料運算為主；讀寫檔案與 DOM 操作由外層負責。
(function(root, factory) {
 const api=factory(); if(typeof module==='object'&&module.exports) module.exports=api; else root.BookmarkCore=api;
})(typeof globalThis!=='undefined'?globalThis:this, function() {
 const CATEGORIES=[
  {id:'ai',name:'AI 工具',icon:'sparkles',color:'mint',description:'讓靈感與效率，一起前進。'},
  {id:'work',name:'工作系統',icon:'briefcase',color:'blue',description:'工作入口、院內系統與協作空間。'},
  {id:'dev',name:'程式開發',icon:'code',color:'lavender',description:'開發工具、技術文件與解題筆記。'},
  {id:'language',name:'語言學習',icon:'languages',color:'peach',description:'每天一點點，走向更大的世界。'},
  {id:'travel',name:'旅遊探索',icon:'compass',color:'blue',description:'把想去的地方，慢慢走成回憶。'},
  {id:'food',name:'美食口袋',icon:'coffee',color:'peach',description:'值得收藏的美味與小店。'},
  {id:'finance',name:'投資理財',icon:'chart',color:'mint',description:'市場資訊、投資研究與理財工具。'},
  {id:'reading',name:'新聞閱讀',icon:'book',color:'blue',description:'新聞、知識與值得細讀的故事。'},
  {id:'media',name:'影音娛樂',icon:'play',color:'lavender',description:'讓生活有音樂、有故事，也有休息。'},
  {id:'design',name:'攝影設計',icon:'camera',color:'peach',description:'發現光影，收藏美好的視角。'},
  {id:'life',name:'購物生活',icon:'sun',color:'mint',description:'購物、公共服務與生活大小事。'},
  {id:'other',name:'待整理',icon:'folder',color:'neutral',description:'用途還不明確的連結，先好好收著。'}
 ];
 const STATUS={reachable:{label:'可連線',short:'可連線',tone:'green'},restricted:{label:'登入／存取限制',short:'存取限制',tone:'blue'},uncertain:{label:'待人工確認',short:'待確認',tone:'amber'},missing:{label:'可能失效（404／410）',short:'可能失效',tone:'rose'},skipped:{label:'內部／特殊網址',short:'內部／特殊',tone:'gray'},unknown:{label:'尚未檢查',short:'未檢查',tone:'gray'}};
 function decode(s) {return s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi,(m,v)=>{if(v[0]==='#'){const cp=v[1].toLowerCase()==='x'?parseInt(v.slice(2),16):Number(v.slice(1));return cp>=0&&cp<=0x10ffff?String.fromCodePoint(cp):m;}return ({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"})[v.toLowerCase()]||m;});}
 // 解析 Chrome 的 Netscape 書籤格式，以資料夾堆疊保留完整路徑。
 // 識別碼納入重複序號，因此同網址的不同書籤仍能各自編輯與刪除。
 function parseBookmarks(html) {
  const {createHash}=require('node:crypto');const entries=[],folders=[],occurrences=new Map();let pending=null;
  for(const m of html.matchAll(/<H3\b[^>]*>([\s\S]*?)<\/H3>|<DL\b[^>]*>|<\/DL>|<A\b([^>]*)>([\s\S]*?)<\/A>/gi)) {
   if(m[1]!==undefined) pending=decode(m[1]);
   else if(/^<DL/i.test(m[0])) {folders.push(pending);pending=null;}
   else if(/^<\/DL/i.test(m[0])) folders.pop();
   else {const h=m[2].match(/\bHREF\s*=\s*(?:"([^"]*)"|'([^']*)')/i);if(!h)continue;const title=decode(m[3]),url=decode(h[1]??h[2]),folder=folders.filter(Boolean).join(' / ');const key=JSON.stringify([url,title,folder]);const n=occurrences.get(key)||0;occurrences.set(key,n+1);const id=createHash('sha256').update(key+'#'+n).digest('hex').slice(0,20);entries.push({id,sourceId:entries.length+1,title,url,folder});}
  }return entries;
 }
 // 分類有先後優先順序；「中榮」原始資料夾先判為工作，後續再比對主題與網域。
 function classify(e) {
  const t=e.title||'',f=e.folder||'',u=e.url||'';const text=t+' '+u;
  // The user explicitly marks this original folder and all descendants as work.
  if(f.split(' / ').includes('中榮'))return 'work';
  // Topic evidence takes precedence over the folder the link happened to be saved in.
  if(/chatgpt|chat\s*gpt|gemini|felo\.ai|felo -|claude\.ai|copilot|openai/i.test(text))return 'ai';
  if(/三分鐘學泰文|學泰語|學泰文|初學泰語|学泰语|語言學習|英語學習|學英語|學英文|日語自學|日語能力|韓語學校|korean school|study korean|italki|voicetube|engoo|空中英語|雙語資源|Hi家教|英文名句|learning english/i.test(text)||/\/\s*(?:日文|英文|多益|韓文|泰文)(?:\s*\/|$)/.test(f))return 'language';
  if(/STOCK/i.test(f)||/股票|股市|股東|投資|財經|理財|銀行|黃金價格|卡優新聞|usdindex|goodinfo|finlab|stockfeel|histock|鉅亨|證券|工商時報|商業周刊|經濟日報/i.test(text))return 'finance';
  let host='';try{host=new URL(u).hostname;}catch{}
  if(/(?:^|\.)vghtc\.gov\.tw$/.test(host)||/^(?:10\.|172\.(?:1[6-9]|2\d|3[01])\.|192\.168\.|127\.)/.test(host)||host==='localhost'||/Team Foundation Server|SSO Portal|Portal Login|myQNAPcloud|門診系統|台中榮民總醫院網基|健保資訊網|員工入口|差勤系統/i.test(text))return 'work';
  if(/Lightroom|Flickr|攝影|摄影|單眼|相簿|National Gallery|IconKitchen|Framer|色碼|空拍|名片設計|名片印刷/i.test(text)||/\s\/\s單眼(?:\s\/|$)/.test(f))return 'design';
  if(/bootstrap|kendo|jquery|javascript|typescript|angular|(?:asp|ado|vb)\.net|asp\b|ado\.net|sql|oracle|sqlhelper|html5?|css|npoi|gridview|webapi|swagger|程式|編程|开发|開發|技術|code converter|code school|codepen|codesandbox|github|stackoverflow|stack overflow|stackblitz|jsfiddle|devtools|dev tools|cordova|android|andriod|docker|sublime|emmet|(?:^|\s)atom(?:\s|$)|ionic|ionicons|onsen|font awesome|cdnjs|cdn links|rx\s?js|rxjs|themeforest|wrapbootstrap|mobiscroll|ckeditor|ckfinder|w3cplus|wibibi|telerik|blueshop|Linode|ColorZilla|載入讀取效果|csharp|c#|vb.net|d3\.js|d3\/d3|eclipse|WindowsMobile|Windows Mobile|點部落|前端資源|Arduino|WinForms|ComponentOne|iThome鐵人/i.test(t)||/(?:^|\.)(?:github\.com|stackoverflow\.com|jsfiddle\.net|codepen\.io|telerik\.com|angular\.dev|angular\.io|typescriptlang\.org|developer\.mozilla\.org|cdnjs\.com|w3schools\.com|w3cplus\.com|linode\.com|wibibi\.com)$/.test(host)||/\/\s*(?:ASP.net|MVC|程式|sublimetext|KENDO|icon)(?:\s\/|$)/i.test(f))return 'dev';
  if(/美食|拉麵|料理|酸菜白肉|餐廳|餐厅|咖啡屋|農產|農產品|鵝房宮/i.test(t.split(/\s[|@]\s/)[0])||/\s\/\s吃(?:\s\/|$)/.test(f))return 'food';
  if(/旅遊|旅遊筆記|旅行|自由行|租車|レンタカー|沖繩|沖縄|觀光|景點|民宿|機票|寄行李|背包客|購物地圖|couchsurfing|清邁|曼谷|換錢|換匯|港[澳臺台]?出入境|香港出入境|地鐵站|東沙飛覽|英國$|交通.*搭乘/i.test(text)||/\s\/\s旅遊(?:\s\/|$)/.test(f))return 'travel';
  if(/新聞|新闻|朝日|BBC|報導者|報橘|鏡人物|光華雜誌|地球圖輯|時報|網誌|部落格|維基|wikipedia|reddit|ptt\.cc|瘟疫|肺炎|covid|nCoV2019|史萊姆|^CNN|7Headlines|歷史|历史|敘利亞|叙利亚|漢字|汉字|華藝|Airiti|考古題|甄試|甄試|舞文弄墨|面試心得|寶貝書庫|書單|癮科技|電腦王|T客邦|ePrice|卡提諾王國|新浪台灣|PCDVD/i.test(text)||/\s\/\s(?:部落格|歷史)(?:\s\/|$)/.test(f))return 'reading';
  if(/youtube|youtu\.be|spotify|podcast|billboard|bilibili|优酷|youku|iqiyi|愛奇藝|影音|影視|影城|VeryCD|電影|电影|動畫|卡通|音樂|音乐|歌手|電視|电视剧|韓劇|韩剧|線上看|在线观看|線上觀看|Grooveshark|Media player|抖音|ShareBa|FLV|tvdeo|drama|gimy|爐石|遊戲|小說|賭城|馬會獎券/i.test(text)||/\s\/\s(?:線上看電視|直播|廣播|音樂|ㄎㄎ)(?:\s\/|$)/.test(f))return 'media';
  if(/MeisterTask|OneDrive|Google (?:Sheets|試算表|Drive)|工作筆記|任務清單|接電話|Survey|問卷|薪資|薪水|PermissionCorp|點通行銷|TianMei|智邦生活館|進銷存|雲端 WEB ERP|Text2MindMap|power bi|^Home - Dashboard|Affiliate Commission/i.test(text)||/\s\/\s(?:中榮|工作|CASE)(?:\s\/|$)/i.test(f))return 'work';
  if(/購物|购物|momo|PChome|PayEasy|博客來|愛合購|折價券|e-coupon|停車|監理|天氣|氣象|水庫|地震|裁判|司法院|法務|檢察|法院|起訴|法拍|不動產|地政|地籍|國土|國軍|土地|商工|公司登記|環保|繳稅|勞工|退休|薪情|統計指標|地理資訊|通緝|查緝|傳票|全國法規|徵才|人事行政|房東|房客|公路|票可易|價格查詢|特殊符號|短網址|線上工具|IP查|軟體|Windows8|Win7|結婚|做事情|装潢|裝潢|住宅|補給站|五倍|採購|SOHO|Citytalk|城市通|Udemy|家教|wintoflash/i.test(text)||/\s\/\s人生有限公司(?:\s\/|$)/.test(f))return 'life';
  return 'other';
 }
 function safeWebUrl(url) {try {return ['http:','https:'].includes(new URL(url).protocol);}catch{return false;}}
 // 用途由原始資料夾與目前分類共同決定，避免把中榮項目誤歸為生活用途。
 function getBookmarkPurpose(entry){return String(entry.folder||'').split(' / ').includes('中榮')||['ai','work','dev'].includes(entry.category)?'work':'personal';}
 function countPurposes(entries,state={}){const counts={all:0,work:0,personal:0};for(const entry of selectBookmarks(entries,{...state,purpose:'all'})){counts.all++;counts[getBookmarkPurpose(entry)]++;}return counts;}
 // 以完整網址字串計數，不省略參數、大小寫或片段，也不直接合併資料。
 // 呼叫端應傳入已套用刪除紀錄的清單，讓已刪除書籤不影響重複判定。
 function countDuplicateUrls(entries){const counts=new Map();for(const entry of entries){if(typeof entry.url==='string'&&entry.url.trim())counts.set(entry.url,(counts.get(entry.url)||0)+1);}return counts;}
 // 各條件取交集；重複網址先以整份傳入清單計算，再套用分類、關鍵字等條件。
 // 因此某分類只顯示一筆時，另一筆相同網址仍可能位於其他分類。
 function selectBookmarks(entries,state={}) {
  const terms=String(state.query||'').toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);const favoriteSet=new Set(state.favorites||[]);
  const originalFolder=state.originalFolder;const duplicateCounts=state.duplicatesOnly?countDuplicateUrls(entries):null;
  return entries.filter(e=> (!duplicateCounts||(duplicateCounts.get(e.url)||0)>1)&&(!state.workSubcategory||state.workSubcategory==='all'||(['work','dev'].includes(e.category)&&(state.workSubcategory==='unassigned'?!e.workSubcategory:e.workSubcategory===state.workSubcategory)))&&(!state.purpose||state.purpose==='all'||getBookmarkPurpose(e)===state.purpose)&&(!originalFolder||originalFolder==='all'||(originalFolder==='__root__'?!e.folder:e.folder===originalFolder||e.folder.startsWith(originalFolder+' / ')))&&(!state.category||state.category==='all'||e.category===state.category)&&(!state.status||state.status==='all'||e.status===state.status)&&(!state.favoriteOnly||favoriteSet.has(e.id))&&terms.every(t=>(e.title+' '+e.url+' '+e.folder+' '+(e.workSubcategoryName||'')+' '+(CATEGORIES.find(c=>c.id===e.category)?.name||'')).toLocaleLowerCase().includes(t)));
 }
 function listOriginalFolders(entries) {const folders=new Map();for(const e of entries){const parts=String(e.folder||'').split(' / ').filter(Boolean);if(!parts.length){const root=folders.get('__root__')||{value:'__root__',label:'未分類（原始根目錄）',depth:0,count:0};root.count++;folders.set(root.value,root);continue;}for(let i=1;i<=parts.length;i++){const value=parts.slice(0,i).join(' / ');const item=folders.get(value)||{value,label:parts.slice(0,i).join(' › '),depth:i-1,count:0};item.count++;folders.set(value,item);}}return [...folders.values()];}
 // 統計保留其他篩選，僅忽略目前的狀態條件，讓使用者能比較切換後的筆數。
 function countStatuses(entries,state={}) {const counts={all:0,reachable:0,restricted:0,uncertain:0,missing:0,skipped:0,unknown:0};for(const entry of selectBookmarks(entries,{...state,status:'all'})){counts.all++;const status=Object.hasOwn(STATUS,entry.status)?entry.status:'unknown';counts[status]++;}return counts;}
 const FAVORITES_KEY='personal-bookmarks:favorites:v1';
 function loadFavorites(storage) {try{const raw=storage.getItem(FAVORITES_KEY);if(!raw)return {ids:[],warning:false};const parsed=JSON.parse(raw);if(!Array.isArray(parsed))return {ids:[],warning:true};return {ids:[...new Set(parsed.filter(x=>typeof x==='string'))],warning:false};}catch{return {ids:[],warning:true};}}
 const LIBRARY_KEY='personal-bookmarks:library:v1';
 // 新增書籤的網址正規化入口：補上缺少的協定並只接受 HTTP／HTTPS。
 function createManualBookmark(input,id,sourceId) {
  const title=String(input.title||'').trim();let url=String(input.url||'').trim();
  if(!title)throw new Error('請輸入書籤名稱。');
  if(!url||/\s/.test(url))throw new Error('請輸入有效的網站網址。');
  if(!/^[a-z][a-z\d+.-]*:/i.test(url))url='https://'+url;
  let parsed;try{parsed=new URL(url);}catch{throw new Error('網址格式不正確，請確認後再試。');}
  if(!safeWebUrl(url)||!parsed.hostname)throw new Error('網址必須以 http:// 或 https:// 開頭。');
  url=parsed.href;
  const e={id,sourceId,title,url,folder:'手動新增',domain:parsed.hostname.replace(/^www\./,''),status:'unknown',code:0,reason:'手動新增，尚未檢查連線狀態',finalUrl:url};
  e.category=CATEGORIES.some(c=>c.id===input.category)?input.category:classify(e);return e;
 }
 function normalizeBookmarkDetails(input){
  const title=String(input.title||'').trim();const raw=String(input.url||'').trim();
  if(!title||title.length>200)throw new Error('書籤名稱請填寫 1 至 200 個字。');
  if(raw.length>8192)throw new Error('網址過長。');
  return createManualBookmark({title,url:raw},'manual-validation',0);
 }
 // 只記錄異動，不改寫原始項目。網址變更時移除舊的手動狀態與檢查結果，
 // 避免新網址沿用舊結果；僅改名稱時則保留檢查狀態。
 function updateBookmarkDetails(changes,entry,input){
  const normalized=normalizeBookmarkDetails(input),urlChanged=normalized.url!==entry.url;
  const prior=changes.entryOverrides?.[entry.id]||{};
  const entryOverrides={...changes.entryOverrides,[entry.id]:{...prior,title:normalized.title,...(urlChanged?{url:normalized.url}:{})}};
  const next={...changes,entryOverrides};
  if(urlChanged){next.urlChecks={...changes.urlChecks};delete next.urlChecks[entry.id];next.statusOverrides={...changes.statusOverrides};delete next.statusOverrides[entry.id];}
  return next;
 }
 // 批次操作逐筆套用既有分類規則，全部成功才回傳新的異動物件。
 // 任一項目不合法就拋錯，呼叫端不應套用局部結果。
 function batchUpdateBookmarkCategories(changes,entries,ids,category,subcategory=''){
  if(!CATEGORIES.some(c=>c.id===category))throw new Error('請選擇有效的分類。');
  const selected=[...new Set(ids)],byId=new Map(entries.map(e=>[e.id,e]));
  if(!selected.length||selected.some(id=>!byId.has(id)))throw new Error('請重新選取有效的書籤。');
  let next=changes;
  for(const id of selected){const entry=byId.get(id);next=updateBookmarkCategory(next,entry,category);next=assignWorkSubcategory(next,{...entry,category},subcategory);}
  return next;
 }
 // 讀取並清理異動格式，同時相容舊版缺少的選用欄位。
 // warning 代表有資料不合法；正式檔案讀取器會據此拒絕載入，避免靜默遺失設定。
 function loadLibraryChanges(storage) {
  const empty=()=>({changes:{added:[],deletedIds:[]},warning:true});
  try {
   const raw=storage.getItem(LIBRARY_KEY);if(!raw)return {changes:{added:[],deletedIds:[]},warning:false};
   const data=JSON.parse(raw);if(!data||!Array.isArray(data.added)||!Array.isArray(data.deletedIds))return empty();
   const added=[],ids=new Set();let warning=false;
   for(const e of data.added){try{if(!e||typeof e.id!=='string'||!e.id.startsWith('manual-')||ids.has(e.id)||!CATEGORIES.some(c=>c.id===e.category))throw new Error('invalid');added.push(createManualBookmark(e,e.id,Number.isSafeInteger(e.sourceId)?e.sourceId:0));ids.add(e.id);}catch{warning=true;}}
   const deletedIds=[...new Set(data.deletedIds.filter(id=>typeof id==='string'))];
   const entryOverrides={};
   if(data.entryOverrides!==undefined){if(!data.entryOverrides||typeof data.entryOverrides!=='object'||Array.isArray(data.entryOverrides))warning=true;else for(const [id,value]of Object.entries(data.entryOverrides)){try{
    if(['__proto__','constructor','prototype'].includes(id)||!value||typeof value.title!=='string'||!value.title.trim()||value.title.length>200)throw Error('invalid');
    const title=value.title.trim();if(value.url!==undefined){if(typeof value.url!=='string')throw Error('invalid');const normalized=normalizeBookmarkDetails(value);entryOverrides[id]={title,url:normalized.url};}else entryOverrides[id]={title};
   }catch{warning=true;}}}
   let quickOrder;
   if(data.quickOrder!==undefined){if(!Array.isArray(data.quickOrder)||data.quickOrder.some(id=>typeof id!=='string'||!id)||new Set(data.quickOrder).size!==data.quickOrder.length)warning=true;else quickOrder=[...data.quickOrder];}
   let categoryOrder;
   if(data.categoryOrder!==undefined){if(!Array.isArray(data.categoryOrder)||data.categoryOrder.length!==CATEGORIES.length||new Set(data.categoryOrder).size!==CATEGORIES.length||data.categoryOrder.some(id=>!CATEGORIES.some(c=>c.id===id)))warning=true;else categoryOrder=[...data.categoryOrder];}
   const categoryOverrides={};
   if(data.categoryOverrides!==undefined){if(!data.categoryOverrides||typeof data.categoryOverrides!=='object'||Array.isArray(data.categoryOverrides))warning=true;else for(const [id,category] of Object.entries(data.categoryOverrides)){if(!['__proto__','constructor','prototype'].includes(id)&&CATEGORIES.some(c=>c.id===category))categoryOverrides[id]=category;else warning=true;}}
   const statusOverrides={};
   if(data.statusOverrides!==undefined){if(!data.statusOverrides||typeof data.statusOverrides!=='object'||Array.isArray(data.statusOverrides))warning=true;else for(const [id,status] of Object.entries(data.statusOverrides)){if(!['__proto__','constructor','prototype'].includes(id)&&Object.hasOwn(STATUS,status))statusOverrides[id]=status;else warning=true;}}
   const urlChecks={};
   if(data.urlChecks!==undefined){if(!data.urlChecks||typeof data.urlChecks!=='object'||Array.isArray(data.urlChecks))warning=true;else for(const [id,value]of Object.entries(data.urlChecks)){if(!['__proto__','constructor','prototype'].includes(id)&&value&&Object.hasOwn(STATUS,value.status)&&Number.isFinite(value.code)&&typeof value.reason==='string'&&typeof value.finalUrl==='string'&&typeof value.checkedAt==='string'&&Number.isFinite(Date.parse(value.checkedAt)))urlChecks[id]={status:value.status,code:value.code,reason:value.reason,finalUrl:value.finalUrl,checkedAt:value.checkedAt};else warning=true;}}
   const workSubcategories=[],workSubcategoryAssignments={};const workIds=new Set(),workNames=new Set();
   if(data.workSubcategories!==undefined){if(!Array.isArray(data.workSubcategories))warning=true;else for(const item of data.workSubcategories){try{if(!item||!validWorkSubcategoryId(item.id)||workIds.has(item.id))throw Error('invalid');const name=normalizeWorkSubcategoryName(item.name),key=(item.category||'work')+':'+name.toLocaleLowerCase();if(item.category!==undefined&&!['work','dev'].includes(item.category))throw Error('invalid parent');if(workNames.has(key))throw Error('duplicate');workSubcategories.push({id:item.id,name,...(item.category?{category:item.category}:{})});workIds.add(item.id);workNames.add(key);}catch{warning=true;}}}
   if(data.workSubcategoryAssignments!==undefined){if(!data.workSubcategoryAssignments||typeof data.workSubcategoryAssignments!=='object'||Array.isArray(data.workSubcategoryAssignments))warning=true;else for(const [id,target]of Object.entries(data.workSubcategoryAssignments)){if(!['__proto__','constructor','prototype'].includes(id)&&workIds.has(target))workSubcategoryAssignments[id]=target;else warning=true;}}
   return {changes:{added,deletedIds,...(quickOrder?{quickOrder}:{}),...(Object.keys(entryOverrides).length?{entryOverrides}:{}),...(categoryOrder?{categoryOrder}:{}),...(workSubcategories.length?{workSubcategories}:{}),...(Object.keys(workSubcategoryAssignments).length?{workSubcategoryAssignments}:{}),...(Object.keys(urlChecks).length?{urlChecks}:{}),...(Object.keys(statusOverrides).length?{statusOverrides}:{}),...(Object.keys(categoryOverrides).length?{categoryOverrides}:{})},warning:warning||deletedIds.length!==data.deletedIds.length};
  }catch{return empty();}
 }
 function updateBookmarkCategory(changes,entry,category){
  if(category!=='original'&&!CATEGORIES.some(c=>c.id===category))throw new Error('請選擇有效的分類。');
  if(category!=='original'&&String(entry.folder||'').split(' / ').includes('中榮')&&!['ai','work','dev'].includes(category))throw new Error('中榮資料夾的書籤須維持工作用途。');
  const categoryOverrides={...changes.categoryOverrides};if(category==='original')delete categoryOverrides[entry.id];else categoryOverrides[entry.id]=category;
  const workSubcategoryAssignments={...changes.workSubcategoryAssignments};const assigned=(changes.workSubcategories||[]).find(s=>s.id===workSubcategoryAssignments[entry.id]);if(category!=='original'&&assigned&&(assigned.category||'work')!==category)delete workSubcategoryAssignments[entry.id];
  return {...changes,categoryOverrides,...(changes.workSubcategoryAssignments?{workSubcategoryAssignments}:{})};
 }
 function updateBookmarkStatus(changes,entry,status){if(status!=='original'&&!Object.hasOwn(STATUS,status))throw new Error('請選擇有效的網址狀態。');const statusOverrides={...changes.statusOverrides};if(status==='original')delete statusOverrides[entry.id];else statusOverrides[entry.id]=status;return {...changes,statusOverrides};}
 function validWorkSubcategoryId(id){return typeof id==='string'&&/^work-sub-[a-zA-Z0-9-]{1,80}$/.test(id);}
 function normalizeWorkSubcategoryName(value){if(typeof value!=='string')throw new Error('請輸入分類名稱。');const name=value.normalize('NFC').trim();if(!name||name.length>40||/[\r\n\t]/.test(name))throw new Error('分類名稱請填寫 1 至 40 個字。');return name;}
 function checkWorkName(changes,name,exceptId,category='work'){const value=normalizeWorkSubcategoryName(name);if((changes.workSubcategories||[]).some(c=>c.id!==exceptId&&(c.category||'work')===category&&c.name.toLocaleLowerCase()===value.toLocaleLowerCase()))throw new Error('已有相同名稱的第二層分類。');return value;}
 function createWorkSubcategory(changes,id,name,category='work'){if(!['work','dev'].includes(category)||!validWorkSubcategoryId(id)||(changes.workSubcategories||[]).some(c=>c.id===id))throw new Error('分類識別碼無效或重複。');return {...changes,workSubcategories:[...(changes.workSubcategories||[]),{id,name:checkWorkName(changes,name,undefined,category),...(category==='dev'?{category}:{})}]};}
 function renameWorkSubcategory(changes,id,name){const sub=(changes.workSubcategories||[]).find(c=>c.id===id);if(!sub)throw new Error('找不到這個分類。');const value=checkWorkName(changes,name,id,sub.category||'work');return {...changes,workSubcategories:changes.workSubcategories.map(c=>c.id===id?{...c,name:value}:c)};}
 // 只在相同主分類內交換順序；沒有 category 的舊資料視為工作系統，dev 則為程式開發。
 function moveWorkSubcategory(changes,id,direction){const subs=[...(changes.workSubcategories||[])],index=subs.findIndex(s=>s.id===id);if(index<0||![-1,1].includes(direction))throw new Error('無效的分類排序。');const category=subs[index].category||'work';let target=index+direction;while(target>=0&&target<subs.length&&(subs[target].category||'work')!==category)target+=direction;if(target<0||target>=subs.length)return changes;[subs[index],subs[target]]=[subs[target],subs[index]];return {...changes,workSubcategories:subs};}
 function removeWorkSubcategory(changes,id){if(!(changes.workSubcategories||[]).some(c=>c.id===id))throw new Error('找不到這個分類。');return {...changes,workSubcategories:changes.workSubcategories.filter(c=>c.id!==id),workSubcategoryAssignments:Object.fromEntries(Object.entries(changes.workSubcategoryAssignments||{}).filter(([,target])=>target!==id))};}
 function assignWorkSubcategory(changes,entry,id){const workSubcategoryAssignments={...changes.workSubcategoryAssignments};if(!id){delete workSubcategoryAssignments[entry.id];return {...changes,workSubcategoryAssignments};}if(!['work','dev'].includes(entry.category))throw new Error('只有工作系統或程式開發書籤可以設定此分類。');if(!(changes.workSubcategories||[]).some(c=>c.id===id&&(c.category||'work')===entry.category))throw new Error('找不到這個第二層分類。');workSubcategoryAssignments[entry.id]=id;return {...changes,workSubcategoryAssignments};}
 // 產生畫面使用的衍生清單：先排除刪除項目，套用名稱／網址異動，
 // 再套用自動檢查、分類、手動狀態與子分類；手動狀態優先於自動結果。
 // 顯示資料每次由來源與異動重建：名稱／網址修改 → 自動檢查 → 手動分類 → 手動狀態。
 // 手動狀態最後套用，所以重新檢查不會蓋掉人工判斷；移除覆寫才會恢復自動結果。
 function mergeLibrary(base,changes){const deleted=new Set(changes.deletedIds);return [...changes.added].reverse().concat(base).filter(e=>!deleted.has(e.id)).map(original=>{
  const detail=changes.entryOverrides?.[original.id];const source=detail?{...original,title:detail.title,...(detail.url?{url:detail.url,domain:new URL(detail.url).hostname.replace(/^www\./,''),status:'unknown',code:0,reason:'網址已修改，尚未檢查',finalUrl:detail.url}:{} )}:original;
  const checked=Object.hasOwn(changes.urlChecks||{},source.id)?changes.urlChecks[source.id]:null;const e=checked?{...source,...checked,statusSource:'automatic'}:source;
  const category=Object.hasOwn(changes.categoryOverrides||{},e.id)?changes.categoryOverrides[e.id]:null;
  const categorized=category&&CATEGORIES.some(c=>c.id===category)&&(!String(e.folder||'').split(' / ').includes('中榮')||['ai','work','dev'].includes(category))?{...e,category}:e;
  const status=Object.hasOwn(changes.statusOverrides||{},e.id)?changes.statusOverrides[e.id]:null;
  const current=status&&Object.hasOwn(STATUS,status)?{...categorized,status,code:0,reason:'手動標記：'+STATUS[status].label,statusSource:'manual'}:categorized;
  const sub=(changes.workSubcategories||[]).find(c=>c.id===changes.workSubcategoryAssignments?.[e.id]);return sub&&current.category===(sub.category||'work')?{...current,workSubcategory:sub.id,workSubcategoryName:sub.name,workSubcategoryOrder:changes.workSubcategories.indexOf(sub)}:current;
 });}
 // 匯出 Chrome 可匯入的 Netscape HTML，並對名稱及網址做 HTML 跳脫。
 // 匯出資料保留用途、主分類及自訂子分類順序，不包含內部編輯紀錄。
 function createChromeBookmarkHtml(entries){
  const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const timestamp=Math.floor(Date.now()/1000);
  const lines=['<!DOCTYPE NETSCAPE-Bookmark-file-1>','<!-- Exported from Melody Pan bookmarks. -->','<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',"<META HTTP-EQUIV=\"Content-Security-Policy\" CONTENT=\"default-src 'none'\">",'<TITLE>Melody Pan 書籤</TITLE>','<H1>Melody Pan 書籤</H1>','<DL><p>'];
  for(const [purpose,label]of [['work','工作用途'],['personal','生活']]){
   const rows=entries.filter(entry=>getBookmarkPurpose(entry)===purpose);if(!rows.length)continue;
   lines.push('    <DT><H3 ADD_DATE="'+timestamp+'">'+label+'</H3>','    <DL><p>');
   for(const category of CATEGORIES){const grouped=rows.filter(entry=>(CATEGORIES.some(c=>c.id===entry.category)?entry.category:'other')===category.id);if(!grouped.length)continue;
    lines.push('        <DT><H3 ADD_DATE="'+timestamp+'">'+escape(category.name)+'</H3>','        <DL><p>');
    const writeEntries=(items,indent)=>{for(const entry of items)lines.push(indent+'<DT><A HREF="'+escape(entry.url)+'" ADD_DATE="'+timestamp+'">'+escape(entry.title||entry.domain||entry.url)+'</A>');};
    if(['work','dev'].includes(category.id)&&grouped.some(e=>e.workSubcategoryName)){const subs=new Map();for(const entry of grouped){const id=entry.workSubcategory||'unassigned';if(!subs.has(id))subs.set(id,{name:entry.workSubcategoryName||'未分類',order:entry.workSubcategoryOrder??Number.MAX_SAFE_INTEGER,rows:[]});subs.get(id).rows.push(entry);}const ordered=[...subs].filter(([id])=>id!=='unassigned').map(([,value])=>value).sort((a,b)=>a.order-b.order);if(subs.has('unassigned'))ordered.push(subs.get('unassigned'));for(const sub of ordered){lines.push('            <DT><H3 ADD_DATE="'+timestamp+'">'+escape(sub.name)+'</H3>','            <DL><p>');writeEntries(sub.rows,'                ');lines.push('            </DL><p>');}}
    else writeEntries(grouped,'            ');
    lines.push('        </DL><p>');
   }
   lines.push('    </DL><p>');
  }
  lines.push('</DL><p>');return lines.join('\r\n')+'\r\n';
 }
 // 僅在有關鍵字時把工作系統穩定移到前面，保留各組原有排序。
 function prioritizeWorkSearchResults(rows,query){if(!String(query||"").trim())return rows;return [...rows.filter(e=>e.category==="work"),...rows.filter(e=>e.category!=="work")];}
 function orderedCategories(changes){const order=changes.categoryOrder||[];return [...CATEGORIES].sort((a,b)=>{const rank=id=>order.includes(id)?order.indexOf(id):order.length+CATEGORIES.findIndex(c=>c.id===id);return rank(a.id)-rank(b.id);});}
 function moveCategory(changes,id,direction){const categoryOrder=orderedCategories(changes).map(c=>c.id),index=categoryOrder.indexOf(id);if(index<0||![-1,1].includes(direction))throw new Error('無效的分類排序。');const target=index+direction;if(target<0||target>=categoryOrder.length)return changes;[categoryOrder[index],categoryOrder[target]]=[categoryOrder[target],categoryOrder[index]];return {...changes,categoryOrder};}

 function validEmbeddedIcon(value){return typeof value==='string'&&value.length<=262144&&/^data:image\/(?:png|x-icon|vnd\.microsoft\.icon|jpeg|gif|webp);base64,[a-zA-Z0-9+/=]+$/i.test(value);}
 function extractBookmarkIcons(html){const icons=Object.create(null);for(const match of html.matchAll(/<A\b([^>]*)>/gi)){const href=match[1].match(/\bHREF\s*=\s*(?:"([^"]*)"|'([^']*)')/i),icon=match[1].match(/\bICON\s*=\s*(?:"([^"]*)"|'([^']*)')/i);if(href&&icon){const value=decode(icon[1]??icon[2]);if(validEmbeddedIcon(value))icons[decode(href[1]??href[2])]=value;}}return icons;}
 // 已隨站保存的官方圖示優先，再用匯出檔內嵌圖示與外站 favicon；不經第三方圖示服務。
 const shippedIcons=Object.freeze({'chatgpt.com':'images/icons/chatgpt.ico','www.chatgpt.com':'images/icons/chatgpt.ico','chat.openai.com':'images/icons/chatgpt.ico','gemini.google.com':'images/icons/gemini.png'});
 function bookmarkIconSources(raw,icons={}){let url;try{url=new URL(raw);}catch{return [];}if(!['http:','https:'].includes(url.protocol)||url.username||url.password)return [];const embedded=Object.hasOwn(icons,raw)?icons[raw]:null;return [...(Object.hasOwn(shippedIcons,url.hostname)?[shippedIcons[url.hostname]]:[]),...(validEmbeddedIcon(embedded)?[embedded]:[]),new URL('/favicon.ico',url).href];}

 return {countDuplicateUrls,updateBookmarkDetails,batchUpdateBookmarkCategories,extractBookmarkIcons,bookmarkIconSources,orderedCategories,moveCategory,moveWorkSubcategory,prioritizeWorkSearchResults,CATEGORIES,STATUS,FAVORITES_KEY,LIBRARY_KEY,decode,parseBookmarks,classify,safeWebUrl,getBookmarkPurpose,countPurposes,selectBookmarks,listOriginalFolders,countStatuses,loadFavorites,createManualBookmark,loadLibraryChanges,mergeLibrary,updateBookmarkCategory,updateBookmarkStatus,createChromeBookmarkHtml,createWorkSubcategory,renameWorkSubcategory,removeWorkSubcategory,assignWorkSubcategory};
});
