// Bookmark contents and unsynced drafts are memory-only.
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.BookmarkCloud=factory();})(globalThis,function(){
 'use strict';
 const error=(code,message)=>Object.assign(new Error(message),{code});
 function createCloudSession({store,authorize,onChange=()=>{},clearAuthorization=()=>{}}){
  const state={phase:'disconnected',account:null,libraries:[],datasetId:null,document:null,draft:null,revision:[],heads:[],error:null,pending:0,online:true};
  let queue=Promise.resolve(),failed=null,draftAccount=null,authorizedAccount=null,busy=false;
  const notify=()=>onChange(state);
  const failure=e=>{if(e.datasetId&&!state.datasetId)state.datasetId=e.datasetId;state.error=e;state.phase=e.code==='conflict'?'conflict':'error';state.heads=e.heads||[];notify();};
  function accept(result){state.datasetId=result.datasetId;state.document=result.document;state.revision=result.revision;state.heads=[];state.error=null;state.phase='ready';}
  function ensureAccount(){if(!state.account||authorizedAccount!==state.account.id)throw error('account','請重新連接原本的 Google 帳號，才能恢復這份草稿。');}
  async function open(datasetId){
   if(state.draft||state.pending)throw error('dirty','請先處理未同步草稿。');ensureAccount();state.phase='loading';state.datasetId=datasetId;state.document=null;notify();
   try{accept(await store.read(datasetId));}catch(e){failure(e);return;}notify();
  }
  async function retry(){
   if(state.pending||busy)return;
   try{ensureAccount();if(!state.online)throw error('network','目前沒有網路連線，請連線後重試。');if(state.phase==='conflict')return;
    const latest=state.draft;if(!latest){if(state.datasetId)await open(state.datasetId);return;}
    busy=true;state.phase='saving';notify();
    const result=failed?.create?await store.create(failed.document):failed?.resolve?await store.resolve(state.datasetId,failed.document,failed.revision):await store.write(state.datasetId,failed?.document||latest,failed?.revision||state.revision);
    failed=null;accept(result);
    if(JSON.stringify(latest)!==JSON.stringify(result.document)){accept(await store.write(state.datasetId,latest,state.revision));}
    state.draft=null;draftAccount=null;
   }catch(e){failure(e);}finally{busy=false;notify();}
  }
  async function connect({resume=false}={}){
   if(state.pending||busy){state.error=error('busy','正在同步，請等待完成後再重新連接。');notify();return;}
   // A new token is not trusted as the previous account until Drive confirms its identity.
   authorizedAccount=null;if(!resume)clearAuthorization();busy=true;state.phase='connecting';notify();
   try{
    await authorize({resume});const account=await store.account();authorizedAccount=account.id;
    if(state.draft&&draftAccount!==account.id){authorizedAccount=null;clearAuthorization();state.document=null;throw error('account','選到其他 Google 帳號；請連接原帳號以恢復未同步草稿。');}
    if(state.account?.id!==account.id){store.reset();state.document=null;state.datasetId=null;state.revision=[];state.heads=[];}
    state.account=account;state.error=null;
    if(state.draft){
     if(state.heads.length){const current=await store.read(state.datasetId);state.heads=current.heads||current.revision.map(id=>({id}));state.phase='conflict';state.error=error('conflict','雲端版本已重新確認；未同步草稿仍保留，請選擇要繼續使用的內容。');notify();return;}
     state.phase='error';busy=false;await retry();return;
    }
    state.libraries=await store.listLibraries();
    if(state.libraries.length===1){busy=false;await open(state.libraries[0].id);return;}
    state.phase=state.libraries.length?'choosing':'empty';state.document=null;
   }catch(e){if(!authorizedAccount){clearAuthorization();state.document=null;}failure(e);}finally{busy=false;notify();}
  }
  function save(document){
   if(!state.online||!['ready','saving'].includes(state.phase)||!state.datasetId||busy)return Promise.resolve();
   try{ensureAccount();}catch(e){failure(e);return Promise.resolve();}
   const snapshot=structuredClone(document);state.draft=snapshot;draftAccount=state.account.id;state.pending++;state.phase='saving';notify();
   const task=queue.then(async()=>{
    if(failed||state.phase==='conflict')return;
    const revision=[...state.revision];
    try{accept(await store.write(state.datasetId,snapshot,revision));if(state.draft===snapshot){state.draft=null;draftAccount=null;}}
    catch(e){failed={document:snapshot,revision};failure(e);}
   }).finally(()=>{state.pending--;if(state.pending&&!failed&&state.phase!=='conflict')state.phase='saving';notify();});
   queue=task.catch(()=>{});return task;
  }
  async function create(document){
   if(busy||state.pending||state.draft||!['empty','choosing'].includes(state.phase))return;
   try{ensureAccount();busy=true;state.phase='saving';state.draft=structuredClone(document);draftAccount=state.account.id;failed={document:state.draft,revision:[],create:true};notify();accept(await store.create(state.draft));failed=null;state.draft=null;draftAccount=null;}
   catch(e){failure(e);}finally{busy=false;notify();}
  }
  async function replace(document){
   if(busy||state.pending||state.draft||state.phase!=='ready'||!state.online)return;
   try{ensureAccount();busy=true;state.phase='saving';state.draft=structuredClone(document);draftAccount=state.account.id;failed={document:state.draft,revision:[...state.revision]};notify();accept(await store.write(state.datasetId,state.draft,state.revision));failed=null;state.draft=null;draftAccount=null;}
   catch(e){failure(e);}finally{busy=false;notify();}
  }
  async function resolve(headId){
   if(busy||state.pending||state.phase!=='conflict')return;
   try{ensureAccount();busy=true;const expected=state.heads.map(x=>x.id).sort();state.phase='saving';notify();
    const choice=headId==='draft'?state.draft:(await store.readHead(state.datasetId,headId)).document;
    if(!choice)throw error('invalid','找不到可採用的草稿。');
    state.draft=structuredClone(choice);draftAccount=state.account.id;failed={document:state.draft,revision:expected,resolve:true};
    const result=await store.resolve(state.datasetId,choice,expected);accept(result);state.draft=null;draftAccount=null;failed=null;
   }catch(e){failure(e);}finally{busy=false;notify();}
  }
  async function refresh(){if(busy||state.pending||state.draft||state.phase!=='ready'||!state.online)return;try{await open(state.datasetId);}catch(e){failure(e);}}
  async function disconnect({discard=false}={}){
   if(state.pending||busy)throw error('busy','正在同步，請等待完成。');
   if(state.draft&&!discard)throw error('dirty','尚有未同步草稿，請先下載備份或重試。');
   clearAuthorization();store.reset();failed=null;authorizedAccount=null;draftAccount=null;
   Object.assign(state,{phase:'disconnected',account:null,libraries:[],datasetId:null,document:null,draft:null,revision:[],heads:[],error:null,pending:0});notify();
  }
  return {state,connect,open,create,replace,save,retry,refresh,resolve,disconnect,setOnline(value){state.online=value;notify();},get hasUnsaved(){return !!state.draft||state.pending>0||busy&&state.phase==='saving';}};
 }
 return {createCloudSession};
});
