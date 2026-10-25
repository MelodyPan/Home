const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
// 提供時間軸所需的最小 DOM 替身，讓測試執行真正的前端函式，檢查建立的節點與點擊結果。
class Element{constructor(tag){this.tag=tag;this.children=[];this.attributes={};this.textContent='';}replaceChildren(...v){this.children=v;}append(...v){this.children.push(...v);}setAttribute(k,v){this.attributes[k]=String(v);}}
// 隔離每項測試的畫面與狀態；日期格式、照片網址等外部依賴使用固定值，聚焦時間軸行為。
function timeline(){
 const source=fs.readFileSync('Javascript/growth.js','utf8'),elements=new Map();const get=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id);};
 const state={page:0,photo:1,mode:'timeline'},context={state,$:get,document:{createElement:tag=>new Element(tag)},photoUrl:id=>'/photos/'+id,child:()=>({name:'小星',birthday:'2022-01-01'}),ageAt:()=> '2 歲',dateLabel:d=>d.replaceAll('-',' / '),setMode:mode=>state.mode=mode};
 vm.createContext(context);const code=source.match(/function renderTimeline\([\s\S]*?^}/m);assert.ok(code,'必須提供時間軸呈現函式');vm.runInContext(code[0],context);return {get,state,render:context.renderTimeline};
}
const record={id:'r1',date:'2024-06-15',title:'一起過生日',photos:['first.jpg','cover.jpg'],coverPhoto:'cover.jpg'};
// 驗證日期、標題與指定封面皆正確，點選時間點後能定位同一份清單中的故事。
test('timeline displays each date, title and selected cover, linking back to its album page',()=>{
 const view=timeline();view.render([record,{...record,id:'r2',date:'2025-01-01',title:'新的一年'}]);const list=view.get('timeline-list');assert.equal(list.children.length,2);
 const first=list.children[0],date=first.children[0].children[0],card=first.children[1];assert.equal(date.dateTime,'2024-06-15');assert.equal(date.textContent,'2024 / 06 / 15');assert.equal(card.children[0].src,'/photos/cover.jpg');assert.equal(card.children[1].children[0].textContent,'一起過生日');
 list.children[1].children[1].onclick();assert.equal(view.state.mode,'album');assert.equal(view.state.page,1);assert.equal(view.state.photo,null);
});
// 舊紀錄未指定封面時使用第一張；沒有照片的紀錄也要顯示，清空資料時不可殘留上一輪節點。
test('timeline keeps legacy first-photo covers and photo-free records visible',()=>{
 const view=timeline();view.render([{...record,coverPhoto:null},{...record,id:'text',photos:[],coverPhoto:null}]);const rows=view.get('timeline-list').children;
 assert.equal(rows[0].children[1].children[0].src,'/photos/first.jpg');assert.equal(rows[1].children[1].children[0].textContent,'尚未加入照片');
 view.render([]);assert.equal(view.get('timeline-list').children.length,0);
});
// 確認直接預覽另一位孩子會清除舊篩選；儲存進行中不得切換孩子。
test('child preview switches to that child timeline and resets old filters and photo state',()=>{
 const source=fs.readFileSync('Javascript/growth.js','utf8'),elements={year:{value:'2025'},search:{value:'生日'}};let renders=0;
 const state={childId:'a',page:2,photo:3,mode:'manage',busy:false},context={state,$:id=>elements[id],render:()=>renders++};vm.createContext(context);
 vm.runInContext(source.match(/^function selectChild.*$/m)[0],context);
 context.selectChild('b','timeline');assert.equal(state.childId,'b');assert.equal(state.mode,'timeline');assert.equal(state.page,0);assert.equal(state.photo,null);assert.equal(elements.year.value,'all');assert.equal(elements.search.value,'');assert.equal(renders,1);
 state.busy=true;context.selectChild('a','timeline');assert.equal(state.childId,'b');assert.equal(renders,1);
});

// 執行實際篩選與排序函式，驗證孩子隔離、由早到晚排列，以及年份和關鍵字同時生效。
test('timeline source includes only the chosen child, ordered by date with combined filters',()=>{
 const source=fs.readFileSync('Javascript/growth.js','utf8');
 const state={childId:'a',data:{records:[{...record,id:'new',childId:'a',date:'2025-01-01',story:'',milestone:''},{...record,id:'other',childId:'b',date:'2022-01-01',story:'',milestone:''},{...record,id:'old',childId:'a',date:'2024-01-01',story:'',milestone:''}]}};
 const elements={year:{value:'all'},search:{value:''}},context={state,$:id=>elements[id]};vm.createContext(context);
 vm.runInContext(source.match(/^const allRecords=.*$/m)[0]+'\n'+source.match(/^function records\(\).*$/m)[0],context);
 assert.equal(JSON.stringify(context.records().map(r=>r.id)),JSON.stringify(['old','new']));
 elements.year.value='2025';elements.search.value='生日';assert.equal(JSON.stringify(context.records().map(r=>r.id)),JSON.stringify(['new']));
 state.childId='b';assert.equal(context.records().length,0);elements.year.value='all';assert.equal(context.records()[0].id,'other');
});
