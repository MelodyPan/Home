const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createChromeBookmarkHtml,parseBookmarks,mergeLibrary,createManualBookmark}=require('../Javascript/bookmark-core.js');

test('Chrome export uses Netscape HTML and current purpose/category folders without deleted bookmarks',()=>{
 const source=[{id:'a',title:'開發文件',url:'https://example.com/dev',folder:'原始資料夾',category:'dev'},{id:'b',title:'刪除',url:'https://example.com/deleted',folder:'',category:'life'},{id:'c',title:'旅遊',url:'https://example.com/trip',folder:'',category:'travel'},{id:'d',title:'中榮文件',url:'https://example.com/work',folder:'書籤列 / 中榮',category:'work'}];
 const added=createManualBookmark({title:'手動新增',url:'https://example.com/new',category:'food'},'manual-export',5);
 const entries=mergeLibrary(source,{added:[added],deletedIds:['b'],categoryOverrides:{a:'finance'}});
 const html=createChromeBookmarkHtml(entries);assert.match(html,/<!DOCTYPE NETSCAPE-Bookmark-file-1>/);assert.match(html,/charset=UTF-8/);
 const rows=parseBookmarks(html);assert.equal(rows.length,4);assert(!rows.some(e=>e.title==='刪除'));
 assert.equal(rows.find(e=>e.title==='開發文件').folder,'生活 / 投資理財');assert.equal(rows.find(e=>e.title==='中榮文件').folder,'工作用途 / 工作系統');assert.equal(rows.find(e=>e.title==='手動新增').folder,'生活 / 美食口袋');
 assert.deepEqual(rows.map(e=>e.title+'|'+e.url).sort(),entries.map(e=>e.title+'|'+e.url).sort());
});

test('Chrome export escapes titles and URLs, preserves duplicates and supports empty lists',()=>{
 const title='<script>alert("test")</script> & 中文';const url='https://example.com/?q="one"&x=<two>';
 const entries=[{title,url,category:'life',folder:''},{title,url,category:'life',folder:''}];
 const html=createChromeBookmarkHtml(entries);assert(!html.includes('<script>'));assert(html.includes('&lt;script&gt;'));assert(html.includes('&quot;one&quot;&amp;x=&lt;two&gt;'));
 const rows=parseBookmarks(html);assert.equal(rows.length,2);assert(rows.every(e=>e.title===title&&e.url===url));assert.deepEqual(parseBookmarks(createChromeBookmarkHtml([])),[]);
});
