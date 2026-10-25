(()=>{
 'use strict';
 const $=id=>document.getElementById(id),form=$('project-form');
 let token='',editor=null,etag='',selectedId=null,formDirty=false,busy=false,clientId='';
 let statusTimer=0;
 // 登入狀態暫存在本分頁：重新整理可延續，閒置 10 分鐘自動登出，操作會重新計時。Google 憑證本身約 1 小時到期，到期後仍需重新登入。
 const IDLE_MS=10*60*1000,SESSION_KEY='admin-session';let lastActive=0,lastSaved=0;
 const store=()=>{try{return globalThis.sessionStorage||null;}catch{return null;}};
 function saveSession(){if(token)store()?.setItem(SESSION_KEY,JSON.stringify({token,last:lastActive}));}
 function clearSession(){store()?.removeItem(SESSION_KEY);}
 function touch(force=false){if(!token)return;lastActive=Date.now();if(force||lastActive-lastSaved>5000){lastSaved=lastActive;saveSession();}}
 function showLoggedOut(){token='';clearSession();$('login-panel').hidden=false;$('workspace').hidden=true;$('logout').hidden=true;$('session-tools').hidden=true;$('account-name').textContent='';globalThis.google?.accounts.id.disableAutoSelect();updateState();}
 function idleCheck(){if(token&&Date.now()-lastActive>=IDLE_MS){showLoggedOut();status('閒置超過 10 分鐘，已自動登出。',false,true);}setTimeout(idleCheck,15000);}
 function restoreSession(){
  try{const saved=JSON.parse(store()?.getItem(SESSION_KEY)||'null');if(saved?.token&&Date.now()-saved.last<IDLE_MS){lastActive=saved.last;signIn(saved.token,true);return true;}}catch{}
  clearSession();return false;
 }
 for(const name of ['pointerdown','keydown','input','scroll'])addEventListener(name,()=>touch(),{passive:true,capture:true});
 const status=(message,error=false,toastOnly=false)=>{for(const id of toastOnly?['status']:['status','form-status']){const node=$(id);if(node){node.textContent=message;node.className=error?'save-feedback error':'save-feedback';}}clearTimeout(statusTimer);statusTimer=setTimeout(()=>{const node=$('status');if(node){node.textContent='';node.className='';}},5000);};
 function changed(){return Boolean(editor?.dirty||formDirty);}
 function updateState(){$('save-state').textContent=changed()?'有未儲存變更':token?'已同步':'尚未登入';$('save-state').classList.toggle('dirty',changed());}
 function guard(){return !changed()||confirm('有尚未儲存的變更，確定要捨棄嗎？');}
 function guardForm(){return !formDirty||confirm('表單內容尚未儲存，確定要捨棄嗎？');}
 async function api(route,options={}){
  const response=await fetch('../api/admin/'+route,{...options,headers:{Authorization:'Bearer '+token,...options.headers},cache:'no-store'});
  const body=await response.json();
  if(!response.ok){
   if(response.status===401){showLoggedOut();}
   throw new Error(body.error||'操作失敗，請重試。');
  }
  return {body,response};
 }
 function resetForm(row){
  form.reset();selectedId=row?.id||null;
  if(row)for(const key of ['title','description','category','linkText','url','published','featured','newTab']){const input=form.elements.namedItem(key);if(input.type==='checkbox')input.checked=row[key];else input.value=row[key];}
  $('form-title').textContent=row?'編輯作品':'新增作品';$('form-error').textContent='';formDirty=false;updateState();
 }
 function render(){
  const list=$('project-list');list.replaceChildren();const rows=editor.rows();
  const keyword=($('filter-text').value||'').trim().toLowerCase(),status=$('filter-status').value||'';
  const matches=row=>(!status||(status==='published'?row.published:status==='hidden'?!row.published:row.featured))&&(!keyword||[row.title,row.description,row.category].some(text=>String(text||'').toLowerCase().includes(keyword)));
  const shown=rows.filter(matches);
  $('empty').hidden=shown.length>0;$('empty').textContent=rows.length?'沒有符合條件的作品。':'還沒有作品，從新增第一筆開始。';
  // 所有公開作品一律依完整清單順序自動編號，篩選不影響編號。
  let serial=0;const shownBadge=row=>row.published?String(++serial).padStart(2,'0'):'';
  rows.forEach((row,index)=>{
   const label=shownBadge(row);if(!matches(row))return;
   const item=document.createElement('li');item.className=[!row.published?'unpublished':'',row.id===selectedId?'selected':''].filter(Boolean).join(' ');
   const heading=document.createElement('div');heading.className='row-title';
   const title=document.createElement('strong');title.textContent=(label?label+'　':'')+row.title;
   if(row.url){try{const link=document.createElement('a');link.href=new URL(row.url,new URL('../',location.href)).href;link.target='_blank';link.rel='noopener noreferrer';link.className='row-link';link.title='另開視窗開啟連結';link.append(...title.childNodes);title.append(link);}catch{}}
   heading.append(title);
   const badge=document.createElement('span');badge.className='badge';badge.textContent=row.published?'已公開':'未公開';heading.append(badge);
   const description=document.createElement('p');description.className='row-description';description.textContent=row.description.length>100?row.description.slice(0,100)+'…':row.description;
   const buttons=document.createElement('div');buttons.className='row-actions';
   const button=(label,action,disabled=false,kind='quiet')=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.className=kind;b.disabled=disabled;b.addEventListener('click',()=>{if(busy)return;action();});buttons.append(b);};
   button('編輯',()=>{if(!guardForm())return;resetForm(row);render();form.elements.title.focus();});
   button('↑ 上移',()=>{if(!guardForm())return;editor.move(row.id,-1);resetForm(null);render();},index===0||rows[index-1].published!==row.published||rows[index-1].featured!==row.featured);
   button('↓ 下移',()=>{if(!guardForm())return;editor.move(row.id,1);resetForm(null);render();},index===rows.length-1||rows[index+1].published!==row.published||rows[index+1].featured!==row.featured);
   button('刪除',()=>{if(!guardForm()||!confirm(`確定刪除「${row.title}」？儲存所有變更後才會生效。`))return;editor.remove(row.id);resetForm(null);render();},false,'danger');
   item.append(heading,description,buttons);list.append(item);
  });updateState();
 }
 function applyForm(){
  if(!form.reportValidity())return false;
  const existing=editor.document.projects.find(row=>row.id===selectedId),row={id:selectedId||crypto.randomUUID(),badge:existing?.badge??'',sortOrder:existing?.sortOrder??Math.max(-1,...editor.rows().map(item=>item.sortOrder))+1};
  for(const key of ['title','description','category','linkText','url','published','featured','newTab']){const input=form.elements.namedItem(key);row[key]=input.type==='checkbox'?input.checked:input.value;}
  try{editor.upsert(row);resetForm(editor.document.projects.find(item=>item.id===row.id));render();return true;}catch(error){$('form-error').textContent=error.message;return false;}
 }
 function setBusy(value){busy=value;for(const id of ['save-all','reload','add','export','logout'])$(id).disabled=value;for(const input of form.elements)input.disabled=value;$('save-all').textContent=value?'儲存中…':'儲存清單變更';const submit=$('save-project');if(submit)submit.textContent=value?'儲存中…':'儲存並更新首頁';}
 // 兩個儲存入口共用同一流程：驗證表單、更新草稿、條件存檔，成功後才標記為已同步。
 async function saveChanges(fromForm=false){
  if(busy||!editor)return;
  if((formDirty||(fromForm&&!selectedId))&&!applyForm())return;
  if(!editor.dirty){status('目前沒有需要儲存的變更。');return;}
  const savedId=selectedId;
  setBusy(true);status('正在儲存，請稍候…');
  try{
   const {body,response}=await api('projects',{method:'PUT',headers:{'Content-Type':'application/json','If-Match':etag},body:JSON.stringify(editor.snapshot())});
   editor.accept(body);etag=response.headers.get('etag');
   const savedRow=editor.document.projects.find(row=>row.id===savedId);
   resetForm(savedRow);render();
   status(savedRow&&!savedRow.published?'已儲存。這件作品已設為不公開，重新整理首頁即可看到更新。':'已儲存。重新整理首頁即可看到更新。');
  }catch(error){status(error.message+' 目前草稿仍保留，可先下載草稿。',true);}finally{setBusy(false);}
 }
 async function load(){const {body,response}=await api('projects');editor=new ProjectEditor(body);etag=response.headers.get('etag');resetForm(null);render();}
 async function signIn(credential,restored=false){
  if(busy)return;setBusy(true);const previous=token;token=credential;
  try{
   const {body:user}=await api('me');$('account-name').textContent=user.email;$('logout').hidden=false;$('session-tools').hidden=false;
   if(editor&&changed()&&previous!==credential){status('已重新登入，草稿已保留。',false,true);}else{await load();if(!restored)status('已登入。選擇作品編輯，或新增作品。',false,true);}
   $('login-panel').hidden=true;$('workspace').hidden=false;touch(true);updateState();
  }catch(error){token='';clearSession();$('login-panel').hidden=false;$('workspace').hidden=true;if(!restored)status(error.message,true,true);}finally{setBusy(false);}
 }
 form.addEventListener('input',()=>{formDirty=true;updateState();});
 form.addEventListener('submit',async event=>{event.preventDefault();await saveChanges(true);});
 $('add').addEventListener('click',()=>{if(guardForm()){resetForm(null);render();form.elements.title.focus();}});
 for(const id of ['filter-text','filter-status'])$(id).addEventListener('input',()=>{if(editor)render();});
 $('cancel-edit').addEventListener('click',()=>{if(guardForm()){resetForm(null);render();}});
 $('reload').addEventListener('click',async()=>{if(!guard())return;setBusy(true);try{await load();status('已載入最新作品。',false,true);}catch(error){status(error.message,true,true);}finally{setBusy(false);}});
 $('save-all').addEventListener('click',()=>saveChanges());
 $('export').addEventListener('click',()=>{if(formDirty&&!applyForm())return;const url=URL.createObjectURL(new Blob([JSON.stringify(editor.snapshot(),null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='projects-draft.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
 $('logout').addEventListener('click',()=>{if(!guard())return;editor=null;etag='';selectedId=null;formDirty=false;form.reset();$('project-list').replaceChildren();showLoggedOut();status('已登出。',false,true);});
 addEventListener('beforeunload',event=>{if(changed()){event.preventDefault();event.returnValue='';}});
 async function init(){
  const remote=globalThis.PortfolioConfig?.apiBaseUrl;
  if(remote&&new URL(remote).origin!==location.origin){location.replace(new URL('admin/',remote.endsWith('/')?remote:remote+'/').href);return;}
  if(location.protocol==='file:'){$('login-note').textContent='請透過 npm start 的網站網址開啟後台。';return;}
  try{
   const response=await fetch('../api/admin/config',{cache:'no-store'});if(!response.ok)throw Error('無法載入後台設定。');const config=await response.json();
   if(!config.configured){$('login-note').textContent='Google 登入尚未設定。請完成 Google Client ID 與管理員帳號設定後，再重新整理。';return;}
   clientId=config.googleClientId;$('login-note').textContent='請選擇授權的 Google 帳號。';
   if(restoreSession())$('login-note').textContent='正在還原登入狀態…';
   const script=document.createElement('script');script.src='https://accounts.google.com/gsi/client';script.async=true;
   script.onload=()=>{google.accounts.id.initialize({client_id:clientId,callback:result=>signIn(result.credential),auto_select:false});google.accounts.id.renderButton($('google-button'),{theme:'outline',size:'large',text:'signin_with',locale:'zh_TW'});};
   script.onerror=()=>{$('login-note').textContent='無法載入 Google 登入，請確認網路後重試。';};document.head.append(script);
  }catch(error){$('login-note').textContent=error.message;}
 }
 init();setTimeout(idleCheck,15000);
})();
