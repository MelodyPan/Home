const {test}=require('node:test'),assert=require('node:assert/strict');
const ProjectEditor=require('../public/editor-state.js');
const row=id=>({id,title:id,description:'',category:'',url:'',linkText:'',badge:'',sortOrder:0,published:true,featured:false,newTab:false});
test('作品草稿可新增、編輯、排序與刪除，接受成功存檔後才清除變更狀態',()=>{
 const editor=new ProjectEditor({schemaVersion:1,updatedAt:null,projects:[row('a')]});assert.equal(editor.dirty,false);
 editor.upsert({...row('b'),sortOrder:1});editor.upsert({...row('a'),title:'新名稱',published:false});editor.move('b',-1);
 assert.deepEqual(editor.rows().map(r=>r.id),['b','a']);assert.equal(editor.rows()[1].title,'新名稱');assert.equal(editor.rows()[1].published,false);
 const exportCopy=editor.snapshot();exportCopy.projects[0].title='外部修改';assert.equal(editor.rows()[0].title,'b');
 editor.remove('a');assert.equal(editor.dirty,true);assert.deepEqual(editor.rows().map(r=>r.id),['b']);editor.accept(editor.snapshot());assert.equal(editor.dirty,false);
});
