const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function setup(signedIn=false){
 const elements=new Map();class Element{constructor(){this.textContent='';this.value='';this.options=[];this.listeners={};this.open=false;}addEventListener(name,fn){this.listeners[name]=fn;}replaceChildren(){this.options=[];}append(el){this.options.push(el);}showModal(){this.open=true;}close(){this.open=false;}setAttribute(){} }
 const get=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id);};
 let token,read=0,clear=0,session,now=1000;const events={},callbacks=[],store={reset(){},readPhoto:async()=>new Blob(['photo']),uploadPhoto:async()=>({id:'photo.jpg',fileId:'drive-id'})};
 const context={console,Blob,URL:{createObjectURL:()=> 'blob:test',revokeObjectURL(){}},Date:class extends Date{static now(){return now;}},setInterval:fn=>callbacks.push(fn),setTimeout,clearTimeout,navigator:{onLine:true},confirm:()=>true,Option:Element,document:{getElementById:get,createElement:()=>new Element(),addEventListener(name,fn){events[name]=fn;},querySelectorAll:()=>[],hidden:false},window:{addEventListener(){},sessionStorage:{}},BookmarksConfig:{googleClientId:'test'},BookmarkLogin:{createLoginCache:()=>({read:()=>signedIn?{token:'test-token',expires:1000000,active:1000}:null,clear(){},save(){}})},GrowthData:{validate:value=>structuredClone(value),empty:()=>({schemaVersion:1,children:[],records:[]})},GrowthDrive:{createDriveStore:options=>{token=options.token;return store;}},BookmarkCloud:{createCloudSession:options=>{session={state:{phase:'ready',account:{id:'a'},document:{schemaVersion:1,children:[],records:[]},revision:['old'],libraries:[],heads:[],online:true,pending:0},setOnline(){},connect:async({resume})=>{await options.authorize({resume});options.onChange(session.state);},save:async document=>{session.state.document=document;session.state.phase='error';session.state.error=new Error('failed save');session.state.draft=document;options.onChange(session.state);},disconnect:async()=>{session.state.phase='disconnected';session.state.document=null;options.onChange(session.state);},get hasUnsaved(){return !!this.state.draft;}};session.update=()=>options.onChange(session.state);return session;}}};
 vm.createContext(context);vm.runInContext(fs.readFileSync('Javascript/growth-cloud-ui.js','utf8'),context);const mounted=context.GrowthCloudUI.mount({onDocument:()=>read++,onState(){},onClear:()=>clear++,onPhotos(){},hasEdits:()=>false,getDraft:()=>null});return {mounted,session,get,token,read:()=>read,clear:()=>clear,callbacks,events};
}
test('failed cloud saves reject instead of letting album forms close as if saved',async()=>{
 const view=setup(true);await new Promise(resolve=>setImmediate(resolve));assert.equal(view.mounted.editable,true);
 await assert.rejects(view.mounted.save({schemaVersion:1,children:[],records:[]}),/failed save/);assert.equal(view.session.state.draft.schemaVersion,1);
});

test('album bridge treats open edit dialogs as edits, preventing silent refresh of their baseline',()=>{
 const code=fs.readFileSync('Javascript/growth.js','utf8');
 const expression=code.match(/hasEdits:\(\)=>([^,]+),getDraft/)[1];
 const context={state:{dirty:false,busy:false},$:id=>({open:id==='record-dialog'})};
 vm.createContext(context);assert.equal(vm.runInContext('('+expression+')',context),true);
});
test('unconnected albums never fetch private photos or enable edits',()=>{
 const view=setup();assert.equal(view.mounted.editable,false);assert.equal(view.token(),'');assert.equal(view.mounted.photoUrl('any'), '');assert.equal(view.read(),0);
});

test('activity works with the shared login cache that no longer exposes touch',async()=>{
 const view=setup(true);await new Promise(resolve=>setImmediate(resolve));assert.doesNotThrow(()=>view.events.pointerdown());
});
