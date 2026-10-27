// Test-only HTTP adapter for legacy validation/locking regressions. Production never imports this.
const http=require('node:http');
const {createGrowthStore}=require('../../scripts/growth-store.cjs');
function createGrowthHandler(root,options={}){
 const store=createGrowthStore(options.dataRoot||root);
 return {handle:async(req,res,state)=>{
  try{return await store.handle(req,res,state);}
  catch(error){res.writeHead(error.status||500,{'Content-Type':'application/json'});res.end(JSON.stringify({error:error.message}));return true;}
 },flush:()=>store.flush()};
}
function createGrowthServer(root,options={}){
 const growth=createGrowthHandler(root,options);
 return http.createServer(async(req,res)=>{if(!await growth.handle(req,res,{stopping:false})){res.writeHead(404);res.end();}});
}
module.exports={createGrowthHandler,createGrowthServer};
