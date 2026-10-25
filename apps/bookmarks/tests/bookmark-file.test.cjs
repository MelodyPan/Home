const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createDataFile,readDataFile}=require('../Javascript/bookmark-file.js');
const {createManualBookmark}=require('../Javascript/bookmark-core.js');
const base=[{id:'a',sourceId:1,title:'原始',url:'https://example.com',folder:'書籤列',domain:'example.com',category:'dev',status:'reachable',code:200,reason:'成功',finalUrl:'https://example.com'}];

test('JSON file restores full source, additions, deletions, category edits and favorites',()=>{
 const added=createManualBookmark({title:'新增',url:'https://example.com',category:'life'},'manual-one',2);
 const changes={added:[added],deletedIds:['a'],categoryOverrides:{'manual-one':'travel'}};
 const data=createDataFile(base,changes,['a','manual-one'],'2026-10-23T00:00:00Z');
 const loaded=readDataFile(JSON.stringify(data));
 assert.deepEqual(loaded.baseEntries,base);
 assert.deepEqual(loaded.changes,changes);
 assert.deepEqual(loaded.favorites,['a','manual-one']);
 assert.equal(data.entries.length,1);assert.equal(data.entries[0].category,'travel');
 assert.equal(data.entries[0].favorite,true);
 assert.equal(data.schemaVersion,1);
});

test('rejects malformed files and invalid fields without silently discarding saved data',()=>{
 const data=createDataFile(base,{added:[],deletedIds:[]},[],'2026-10-23T00:00:00Z');
 for(const value of ['bad',JSON.stringify({...data,schemaVersion:9}),JSON.stringify({...data,baseEntries:[{...base[0],title:12}]}),JSON.stringify({...data,changes:{added:[],deletedIds:[],categoryOverrides:{a:'bad'}}})])assert.throws(()=>readDataFile(value));
});
