/* 本機電子書：獨立管理紙張翻動，不寫入照片或成長資料。可在 Node 測試頁碼規則。 */
(function(scope){
'use strict';
// 將來源故事轉成閱讀跨頁；只重排顯示用陣列，不改動照片或紀錄本身。
function buildBook(records,child){
 const entries=[{type:'cover',key:'cover',title:'專屬書封'},{type:'contents',key:'contents',title:'章節目錄'}],chapters=[];
 records.forEach((record,recordIndex)=>{
  const chapterId=!child.birthday||record.date<child.birthday?'pregnancy':record.date.slice(0,4);
  const chapterTitle=chapterId==='pregnancy'?'孕期篇':chapterId+' 年成長篇';
  const layout=['editorial','grid','full'].includes(record.photoLayout)?record.photoLayout:'editorial',size=layout==='grid'?4:layout==='full'?1:3;
  const photos=record.coverPhoto&&record.photos.includes(record.coverPhoto)?[record.coverPhoto,...record.photos.filter(id=>id!==record.coverPhoto)]:[...record.photos];
  const first={type:'story',key:'story-'+record.id,title:record.title,record,recordIndex,chapterId,chapterTitle,layout,leftPhotos:photos.slice(0,size),rightPhotos:[],photoStart:0};
  if(!chapters.some(c=>c.id===chapterId))chapters.push({id:chapterId,title:chapterTitle,key:first.key,count:0});
  chapters.find(c=>c.id===chapterId).count++;
  entries.push(first);
  for(let offset=size;offset<photos.length;offset+=size*2)entries.push({...first,type:'gallery',key:'gallery-'+record.id+'-'+offset,photoStart:offset,leftPhotos:photos.slice(offset,offset+size),rightPhotos:photos.slice(offset+size,offset+size*2)});
 });
 return {entries,chapters};
}
class TurnState {
 constructor(){this.reset(0,0);}
 reset(count,index){this.count=count;this.index=Math.max(0,Math.min(index,count-1));this.turn=0;this.progress=0;this.target=this.index;}
 start(direction){
  const target=this.index+direction;
  if(this.turn||![-1,1].includes(direction)||target<0||target>=this.count)return false;
  this.turn=direction;this.target=target;this.progress=0;return true;
 }
 move(progress){this.progress=Math.max(0,Math.min(1,progress));}
 finish(commit){if(this.turn&&commit)this.index=this.target;this.turn=0;this.progress=0;this.target=this.index;}
}

class Flipbook {
 constructor(root,options){
  this.root=root;this.options=options;this.model=new TurnState();this.generation=0;this.animation=null;this.pointer=null;
  this.stage=root.querySelector('.flipbook-stage');this.previous=root.querySelector('[data-book-prev]');this.next=root.querySelector('[data-book-next]');
  this.counter=root.querySelector('[data-book-count]');
  if(options.magazine){this.contents=root.querySelector('[data-book-contents]');root.querySelector('[data-book-cover]').onclick=()=>this.jump('cover');root.querySelector('[data-book-toc]').onclick=()=>this.jump('contents');}
  this.previous.onclick=()=>this.turn(-1);this.next.onclick=()=>this.turn(1);
  this.stage.addEventListener('keydown',event=>{
   if(event.target.closest('button,a'))return;
   if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();this.turn(event.key==='ArrowRight'?1:-1);}
  });
  // 僅在紙張外緣接受拖曳；故事文字仍可選取或捲動，垂直手勢保留給瀏覽器。
  this.stage.addEventListener('pointerdown',event=>this.pointerDown(event));
  this.stage.addEventListener('pointermove',event=>this.pointerMove(event));
  this.stage.addEventListener('pointerup',event=>this.pointerEnd(event,false));
  this.stage.addEventListener('pointercancel',event=>this.pointerEnd(event,true));
  this.stage.addEventListener('lostpointercapture',event=>this.pointerEnd(event,true));
  this.mobile=matchMedia('(max-width: 650px)');
  this.reduced=matchMedia('(prefers-reduced-motion: reduce)');
  this.mobile.addEventListener('change',()=>this.refresh());
  this.reduced.addEventListener('change',()=>{if(this.model.turn)this.refresh();});
 }
 refresh(){this.setRecords(this.records,this.model.index,this.child,this.list[this.model.index]?.key);}
 setRecords(list,index,child,key){
  // 取消尚未結束的動畫與指標捕捉。版本號讓舊 Promise 無法更新另一個孩子的頁碼。
  this.generation++;this.animation?.cancel();this.animation=null;
  const pointer=this.pointer;this.pointer=null;
  if(pointer&&this.stage.hasPointerCapture(pointer.id))this.stage.releasePointerCapture(pointer.id);
  this.records=list||[];this.child=child;
  if(this.options.magazine&&child&&this.records.length){const book=buildBook(this.records,child);this.list=book.entries;this.chapters=book.chapters;const found=this.list.findIndex(e=>e.key===(key||'cover'));index=found<0?0:found;}
  else{this.list=this.records;this.chapters=[];}
  this.model.reset(this.list.length,index);this.paint();
 }
 // 目錄跳頁亦走取消動畫流程，舊翻頁 Promise 不得改回已跳走的頁面。
 jump(key){if(!this.options.magazine||!this.list.some(e=>e.key===key))return;this.setRecords(this.records,0,this.child,key);this.notify();this.stage.focus?.();}
 notify(){const entry=this.list[this.model.index];if(this.options.magazine)this.options.onChange(entry.recordIndex??null,entry.key);else this.options.onChange(this.model.index);}
 node(tag,className,text){const el=document.createElement(tag);el.className=className;if(text!==undefined)el.textContent=text;return el;}
 page(index,side){
  if(this.options.magazine)return this.magazinePage(this.list[index],side);
  const record=this.list[index],page=this.node('article','flipbook-paper flipbook-'+side);
  const date=this.node('time','flipbook-date',record.date.replace(/-/g,' / '));date.dateTime=record.date;page.append(date);
  if(side==='photo'){
   const frame=this.node('div','flipbook-photo-frame'),id=record.coverPhoto||record.photos[0];
   if(id){const img=this.node('img','flipbook-image');img.src=this.options.photoUrl(id);img.alt=record.title+'的封面照片';img.draggable=false;frame.append(img);}
   else frame.append(this.node('div','flipbook-no-photo','♡'),this.node('p','','把這一天，收藏在心裡。'));
   page.append(frame,this.node('p','flipbook-caption',this.child.name+'的小小時光'));
  }else{
   page.append(this.node('p','flipbook-age',this.options.ageAt(this.child.birthday,record.date,this.child.dueDate)+' 的你'),this.node('h3','flipbook-title',record.title));
   if(record.milestone)page.append(this.node('p','flipbook-milestone',record.milestone));
   const measurements=this.options.metricsLabel?.(record);if(measurements)page.append(this.node('p','flipbook-measurements',measurements));
   page.append(this.node('p','flipbook-story',record.story||'這一天，值得被記得。'),this.node('span','flipbook-folio',String(index+1).padStart(2,'0')));
  }
  return page;
 }
 magazinePage(entry,side){
  const page=this.node('article','flipbook-paper flipbook-'+side+' magazine-paper');
  if(entry.type==='cover'){
   page.className+=' magazine-cover '+(side==='photo'?'magazine-cover-photo':'magazine-cover-letter');
   if(side==='photo'){
    const id=this.child.bookCover||this.child.avatar||this.records.find(r=>r.photos.length)?.coverPhoto||this.records.find(r=>r.photos.length)?.photos[0];
    if(id){const img=this.node('img','magazine-cover-image');img.src=this.options.photoUrl(id);img.alt=this.child.name+'的專屬書封';img.draggable=false;page.append(img);}
    else page.append(this.node('span','magazine-cover-heart','♡'));
    page.append(this.node('span','magazine-cover-signature','THE LITTLE DAYS OF '+this.child.name));
   }else{
    page.append(this.node('p','magazine-kicker','A LIFE FULL OF LITTLE WONDERS'),this.node('h3','magazine-cover-title',this.child.bookTitle||this.child.name+'的成長故事'),this.node('span','magazine-cover-rule','✧'),this.node('p','magazine-dedication',this.child.bookDedication||'把每一次相遇、每一點長大，\n都好好收藏。'));
    const button=this.node('button','outline-button','打開我們的故事 →');button.type='button';button.onclick=()=>this.turn(1);page.append(button);
   }return page;
  }
  if(entry.type==='contents'){
   page.className+=' magazine-contents';
   if(side==='photo')page.append(this.node('p','magazine-kicker','OUR CHAPTERS'),this.node('h3','magazine-contents-title','每一章，\n都是愛。'),this.node('p','magazine-dedication',this.child.bookTitle||this.child.name+'的成長故事'),this.node('small','',this.records.length+' 段故事 · '+this.chapters.length+' 個章節'));
   else{page.append(this.node('h3','magazine-toc-title','章節目錄'));const list=this.node('div','magazine-toc-list');this.chapterButtons(list);page.append(list);}return page;
  }
  const r=entry.record,date=this.node('time','flipbook-date',entry.chapterTitle+' · '+r.date.replace(/-/g,' / '));date.dateTime=r.date;page.append(date);
  if(side==='photo'||entry.type==='gallery'){
   const photos=side==='photo'?entry.leftPhotos:entry.rightPhotos;
   page.append(this.node('h3','magazine-photo-title',r.title));
   const gallery=this.node('div','magazine-gallery layout-'+entry.layout+' count-'+photos.length);
   photos.forEach((id,i)=>{const figure=this.node('figure','magazine-figure'),img=this.node('img','magazine-image');img.src=this.options.photoUrl(id);img.alt=r.title+'，第 '+(entry.photoStart+(side==='story'?entry.leftPhotos.length:0)+i+1)+' 張照片';img.draggable=false;figure.append(img);gallery.append(figure);});
   if(!photos.length)gallery.append(this.node('div','magazine-no-photo',r.photos.length?'下一頁，還有更多小時光。':'♡ 有些回憶，文字就能珍藏。'));
   page.append(gallery,this.node('p','flipbook-caption',entry.type==='gallery'?'照片續頁 · '+this.child.name+'的小小時光':this.child.name+'的小小時光'));
  }else{
   page.append(this.node('p','flipbook-age',this.options.ageAt(this.child.birthday,r.date,this.child.dueDate)+' 的你'),this.node('h3','flipbook-title',r.title));
   if(r.milestone)page.append(this.node('p','flipbook-milestone',r.milestone));
   const measurements=this.options.metricsLabel?.(r);if(measurements)page.append(this.node('p','flipbook-measurements',measurements));
   page.append(this.node('p','flipbook-story',r.story||'這一天，值得被記得。'));
  }
  page.append(this.node('span','flipbook-folio',String(this.list.indexOf(entry)+1).padStart(2,'0')));return page;
 }
 chapterButtons(container){
  this.chapters.forEach((chapter,i)=>{const button=this.node('button','magazine-chapter-button');button.type='button';button.append(this.node('span','magazine-chapter-number',String(i+1).padStart(2,'0')),this.node('span','',chapter.title),this.node('small','',chapter.count+' 段故事'));if(this.list[this.model.index]?.chapterId===chapter.id)button.setAttribute('aria-current','true');button.onclick=()=>this.jump(chapter.key);container.append(button);});
 }
 spread(index){const spread=this.node('div','flipbook-spread');spread.append(this.page(index,'photo'),this.page(index,'story'));return spread;}
 paint(){
  this.stage.replaceChildren();this.leaf=null;
  const {index,count}=this.model;
  if(count)this.stage.append(this.spread(index));
  this.previous.disabled=!count||index===0;this.next.disabled=!count||index===count-1;
  this.counter.textContent=count?`${index+1} / ${count} ${this.options.magazine?'跨頁':'段故事'}`:'尚無成長故事';
  this.stage.setAttribute('aria-label',count?`電子書，第 ${index+1} ${this.options.magazine?'跨頁':'段'}，共 ${count} ${this.options.magazine?'跨頁':'段'}：${this.list[index].title}`:'成長電子書');
  if(this.contents){this.contents.replaceChildren();this.chapterButtons(this.contents);}
 }
 prepare(direction){
  if(!this.model.start(direction))return false;
  const {index,target}=this.model;
  // 寬螢幕以書脊為軸翻動半張紙：正面是舊頁，背面是下一頁；手機則翻動整張直式頁面。
  const base=this.spread(index),incoming=this.spread(target);
  this.stage.replaceChildren(base);
  if(this.mobile.matches)this.stage.append(incoming);
  else base.replaceChild(this.page(target,direction===1?'story':'photo'),base.children[direction===1?1:0]);
  const leaf=this.node('div','flipbook-leaf '+(direction===1?'is-forward':'is-backward')+(this.mobile.matches?' is-mobile':''));
  leaf.setAttribute('aria-hidden','true');leaf.inert=true;
  const front=this.node('div','flipbook-face flipbook-front'),back=this.node('div','flipbook-face flipbook-back');
  front.append(this.mobile.matches?this.spread(index):this.page(index,direction===1?'story':'photo'));
  back.append(this.mobile.matches?this.spread(target):this.page(target,direction===1?'photo':'story'));
  leaf.append(front,back);this.stage.append(leaf);this.leaf=leaf;
  this.previous.disabled=this.next.disabled=true;return true;
 }
 transform(progress){return `rotateY(${(this.model.turn===1?-180:180)*progress}deg)`;}
 async settle(commit){
  if(!this.model.turn)return;
  const version=this.generation,end=commit?1:0;
  if(!this.reduced.matches&&this.leaf.animate){
   this.animation=this.leaf.animate([{transform:this.transform(this.model.progress)},{transform:this.transform(end)}],{duration:Math.max(160,650*Math.abs(end-this.model.progress)),easing:'cubic-bezier(.3,.05,.2,1)',fill:'forwards'});
   try{await this.animation.finished;}catch{return;}
  }
  if(version!==this.generation)return;
  this.animation=null;this.model.finish(commit);this.paint();
  if(commit)this.notify();
 }
 turn(direction){if(this.prepare(direction))this.settle(true);}
 pointerDown(event){
  if(event.button!==0||!event.isPrimary||this.model.turn||event.target.closest('button,a'))return;
  const rect=this.stage.getBoundingClientRect(),x=event.clientX-rect.left;
  if(x>rect.width*.2&&x<rect.width*.8)return;
  this.pointer={id:event.pointerId,x:event.clientX,y:event.clientY,width:this.mobile.matches?rect.width:rect.width/2,direction:x>rect.width/2?1:-1,started:false};
  this.stage.setPointerCapture(event.pointerId);
 }
 pointerMove(event){
  const p=this.pointer;if(!p||event.pointerId!==p.id)return;
  const dx=event.clientX-p.x,dy=event.clientY-p.y;
  if(!p.started){
   if(Math.abs(dy)>12&&Math.abs(dy)>Math.abs(dx)){this.pointerEnd(event,true);return;}
   if(Math.abs(dx)<8||Math.abs(dx)<Math.abs(dy)*1.25)return;
   if(!this.prepare(p.direction)){this.pointerEnd(event,true);return;}p.started=true;
  }
  this.model.move(-dx*p.direction/p.width);this.leaf.style.transform=this.transform(this.model.progress);
 }
 pointerEnd(event,cancel){
  const p=this.pointer;if(!p||event.pointerId!==p.id)return;
  this.pointer=null;
  if(this.stage.hasPointerCapture(p.id))this.stage.releasePointerCapture(p.id);
  if(p.started)this.settle(!cancel&&this.model.progress>.22);
  else if(!cancel&&Math.abs(event.clientX-p.x)<8&&Math.abs(event.clientY-p.y)<8)this.turn(p.direction);
 }
}
if(typeof module!=='undefined'&&module.exports)module.exports={TurnState,Flipbook,buildBook};
else scope.GrowthFlipbook={TurnState,Flipbook,buildBook};
})(globalThis);
