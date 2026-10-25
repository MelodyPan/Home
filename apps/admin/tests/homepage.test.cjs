const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const model=require('../public/project-model.js');
async function homepage(response,remote=''){
 const notices=[];
 const responses=Array.isArray(response)?[...response]:[response],requests=[];
 class Element{constructor(){this.children=[];this.hidden=false;this.textContent='';}setAttribute(){}append(...nodes){this.children.push(...nodes);}replaceChildren(...nodes){this.children=nodes;}before(node){notices.push(node);}set innerHTML(value){throw Error('不得將作品資料當 HTML 插入');}querySelectorAll(){return this.children.flatMap(child=>child.children?.filter(node=>node.className==='project-index')||[]);}}
 const grid=new Element();grid.children=['原有靜態作品'];
 const context={URL,AbortSignal,location:{protocol:'https:'},PortfolioConfig:{apiBaseUrl:remote},ProjectModel:model,document:{currentScript:{src:'https://home.test/Home/portfolio/projects.js'},querySelector:()=>grid,createElement:()=>new Element()},fetch:async(url)=>{requests.push(String(url));const next=responses.shift();if(next instanceof Error)throw next;return next;}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../public/projects.js'),'utf8'),context);await new Promise(setImmediate);return {grid,notice:notices[0],requests};
}
test('同源雲端 API 出錯時不顯示可能已下架的舊作品，只有未設定 API 的靜態 404 可回退',async()=>{
 for(const response of [new Response('',{status:503}),new Error('offline'),new Response('broken',{status:200})]){const {grid,notice}=await homepage(response);assert.equal(grid.hidden,true);assert.match(notice.textContent,/無法載入/);}
 const staticPage=await homepage([new Response('',{status:404}),Response.json({schemaVersion:1,updatedAt:null,projects:[]})]);assert.equal(staticPage.grid.hidden,false);assert.deepEqual(staticPage.grid.children,[]);assert.equal(staticPage.requests[1],'https://home.test/Home/portfolio/projects.json');
 const remote=await homepage(new Response('',{status:404}),'https://api.test/');assert.equal(remote.grid.hidden,true);
});
test('公開 API 回傳空清單時清除舊作品，作品文字以安全 DOM 顯示',async()=>{
 const empty=await homepage(Response.json({schemaVersion:1,updatedAt:null,projects:[]}));assert.deepEqual(empty.grid.children,[]);assert.equal(empty.grid.hidden,false);
 const row={id:'a',title:'<script>alert(1)</script>',description:'文字',category:'',url:'https://example.com/',linkText:'查看',badge:'01',sortOrder:0,published:true,featured:false,newTab:true};
 const page=await homepage(Response.json({schemaVersion:1,updatedAt:null,projects:[row]}));assert.equal(page.grid.children[0].children[1].textContent,row.title);assert.equal(page.grid.children[0].children[4].rel,'noopener noreferrer');
});
test('所有公開作品依清單順序自動編號',async()=>{
 const make=(id,badge)=>({id,title:id,description:'',category:'',url:'',linkText:'',badge,sortOrder:0,published:true,featured:false,newTab:false});
 const page=await homepage(Response.json({schemaVersion:1,updatedAt:null,projects:[make('a','♡'),make('b','03'),make('c','07')]}));
 assert.deepEqual(page.grid.children.map(article=>article.children[0].textContent),['01','02','03']);
});
test('精選作品在首頁清單置頂，且其餘作品保留原有排序',async()=>{
 const make=(id,sortOrder,featured)=>({id,title:id,description:'',category:'',url:'',linkText:'',badge:'',sortOrder,published:true,featured,newTab:false});
 const page=await homepage(Response.json({schemaVersion:1,updatedAt:null,projects:[make('normal-first',0,false),make('featured-later',5,true),make('normal-later',2,false)]}));
 assert.deepEqual(page.grid.children.map(article=>article.children[1].textContent),['featured-later','normal-first','normal-later']);
 assert.match(page.grid.children[0].className,/\bfeatured\b/);
});
