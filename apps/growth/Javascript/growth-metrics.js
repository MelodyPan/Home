/* 成長數字：量測依年齡定位，官方百分位節點隨網站離線載入，不傳送孩子資料。 */
(function(scope){
'use strict';
const fields={heightCm:{name:'身高',unit:'cm',max:300},weightKg:{name:'體重',unit:'kg',max:500}};
const valid=(value,key)=>typeof value==='number'&&Number.isFinite(value)&&value>0&&value<=fields[key].max;
// 表單留白代表清除；數字不可用 Number('') 轉為 0，避免把未量測誤畫在曲線上。
function parseInput(input,key){if(input.trim()==='')return null;const number=Number(input);if(!valid(number,key))throw new Error(fields[key].name+'請填寫大於 0、最多 '+fields[key].max+' '+fields[key].unit+' 的數字，或留白。');return number;}
function label(record){return Object.entries(fields).filter(([key])=>valid(record[key],key)).map(([key,f])=>f.name+' '+record[key]+' '+f.unit).join(' · ');}
function series(records,childId,key){return records.filter(r=>r.childId===childId&&valid(r[key],key)).sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));}
// 使用實際日期間隔定位 X 軸；同日與單筆資料放在中央，Y 軸留白讓相同數值也能顯示。
function plot(records,key){
 if(!records.length)return {points:[],min:0,max:1};
 const dates=records.map(r=>Date.parse(r.date)),values=records.map(r=>r[key]);
 const start=Math.min(...dates),end=Math.max(...dates),low=Math.min(...values),high=Math.max(...values),padding=Math.max((high-low)*.15,high*.03,.1);
 const min=Math.max(0,low-padding),max=high+padding;
 return {min,max,points:records.map((record,i)=>({record,x:start===end?330:64+532*(dates[i]-start)/(end-start),y:210-180*(record[key]-min)/(max-min)}))};
}
// 用生日的每月週年日計算月齡；月底與閏日夾到該月最後一天，不用天數除以 30 推估。
function ageMonths(birthday,date){
 if(!birthday||date<birthday)return null;
 const birth=new Date(birthday+'T00:00:00Z'),day=new Date(date+'T00:00:00Z');if(!Number.isFinite(+birth)||!Number.isFinite(+day))return null;
 function anniversary(offset){const d=new Date(birth);d.setUTCDate(1);d.setUTCMonth(birth.getUTCMonth()+offset);const last=new Date(d);last.setUTCMonth(last.getUTCMonth()+1);last.setUTCDate(0);d.setUTCDate(Math.min(birth.getUTCDate(),last.getUTCDate()));return +d;}
 let months=(day.getUTCFullYear()-birth.getUTCFullYear())*12+day.getUTCMonth()-birth.getUTCMonth();if(+day<anniversary(months))months--;
 const start=anniversary(months),end=anniversary(months+1);return months+(+day-start)/(end-start);
}
function ageText(months){const complete=Math.floor(months),years=Math.floor(complete/12),rest=complete%12;return complete===0?'未滿 1 個月':(years?years+' 歲':'')+(rest?(years?' ':'')+rest+' 個月':'');}
// 不把孕期或 7 歲以上的點硬夾在圖框；超界紀錄仍留在明細。Y 軸則擴展以完整顯示有效量測。
function agePlot(records,key,child,reference){
 const inRange=records.map(record=>({record,age:ageMonths(child.birthday,record.date)})).filter(p=>p.age!==null&&p.age>=0&&p.age<=84);
 const rows=reference?.sexes[child.growthSex]?.[key]||[],values=[...rows.flatMap(row=>row.slice(1)),...inRange.map(p=>p.record[key])];
 const step=key==='heightCm'?10:5,min=Math.min(key==='heightCm'?40:0,...values),max=Math.max(key==='heightCm'?140:40,...values);
 const low=Math.floor(min/step)*step,high=Math.ceil(max/step)*step,y=value=>400-360*(value-low)/(high-low);
 return {min:low,max:high,rows,excluded:records.length-inRange.length,points:inRange.map(p=>({...p,x:70+980*p.age/84,y:y(p.record[key])})),y};
}
function node(tag,className,text){const el=document.createElement(tag);el.className=className;if(text!==undefined)el.textContent=text;return el;}
function svgNode(tag,attributes,text){const el=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [key,value] of Object.entries(attributes))el.setAttribute(key,value);if(text!==undefined)el.textContent=text;return el;}
function chart(records,key,child,reference){
 const f=fields[key],card=node('section','metric-chart-card'),heading=node('div','metric-chart-heading');
 heading.append(node('h3','',f.name+'生長曲線'+(child.growthSex==='female'?'（女孩）':child.growthSex==='male'?'（男孩）':'')));card.append(heading);
 if(records.length){const latest=records[records.length-1];heading.append(node('p','metric-latest',latest[key]+' '+f.unit),node('small','',latest.date.replace(/-/g,' / ')+' 最新量測'));}
 if(child.birthday&&reference){card.append(ageChart(records,key,child,reference));return card;}
 if(!records.length){card.append(node('p','metric-chart-empty','還沒有'+f.name+'紀錄，量好後再把它收藏進來。'));return card;}
 card.append(node('p','metric-chart-hint','尚未填生日，先依紀錄日期呈現；補上生日後即可按年齡定位。'));
 const graph=plot(records,key),svg=svgNode('svg',{viewBox:'0 0 640 260',role:'img','aria-label':f.name+'變化曲線，單位 '+f.unit+'，完整數值見下方紀錄表',class:'metric-chart'});
 for(let i=0;i<5;i++){
  const y=30+i*45,value=graph.max-(graph.max-graph.min)*i/4;
  svg.append(svgNode('line',{x1:64,x2:596,y1:y,y2:y,class:'metric-grid'}),svgNode('text',{x:54,y:y+4,'text-anchor':'end',class:'metric-axis'},String(Number(value.toFixed(2)))));
 }
 svg.append(svgNode('text',{x:64,y:18,class:'metric-axis'},f.unit));
 if(graph.points.length>1)svg.append(svgNode('polyline',{points:graph.points.map(p=>p.x+','+p.y).join(' '),class:'metric-line'}));
 for(const p of graph.points){const dot=svgNode('circle',{cx:p.x,cy:p.y,r:5,class:'metric-dot'});dot.append(svgNode('title',{},p.record.date+' · '+p.record[key]+' '+f.unit+' · '+p.record.title));svg.append(dot);}
 const first=records[0].date,last=records.at(-1).date;
 svg.append(svgNode('text',{x:64,y:242,class:'metric-axis'},first),svgNode('text',{x:596,y:242,'text-anchor':'end',class:'metric-axis'},first===last?'':last));
 card.append(svg);if(records.length===1)card.append(node('p','metric-chart-hint','第一個小點點！再加一筆就能看見變化。'));return card;
}
function ageChart(records,key,child,reference){
 const f=fields[key],data=agePlot(records,key,child,reference),wrap=node('div','percentile-panel'),scroll=node('div','percentile-scroll');
 const svg=svgNode('svg',{viewBox:'0 0 1160 470',role:'group','aria-label':f.name+'年齡與百分位參考圖，0 到 7 歲，單位 '+f.unit,class:'percentile-chart'});
 svg.append(svgNode('rect',{x:70,y:40,width:980,height:360,class:'percentile-paper'}));
 for(let month=0;month<=84;month++){
  const x=70+980*month/84;svg.append(svgNode('line',{x1:x,x2:x,y1:40,y2:400,class:month%12===0?'percentile-grid-major':'percentile-grid-minor'}));
  if(month%12===0){const label=month===0?'出生':month/12+'歲';svg.append(svgNode('text',{x,y:28,'text-anchor':'middle',class:'percentile-axis'},label),svgNode('text',{x,y:427,'text-anchor':'middle',class:'percentile-axis'},label));}
  else if(month%2===0)svg.append(svgNode('text',{x,y:416,'text-anchor':'middle',class:'percentile-month'},month%12));
 }
 const major=Math.max(key==='heightCm'?10:5,Math.ceil((data.max-data.min)/10/5)*5),minor=major/5;
 for(let value=data.min;value<=data.max+.00001;value+=minor){const y=data.y(value),isMajor=Math.abs((value-data.min)/major-Math.round((value-data.min)/major))<.0001;svg.append(svgNode('line',{x1:70,x2:1050,y1:y,y2:y,class:isMajor?'percentile-grid-major':'percentile-grid-minor'}));if(isMajor)svg.append(svgNode('text',{x:58,y:y+5,'text-anchor':'end',class:'percentile-axis'},Number(value.toFixed(2))));}
 // 僅將官方月／半年節點連線，標明 P3/P15/P50/P85/P97，不推論孩子的精確百分位。
 reference.percentiles.forEach((percentile,i)=>{
  if(!data.rows.length)return;
  const color=percentile===50?'median':percentile===15||percentile===85?'inner':'outer';
  svg.append(svgNode('polyline',{points:data.rows.map(row=>(70+980*row[0]/84)+','+data.y(row[i+1])).join(' '),class:'percentile-reference '+color}));
  svg.append(svgNode('text',{x:1064,y:data.y(data.rows.at(-1)[i+1])+5,class:'percentile-label '+color},'P'+percentile));
 });
 const detail=node('p','percentile-detail');detail.setAttribute('role','status');detail.setAttribute('aria-live','polite');
 const description=p=>p.record.date+' · '+ageText(p.age)+' · '+f.name+' '+p.record[key]+' '+f.unit+' · '+p.record.title;
 if(data.points.length>1)svg.append(svgNode('polyline',{points:data.points.map(p=>p.x+','+p.y).join(' '),class:'percentile-child-line'}));
 data.points.forEach((p,index)=>{const dot=svgNode('circle',{cx:p.x,cy:p.y,r:index===data.points.length-1?7:5,class:'percentile-child-dot',tabindex:0,role:'button','aria-label':description(p)});dot.append(svgNode('title',{},description(p)));const show=()=>detail.textContent=description(p);dot.onclick=dot.onfocus=dot.onpointerenter=show;dot.onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();show();}};svg.append(dot);});
 svg.append(svgNode('text',{x:560,y:456,'text-anchor':'middle',class:'percentile-axis'},'年齡（上方為歲，下方小字為月）'),svgNode('text',{x:12,y:220,transform:'rotate(-90 12 220)','text-anchor':'middle',class:'percentile-axis'},f.name+'（'+f.unit+'）'));
 scroll.append(svg);wrap.append(scroll);
 detail.textContent=data.points.length?'最新圖上位置：'+description(data.points.at(-1)):'目前沒有可標示的出生後 0–7 歲量測。';wrap.append(detail);
 if(data.excluded)wrap.append(node('p','metric-chart-hint',data.excluded+' 筆孕期或超過 7 歲的紀錄未畫入圖中，仍保留在下方明細。'));
 return wrap;
}
// records 已由主頁套用年份及關鍵字；再次依孩子限制，避免不同孩子的數字混入。
function render(root,{records,child,onEdit,onEditChild,reference=scope.GrowthReference}){
 root.replaceChildren();if(!child)return;
 const heading=node('div','metrics-heading');heading.append(node('p','eyebrow','LITTLE BY LITTLE'),node('h2','',child.name+'的成長數字'),node('p','','一公分、一點點重量，都是長大的足跡。'));root.append(heading);
 const charts=node('div','metric-charts'+(child.growthSex==='male'?' reference-male':''));for(const key of Object.keys(fields))charts.append(chart(series(records,child.id,key),key,child,reference));root.append(charts);
 const measured=records.filter(r=>r.childId===child.id&&label(r)).sort((a,b)=>b.date.localeCompare(a.date)||b.id.localeCompare(a.id));
 if(!measured.length)root.append(node('p','metric-empty','新增或編輯成長紀錄時，可選填身高、體重；也可以只記錄其中一項。'));
 else{
 const wrapper=node('div','metric-table-wrap'),table=node('table','metric-table'),caption=node('caption','','量測紀錄 · '+measured.length+' 筆（依目前年份與搜尋條件）'),head=node('thead'),headRow=node('tr');
 for(const text of ['日期','故事','身高（cm）','體重（kg）','操作']){const th=node('th','',text);th.scope='col';headRow.append(th);}head.append(headRow);const body=node('tbody');
 for(const r of measured){const row=node('tr');row.append(node('td','',r.date),node('td','',r.title),node('td','',r.heightCm??'—'),node('td','',r.weightKg??'—'));const cell=node('td'),button=node('button','text-button','編輯');button.type='button';button.setAttribute('aria-label','編輯 '+r.date+' '+r.title);button.onclick=()=>onEdit(r);cell.append(button);row.append(cell);body.append(row);}
 table.append(caption,head,body);wrapper.append(table);root.append(wrapper);
 }
 const notes=node('div','percentile-notes');
 if(!child.birthday||!['male','female'].includes(child.growthSex)){
  notes.append(node('p','','請在「編輯孩子」補上生日，並選擇男孩／女孩參考曲線；不會依名字猜測。'));
  if(onEditChild){const button=node('button','outline-button','設定生日與參考曲線');button.type='button';button.onclick=onEditChild;notes.append(button);}
 }
 const source=node('a','','資料來源：國民健康署 0–7 歲兒童生長曲線');source.href='https://www.hpa.gov.tw/Pages/Detail.aspx?nodeid=1596&pid=549';source.target='_blank';source.rel='noopener noreferrer';
 const who=node('a','','WHO 身長／身高與體重標準');who.href='https://www.who.int/tools/child-growth-standards';who.target='_blank';who.rel='noopener noreferrer';
 notes.append(source,node('span','',' · '),who,node('p','','P3、P15、P50、P85、P97 依官方節點連線：身長 0–2 歲、體重 0–5 歲採 WHO 逐月資料，後續至 7 歲採國健署半年資料。供位置參考，不計算精確百分位。紫色點是孩子的量測，可點選查看日期與年齡；圖表不代替專業評估。'));root.append(notes);
}
const api={parseInput,label,series,plot,ageMonths,agePlot,render};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else scope.GrowthMetrics=api;
})(globalThis);
