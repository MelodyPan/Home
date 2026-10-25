// 由目前載入的 script 找出子系統根目錄，因此在 / 或 /Home/bookmarks/ 都能正確讀取 API 與照片。
(()=>{
 'use strict';
 const base=new URL('../',document.currentScript.src),config=globalThis.BookmarksConfig||{};
 const runtime={mode:config.mode||'local',url:pathname=>new URL(pathname.replace(/^\/+/,''),base).href};
 globalThis.BookmarksRuntime=runtime;
 if(config.homeUrl){
  const link=document.createElement('a');link.href=new URL(config.homeUrl,base).href;link.className='home-system-link';link.textContent='← Home 首頁';
  const target=document.querySelector('.site-header')||document.querySelector('.sidebar');if(target)target.append(link);
 }
 if(runtime.mode==='preview'){
  const banner=document.createElement('div');banner.className='integration-preview';banner.setAttribute('role','status');banner.textContent='目前為網站預覽。雲端儲存尚未設定，新增與儲存功能將在完成設定後開放。';
  (document.querySelector('main')||document.body).prepend(banner);
 }
})();
