const {test}=require('node:test');
const assert=require('node:assert/strict');
const {validate}=require('../scripts/growth-store.cjs');
const metrics=require('../Javascript/growth-metrics.js');
const fs=require('node:fs'),vm=require('node:vm');
const child={id:'a',name:'小星',birthday:''};
const record={id:'first',childId:'a',date:'2026-03-01',title:'量身高',story:'',milestone:'',photos:[]};
const data=r=>({schemaVersion:1,children:[child],records:[r]});
test('數字可選填、分開填寫及清除，舊紀錄不會被補成零',()=>{
 assert.equal(validate(data(record)).records[0].heightCm,undefined);
 const r=validate(data({...record,heightCm:52.3,weightKg:3.125})).records[0];
 assert.equal(r.heightCm,52.3);assert.equal(r.weightKg,3.125);
 assert.equal(validate(data({...record,heightCm:null,weightKg:null})).records[0].weightKg,undefined);
 assert.equal(validate(data({...record,weightKg:.125})).records[0].heightCm,undefined);
});
test('儲存層拒絕無效數字、負數、零、字串及超出輸入範圍的值',()=>{
 for(const [key,max] of [['heightCm',300],['weightKg',500]]){
  for(const value of [0,-1,NaN,Infinity,'10','',true,{},max+.1])assert.throws(()=>validate(data({...record,[key]:value})));
  assert.equal(validate(data({...record,[key]:max})).records[0][key],max);
 }
});
test('曲線只取指定孩子且有該數字的紀錄，按實際日期排序，缺值不變成零',()=>{
 const list=[{...record,id:'later',date:'2026-05-01',heightCm:60},{...record,id:'empty'},
 {...record,id:'other',childId:'b',heightCm:90},{...record,id:'early',heightCm:52,weightKg:3.2}];
 assert.deepEqual(metrics.series(list,'a','heightCm').map(r=>r.id),['early','later']);
 assert.deepEqual(metrics.series(list,'a','weightKg').map(r=>r.id),['early']);
 assert.equal(metrics.label(record),'');assert.equal(metrics.label(list[3]),'身高 52 cm · 體重 3.2 kg');
 assert.equal(metrics.parseInput('','heightCm'),null);assert.equal(metrics.parseInput('3.125','weightKg'),3.125);
 assert.throws(()=>metrics.parseInput('-1','heightCm'));assert.throws(()=>metrics.parseInput('abc','weightKg'));
});
test('圖表以時間間隔定位；單點、同日、相同數值與空資料都能建立有限座標',()=>{
 const points=metrics.plot([{...record,heightCm:50},{...record,id:'2',date:'2026-03-02',heightCm:51},{...record,id:'3',date:'2026-03-11',heightCm:60}],'heightCm');
 assert.ok(Math.abs((points.points[1].x-points.points[0].x)/(points.points[2].x-points.points[0].x)-.1)<.0001);
 for(const list of [[],[{...record,heightCm:50}],[{...record,heightCm:50},{...record,id:'2',heightCm:50}]]){
  const result=metrics.plot(list,'heightCm');for(const p of result.points)assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.y));
 }
});

test('圖表與可存取明細分開呈現單位、最新量測日期，且可回到原紀錄編輯',()=>{
 class Element{constructor(tag){this.tag=tag;this.children=[];this.attributes={};}append(...v){this.children.push(...v);}replaceChildren(...v){this.children=v;}setAttribute(k,v){this.attributes[k]=v;}}
 const context={document:{createElement:tag=>new Element(tag),createElementNS:(_,tag)=>new Element(tag)}};
 vm.createContext(context);vm.runInContext(fs.readFileSync('Javascript/growth-metrics.js','utf8'),context);
 const root=new Element('div'),edited=[],records=[{...record,heightCm:52.5},{...record,id:'later',date:'2026-04-01',weightKg:4.5},{...record,id:'other',childId:'b',heightCm:200}];
 context.GrowthMetrics.render(root,{records,child,onEdit:r=>edited.push(r.id)});
 const charts=root.children[1].children;assert.equal(charts.length,2);
 assert.equal(charts[0].children[0].children[1].textContent,'52.5 cm');
 assert.match(charts[0].children[0].children[2].textContent,/2026 \/ 03 \/ 01/);
 assert.equal(charts[1].children[0].children[1].textContent,'4.5 kg');
 const table=root.children[2].children[0],rows=table.children[2].children;
 assert.equal(rows.length,2);assert.equal(rows[0].children[2].textContent,'—');
 rows[1].children[4].children[0].onclick();assert.deepEqual(edited,['first']);
 context.GrowthMetrics.render(root,{records:[],child,onEdit(){}});assert.match(root.children[2].textContent,/新增或編輯/);
 context.GrowthMetrics.render(root,{records,child:null,onEdit(){}});assert.equal(root.children.length,0);
});
