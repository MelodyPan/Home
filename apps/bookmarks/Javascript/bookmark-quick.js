(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.BookmarkQuick=factory();})(globalThis,function(){
 'use strict';
 function orderedFavorites(entries,favorites,order=[]){const ids=new Set(favorites),rank=new Map(order.map((id,index)=>[id,index]));return entries.filter(e=>{try{const url=new URL(e.url);return ids.has(e.id)&&['http:','https:'].includes(url.protocol)&&!url.username&&!url.password;}catch{return false;}}).sort((a,b)=>(rank.get(a.id)??order.length)-(rank.get(b.id)??order.length));}
 function moveQuick(entries,favorites,changes,id,direction){const order=orderedFavorites(entries,favorites,changes.quickOrder).map(e=>e.id),index=order.indexOf(id),target=index+direction;if(index<0||![-1,1].includes(direction))throw new Error('無效的常用入口排序。');if(target<0||target>=order.length)return changes;[order[index],order[target]]=[order[target],order[index]];return {...changes,quickOrder:order};}
 return {orderedFavorites,moveQuick};
});
