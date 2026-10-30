const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm'),fs=require('node:fs');
const {validate}=require('../scripts/growth-store.cjs');
const source=fs.readFileSync('Javascript/growth.js','utf8');
const child={id:'a',name:'小星',birthday:'2026-10-24'};
const record={id:'first',childId:'a',date:'2026-03-01',title:'第一次見到你',story:'超音波照片',milestone:'',photos:[]};
const data={schemaVersion:1,children:[child],records:[record]};
test('實際出生日期上限為昨天，跨年、月底與閏日皆正確',()=>{
 const context={today:()=> '2026-10-31'};vm.createContext(context);vm.runInContext(source.match(/function birthDateLimit\([\s\S]*?}/)[0],context);
 for(const [today,yesterday]of [['2026-10-31','2026-10-30'],['2027-01-01','2026-12-31'],['2024-03-01','2024-02-29'],['2026-03-01','2026-02-28']]){context.today=()=>today;assert.equal(context.birthDateLimit(),yesterday);}
});

test('預產期與實際生日分開保存及備份，出生後補生日不改動預產期',async()=>{
 const portable=require('../Javascript/growth-data.js'),backup=require('../Javascript/growth-backup.js');
 for(const check of [validate,portable.validate]){
  const document=check({...data,children:[{...child,birthday:'',dueDate:'2027-04-23'}]});assert.equal(document.children[0].birthday,'');assert.equal(document.children[0].dueDate,'2027-04-23');
  document.children[0].birthday='2027-04-15';assert.equal(check(document).children[0].dueDate,'2027-04-23');
  for(const dueDate of ['2027-02-30','invalid',42])assert.throws(()=>check({...data,children:[{...child,dueDate}]}));
 }
 const source=portable.validate({...data,children:[{...child,birthday:'',dueDate:'2027-04-23'}]}),decoded=await backup.decode(await backup.encode(source,()=>{}));assert.equal(decoded.document.children[0].dueDate,'2027-04-23');
});

test('孕週只以預產期為 40 週計算，跨年、閏日及補填實際生日後仍正確',()=>{
 const metrics=require('../Javascript/growth-metrics.js');
 assert.equal(metrics.pregnancyLabel('2027-04-23','2026-10-31'),'孕 15 週 1 天');
 assert.equal(metrics.pregnancyLabel('2027-04-23','2027-04-23'),'孕 40 週 0 天');
 assert.equal(metrics.pregnancyLabel('2027-04-23','2027-04-24'),'孕 40 週 1 天');
 assert.equal(metrics.pregnancyLabel('2027-04-23','2026-07-17'),'孕 0 週 0 天');
 assert.equal(metrics.pregnancyLabel('2027-04-23','2026-07-16'),'');
 assert.equal(metrics.pregnancyLabel('2024-03-01','2024-02-28'),'孕 39 週 5 天');
 assert.equal(metrics.pregnancyLabel('','2026-10-31'),'');assert.equal(metrics.pregnancyLabel('2027-02-30','2026-10-31'),'');
 const context={GrowthMetrics:metrics};vm.createContext(context);vm.runInContext(source.match(/function ageAt\([\s\S]*?^}/m)[0],context);
 assert.equal(context.ageAt('','2026-10-31','2027-04-23'),'孕 15 週 1 天');
 assert.equal(context.ageAt('2027-04-15','2026-10-31','2027-04-23'),'孕 15 週 1 天');
 assert.equal(context.ageAt('2027-04-15','2027-04-15','2027-04-23'),'0y0m');
});

test('允許保存出生前故事；尚未出生可省略生日，出生後補填不影響原紀錄',()=>{
 assert.equal(validate(data).records[0].date,'2026-03-01');
 for(const birthday of ['',null,undefined]){
  const pregnancy=validate({...data,children:[{...child,birthday}]});
  assert.equal(pregnancy.children[0].birthday,'');
  pregnancy.children[0].birthday='2026-11-01';assert.equal(validate(pregnancy).records[0].title,record.title);
 }
 for(const birthday of ['2026-02-30','not-a-date',0])assert.throws(()=>validate({...data,children:[{...child,birthday}]}));
 assert.throws(()=>validate({...data,records:[{...record,date:'2026-02-30'}]}));
});

test('年齡顯示涵蓋孕期、出生前天數、出生當天及原有月齡，跨年與閏年仍正確',()=>{
 const context={GrowthMetrics:require('../Javascript/growth-metrics.js')};vm.createContext(context);vm.runInContext(source.match(/function ageAt\([\s\S]*?^}/m)[0],context);
 assert.equal(context.ageAt('','2026-03-01'),'還在肚子裡');
 assert.equal(context.ageAt('2026-10-24','2026-10-23'),'出生前 1 天');
 assert.equal(context.ageAt('2026-01-01','2025-12-31'),'出生前 1 天');
 assert.equal(context.ageAt('2024-03-01','2024-02-28'),'出生前 2 天');
 assert.equal(context.ageAt('2026-10-24','2026-10-24'),'0y0m');
 assert.equal(context.ageAt('2026-10-24','2026-10-25'),'0y0m');
 assert.equal(context.ageAt('2025-10-24','2026-10-23'),'0y11m');
 assert.equal(context.ageAt('2025-10-24','2026-10-24'),'1y0m');
 assert.equal(context.ageAt('2024-02-29','2025-02-28'),'1y0m');
 assert.equal(context.ageAt('2023-01-31','2023-02-28'),'0y1m');
 assert.equal(context.ageAt('2023-10-31','2026-10-30'),'2y11m');
 assert.equal(context.ageAt('2023-10-31','2026-10-31'),'3y0m');
 assert.equal(context.ageAt('2023-10-31','2026-11-01'),'3y');
 assert.equal(context.ageAt('2023-10-31','2027-10-30'),'3y');
 assert.equal(context.ageAt('2023-10-31','2027-10-31'),'4y');
});

test('新增紀錄不再限制生日以前，孕期相簿預設今天而非未來出生日期',()=>{
 const nodes=new Map(),get=id=>{if(!nodes.has(id))nodes.set(id,{showModal(){},replaceChildren(){},value:'',textContent:''});return nodes.get(id);};
 const state={data:{children:[child]},childId:child.id,busy:false},context={state,GrowthMetrics:require('../Javascript/growth-metrics.js'),Option:function(text,value){this.value=value;},cloudReady:true,$:get,child:()=>child,today:()=> '2026-03-01',clearDraft(){},renderDraft(){}};
 vm.createContext(context);vm.runInContext(source.match(/^const maternalInputs=.+;/m)[0]+'\n'+source.match(/function ageAt\([\s\S]*?^}/m)[0]+'\n'+source.match(/function updateMaternalFields\([\s\S]*?^}/m)[0]+'\n'+source.match(/function openRecord\([\s\S]*?^}/m)[0],context);
 context.openRecord();assert.ok(!get('record-date').min);assert.equal(get('record-date').value,'2026-03-01');
 context.openRecord(record);assert.equal(get('record-date').value,record.date);
 get('record-date').value='2026-10-24';context.updateMaternalFields();assert.equal(get('record-age').textContent,'紀錄當天：0y0m');
 get('record-date').value='2026-10-31';context.updateMaternalFields();assert.equal(get('record-age').textContent,'紀錄當天：0y0m');
 get('record-date').value='2029-12-24';context.updateMaternalFields();assert.equal(get('record-age').textContent,'紀錄當天：3y');
 state.data.children.push({id:'b',name:'另一位孩子',birthday:'2020-12-24'});get('record-child-select').value='b';context.updateMaternalFields();assert.equal(get('record-age').textContent,'紀錄當天：9y');
});
