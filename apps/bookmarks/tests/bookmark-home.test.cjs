const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {parseBookmarks, classify, selectBookmarks, safeWebUrl, loadFavorites} = require('../Javascript/bookmark-core.js');
const {createManualBookmark,loadLibraryChanges,mergeLibrary} = require('../Javascript/bookmark-core.js');
const {countStatuses} = require('../Javascript/bookmark-core.js');
const {listOriginalFolders} = require('../Javascript/bookmark-core.js');
const {getBookmarkPurpose,countPurposes} = require('../Javascript/bookmark-core.js');
const {updateBookmarkCategory} = require('../Javascript/bookmark-core.js');
const {updateBookmarkStatus} = require('../Javascript/bookmark-core.js');

test('manual URL status overrides survive reload, compose with category edits and restore checked results',()=>{
 const original={id:'status-original',title:'網站',url:'https://example.com/',folder:'書籤列 / 中榮',category:'work',status:'missing',code:404,reason:'HTTP 404'};
 const manual=createManualBookmark({title:'新增',url:'example.com',category:'life'},'manual-status',2);
 let changes={added:[manual],deletedIds:[]};
 changes=updateBookmarkStatus(changes,original,'reachable');
 changes=updateBookmarkStatus(changes,manual,'restricted');
 changes=updateBookmarkCategory(changes,original,'dev');
 const loaded=loadLibraryChanges({getItem(){return JSON.stringify(changes);}});
 assert.equal(loaded.warning,false);
 let rows=mergeLibrary([original],loaded.changes);const edited=rows.find(e=>e.id===original.id);
 assert.equal(edited.status,'reachable');assert.equal(edited.code,0);assert.equal(edited.statusSource,'manual');assert.match(edited.reason,/手動/);assert.equal(edited.category,'dev');
 assert.equal(rows.find(e=>e.id===manual.id).status,'restricted');
 assert.equal(selectBookmarks(rows,{status:'missing'}).length,0);assert.equal(countStatuses(rows).reachable,1);
 assert.equal(original.status,'missing');assert.equal(original.code,404);
 changes=updateBookmarkStatus(changes,original,'original');
 const restored=mergeLibrary([original],changes).find(e=>e.id===original.id);
 assert.equal(restored.status,'missing');assert.equal(restored.code,404);assert.equal(restored.reason,'HTTP 404');
 assert.throws(()=>updateBookmarkStatus(changes,original,'invalid'));
 assert.equal(loadLibraryChanges({getItem(){return JSON.stringify({...changes,statusOverrides:{[original.id]:'invalid'}});}}).warning,true);
});

test('category edits persist for original and manual bookmarks without mutating sources',()=>{
 const base=[{id:'a',title:'網站',folder:'書籤列',category:'dev'}];
 const manual=createManualBookmark({title:'手動',url:'example.com',category:'life'},'manual-edit',2);
 let changes={added:[manual],deletedIds:[]};
 changes=updateBookmarkCategory(changes,base[0],'travel');
 changes=updateBookmarkCategory(changes,manual,'work');
 const loaded=loadLibraryChanges({getItem(){return JSON.stringify(changes);}});
 assert.equal(loaded.warning,false);
 const rows=mergeLibrary(base,loaded.changes);
 assert.equal(rows.find(e=>e.id==='a').category,'travel');
 assert.equal(rows.find(e=>e.id===manual.id).category,'work');
 assert.equal(base[0].category,'dev');assert.equal(manual.category,'life');
 assert.equal(countPurposes(rows).personal,1);
 const reset=updateBookmarkCategory(changes,base[0],'original');
 assert.equal(mergeLibrary(base,reset).find(e=>e.id==='a').category,'dev');
 assert.throws(()=>updateBookmarkCategory(changes,base[0],'invalid'));
 assert.throws(()=>updateBookmarkCategory(changes,{...base[0],folder:'書籤列 / 中榮 / 網站'},'life'));
 const corrupt=loadLibraryChanges({getItem(){return JSON.stringify({...changes,categoryOverrides:{a:'invalid'}});}});
 assert.equal(corrupt.warning,true);
 assert.equal(mergeLibrary(base,corrupt.changes).find(e=>e.id==='a').category,'dev');
});

