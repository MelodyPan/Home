// 已設定線上 API 時，不回退顯示舊清單，以免重新顯示已隱藏或刪除的作品。
(()=>{
 'use strict';
 const grid=document.querySelector('#works .project-grid');if(!grid)return;
 const base=new URL('../',document.currentScript.src),remote=globalThis.PortfolioConfig?.apiBaseUrl;
 if(location.protocol==='file:'&&!remote)return;
 const notice=document.createElement('p');notice.setAttribute('role','status');notice.textContent='正在載入作品…';grid.before(notice);grid.hidden=true;
 // 所有顯示的作品依順序自動編號，不使用符號編號。
 function renumber(){let n=0;for(const node of grid.querySelectorAll('.project-index'))node.textContent=String(++n).padStart(2,'0');}
 function render(data){
  const rows=ProjectModel.publicDocument(data).projects;grid.replaceChildren();
  for(const row of rows){
   const article=document.createElement('article');article.className='project'+(row.featured?' featured':'');article.id=row.id;
   for(const [tag,className,text] of [['div','project-index',row.badge],['h3','',row.title],['p','',row.description],['small','',row.category]]){const node=document.createElement(tag);node.className=className;node.textContent=text;article.append(node);}
   if(row.url){const link=document.createElement('a');link.className='project-link';link.href=new URL(row.url,base).href;link.textContent=row.linkText||'開啟作品';if(row.newTab){link.target='_blank';link.rel='noopener noreferrer';}article.append(link);}
   grid.append(article);
  }
  renumber();notice.textContent=rows.length?'':'目前尚無公開作品。';grid.hidden=false;
 }
 const endpoint=remote?new URL('api/projects',remote.endsWith('/')?remote:remote+'/').href:new URL('api/projects',base).href;
 fetch(endpoint,{cache:'no-store',signal:AbortSignal.timeout(15000)}).then(response=>{
  // GitHub Pages 沒有同源 API，只有這個明確情況可保留原清單。
  if(!remote&&response.status===404){renumber();notice.textContent='';grid.hidden=false;return null;}
  if(!response.ok)throw Error('作品載入失敗');return response.json();
 }).then(data=>{if(data)render(data);}).catch(()=>{notice.textContent='目前無法載入作品，請稍後重新整理。';});
})();
