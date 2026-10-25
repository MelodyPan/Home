const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm'),fs=require('node:fs');
const {validate}=require('../scripts/growth-store.cjs');
const source=fs.readFileSync('Javascript/growth.js','utf8');
const child={id:'a',name:'小星',birthday:'2026-10-24'};
const record={id:'first',childId:'a',date:'2026-03-01',title:'第一次見到你',story:'超音波照片',milestone:'',photos:[]};
const data={schemaVersion:1,children:[child],records:[record]};

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
 assert.equal(context.ageAt('2026-10-24','2026-10-24'),'出生的這一天');
 assert.equal(context.ageAt('2026-10-24','2026-10-25'),'1 天大');
 assert.equal(context.ageAt('2025-10-24','2026-10-23'),'11 個月');
 assert.equal(context.ageAt('2025-10-24','2026-10-24'),'1 歲');
 assert.equal(context.ageAt('2024-02-29','2025-02-28'),'1 歲');
 assert.equal(context.ageAt('2023-01-31','2023-02-28'),'1 個月');
});

test('新增紀錄不再限制生日以前，孕期相簿預設今天而非未來出生日期',()=>{
 const nodes=new Map(),get=id=>{if(!nodes.has(id))nodes.set(id,{showModal(){},value:'',textContent:''});return nodes.get(id);};
 const state={data:{},busy:false},context={state,$:get,child:()=>child,today:()=> '2026-03-01',clearDraft(){},renderDraft(){}};
 vm.createContext(context);vm.runInContext(source.match(/function openRecord\([\s\S]*?^}/m)[0],context);
 context.openRecord();assert.ok(!get('record-date').min);assert.equal(get('record-date').value,'2026-03-01');
 context.openRecord(record);assert.equal(get('record-date').value,record.date);
});
