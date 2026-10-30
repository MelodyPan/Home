const {test}=require('node:test');
const assert=require('node:assert/strict');
const {TurnState}=require('../Javascript/growth-flipbook.js');
const fs=require('node:fs'),vm=require('node:vm');

test('電子書：第一頁不能往前、最後一頁不能往後，翻完才更新頁碼',()=>{
 const book=new TurnState();book.reset(3,0);
 assert.equal(book.start(-1),false);assert.equal(book.start(1),true);
 assert.equal(book.index,0);assert.equal(book.target,1);
 book.finish(true);assert.equal(book.index,1);
 book.start(1);book.finish(true);assert.equal(book.index,2);
 assert.equal(book.start(1),false);
});
test('電子書：拖曳進度限制在紙張範圍，取消拖曳保留原頁',()=>{
 const book=new TurnState();book.reset(3,1);book.start(-1);
 book.move(2);assert.equal(book.progress,1);book.move(-1);assert.equal(book.progress,0);
 book.move(.3);book.finish(false);assert.equal(book.index,1);assert.equal(book.turn,0);
 book.start(-1);book.finish(true);assert.equal(book.index,0);
});
test('電子書：快速重複翻頁不會跳頁；換孩子或篩選時取消舊翻頁',()=>{
 const book=new TurnState();book.reset(5,2);book.start(1);
 assert.equal(book.start(1),false);assert.equal(book.start(-1),false);
 book.reset(2,0);book.finish(true);assert.equal(book.index,0);assert.equal(book.turn,0);
 book.reset(0,10);assert.equal(book.start(1),false);assert.equal(book.index,0);
 book.reset(2,20);assert.equal(book.index,1);
});

// 最小 DOM 邊界替身：執行正式模組的節點建立、指標事件與動畫完成流程，不複製實作。
class Element {
 constructor(tag){this.tag=tag;this.children=[];this.attributes={};this.events={};this.style={};this.captured=new Set();}
 append(...items){this.children.push(...items);}
 replaceChildren(...items){this.children=items;}
 replaceChild(next,old){this.children[this.children.indexOf(old)]=next;}
 setAttribute(key,value){this.attributes[key]=value;}
 addEventListener(name,handler){this.events[name]=handler;}
 showModal(){this.open=true;}
 close(){this.open=false;}
 closest(){return null;}
 getBoundingClientRect(){return {left:0,width:800};}
 setPointerCapture(id){this.captured.add(id);}
 hasPointerCapture(id){return this.captured.has(id);}
 releasePointerCapture(id){this.captured.delete(id);}
 animate(){let resolve,reject;const finished=new Promise((a,b)=>{resolve=a;reject=b;});const animation={finished,resolve,cancel:()=>reject(new Error('cancelled'))};this.pending=animation;return animation;}
}
function fixture({mobile=false,reduced=true,magazine=false}={}){
 const elements=new Map(),root=new Element(),changes=[];
 root.querySelector=selector=>{if(!elements.has(selector))elements.set(selector,new Element());return elements.get(selector);};
 const media={mobile:{matches:mobile,addEventListener(){}},reduced:{matches:reduced,addEventListener(){}}};
 const context={document:{createElement:tag=>new Element(tag)},matchMedia:query=>query.includes('650')?media.mobile:media.reduced};
 vm.createContext(context);vm.runInContext(fs.readFileSync('Javascript/growth-flipbook.js','utf8'),context);
 const view=new context.GrowthFlipbook.Flipbook(root,{magazine,photoUrl:id=>'/photos/'+id,ageAt:()=> '2 歲',onChange:i=>changes.push(i)});
 const records=[{id:'a',date:'2024-01-01',title:'生日 <script>',photos:['first','cover'],coverPhoto:'cover',story:'好多回憶',milestone:'兩歲'},
 {id:'b',date:'2024-02-01',title:'文字故事',photos:[],story:'沒有照片也能珍藏'}];
 view.setRecords(records,0,{name:'小星',birthday:'2022-01-01'});
 return {view,records,changes,media};
}
test('電子書呈現指定封面與純文字故事；無照片仍可閱讀，左右鍵停在正確邊界',()=>{
 const {view,changes}=fixture();const spread=view.stage.children[0];
 assert.equal(spread.children[0].children[1].children[0].src,'/photos/cover');
 assert.equal(spread.children[1].children[2].textContent,'生日 <script>');
 view.stage.events.keydown({key:'ArrowRight',target:view.stage,preventDefault(){}});
 assert.equal(view.model.index,1);assert.equal(view.next.disabled,true);assert.deepEqual(changes,[1]);
 assert.equal(view.stage.children[0].children[0].children[1].children[0].textContent,'♡');
 view.turn(1);assert.equal(changes.length,1);view.previous.onclick();assert.equal(view.model.index,0);
});
test('寬螢幕翻動獨立紙張，動畫完成才換頁，切孩子會取消舊動畫',async()=>{
 const {view,records,changes}=fixture({reduced:false});view.turn(1);
 assert.equal(view.leaf.children.length,2);assert.equal(view.leaf.children[0].children[0].className,'flipbook-paper flipbook-story');
 assert.equal(view.leaf.children[1].children[0].className,'flipbook-paper flipbook-photo');
 assert.equal(view.model.index,0);view.leaf.pending.resolve();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(view.model.index,1);assert.deepEqual(changes,[1]);
 view.turn(-1);view.setRecords([records[1]],0,{name:'另一位孩子',birthday:'2022-01-01'});await new Promise(resolve=>setImmediate(resolve));
 assert.equal(view.model.index,0);assert.equal(view.leaf,null);assert.deepEqual(changes,[1]);
});
test('手機翻動整張直式頁；拖曳不足回原頁，取消手勢及垂直捲動不翻頁',()=>{
 const {view}=fixture({mobile:true});
 const event=(x,y=20)=>({button:0,isPrimary:true,pointerId:1,clientX:x,clientY:y,target:view.stage});
 view.pointerDown(event(790));view.pointerMove(event(710));assert.equal(view.model.progress,.1);
 assert.match(view.leaf.className,/is-mobile/);assert.equal(view.leaf.children[0].children[0].className,'flipbook-spread');
 view.pointerEnd(event(710),false);assert.equal(view.model.index,0);assert.equal(view.stage.hasPointerCapture(1),false);
 view.pointerDown(event(790));view.pointerMove(event(400));view.pointerEnd(event(400),true);assert.equal(view.model.index,0);
 view.pointerDown(event(790));view.pointerMove(event(785,60));view.pointerEnd(event(785,60),false);assert.equal(view.model.index,0);
 view.pointerDown(event(790));view.pointerMove(event(400));view.pointerEnd(event(400),false);assert.equal(view.model.index,1);
});

