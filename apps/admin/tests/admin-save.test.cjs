// 執行真正的頁面事件處理程式，驗證按下表單儲存就會寫入暫存 JSON；不使用正式帳號或資料。
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),vm=require('node:vm'),{randomUUID}=require('node:crypto');
const ProjectModel=require('../public/project-model.js'),ProjectEditor=require('../public/editor-state.js'),{createLocalStore}=require('../server/store.cjs');
const seed={schemaVersion:1,updatedAt:null,projects:[{id:'bookmarks',title:'書籤工作台',description:'常用網站',category:'工具',url:'bookmarks/bookmarks.html',linkText:'開啟',badge:'01',sortOrder:0,published:true,featured:false,newTab:false}]};
async function setup(t,saved=null){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'admin-save-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const memory=new Map(saved?Object.entries(saved):[]),sessionStorage={getItem:key=>memory.has(key)?memory.get(key):null,setItem:(key,value)=>memory.set(key,String(value)),removeItem:key=>memory.delete(key)};
 const filename=path.join(root,'projects.json'),store=createLocalStore(filename,seed),nodes=new Map();let callback,failNext=false,puts=0;
 class Element{
  constructor(){this.listeners={};this.children=[];this.hidden=false;this.disabled=false;this.textContent='';this.value='';this.checked=false;this.classList={toggle(){}};}
  addEventListener(name,fn){this.listeners[name]=fn;}async fire(name){return this.listeners[name]?.({preventDefault(){}});}append(...children){this.children.push(...children);}replaceChildren(...children){this.children=children;}focus(){}
 }
 const get=id=>{if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id);},form=get('project-form');
 const fields=['title','description','category','badge','linkText','url','published','featured','newTab'].map(name=>{const node=new Element();node.name=name;node.type=['published','featured','newTab'].includes(name)?'checkbox':'text';return node;});
 fields.namedItem=name=>fields.find(field=>field.name===name);fields.title=fields.namedItem('title');form.elements=fields;form.reset=()=>{for(const field of fields){field.value='';field.checked=field.name==='published';}};form.reportValidity=()=>Boolean(fields.title.value.trim());
 const context={sessionStorage,URL,Blob,crypto:{randomUUID},structuredClone,ProjectModel,ProjectEditor,location:{origin:'http://127.0.0.1:4179',protocol:'http:'},confirm:()=>true,addEventListener(){},setTimeout:(fn,ms)=>setTimeout(fn,ms).unref(),clearTimeout,document:{getElementById:get,createElement:()=>new Element(),head:{append(script){script.onload();}}},google:{accounts:{id:{initialize(options){callback=options.callback;},renderButton(){},disableAutoSelect(){}}}},fetch:async(route,options={})=>{
  if(route.endsWith('/config'))return Response.json({configured:true,googleClientId:'test-client'});
  if(route.endsWith('/me'))return Response.json({email:'test@example.com'});
  if(options.method==='PUT'){
   puts++;if(failNext){failNext=false;return Response.json({error:'其他分頁已更新'},{status:409});}
   const result=await store.write(JSON.parse(options.body),options.headers['If-Match'].replaceAll('"',''));return Response.json(result.document,{headers:{ETag:'"'+result.revision+'"'}});
  }
  const result=await store.read();return Response.json(result.document,{headers:{ETag:'"'+result.revision+'"'}});
 }};
 vm.runInNewContext(await fs.readFile(path.join(__dirname,'../public/admin.js'),'utf8'),context);await new Promise(setImmediate);if(!saved){await callback({credential:'test-only-token'});}await new Promise(setImmediate);await new Promise(setImmediate);
 return {memory,get,form,fields,store,filename,puts:()=>puts,conflict:()=>{failNext=true;},edit:()=>get('project-list').children[0].children[2].children[0].fire('click')};
}
test('取消公開後按一次表單儲存即更新 JSON，表單保留未公開狀態且顯示就近提示',async t=>{
 const page=await setup(t);await page.edit();page.fields.namedItem('published').checked=false;await page.form.fire('input');await page.form.fire('submit');
 assert.equal(page.puts(),1);assert.equal((await page.store.read()).document.projects[0].published,false);assert.equal(ProjectModel.publicDocument((await page.store.read()).document).projects.length,0);
 assert.equal(page.fields.namedItem('published').checked,false);assert.match(page.get('project-list').children[0].className,/unpublished/);assert.match(page.get('form-status').textContent,/已儲存/);assert.equal(page.get('save-state').textContent,'已同步');
});
test('儲存衝突保留未公開草稿與就近錯誤提示，重試不重複新增作品',async t=>{
 const page=await setup(t);await page.edit();page.fields.namedItem('published').checked=false;await page.form.fire('input');page.conflict();await page.form.fire('submit');
 assert.equal((await page.store.read()).document.projects[0].published,true);assert.equal(page.fields.namedItem('published').checked,false);assert.match(page.get('form-status').textContent,/其他分頁已更新/);assert.equal(page.get('save-state').textContent,'有未儲存變更');
 await page.form.fire('submit');const saved=await page.store.read();assert.equal(saved.document.projects.length,1);assert.equal(saved.document.projects[0].published,false);
});
test('表單儲存後立即重複按相同按鈕不會重複寫入',async t=>{
 const page=await setup(t);await page.edit();page.fields.namedItem('published').checked=false;await page.form.fire('input');await Promise.all([page.form.fire('submit'),page.form.fire('submit')]);assert.equal(page.puts(),1);
});
test('清單可依關鍵字與狀態篩選，編號不受篩選影響',async t=>{
 const page=await setup(t);const items=()=>page.get('project-list').children;
 assert.equal(items().length,1);
 page.get('filter-status').value='hidden';await page.get('filter-status').fire('input');assert.equal(items().length,0);assert.match(page.get('empty').textContent,/沒有符合/);
 page.get('filter-status').value='';page.get('filter-text').value='書籤';await page.get('filter-text').fire('input');assert.equal(items().length,1);assert.match(items()[0].children[0].children[0].textContent,/^01/);
 page.get('filter-text').value='不存在';await page.get('filter-text').fire('input');assert.equal(items().length,0);
});
test('頁面訊息顯示五秒後自動清除',async t=>{
 const page=await setup(t);const realSet=globalThis.setTimeout;
 assert.match(page.get('status').textContent,/已登入/);
 await new Promise(resolve=>realSet(resolve,5100));
 assert.equal(page.get('status').textContent,'');
});
test('登入訊息只顯示在右下角提示，不出現在表單內',async t=>{
 const page=await setup(t);
 assert.match(page.get('status').textContent,/已登入/);assert.equal(page.get('form-status').textContent,'');
});

test('登入後暫存於分頁，重新整理在 10 分鐘內免重新登入，逾時或登出則清除',async t=>{
 const first=await setup(t);const stored=JSON.parse(first.memory.get('admin-session'));assert.equal(stored.token,'test-only-token');
 const fresh=await setup(t,{'admin-session':JSON.stringify({token:'test-only-token',last:Date.now()-60000})});
 assert.equal(fresh.get('account-name').textContent,'test@example.com');assert.equal(fresh.get('status').textContent,'');
 const expired=await setup(t,{'admin-session':JSON.stringify({token:'test-only-token',last:Date.now()-11*60000})});
 assert.equal(expired.get('account-name').textContent,'');assert.equal(expired.memory.has('admin-session'),false);
 await first.get('logout').fire('click');assert.equal(first.memory.has('admin-session'),false);
});
