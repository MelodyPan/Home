// Only authorization is kept for this tab. Bookmark contents remain in Drive.
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.BookmarkLogin=factory();})(globalThis,function(){
 'use strict';
 function createLoginCache({storage,now=Date.now,clientId}){
  const key='melody-drive-login-v1';
  function clear(){try{storage?.removeItem(key);}catch{}}
  function read(){try{const value=JSON.parse(storage?.getItem(key)||'null'),time=now();if(value&&value.clientId===clientId&&typeof value.token==='string'&&value.token&&Number.isFinite(value.expires)&&time<value.expires)return value;}catch{}clear();return null;}
  function write(value){try{storage?.setItem(key,JSON.stringify(value));}catch{}}
  function save(token,expires,limit){write({token,expires,limit,clientId});}
  return {read,save,clear};
 }
 return {createLoginCache};
});
