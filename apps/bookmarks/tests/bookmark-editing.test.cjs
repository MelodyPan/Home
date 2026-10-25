const {test}=require('node:test');
const assert=require('node:assert/strict');
const core=require('../Javascript/bookmark-core.js');
const {createDataFile,readDataFile}=require('../Javascript/bookmark-file.js');
const {applyCheckResults}=require('../scripts/url-checker.cjs');
const base=[{id:'a',sourceId:1,title:'原名稱',url:'https://example.com/old',domain:'example.com',folder:'書籤列 / 中榮',category:'work',status:'reachable',code:200,reason:'old',finalUrl:'https://example.com/old'},{id:'b',sourceId:2,title:'開發',url:'https://example.org/',domain:'example.org',folder:'書籤列',category:'dev',status:'unknown',code:0,reason:'unknown',finalUrl:'https://example.org/'}];
const stamp='2026-10-23T00:00:00Z';
test('editing titles preserves checks while URL edits invalidate old checks and preserve identity',()=>{
 let c={added:[],deletedIds:[],statusOverrides:{a:'restricted'},urlChecks:{a:{status:'missing',code:404,reason:'404',finalUrl:base[0].url,checkedAt:stamp}}};
 c=core.updateBookmarkDetails(c,base[0],{title:'新名稱',url:base[0].url});assert.equal(core.mergeLibrary(base,c)[0].status,'restricted');
 const current=core.mergeLibrary(base,c)[0];const next=core.updateBookmarkDetails(c,current,{title:'新名稱',url:'new.example.com/page'});
 const file=readDataFile(JSON.stringify(createDataFile(base,next,['a'],stamp)));let row=core.mergeLibrary(file.baseEntries,file.changes)[0];
 assert.equal(row.id,'a');assert.equal(row.folder,base[0].folder);assert.equal(row.category,'work');assert.deepEqual(file.favorites,['a']);assert.equal(row.url,'https://new.example.com/page');assert.equal(row.domain,'new.example.com');assert.equal(row.status,'unknown');assert.equal(row.code,0);assert.equal(next.urlChecks.a,undefined);assert.equal(next.statusOverrides.a,undefined);assert.equal(c.statusOverrides.a,'restricted');
 const oldResults=new Map([[base[0].url,{status:'missing',code:404,reason:'old',finalUrl:base[0].url,checkedAt:stamp}]]);
 row=core.mergeLibrary(file.baseEntries,applyCheckResults(file,oldResults,stamp).changes)[0];assert.equal(row.status,'unknown');
 const newResults=new Map([[row.url,{status:'reachable',code:200,reason:'new',finalUrl:row.url,checkedAt:stamp}]]);assert.equal(core.mergeLibrary(file.baseEntries,applyCheckResults(file,newResults,stamp).changes)[0].status,'reachable');
 assert.equal(core.parseBookmarks(core.createChromeBookmarkHtml([row]))[0].title,'新名稱');
});
test('detail validation rejects unsafe, empty and unknown data while manual additions can be edited',()=>{
 const c={added:[],deletedIds:[]};for(const input of [{title:'',url:base[0].url},{title:'a',url:'javascript:alert(1)'},{title:'a',url:'bad url'},{title:'x'.repeat(201),url:base[0].url}])assert.throws(()=>core.updateBookmarkDetails(c,base[0],input));
 const manual=core.createManualBookmark({title:'手動',url:'https://example.net/',category:'dev'},'manual-one',3);const next=core.updateBookmarkDetails({...c,added:[manual]},manual,{title:'修改手動',url:'https://example.net/new'});assert.equal(core.mergeLibrary(base,next)[0].title,'修改手動');
 const invalid=createDataFile(base,{...c,entryOverrides:{missing:{title:'x'}}},[],stamp);assert.throws(()=>readDataFile(JSON.stringify(invalid)));
});
test('batch classification moves selected entries atomically and enforces work folder rules',()=>{
 let c=core.createWorkSubcategory({added:[],deletedIds:[]},'work-sub-dev','前端','dev');
 const next=core.batchUpdateBookmarkCategories(c,base,['a','b'],'dev','work-sub-dev');let rows=core.mergeLibrary(base,next);assert(rows.every(e=>e.category==='dev'&&e.workSubcategory==='work-sub-dev'));assert.equal(c.categoryOverrides,undefined);
 assert.throws(()=>core.batchUpdateBookmarkCategories(c,base,['a','b'],'life',''));assert.throws(()=>core.batchUpdateBookmarkCategories(c,base,['missing'],'dev',''));assert.throws(()=>core.batchUpdateBookmarkCategories(c,base,[],'dev',''));assert.throws(()=>core.batchUpdateBookmarkCategories(c,base,['b'],'work','work-sub-dev'));
 const restored=readDataFile(JSON.stringify(createDataFile(base,next,[],stamp)));assert.equal(core.mergeLibrary(restored.baseEntries,restored.changes)[0].workSubcategoryName,'前端');
});