test('完整前端載入後，可從時間軸切換電子書，再回到同一段手帳故事',async()=>{
 const nodes=new Map(),elements=()=>new Element();
 const get=id=>{if(!nodes.has(id)){const el=elements();el.value='';el.classList={toggle(){},add(){},remove(){}};el.removeAttribute=name=>delete el[name];el.querySelector=selector=>get(id+selector);nodes.set(id,el);}return nodes.get(id);};
 const data={children:[{id:'child-a',name:'小星',birthday:'2024-06-01'},{id:'child-b',name:'小月',birthday:''}],records:[
  {id:'1',childId:'child-a',date:'2024-01-01',title:'第一段故事',story:'',milestone:'',photos:[],heightCm:52.5,weightKg:3.125},
  {id:'2',childId:'child-a',date:'2025-01-01',title:'第二段故事',story:'',milestone:'',photos:['second']},
  {id:'3',childId:'child-b',date:'2025-02-01',title:'另一位孩子',story:'',milestone:'',photos:[]}
 ]};
 const context={structuredClone,GrowthData:{empty:()=>({schemaVersion:1,children:[],records:[]})},GrowthCloudUI:{mount({onDocument,onState}){setImmediate(()=>{onState({editable:true});onDocument(data);});return {photoUrl:id=>'/photos/'+id,save:async next=>next,hasUnsaved:false};}},document:{getElementById:get,createElement:elements,createElementNS:elements,querySelectorAll:()=>[]},Option:function(text,value){this.text=text;this.value=value;},
  matchMedia:()=>({matches:true,addEventListener(){}}),window:{addEventListener(){}},location:{protocol:'http:'},
  fetch:async()=>({ok:true,json:async()=>data,headers:{get:()=> 'revision'}})};
 vm.createContext(context);
 vm.runInContext(fs.readFileSync('Javascript/growth-flipbook.js','utf8'),context);
 vm.runInContext(fs.readFileSync('Javascript/growth-metrics.js','utf8'),context);
 vm.runInContext(fs.readFileSync('Javascript/growth-reference.js','utf8'),context);
 vm.runInContext(fs.readFileSync('Javascript/growth.js','utf8'),context);
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(get('status').hidden,true);assert.equal(get('story-title').textContent,'第一段故事');
 assert.match(get('story-age').textContent,/出生前/);
 // 從數字明細編輯同一筆故事，清除體重並更新身高；再讀畫面確認主程式確實送出了量測欄位。
 get('metrics-tab').onclick();assert.equal(get('metrics-view').hidden,false);
 get('metrics-view').children[2].children[0].children[2].children[0].children[4].children[0].onclick();
 assert.equal(get('record-height').value,52.5);assert.equal(get('record-weight').value,3.125);
 get('record-height').value='53.2';get('record-weight').value='';
 get('record-photo-layout').value='grid';
 get('record-form').events.submit({preventDefault(){}});await new Promise(resolve=>setImmediate(resolve));
 assert.equal(get('record-error').textContent,'');assert.equal(get('story-measurements').textContent,'身高 53.2 cm');
 assert.equal(get('metrics-view').children[1].children[0].children[0].children[1].textContent,'53.2 cm');
 get('year').value='2025';get('year').onchange();assert.match(get('metrics-view').children[2].textContent,/新增或編輯/);
 get('search').value='第一段';get('search').oninput();assert.equal(get('metrics-view').hidden,true);assert.equal(get('empty').hidden,false);
 get('preview-child').onclick();assert.equal(get('timeline-view').hidden,false);
 assert.match(get('timeline-list').children[0].children[0].children[1].textContent,/出生前/);
 get('ebook-tab').onclick();assert.equal(get('timeline-view').hidden,true);assert.equal(get('ebook-view').hidden,false);
 assert.equal(get('ebook-view[data-book-count]').textContent,'1 / 4 跨頁');
 get('ebook-view[data-book-next]').onclick();get('ebook-view[data-book-next]').onclick();get('ebook-view[data-book-next]').onclick();get('ebook-open-story').onclick();
 assert.equal(get('story-title').textContent,'第二段故事');assert.equal(get('album-view').hidden,false);
 get('ebook-tab').onclick();get('child-select').onchange({target:{value:'child-b'}});
 assert.equal(get('ebook-title').textContent,'小月的成長電子書');assert.equal(get('ebook-view[data-book-count]').textContent,'1 / 3 跨頁');
 assert.match(get('child-summary').textContent,/生日待補/);
 get('ebook-view[data-book-next]').onclick();get('ebook-view[data-book-next]').onclick();
 assert.equal(get('ebook-view.flipbook-stage').children[0].children[1].children[1].textContent,'還在肚子裡 的你');
 // 從電子書編輯書封，保存後仍是同一位孩子的書，不影響其他故事及孕期狀態。
 get('ebook-settings').onclick();assert.equal(get('child-book-title').value,'');
 get('child-book-title').value='小月的奇妙旅程';get('child-book-dedication').value='最愛的你';
 get('child-growth-sex').value='female';
 get('child-form').events.submit({preventDefault(){}});await new Promise(resolve=>setImmediate(resolve));
 assert.equal(get('child-error').textContent,'');get('ebook-view[data-book-cover]').onclick();
 get('ebook-settings').onclick();assert.equal(get('child-growth-sex').value,'female');
 assert.equal(get('ebook-view.flipbook-stage').children[0].children[1].children[1].textContent,'小月的奇妙旅程');
 get('search').value='沒有符合';get('search').oninput();assert.equal(get('ebook-view').hidden,true);assert.equal(get('empty').hidden,false);
});

