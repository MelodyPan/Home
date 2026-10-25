const {test}=require('node:test');
const assert=require('node:assert/strict');
const {selectBookmarks,countDuplicateUrls,mergeLibrary,updateBookmarkDetails,countStatuses}=require('../Javascript/bookmark-core.js');
const rows=[{id:'a',title:'工作一',url:'https://example.com/path?a=1',category:'work',folder:'書籤列 / 中榮',status:'reachable'},{id:'b',title:'生活二',url:'https://example.com/path?a=1',category:'life',folder:'書籤列',status:'uncertain'},{id:'c',title:'開發三',url:'https://example.com/path?a=2',category:'dev',folder:'書籤列',status:'reachable'},{id:'d',title:'大小寫',url:'https://example.com/Path?a=1',category:'dev',folder:'書籤列',status:'reachable'}];
test('duplicate filter compares exact URLs across the entire live library before other filters',()=>{
 assert.equal(countDuplicateUrls(rows).get(rows[0].url),2);
 assert.deepEqual(selectBookmarks(rows,{duplicatesOnly:true}).map(e=>e.id),['a','b']);
 assert.deepEqual(selectBookmarks(rows,{duplicatesOnly:true,category:'work',query:'一',status:'reachable',favoriteOnly:true,favorites:['a']}).map(e=>e.id),['a']);
 assert.equal(countStatuses(rows,{duplicatesOnly:true}).all,2);
 assert.equal(selectBookmarks(rows,{duplicatesOnly:false}).length,4);
});
test('deleted bookmarks do not count and edited URLs update duplicate membership without removing entries',()=>{
 let c={added:[],deletedIds:['b']};assert.equal(selectBookmarks(mergeLibrary(rows,c),{duplicatesOnly:true}).length,0);
 c={added:[],deletedIds:[]};c=updateBookmarkDetails(c,rows[1],{title:'生活二',url:'https://example.com/different'});const merged=mergeLibrary(rows,c);assert.equal(merged.length,4);assert.equal(selectBookmarks(merged,{duplicatesOnly:true}).length,0);
 assert.equal(countDuplicateUrls([{url:''},{url:''},{url:null}]).size,0);
});
