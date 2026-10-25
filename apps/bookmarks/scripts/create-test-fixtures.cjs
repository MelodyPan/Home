// 測試只使用合成範例，不依賴或發布使用者的原始書籤匯出檔。
const fs=require('node:fs'),path=require('node:path');
const {createDataFile}=require('../Javascript/bookmark-file.js');
const root=path.join(__dirname,'../tests/fixtures');fs.mkdirSync(root,{recursive:true});
const links=Array.from({length:546},(_,i)=>'<DT><A HREF="https://example.com/bookmark/'+(i%527)+'">範例書籤 '+(i+1)+'</A>');
fs.writeFileSync(path.join(root,'bookmarks-export.html'),'<!DOCTYPE NETSCAPE-Bookmark-file-1><META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8"><DL><p><DT><H3>中榮</H3><DL><p>'+links.join('\n')+'</DL><p></DL><p>');
const entry={id:'fixture-bookmark',sourceId:1,title:'範例網站',url:'https://example.com/',folder:'範例',domain:'example.com',category:'other',status:'unknown',code:0,reason:'尚未檢查',finalUrl:'https://example.com/'};
const data=createDataFile([entry],{added:[],deletedIds:[]},[],'2026-01-01T00:00:00.000Z');data.updatedAt='2026-01-01T00:00:00.000Z';
fs.writeFileSync(path.join(root,'bookmarks-data.json'),JSON.stringify(data,null,2)+'\n');