test('purpose filters compose with folders, status, search and favorites',()=>{
 const rows=[
  {id:'a',title:'筆記',url:'https://a.test',folder:'書籤列 / 中榮 / 私人',category:'life',status:'reachable'},
  {id:'b',title:'筆記',url:'https://b.test',folder:'書籤列 / 生活',category:'life',status:'reachable'},
  {id:'c',title:'開發',url:'https://c.test',folder:'書籤列 / 學習',category:'dev',status:'missing'}
 ];
 assert.equal(getBookmarkPurpose(rows[0]),'work');
 assert.deepEqual(selectBookmarks(rows,{purpose:'personal'}).map(e=>e.id),['b']);
 const state={purpose:'work',originalFolder:'書籤列',status:'reachable',query:'筆記',favoriteOnly:true,favorites:['a','b']};
 assert.deepEqual(selectBookmarks(rows,state).map(e=>e.id),['a']);
 assert.deepEqual(countPurposes(rows,state),{all:2,work:1,personal:1});
 assert.equal(countStatuses(rows,state).all,1);
});

test('original folder filters include descendants but exclude similarly named sibling folders',()=>{
 const rows=[
  {id:'a',title:'Angular',url:'https://a.test',folder:'書籤列 / 中榮',category:'work',status:'reachable'},
  {id:'b',title:'Angular 文件',url:'https://b.test',folder:'書籤列 / 中榮 / Angular網站',category:'dev',status:'missing'},
  {id:'c',title:'其他',url:'https://c.test',folder:'書籤列 / 中榮其他',category:'work',status:'reachable'},
  {id:'d',title:'根目錄',url:'https://d.test',folder:'',category:'other',status:'unknown'}
 ];
 assert.deepEqual(selectBookmarks(rows,{originalFolder:'書籤列 / 中榮'}).map(e=>e.id),['a','b']);
 assert.deepEqual(selectBookmarks(rows,{originalFolder:'書籤列 / 中榮',category:'dev',query:'Angular',status:'missing'}).map(e=>e.id),['b']);
 assert.deepEqual(selectBookmarks(rows,{originalFolder:'__root__'}).map(e=>e.id),['d']);
 assert.equal(countStatuses(rows,{originalFolder:'書籤列 / 中榮',status:'missing'}).all,2);
});
test('original folder options preserve the complete hierarchy and include root and manual additions',()=>{
 assert.equal(typeof listOriginalFolders,'function');
 const rows=[{folder:'書籤列 / 旅遊 / 日本'},{folder:'書籤列 / 旅遊'},{folder:''},{folder:'手動新增'}];
 const folders=listOriginalFolders(rows);
 assert.equal(folders.find(f=>f.value==='書籤列').count,2);
 assert.equal(folders.find(f=>f.value==='書籤列 / 旅遊').count,2);
 assert.equal(folders.find(f=>f.value==='書籤列 / 旅遊 / 日本').count,1);
 assert.equal(folders.find(f=>f.value==='__root__').count,1);
 assert.equal(folders.find(f=>f.value==='手動新增').count,1);
});

test('quick status counts follow category, search and favorites, independently of selected status',()=>{
 assert.equal(typeof countStatuses,'function');
 const entries=[
  {id:'a',title:'Angular guide',url:'https://a.test',folder:'',category:'dev',status:'reachable'},
  {id:'b',title:'Angular old',url:'https://b.test',folder:'',category:'dev',status:'missing'},
  {id:'c',title:'Travel',url:'https://c.test',folder:'',category:'travel',status:'uncertain'},
  {id:'d',title:'Angular new',url:'https://d.test',folder:'',category:'dev',status:'unknown'}
 ];
 const counts=countStatuses(entries,{category:'dev',query:'Angular',status:'reachable'});
 assert.equal(counts.all,3);assert.equal(counts.reachable,1);assert.equal(counts.missing,1);assert.equal(counts.unknown,1);assert.equal(counts.uncertain,0);
 assert.deepEqual(countStatuses(entries,{favoriteOnly:true,favorites:['c']}),{all:1,reachable:0,restricted:0,uncertain:1,missing:0,skipped:0,unknown:0});
 assert.equal(countStatuses(entries,{query:'no such bookmark'}).all,0);
});

