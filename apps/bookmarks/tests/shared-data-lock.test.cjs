const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),{fork}=require('node:child_process');
test('兩個獨立程序同時保存同一版本的相簿，只有一筆成功且另一筆回報衝突',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'shared-data-'));await fs.mkdir(path.join(root,'assets'));
 const processes=[];t.after(async()=>{for(const child of processes)child.kill();await Promise.all(processes.map(child=>new Promise(resolve=>child.exitCode!==null?resolve():child.once('exit',resolve))));await fs.rm(root,{recursive:true,force:true});});
 async function start(){const child=fork(path.join(__dirname,'fixtures/server-process.cjs'),[root],{stdio:['ignore','ignore','inherit','ipc'],windowsHide:true});processes.push(child);const message=await new Promise((resolve,reject)=>{child.once('message',resolve);child.once('error',reject);child.once('exit',code=>reject(new Error('child exit '+code)));});return 'http://127.0.0.1:'+message.port;}
 const origins=await Promise.all([start(),start()]);
 for(const endpoint of ['/api/growth']){
  for(let round=0;round<4;round++){
   const read=await fetch(origins[0]+(endpoint==='/api/bookmarks'?'/assets/bookmarks-data.txt':endpoint)),data=await read.json(),tag=read.headers.get('etag');
   const responses=await Promise.all(origins.map((origin,i)=>{const next=structuredClone(data);if(endpoint==='/api/bookmarks')next.checkedAt='2026-01-0'+(i+1)+'T00:00:00.000Z';else next.children=[{id:'child-'+i,name:'孩子'+i,birthday:''}];return fetch(origin+endpoint,{method:'PUT',headers:{Origin:origin,'Content-Type':'application/json','If-Match':tag},body:JSON.stringify(next)});}));
   assert.deepEqual(responses.map(r=>r.status).sort(),[200,409],endpoint+' round '+round);
  }
 }
});
