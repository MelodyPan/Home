const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
test('GitHub 專案子路徑的 API／照片及返回 Home 網址保持正確，預覽顯示提示',()=>{
 const added=[],document={body:{dataset:{page:'growth'}},currentScript:{src:'https://example.com/Home/bookmarks/Javascript/app-runtime.js'},createElement:()=>({setAttribute(){}}),querySelector:()=>({append:el=>added.push(el),prepend:el=>added.push(el)})};
 const context={URL,document,BookmarksConfig:{mode:'preview',homeUrl:'../index.html'}};
 vm.runInNewContext(fs.readFileSync('Javascript/app-runtime.js','utf8'),context);
 assert.equal(context.BookmarksRuntime.url('/api/growth'),'https://example.com/Home/bookmarks/api/growth');
 assert.equal(context.BookmarksRuntime.url('/assets/growth-photos/a.jpg'),'https://example.com/Home/bookmarks/assets/growth-photos/a.jpg');
 assert.equal(added[0].href,'https://example.com/Home/index.html');assert.match(added[1].textContent,/雲端儲存尚未設定/);
});
