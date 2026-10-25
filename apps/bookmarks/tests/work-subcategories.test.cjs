const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createWorkSubcategory,renameWorkSubcategory,removeWorkSubcategory,assignWorkSubcategory,mergeLibrary,selectBookmarks,countStatuses,updateBookmarkCategory,createChromeBookmarkHtml,parseBookmarks}=require('../Javascript/bookmark-core.js');
const {createDataFile,readDataFile}=require('../Javascript/bookmark-file.js');
const {prioritizeWorkSearchResults}=require('../Javascript/bookmark-core.js');
const base=[{id:'a',sourceId:1,title:'院內系統',url:'https://example.com/',folder:'書籤列 / 中榮',domain:'example.com',category:'work',status:'reachable',code:200,reason:'ok',finalUrl:'https://example.com/'},{id:'b',sourceId:2,title:'工作工具',url:'https://example.com/tools',folder:'書籤列',domain:'example.com',category:'work',status:'missing',code:404,reason:'missing',finalUrl:'https://example.com/tools'}];

test('keyword search stably puts work-system bookmarks before other categories',()=>{
 const rows=[{id:'life',category:'life'},{id:'work2',category:'work'},{id:'dev',category:'dev'},{id:'work1',category:'work'},{id:'ai',category:'ai'}];
 assert.deepEqual(prioritizeWorkSearchResults(rows,'bi').map(e=>e.id),['work2','work1','life','dev','ai']);assert.deepEqual(prioritizeWorkSearchResults(rows,' '),rows);assert.equal(rows[0].id,'life');
});

test('users can create, rename and delete work subcategories without deleting bookmarks',()=>{
 const initial={added:[],deletedIds:[]};let changes=createWorkSubcategory(initial,'work-sub-one','院內系統');
 changes=assignWorkSubcategory(changes,base[0],'work-sub-one');changes=renameWorkSubcategory(changes,'work-sub-one','門診系統');
 let rows=mergeLibrary(base,changes);assert.equal(rows[0].workSubcategory,'work-sub-one');assert.equal(rows[0].workSubcategoryName,'門診系統');
 assert.equal(selectBookmarks(rows,{category:'work',workSubcategory:'work-sub-one',status:'reachable',query:'門診'}).length,1);
 assert.deepEqual(selectBookmarks(rows,{workSubcategory:'unassigned'}).map(e=>e.id),['b']);assert.equal(countStatuses(rows,{workSubcategory:'work-sub-one'}).all,1);
 changes=removeWorkSubcategory(changes,'work-sub-one');rows=mergeLibrary(base,changes);assert.equal(rows.length,2);assert(rows.every(e=>!e.workSubcategory));assert.equal(initial.workSubcategories,undefined);
});

test('work subcategory settings survive JSON and invalid definitions cannot be saved',()=>{
 let changes=createWorkSubcategory({added:[],deletedIds:[]},'work-sub-one','院內系統');changes=assignWorkSubcategory(changes,base[0],'work-sub-one');
 const restored=readDataFile(JSON.stringify(createDataFile(base,changes,['a'],'2026-10-23T00:00:00Z')));assert.deepEqual(restored.changes,changes);assert.equal(mergeLibrary(restored.baseEntries,restored.changes)[0].workSubcategoryName,'院內系統');
 assert.throws(()=>createWorkSubcategory(changes,'work-sub-two',' 院內系統 '));assert.throws(()=>createWorkSubcategory(changes,'work-sub-two',' '));assert.throws(()=>renameWorkSubcategory(changes,'missing','名稱'));
 assert.throws(()=>assignWorkSubcategory(changes,{...base[0],category:'life'},'work-sub-one'));assert.throws(()=>assignWorkSubcategory(changes,base[0],'missing'));
 const moved=updateBookmarkCategory(assignWorkSubcategory(changes,base[1],'work-sub-one'),base[1],'dev');assert.equal(mergeLibrary(base,moved)[1].workSubcategory,undefined);
 const invalid={...changes,workSubcategoryAssignments:{a:'missing'}};assert.throws(()=>readDataFile(JSON.stringify(createDataFile(base,invalid,[],'2026-10-23T00:00:00Z'))));
});

test('Chrome export includes customized work subcategory folders',()=>{
 let changes=createWorkSubcategory({added:[],deletedIds:[]},'work-sub-one','院內 <系統>');changes=assignWorkSubcategory(changes,base[0],'work-sub-one');
 const rows=parseBookmarks(createChromeBookmarkHtml(mergeLibrary(base,changes)));assert.equal(rows.length,2);assert.equal(rows[0].folder,'工作用途 / 工作系統 / 院內 <系統>');assert.equal(rows[1].folder,'工作用途 / 工作系統 / 未分類');
});

test('developer subcategories are isolated, sortable, persisted and exported in chosen order',()=>{
 const {moveWorkSubcategory}=require('../Javascript/bookmark-core.js');
 let c=createWorkSubcategory({added:[],deletedIds:[]},'work-sub-w','工具');
 c=createWorkSubcategory(c,'work-sub-d1','工具','dev');c=createWorkSubcategory(c,'work-sub-d2','前端','dev');
 const dev=[{...base[0],id:'d1',category:'dev'},{...base[1],id:'d2',category:'dev'}];
 c=assignWorkSubcategory(c,dev[0],'work-sub-d1');c=assignWorkSubcategory(c,dev[1],'work-sub-d2');
 assert.throws(()=>assignWorkSubcategory(c,base[0],'work-sub-d1'));
 const before=JSON.stringify(c);const sorted=moveWorkSubcategory(c,'work-sub-d2',-1);assert.equal(JSON.stringify(c),before);
 assert.deepEqual(sorted.workSubcategories.filter(s=>s.category==='dev').map(s=>s.id),['work-sub-d2','work-sub-d1']);
 assert.deepEqual(moveWorkSubcategory(sorted,'work-sub-d2',-1),sorted);
 const restored=readDataFile(JSON.stringify(createDataFile(dev,sorted,[],'2026-10-23T00:00:00Z')));
 const rows=mergeLibrary(restored.baseEntries,restored.changes);assert.equal(selectBookmarks(rows,{category:'dev',workSubcategory:'work-sub-d1'}).length,1);
 const exported=parseBookmarks(createChromeBookmarkHtml(rows));assert.equal(exported[0].folder,'工作用途 / 程式開發 / 前端');assert.equal(exported[1].folder,'工作用途 / 程式開發 / 工具');
 assert.equal(mergeLibrary(dev,updateBookmarkCategory(sorted,dev[0],'work'))[0].workSubcategory,undefined);
});

test('work subcategory ordering is independent and older saved definitions still load',()=>{
 const {moveWorkSubcategory}=require('../Javascript/bookmark-core.js');let c=createWorkSubcategory({added:[],deletedIds:[]},'work-sub-a','一');c=createWorkSubcategory(c,'work-sub-dev','開發','dev');c=createWorkSubcategory(c,'work-sub-b','二');const sorted=moveWorkSubcategory(c,'work-sub-a',1);
 assert.deepEqual(sorted.workSubcategories.filter(s=>!s.category).map(s=>s.name),['二','一']);assert.equal(sorted.workSubcategories[1].id,'work-sub-dev');
 assert.deepEqual(readDataFile(JSON.stringify(createDataFile(base,sorted,[],'2026-10-23T00:00:00Z'))).changes.workSubcategories,sorted.workSubcategories);
 assert.throws(()=>moveWorkSubcategory(c,'missing',1));assert.throws(()=>createWorkSubcategory(c,'work-sub-no','不可用','life'));
});
