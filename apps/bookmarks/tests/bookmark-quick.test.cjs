const {test}=require('node:test'),assert=require('node:assert/strict');
const {orderedFavorites,moveQuick}=require('../Javascript/bookmark-quick.js');
const {createDataFile,readDataFile}=require('../Javascript/bookmark-file.js');
const {createManualBookmark}=require('../Javascript/bookmark-core.js');
test('favorite order moves, skips removed favorites, and survives Drive JSON round-trip',()=>{
 const entries=['a','b','c'].map((id,index)=>createManualBookmark({title:id,url:'https://example.com/'+id},'manual-'+id,index)),favorites=entries.map(e=>e.id);
 const changes=moveQuick(entries,favorites,{added:entries,deletedIds:[]},'manual-c',-1),restored=readDataFile(JSON.stringify(createDataFile([],changes,favorites,'1970-01-01T00:00:00Z')));
 assert.deepEqual(orderedFavorites(entries,favorites,restored.changes.quickOrder).map(e=>e.id),['manual-a','manual-c','manual-b']);
 assert.deepEqual(orderedFavorites(entries,['manual-b','manual-c'],restored.changes.quickOrder).map(e=>e.id),['manual-c','manual-b']);
});
