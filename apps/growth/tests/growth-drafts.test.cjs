const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
// 以最小 DOM 邊界執行實際草稿函式，確認封面操作更新狀態且不改變照片順序。
class Element{
 constructor(){this.children=[];this.attributes={};this._text='';}
 set textContent(value){this._text=value;this.children=[];}get textContent(){return this._text;}
 replaceChildren(...children){this.children=children;}append(...children){this.children.push(...children);}
 setAttribute(key,value){this.attributes[key]=String(value);}
}
function drafts(photos){
 const container=new Element(),revoked=[];const state={draft:photos,coverDraft:null,dirty:false,busy:false};
 const context={state,document:{createElement:()=>new Element()},$:()=>container,URL:{revokeObjectURL:value=>revoked.push(value)}};
 vm.createContext(context);const source=fs.readFileSync('Javascript/growth.js','utf8');
 vm.runInContext(source.match(/^function actionButton.*$/m)[0],context);
 vm.runInContext(source.match(/function renderDraft\([\s\S]*?^}/m)[0],context);
 const button=(row,type)=>container.children[row].children.find(el=>el.className===type);
 return {state,container,revoked,render:context.renderDraft,button};
}
// 封面選擇只更新照片物件參照及未儲存狀態，不改變照片順序。
test('choosing a cover preserves photo order and marks the form as unsaved',()=>{
 const a={id:'a',preview:'/a'},b={id:'b',preview:'/b'},view=drafts([a,b]);view.render();assert.equal(view.state.coverDraft,a);
 view.button(1,'set-cover').onclick();assert.equal(view.state.coverDraft,b);assert.deepEqual(view.state.draft.map(p=>p.id),['a','b']);assert.equal(view.button(1,'set-cover').attributes['aria-pressed'],'true');assert.equal(view.button(0,'set-cover').attributes['aria-pressed'],'false');assert.equal(view.state.dirty,true);
});
// 移除目前封面時退回剩餘第一張；最後一張也移除後，封面狀態必須回到 null。
test('removing the cover falls back to the remaining photo and releases only local previews',()=>{
 const a={id:'a',preview:'/a'},b={preview:'blob:photo'},view=drafts([a,b]);view.render();view.button(1,'set-cover').onclick();view.button(1,'remove-photo').onclick();assert.equal(view.state.coverDraft,a);assert.deepEqual(view.revoked,['blob:photo']);
 view.button(0,'remove-photo').onclick();assert.equal(view.state.coverDraft,null);assert.equal(view.state.draft.length,0);assert.deepEqual(view.revoked,['blob:photo']);
});
// 模擬上傳鎖定期間點擊，確認不能更換封面或刪除正在處理的照片。
test('saving cannot change the cover or remove photos while an upload is in progress',()=>{
 const a={id:'a',preview:'/a'},b={id:'b',preview:'/b'},view=drafts([a,b]);view.render();view.state.busy=true;view.button(1,'set-cover').onclick();view.button(0,'remove-photo').onclick();assert.equal(view.state.coverDraft,a);assert.equal(view.state.draft.length,2);assert.equal(view.state.dirty,false);
});
