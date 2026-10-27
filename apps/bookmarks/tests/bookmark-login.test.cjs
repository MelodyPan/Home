const {test}=require('node:test'),assert=require('node:assert/strict');
const {createLoginCache}=require('../Javascript/bookmark-login.js');
test('reload retains authorization until Google expiry, expiry cannot revive it',()=>{
 const values=new Map(),storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};let now=1000;
 const make=()=>createLoginCache({storage,now:()=>now,clientId:'client'});
 const first=make();first.save('token',now+3600000);now+=1800000;
 assert.equal(make().read().token,'token');now+=1799999;assert.equal(make().read().token,'token');now+=1;
 assert.equal(make().read(),null);assert.equal(values.size,0);
});
test('Google expiration, client mismatch, explicit logout and malformed storage clear credentials',()=>{
 const values=new Map(),storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};let now=1000;
 const cache=createLoginCache({storage,now:()=>now,clientId:'one'});cache.save('token',2000);now=2000;assert.equal(cache.read(),null);
 cache.save('token',9000);assert.equal(createLoginCache({storage,now:()=>now,clientId:'two'}).read(),null);
 cache.save('token',9000);cache.clear();assert.equal(cache.read(),null);
 values.set('melody-drive-login-v1','bad');assert.equal(cache.read(),null);
});
