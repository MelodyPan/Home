const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('Javascript/growth.js','utf8');
class Element{constructor(){this.children=[];this.attributes={};this._text='';}set textContent(v){this._text=v;this.children=[];}get textContent(){return this._text;}replaceChildren(...v){this.children=v;}append(...v){this.children.push(...v);}setAttribute(k,v){this.attributes[k]=String(v);}removeAttribute(k){delete this[k];}}
// 各測試建立獨立的 DOM 與狀態容器，避免上一項測試的圖片或事件影響下一項。
function context(extra={}){const elements=new Map();const get=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id);};const c={GrowthMetrics:require('../Javascript/growth-metrics.js'),$:get,document:{createElement:()=>new Element()},...extra};vm.createContext(c);return {c,get};}
// 擷取並執行專案內實際函式，不在測試中重寫功能，讓正式程式的回歸能被偵測。
function load(c,name){const code=source.match(new RegExp('function '+name+'\\([^]*?^}', 'm'))[0];vm.runInContext(code,c);}
// 確認相簿初次進入優先顯示封面，但手動選其他照片後不會被強制切回封面。
test('album first displays the selected cover while allowing another photo to be viewed',()=>{
 const record={date:'2024-01-01',title:'生日',story:'故事',milestone:'生日',photos:['a.jpg','b.jpg'],coverPhoto:'b.jpg'};
 const state={page:0,photo:null},view=context({state,records:()=>[record],child:()=>({name:'小星',birthday:'2022-01-01'}),photoUrl:id=>'/photos/'+id,ageAt:()=>'',dateLabel:d=>d});
 load(view.c,'renderBook');view.c.renderBook();assert.equal(view.get('album-photo').src,'/photos/b.jpg');assert.equal(state.photo,1);
 view.get('photo-thumbs').children[0].onclick();assert.equal(view.get('album-photo').src,'/photos/a.jpg');assert.equal(state.photo,0);
 delete record.coverPhoto;state.photo=null;view.c.renderBook();assert.equal(view.get('album-photo').src,'/photos/a.jpg');
});
// 確認大頭貼顯示照片，未設定或讀取失敗時退回孩子名字的第一個字。
test('avatar display uses the photo and falls back to the name when absent or unreadable',()=>{
 const view=context({photoUrl:id=>'/photos/'+id});load(view.c,'fillAvatar');const avatar=new Element();
 view.c.fillAvatar(avatar,{name:'小星'});assert.equal(avatar.textContent,'小');
 view.c.fillAvatar(avatar,{name:'小星',avatar:'avatar.jpg'});assert.equal(avatar.children[0].src,'/photos/avatar.jpg');avatar.children[0].onerror();assert.equal(avatar.textContent,'小');assert.equal(avatar.children.length,0);
});
// 驗證只釋放 blob 暫存預覽，不對已保存照片網址執行釋放，關閉後清除草稿狀態。
test('closing or replacing avatar drafts releases blob previews but keeps saved photos',()=>{
 const revoked=[],state={avatarDraft:{preview:'blob:old'}};const view=context({state,URL:{revokeObjectURL:url=>revoked.push(url)}});load(view.c,'renderChildAvatar');load(view.c,'setChildAvatar');view.get('child-name').value='小星';
 view.c.setChildAvatar({id:'saved.jpg',preview:'/photos/saved.jpg'});assert.deepEqual(revoked,['blob:old']);assert.equal(view.get('child-avatar-preview').src,'/photos/saved.jpg');
 view.c.setChildAvatar(null);assert.deepEqual(revoked,['blob:old']);assert.equal(view.get('child-avatar-preview').hidden,true);assert.equal(view.get('child-avatar-placeholder').textContent,'小');assert.equal(state.avatarDraft,null);
});

test('書封草稿可預覽更換及移除，釋放 blob 而不刪除既有照片',()=>{
 const revoked=[],state={bookCoverDraft:{preview:'blob:old-cover'}},view=context({state,URL:{revokeObjectURL:url=>revoked.push(url)}});
 load(view.c,'setBookCover');view.c.setBookCover({id:'saved.jpg',preview:'/photos/saved.jpg'});
 assert.deepEqual(revoked,['blob:old-cover']);assert.equal(view.get('child-book-cover-preview').src,'/photos/saved.jpg');assert.equal(view.get('child-book-cover-preview').hidden,false);
 view.c.setBookCover(null);assert.deepEqual(revoked,['blob:old-cover']);assert.equal(view.get('child-book-cover-preview').hidden,true);assert.equal(view.get('remove-book-cover').hidden,true);assert.equal(state.bookCoverDraft,null);
});
