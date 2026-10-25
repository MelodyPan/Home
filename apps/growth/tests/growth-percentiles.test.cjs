const {test}=require('node:test'),assert=require('node:assert/strict');
const metrics=require('../Javascript/growth-metrics.js'),reference=require('../Javascript/growth-reference.js');
const {validate}=require('../scripts/growth-store.cjs');
const fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
test('年齡以完整日曆月及該月份內比例計算，出生當天、生日及閏日均精確定位',()=>{
 assert.equal(metrics.ageMonths('2023-02-18','2023-02-18'),0);
 assert.equal(metrics.ageMonths('2023-02-18','2026-02-18'),36);
 assert.equal(metrics.ageMonths('2024-02-29','2025-02-28'),12);
 assert.equal(metrics.ageMonths('2023-01-01','2023-01-16'),15/31);
 assert.equal(metrics.ageMonths('','2026-01-01'),null);
 assert.equal(metrics.ageMonths('2026-02-01','2026-01-31'),null);
});
test('參考節點來自官方檔案，男女孩值分開，支援 0 到 84 個月',()=>{
 assert.deepEqual(reference.percentiles,[3,15,50,85,97]);
 assert.equal(reference.sexes.male.heightCm[0][3],49.9);assert.equal(reference.sexes.female.heightCm[0][3],49.1);
 for(const sex of ['male','female'])for(const key of ['heightCm','weightKg']){
  const rows=reference.sexes[sex][key];assert.equal(rows.length,key==='heightCm'?35:65);assert.equal(rows.at(-1)[0],84);
  for(const row of rows)assert.ok(row.slice(1).every((value,i,values)=>i===0||value>values[i-1]));
 }
 assert.equal(reference.sexes.female.heightCm.find(r=>r[0]===3)[3],59.8);
});
test('量測點按年齡對齊，孕期及超齡不夾到圖邊界，極端量測不被裁去',()=>{
 const records=[{id:'birth',date:'2023-02-18',heightCm:50},{id:'year',date:'2024-02-18',heightCm:75},{id:'large',date:'2025-02-18',heightCm:200},{id:'pre',date:'2023-02-17',heightCm:20},{id:'old',date:'2030-02-19',heightCm:150}];
 const plot=metrics.agePlot(records,'heightCm',{birthday:'2023-02-18',growthSex:'male'},reference);
 assert.equal(plot.points.length,3);assert.equal(plot.excluded,2);assert.equal(plot.points[1].age,12);
 assert.equal(plot.points[0].x,70);assert.equal(plot.points[1].x,210);
 assert.ok(plot.points.every(p=>p.y>=40&&p.y<=400));assert.ok(plot.max>=200);
 assert.equal(metrics.agePlot(records,'heightCm',{birthday:''},reference).points.length,0);
});
test('孩子參考性別選填、可清除，非法值不可保存',()=>{
 const data={schemaVersion:1,children:[{id:'a',name:'孩子',birthday:'2023-01-01',growthSex:'female'}],records:[]};
 assert.equal(validate(data).children[0].growthSex,'female');
 data.children[0].growthSex='';assert.equal(validate(data).children[0].growthSex,undefined);
 data.children[0].growthSex='guess';assert.throws(()=>validate(data));
});
test('離線來源檔案雜湊與轉換中繼資料一致',()=>{
 assert.equal(crypto.createHash('sha256').update(fs.readFileSync('docs/data/hpa-growth-0-7.ods')).digest('hex'),reference.sha256);
 for(const source of reference.whoSources)assert.equal(crypto.createHash('sha256').update(fs.readFileSync('docs/data/'+source.file)).digest('hex'),source.sha256);
});
test('真正圖表產生五條性別參考線與年齡量測點，點擊與鍵盤可讀取數值',()=>{
 class Element{constructor(tag){this.tag=tag;this.children=[];this.attributes={};}append(...v){this.children.push(...v);}replaceChildren(...v){this.children=v;}setAttribute(k,v){this.attributes[k]=v;}}
 const context={GrowthReference:reference,document:{createElement:tag=>new Element(tag),createElementNS:(_,tag)=>new Element(tag)}};
 vm.createContext(context);vm.runInContext(fs.readFileSync('Javascript/growth-metrics.js','utf8'),context);
 const root=new Element('div'),child={id:'a',name:'小星',birthday:'2023-02-18',growthSex:'female'},records=[{id:'1',childId:'a',date:'2024-02-18',heightCm:75,title:'生日'},{id:'2',childId:'b',date:'2024-02-18',heightCm:100,title:'另一位'}];
 context.GrowthMetrics.render(root,{records,child,onEdit(){}});
 const card=root.children[1].children[0],panel=card.children[1],svg=panel.children[0].children[0];
 const references=svg.children.filter(n=>n.attributes.class?.startsWith('percentile-reference'));assert.equal(references.length,5);
 const dot=svg.children.find(n=>n.tag==='circle');assert.equal(dot.attributes.cx,210);dot.onclick();assert.match(panel.children[1].textContent,/1 歲/);assert.match(panel.children[1].textContent,/75 cm/);
 let prevented=false;dot.onkeydown({key:'Enter',preventDefault(){prevented=true;}});assert.ok(prevented);
 context.GrowthMetrics.render(root,{records,child:{...child,growthSex:''},onEdit(){}});
 const unselected=root.children[1].children[0].children[1].children[0].children[0];assert.equal(unselected.children.filter(n=>n.attributes.class?.startsWith('percentile-reference')).length,0);
 assert.match(root.children.at(-1).children[0].textContent,/選擇男孩/);
});