test('雜誌書封、目錄跳頁與照片續頁共用翻頁引擎，保留原故事映射並取消舊動畫',async()=>{
 const {view,records,changes}=fixture({magazine:true,reduced:false});
 const child={name:'小星',birthday:'2024-01-01',bookTitle:'星星的旅行',bookDedication:'給你 <b>好多愛</b>',bookCover:'book-cover'};
 const story={...records[0],photos:['a','b','c','d','e','f','g','h'],coverPhoto:'e'};
 view.setRecords([story,records[1]],0,child,'cover');
 assert.equal(view.model.index,0);assert.equal(view.stage.children[0].children[0].children[0].src,'/photos/book-cover');
 assert.equal(view.stage.children[0].children[1].children[1].textContent,'星星的旅行');
 view.turn(1);const pending=view.leaf.pending;
 view.jump('gallery-a-3');assert.equal(view.model.index,3);assert.equal(changes.at(-1),0);await new Promise(resolve=>setImmediate(resolve));
 pending.resolve();await new Promise(resolve=>setImmediate(resolve));assert.equal(view.model.index,3);
 const spread=view.stage.children[0];assert.equal(spread.children[0].children[2].children.length,3);assert.equal(spread.children[1].children[2].children.length,2);
 view.jump('contents');assert.equal(view.model.index,1);assert.equal(changes.at(-1),null);
 view.contents.children[0].onclick();assert.equal(view.model.index,2);assert.equal(changes.at(-1),0);
 view.jump('cover');view.mobile.matches=true;view.refresh();assert.equal(view.model.index,0);
 view.setRecords([],0,child,'story-a');assert.equal(view.stage.children.length,0);
});