test('manual bookmarks validate input, normalize web URLs and honor selected category',()=>{
 assert.equal(typeof createManualBookmark,'function');
 const e=createManualBookmark({title:' 我的連結 ',url:'example.com/a?x=1',category:'travel'},'manual-1',547);
 assert.equal(e.title,'我的連結');assert.equal(e.url,'https://example.com/a?x=1');assert.equal(e.category,'travel');assert.equal(e.status,'unknown');assert.equal(e.folder,'手動新增');
 assert.equal(createManualBookmark({title:'ChatGPT',url:'https://chatgpt.com',category:'auto'},'manual-2',548).category,'ai');
 assert.throws(()=>createManualBookmark({title:' ',url:'https://example.com'},'a',1),/名稱/);
 for(const url of ['javascript:alert(1)','file:///a','ftp://example.com','https://','bad address'])assert.throws(()=>createManualBookmark({title:'test',url},'a',1),/網址/);
});
test('additions and tombstones survive reload, undo restores originals without changing source',()=>{
 assert.equal(typeof mergeLibrary,'function');
 const source=[{id:'original',title:'原始書籤'}];
 const manual=createManualBookmark({title:'新增',url:'example.com',category:'life'},'manual-1',2);
 const changes={added:[manual],deletedIds:['original']};
 const loaded=loadLibraryChanges({getItem(){return JSON.stringify(changes);}});
 assert.equal(loaded.warning,false);assert.deepEqual(mergeLibrary(source,loaded.changes).map(e=>e.id),['manual-1']);
 assert.equal(source.length,1);assert.equal(mergeLibrary(source,{added:[manual],deletedIds:[]}).length,2);
 assert.equal(mergeLibrary(source,{added:[manual],deletedIds:['manual-1']}).length,1);
});
test('corrupt or unavailable library storage cannot execute unsafe URLs or crash the homepage',()=>{
 assert.equal(typeof loadLibraryChanges,'function');
 assert.deepEqual(loadLibraryChanges({getItem(){throw new Error('denied');}}),{changes:{added:[],deletedIds:[]},warning:true});
 assert.equal(loadLibraryChanges({getItem(){return '{broken';}}).warning,true);
 const data=loadLibraryChanges({getItem(){return JSON.stringify({added:[{id:'x',title:'X',url:'javascript:alert(1)',category:'ai'}],deletedIds:[]});}});
 assert.equal(data.changes.added.length,0);assert.equal(data.warning,true);
});

