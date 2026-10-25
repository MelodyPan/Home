const {test}=require('node:test');
const assert=require('node:assert/strict');
const {buildBook}=require('../Javascript/growth-flipbook.js');
const {validate}=require('../scripts/growth-store.cjs');
const child={id:'a',name:'小星',birthday:'2024-06-01'};
const record={id:'r1',childId:'a',date:'2024-01-01',title:'第一次見面',story:'你好',milestone:'',photos:[]};
test('電子書從書封和目錄開始，依孕期及年份分章，保留來源故事索引',()=>{
 const book=buildBook([record,{...record,id:'r2',date:'2024-07-01'},{...record,id:'r3',date:'2025-01-01'}],child);
 assert.deepEqual(book.entries.slice(0,2).map(p=>p.type),['cover','contents']);
 assert.deepEqual(book.chapters.map(c=>c.title),['孕期篇','2024 年成長篇','2025 年成長篇']);
 for(const [i,c] of book.chapters.entries())assert.equal(book.entries.find(e=>e.key===c.key).recordIndex,i);
 assert.equal(buildBook([record],{...child,birthday:''}).chapters[0].title,'孕期篇');
 assert.equal(buildBook([],child).entries.length,2);
});
test('三種排版完整呈現全部照片，封面優先但不改來源順序，延伸頁指向原故事',()=>{
 for(const photoLayout of ['editorial','grid','full']){
  const photos=Array.from({length:20},(_,i)=>'photo-'+i),snapshot=[...photos];
  const book=buildBook([{...record,photos,coverPhoto:photos[7],photoLayout}],child);
  const pages=book.entries.filter(e=>e.recordIndex===0),shown=pages.flatMap(e=>[...e.leftPhotos,...e.rightPhotos]);
  assert.equal(shown[0],photos[7]);assert.equal(shown.length,20);assert.equal(new Set(shown).size,20);assert.deepEqual(photos,snapshot);
  assert.equal(pages[0].type,'story');assert.ok(pages.slice(1).every(e=>e.type==='gallery'));
  assert.ok(new Set(book.entries.map(e=>e.key)).size===book.entries.length);
 }
});
test('新欄位可保存、清除並相容舊資料，拒絕錯誤設定及照片路徑',()=>{
 const cover='12345678-1234-1234-1234-123456789abc.jpg';
 const data={schemaVersion:1,children:[{...child,bookTitle:' 小星的故事 ',bookDedication:'給最愛的你',bookCover:cover}],records:[{...record,photoLayout:'grid'}]};
 const saved=validate(data);assert.equal(saved.children[0].bookTitle,'小星的故事');assert.equal(saved.children[0].bookCover,cover);assert.equal(saved.records[0].photoLayout,'grid');
 assert.equal(validate({...data,children:[child],records:[record]}).children[0].bookTitle,undefined);
 for(const changes of [{bookTitle:'a'.repeat(121)},{bookDedication:'a'.repeat(2001)},{bookCover:'../../photo.jpg'},{bookTitle:5}])assert.throws(()=>validate({...data,children:[{...child,...changes}]}));
 assert.throws(()=>validate({...data,records:[{...record,photoLayout:'unknown'}]}));
 const cleared=validate({...data,children:[{...child,bookTitle:'',bookDedication:'',bookCover:null}]});assert.equal(cleared.children[0].bookCover,undefined);
});
