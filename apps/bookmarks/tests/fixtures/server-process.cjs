// 供跨程序存檔測試使用；不會啟動正式服務或讀取個人資料。
if(typeof process.send==='function'){
 const path=require('node:path'),{createBookmarkServer}=require('../../scripts/server.cjs');
 const {createGrowthHandler}=require('../../../growth/scripts/server.cjs');
 const growth=createGrowthHandler(path.resolve(__dirname,'../../../growth'),{dataRoot:process.argv[2]});
 const server=createBookmarkServer(path.resolve(__dirname,'../..'),{dataRoot:process.argv[2],handleAdditional:growth.handle,flush:growth.flush});
 server.listen(0,'127.0.0.1',()=>process.send({port:server.address().port}));
 process.on('message',message=>{if(message==='close'){server.close(()=>process.disconnect());server.closeIdleConnections();}});
}