test('preserves 546 synthetic fixture entries, folders, entities and duplicate URLs with stable unique IDs',()=>{
 const source=fs.readFileSync('tests/fixtures/bookmarks-export.html','utf8');
 const rows=parseBookmarks(source);
 assert.equal(rows.length,546);
 assert.equal(new Set(rows.map(x=>x.url)).size,527);
 assert.equal(new Set(rows.map(x=>x.id)).size,546);
 assert.deepEqual(rows,parseBookmarks(source));
 const sample=parseBookmarks('<DL><p><DT><H3>A &amp; B</H3><DL><p><DT><A HREF="https://example.com/?x=1&amp;y=2">&lt;測試&gt;</A></DL><p><DT><A HREF="https://example.com/?x=1&amp;y=2">Again</A></DL>');
 assert.equal(sample[0].title,'<測試>');assert.equal(sample[0].url,'https://example.com/?x=1&y=2');assert.equal(sample[0].folder,'A & B');assert.equal(sample[1].folder,'');assert.notEqual(sample[0].id,sample[1].id);
});
test('classifies by purpose while honoring authoritative 中榮 work folders',()=>{
 assert.equal(classify({title:'三分鐘學泰文 第15課',url:'https://example.com',folder:'書籤列 / 旅遊 / 泰國'}),'language');
 assert.equal(classify({title:'Angular 介紹 - HackMD',url:'https://hackmd.io/a',folder:'書籤列 / 中榮'}),'work');
 assert.equal(classify({title:'門診系統(WEB)',url:'https://net.vghtc.gov.tw/app',folder:'書籤列 / 中榮'}),'work');
 assert.equal(classify({title:'神祕書籤',url:'https://example.com',folder:''}),'other');
});
test('every original bookmark below 中榮 is work regardless of its topic',()=>{
 for(const title of ['兆豐國際商業銀行','Flickr 相簿','Spotify 音樂','Angular 教學','英文學習'])assert.equal(classify({title,url:'https://example.com',folder:'書籤列 / 中榮 / 網站'}),'work');
 assert.equal(classify({title:'Flickr 相簿',url:'https://flickr.com/a',folder:'書籤列 / 中榮其他'}),'design');
 const source=parseBookmarks(fs.readFileSync('tests/fixtures/bookmarks-export.html','utf8')).filter(e=>e.folder.split(' / ').includes('中榮'));
 assert(source.length>0);assert(source.every(e=>classify(e)==='work'));
});
test('combines case insensitive multi-term search, category, status and favorites',()=>{
 const rows=[{id:'a',title:'Angular 教學',url:'https://EXAMPLE.com',folder:'程式 / 前端',category:'dev',status:'reachable'},{id:'b',title:'Angular 工作',url:'https://example.com/b',folder:'工作',category:'work',status:'uncertain'}];
 assert.equal(selectBookmarks(rows,{query:'angular 前端',category:'dev',status:'reachable',favorites:['a'],favoriteOnly:true}).length,1);
 assert.equal(selectBookmarks(rows,{query:'EXAMPLE',category:'work',status:'reachable'}).length,0);
 assert.equal(selectBookmarks(rows,{query:'不存在'}).length,0);
 assert.equal(selectBookmarks(rows,{query:''}).length,2);
});
test('only permits HTTP(S) navigation and handles corrupt or denied favorite storage',()=>{
 assert.equal(safeWebUrl('javascript:alert(1)'),false);assert.equal(safeWebUrl('file:///C:/secret'),false);assert.equal(safeWebUrl('https://example.com'),true);assert.equal(safeWebUrl('http://172.22.1.2/app'),true);
 assert.deepEqual(loadFavorites({getItem(){throw new Error('denied');}}),{ids:[],warning:true});
 assert.deepEqual(loadFavorites({getItem(){return 'broken';}}),{ids:[],warning:true});
 assert.deepEqual(loadFavorites({getItem(){return '["a",8,"a"]';}}),{ids:['a'],warning:false});
});
test('does not treat blog domains ending in .net as developer content',()=>{
 assert.equal(classify({title:'【台中美食】鵝房宮 日式料理',url:'https://peko.pixnet.net/blog/post/123',folder:'書籤列 / 吃'}),'food');
 assert.equal(classify({title:'沖繩6天5夜自由行心得分享',url:'https://trip.pixnet.net/blog/post/456',folder:'書籤列 / 旅遊'}),'travel');
 assert.equal(classify({title:'ASP.NET 與 AJAX 教學',url:'https://dev.pixnet.net/blog/post/789',folder:'書籤列 / 學習'}),'dev');
});
test('recognizes nested language and developer folders with Chrome spacing',()=>{
 assert.equal(classify({title:'測驗服務專區',url:'https://example.com/exam',folder:'書籤列 / 學習 / 英文 / 多益'}),'language');
 assert.equal(classify({title:'Atom',url:'https://atom.io',folder:'書籤列 / 學習 / sublimetext'}),'dev');
});
test('does not interpret ordinary .html article URLs as HTML development',()=>{
 assert.equal(classify({title:'一段海邊散步',url:'https://example.com/trip.html',folder:'書籤列 / 旅遊'}),'travel');
 assert.equal(classify({title:'午餐筆記',url:'https://example.com/lunch.html',folder:'書籤列 / 吃'}),'food');
});
test('ignores blog branding when distinguishing travel from food',()=>{
 assert.equal(classify({title:'泰國清邁第一次騎車就上手! | 【爆肝護士】-美食‧旅行‧玩樂記事',url:'https://example.com/trip',folder:'書籤列 / 旅遊 / 泰國'}),'travel');
});
test('offers every status as a selectable option in the homepage',()=>{
 const html=fs.readFileSync('src/home.html','utf8');
 const select=html.match(/<select id="status-filter">([\s\S]*?)<\/select>/)[1];
 const values=[...select.matchAll(/<option value="([^"]+)"/g)].map(m=>m[1]);
 assert.deepEqual(values,['all','reachable','restricted','uncertain','missing','skipped','unknown']);
});
