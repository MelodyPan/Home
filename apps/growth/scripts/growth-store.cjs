// 相簿儲存模組：孩子與紀錄存入 JSON，照片另存檔案，與書籤資料分開管理。
// 成長相簿儲存層：JSON 記錄孩子及故事，照片存成獨立檔案，以 ETag 防止過期覆寫。
const fs=require('node:fs/promises');
const path=require('node:path');
const {withDataLock}=require('../../shared/scripts/data-lock.cjs');
const {createHash,randomUUID}=require('node:crypto');
// 只接受 UUID 照片檔名及指定副檔名，避免相對路徑或任意本機檔案存取。
const photoPattern=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.(png|jpg|webp)$/;
const mime={png:'image/png',jpg:'image/jpeg',webp:'image/webp'};
// 用完整檔案內容計算 SHA-256 ETag，供前端辨識資料是否已被其他視窗或程式修改。
const revision=text=>'"'+createHash('sha256').update(text).digest('hex')+'"';
// 日期須符合格式並能原樣轉回，避免 JavaScript 把 2 月 30 日自動進位成合法日期。
const validDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
// 驗證欄位長度、唯一識別碼、日期及孩子／照片關聯；回傳時只保留支援的欄位。
// 同時檢查欄位長度、有效日期、孩子關聯及照片 ID；允許孕期紀錄早於生日。
function validate(data){
 const fail=()=>{throw Object.assign(new Error('成長資料格式不正確，請確認孩子、日期與照片。'),{status:400});};
 const text=(value,max,required=false)=>typeof value==='string'&&value.length<=max&&(!required||value.trim().length>0);
 const id=value=>typeof value==='string'&&/^[a-zA-Z0-9-]{1,80}$/.test(value);
 if(!data||data.schemaVersion!==1||!Array.isArray(data.children)||!Array.isArray(data.records)||data.children.length>100||data.records.length>10000)fail();
 // Map 檢查紀錄所屬孩子，Set 用來偵測重複紀錄識別碼。
 const children=new Map(),records=new Set();
 // avatar 是可省略的大頭貼照片 ID；舊孩子資料缺少欄位或傳 null 仍合法，有設定時則必須符合安全檔名規則。
 // 尚未出生時 birthday 可留空、null 或省略；有填寫仍須是有效日期，不接受其他型別。
 for(const c of data.children){if(!c||!id(c.id)||children.has(c.id)||!text(c.name,80,true)||(![undefined,null,''].includes(c.birthday)&&!validDate(c.birthday))||(c.avatar!==undefined&&c.avatar!==null&&(typeof c.avatar!=='string'||!photoPattern.test(c.avatar))))fail();children.set(c.id,c);}
 // 每位孩子的書封設定各自保存；圖片使用本機產生的識別碼，書名與寄語仍為純文字。
 for(const c of children.values()){
  if(c.growthSex!=null&&!['','male','female'].includes(c.growthSex))fail();
  if((c.bookTitle!=null&&!text(c.bookTitle,120))||(c.bookDedication!=null&&!text(c.bookDedication,2000))||(c.bookCover!=null&&(typeof c.bookCover!=='string'||!photoPattern.test(c.bookCover))))fail();
 }
 // 孕期、出生後共用日期排序；每筆最多 20 張照片，照片檔名不能重複或超出允許格式。
 for(const r of data.records){
  if(!r||!id(r.id)||records.has(r.id)||!children.has(r.childId)||!validDate(r.date)||!text(r.title,160,true)||!text(r.story,20000)||!text(r.milestone,80)||!Array.isArray(r.photos)||r.photos.length>20||new Set(r.photos).size!==r.photos.length||r.photos.some(p=>typeof p!=='string'||!photoPattern.test(p)))fail();
  // 封面只能引用這一筆紀錄自己的照片；省略時沿用舊版第一張照片的行為。
  if(r.coverPhoto!==undefined&&r.coverPhoto!==null&&(typeof r.coverPhoto!=='string'||!r.photos.includes(r.coverPhoto)))fail();
  // 身高／體重為可選數字；空值不等於零。上下限只用來防止誤輸入，不代表健康標準。
  for(const [key,max] of [['heightCm',300],['weightKg',500]])if(r[key]!==undefined&&r[key]!==null&&(typeof r[key]!=='number'||!Number.isFinite(r[key])||r[key]<=0||r[key]>max))fail();
  if(r.photoLayout!=null&&!['editorial','grid','full'].includes(r.photoLayout))fail();
  records.add(r.id);
 }
 // 只輸出支援欄位；未設定的大頭貼與封面不強制補欄位，因此維持 schemaVersion 1 與既有資料相容。
 return {schemaVersion:1,updatedAt:typeof data.updatedAt==='string'?data.updatedAt:null,children:data.children.map(c=>({id:c.id,name:c.name.trim(),birthday:c.birthday||'',...(c.growthSex?{growthSex:c.growthSex}:{}),...(c.avatar?{avatar:c.avatar}:{}),...(c.bookTitle?.trim()?{bookTitle:c.bookTitle.trim()}:{}),...(c.bookDedication?.trim()?{bookDedication:c.bookDedication}:{}),...(c.bookCover?{bookCover:c.bookCover}:{})})),records:data.records.map(r=>({id:r.id,childId:r.childId,date:r.date,title:r.title.trim(),story:r.story,milestone:r.milestone.trim(),photos:[...r.photos],...(r.photoLayout?{photoLayout:r.photoLayout}:{}),...(r.heightCm!=null?{heightCm:r.heightCm}:{}),...(r.weightKg!=null?{weightKg:r.weightKg}:{}),...(r.coverPhoto?{coverPhoto:r.coverPhoto}:{})}))};
}
// 每個服務實例各有資料路徑與寫入佇列；測試可使用暫存目錄，不碰正式資料。
// 每個儲存實例有自己的寫入佇列；照片與 JSON 依序保存，停止服務時等待 flush。
function createGrowthStore(root){
 const filename=path.join(root,'assets','growth-data.json'),photos=path.join(root,'assets','growth-photos');let pending=Promise.resolve();
 // 依序寫入；呼叫者仍收到原本錯誤，但佇列接住失敗狀態，讓下一筆能繼續執行。
 const queue=fn=>{const task=pending.then(fn);pending=task.catch(()=>{});return task;};
 // 只有缺檔才初始化；既有資料解析或驗證失敗時報錯，不以空白相簿覆蓋損毀檔案。
 // 首次載入只在檔案不存在時建立空資料；損毀資料會報錯，不以空資料覆蓋。
 async function load(){
  let raw;try{raw=await fs.readFile(filename,'utf8');}catch(e){
   // 只有 ENOENT 代表可建立第一份資料；權限或其他讀取錯誤必須保留並回報。
   if(e.code!=='ENOENT')throw e;
   await fs.mkdir(path.dirname(filename),{recursive:true});
   const initial=JSON.stringify({schemaVersion:1,updatedAt:null,children:[],records:[]},null,2)+'\n';
   // wx 只允許新建；若其他請求已先建立檔案，改讀既有內容，避免覆蓋。
   try{await fs.writeFile(filename,initial,{encoding:'utf8',flag:'wx'});}catch(error){if(error.code!=='EEXIST')throw error;}
   raw=await fs.readFile(filename,'utf8');
  }
  try{return {raw,data:validate(JSON.parse(raw)),tag:revision(raw)};}catch{throw Object.assign(new Error('成長資料檔無法讀取，請檢查或還原備份；原檔未被覆蓋。'),{status:500});}
 }
 // 分段接收並累計實際位元組，依 JSON／照片各自的上限拒絕超量內容。
 async function readBody(req,limit){const chunks=[];let total=0;for await(const chunk of req){total+=chunk.length;if(total>limit)throw Object.assign(new Error('資料太大。照片上限為 12 MB。'),{status:413});chunks.push(chunk);}return Buffer.concat(chunks);}
 // 路由契約：相簿請求處理後回傳 true；其他路徑回傳 false，交給既有書籤服務。
 // 僅接管相簿 API 與限定格式的照片路徑；回傳 false 代表交由其他服務路由處理。
 async function handle(req,res,{stopping=false}={}){
  const photoMatch=req.url.match(/^\/assets\/growth-photos\/([^/?]+)$/);
  if(req.url!=='/api/growth'&&req.url!=='/api/growth/photos'&&!photoMatch)return false;
  // 回應 JSON 或圖片時停用快取及 MIME 猜測，維持資料版本與圖片型別的明確性。
  const send=(status,value,type='application/json; charset=utf-8',headers={})=>{res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers});res.end(Buffer.isBuffer(value)?value:JSON.stringify(value));};
  try{
   // 先驗證檔名再組合固定照片目錄；照片不存在時回傳 404。
   if(req.method==='GET'&&photoMatch){
    const id=photoMatch[1];if(!photoPattern.test(id)){send(404,{error:'找不到照片。'});return true;}
    try{send(200,await fs.readFile(path.join(photos,id)),mime[id.split('.').pop()]);}catch(e){if(e.code!=='ENOENT')throw e;send(404,{error:'找不到照片。'});}return true;
   }
   // 讀取前等候已排隊寫入，回傳相簿資料及 ETag，作為下一次存檔的版本依據。
   if(req.method==='GET'&&req.url==='/api/growth'){await pending;const loaded=await withDataLock(filename,load);send(200,loaded.data,undefined,{ETag:loaded.tag});return true;}
   if(!((req.method==='PUT'&&req.url==='/api/growth')||(req.method==='POST'&&req.url==='/api/growth/photos'))){send(405,{error:'不支援的操作。'});return true;}
   // 寫入只接受目前 127.0.0.1 同連接埠的來源，拒絕其他網站代送修改。
   if(req.headers.origin!=='http://127.0.0.1:'+req.socket.localPort){send(403,{error:'來源不符。'});return true;}
   if(stopping){send(503,{error:'服務正在停止，請重新啟動。'});return true;}
   // 照片上傳限制 MIME、12 MB 大小及相符檔頭；檔頭驗證不等同完整圖片解碼。
   // 上傳檢查 MIME、大小與檔頭，再由服務產生 UUID 檔名；不採用使用者提供的檔名。
   if(req.method==='POST'){
    const type=req.headers['content-type'];const ext=Object.keys(mime).find(k=>mime[k]===type);
    if(!ext){send(415,{error:'請選擇 JPG、PNG 或 WebP 照片。'});return true;}
    const bytes=await readBody(req,12*1024*1024);
    const valid=ext==='png'?bytes.length>=24&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):ext==='jpg'?bytes.length>=4&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255:bytes.length>=16&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP';
    if(!valid){send(400,{error:'照片內容與格式不符。'});return true;}
    // 以服務產生的 UUID 命名照片，並使用 wx 防覆寫；回傳識別碼給故事引用。
    const id=randomUUID()+'.'+ext;await queue(async()=>{await fs.mkdir(photos,{recursive:true});await fs.writeFile(path.join(photos,id),bytes,{flag:'wx'});});send(201,{id});return true;
   }
   if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||'')){send(403,{error:'需使用 JSON 格式。'});return true;}
   // 紀錄 API 接受 8 MB 內的完整 JSON，驗證成功才允許排隊寫入。
   let data;const body=await readBody(req,8*1024*1024);
   try{data=validate(JSON.parse(body.toString('utf8')));}catch(e){if(e.status)throw e;throw Object.assign(new Error('成長資料格式不正確。'),{status:400});}
   // 版本比對在佇列內重新讀取最新檔案，阻止兩個視窗用同一舊版本互相覆蓋。
   // 在寫入佇列中驗證最新版本與照片是否存在，再備份並以暫存檔替換正式 JSON。
   // 此處不清除未被引用的照片，以免刪除仍可能需要還原的檔案。
   await queue(()=>withDataLock(filename,async()=>{
    const previous=await load();if(req.headers['if-match']!==previous.tag){send(409,{error:'其他視窗已更新資料。請先複製尚未儲存的內容，再重新整理頁面。'});return;}
    // 確認引用的照片實體都存在，避免保存指向不存在圖片的故事。
    for(const record of data.records)for(const photo of record.photos){try{await fs.access(path.join(photos,photo));}catch{throw Object.assign(new Error('紀錄包含不存在的照片。'),{status:400});}}
    // 大頭貼沿用照片檔案目錄；必須確認實體存在，且舊資料未設定時仍可正常保存。
    // 大頭貼必須先成功上傳才可被孩子資料引用；檢查失敗會中止本次存檔，不覆蓋原 JSON。
    for(const child of data.children)for(const [key,label] of [['avatar','大頭貼'],['bookCover','書封']]){if(child[key]){try{await fs.access(path.join(photos,child[key]));}catch{throw Object.assign(new Error('孩子的'+label+'照片不存在，請重新選擇。'),{status:400});}}}
    data.updatedAt=new Date().toISOString();const raw=JSON.stringify(data,null,2)+'\n';
    // 先備份舊版，再完整寫入暫存檔並 rename 替換正式檔，降低留下半份 JSON 的機會。
    await fs.writeFile(filename+'.bak',previous.raw,'utf8');await fs.writeFile(filename+'.tmp',raw,'utf8');await fs.rename(filename+'.tmp',filename);
    send(200,{revision:revision(raw),updatedAt:data.updatedAt});
   }));
  }catch(error){if(!res.headersSent)send(error.status||500,{error:error.status?error.message:'無法讀寫成長相簿，請檢查檔案權限。'});else res.end();}
  return true;
 }
 // flush 等待目前已排隊的磁碟寫入，供本機服務停止時使用。
 return {handle,flush:()=>pending};
}
module.exports={createGrowthStore,validate};
