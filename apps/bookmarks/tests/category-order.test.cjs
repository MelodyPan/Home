const {test}=require('node:test');const assert=require('node:assert/strict');const core=require('../Javascript/bookmark-core.js');const {createDataFile,readDataFile}=require('../Javascript/bookmark-file.js');
test('first-level category order moves both ways and persists without changing bookmarks or subcategories',()=>{
 const c={added:[],deletedIds:[],workSubcategories:[{id:'work-sub-a',name:'院內'}]};const before=JSON.stringify(c);let next=core.moveCategory(c,'work',-1);assert.equal(core.orderedCategories(next)[0].id,'work');assert.equal(JSON.stringify(c),before);assert.deepEqual(next.workSubcategories,c.workSubcategories);
 next=core.moveCategory(next,'work',1);assert.deepEqual(core.orderedCategories(next).map(c=>c.id),core.CATEGORIES.map(c=>c.id));const file=readDataFile(JSON.stringify(createDataFile([],next,[],'2026-10-24T00:00:00Z')));assert.deepEqual(file.changes.categoryOrder,next.categoryOrder);
 assert.deepEqual(core.moveCategory(next,'ai',-1),next);assert.throws(()=>core.moveCategory(next,'invalid',1));assert.throws(()=>core.moveCategory(next,'work',5));
});
test('old files keep default category order and corrupt category order is rejected',()=>{
 const old=createDataFile([],{added:[],deletedIds:[]},[],'2026-10-24T00:00:00Z');assert.deepEqual(core.orderedCategories(readDataFile(JSON.stringify(old)).changes),core.CATEGORIES);
 for(const categoryOrder of [['work','work'],['missing'],null,'work'])assert.throws(()=>readDataFile(JSON.stringify({...old,changes:{...old.changes,categoryOrder}})));
});
