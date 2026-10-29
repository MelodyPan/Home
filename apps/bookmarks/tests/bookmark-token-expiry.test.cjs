const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const {createLoginCache,tokenDetails}=require('../Javascript/bookmark-login.js');
test('Google lifetime controls logout without background renewal, including after reload',async()=>{
 let now=1000000,requests=0;const values=new Map(),storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
 function mount(){
  let auth,interval,disconnected=0;const nodes=new Map();
  const context={Date:class extends Date{static now(){return now;}},BookmarkCache:require('../Javascript/bookmark-cache.js'),BookmarkLogin:{createLoginCache:options=>createLoginCache({...options,now:()=>now}),tokenDetails:response=>tokenDetails(response,now)},BookmarksConfig:{googleClientId:'client'},window:{sessionStorage:storage,addEventListener(){},removeEventListener(){}},document:{getElementById:id=>{if(!nodes.has(id))nodes.set(id,{addEventListener(){},hidden:false,textContent:''});return nodes.get(id);},addEventListener(){},removeEventListener(){}},navigator:{onLine:true},setTimeout,clearTimeout,setInterval:fn=>{interval=fn;},BookmarkDrive:{createDriveStore:()=>({})},BookmarkCloud:{createCloudSession:options=>{auth=options;return {setOnline(){},connect:options.authorize,disconnect:async()=>{disconnected++;options.clearAuthorization();}};}},google:{accounts:{oauth2:{hasGrantedAllScopes:()=>true,initTokenClient:options=>({requestAccessToken(){requests++;options.callback({access_token:'test',expires_in:3599});}})}}}};
  vm.runInNewContext(fs.readFileSync(require.resolve('../Javascript/bookmark-drive-ui.js'),'utf8'),context);context.BookmarkDriveUI.mount({onChange(){},download(){}});
  return {authorize:()=>auth.authorize(),tick:()=>interval(),get disconnected(){return disconnected;}};
 }
 const first=mount();await first.authorize();
 const expiry=now+3599*1000;assert.equal(JSON.parse(values.get('melody-drive-login-v1')).expires,expiry);
 now=expiry-240000;await first.tick();assert.equal(requests,1);assert.equal(first.disconnected,0);
 const reloaded=mount();await reloaded.tick();assert.equal(requests,1);assert.equal(reloaded.disconnected,0);
 now=expiry;await reloaded.tick();assert.equal(reloaded.disconnected,1);assert.equal(values.size,0);assert.equal(requests,1);
});
