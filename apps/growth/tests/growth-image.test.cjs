const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
// 以 Canvas 邊界替身驗證真實縮圖函式的尺寸計算，不依賴瀏覽器繪圖引擎。
function imageProcessor(width,height){
 let released=false;const bitmap={width,height,close(){released=true;}};
 const canvas={width:0,height:0,getContext(){return {fillRect(){},drawImage(){}};},toBlob(done,type){done({type});}};
 const source=fs.readFileSync('Javascript/growth.js','utf8').match(/async function compressPhoto\([\s\S]*?^}/m)[0];
 const context={createImageBitmap:async()=>bitmap,document:{createElement:()=>canvas}};vm.createContext(context);vm.runInContext(source,context);
 return {process:context.compressPhoto,canvas,released:()=>released};
}
// 相同縮圖函式接受不同長邊上限：大頭貼 512、故事 1800；同時確認圖片資源有釋放。
test('avatar thumbnails use requested edge while story photos keep their original limit',async()=>{
 const avatar=imageProcessor(1200,800);await avatar.process({name:'avatar.jpg'},512);assert.equal(avatar.canvas.width,512);assert.equal(avatar.canvas.height,341);assert.ok(avatar.released());
 const story=imageProcessor(2400,1600);await story.process({name:'story.jpg'});assert.equal(story.canvas.width,1800);assert.equal(story.canvas.height,1200);assert.ok(story.released());
});
// 小照片維持原尺寸，不刻意放大；像素超限時拒絕處理，仍必須釋放已解碼的點陣圖。
test('photo processing never enlarges small images and releases oversized bitmaps after rejection',async()=>{
 const small=imageProcessor(240,360);await small.process({name:'small.jpg'},512);assert.equal(small.canvas.width,240);assert.equal(small.canvas.height,360);
 const large=imageProcessor(10000,10000);await assert.rejects(large.process({name:'large.jpg'},512),/像素過大/);assert.ok(large.released());
});
