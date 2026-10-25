(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./project-model.js'));else root.ProjectEditor=factory(root.ProjectModel);})(globalThis,model=>{
 'use strict';
 return class ProjectEditor{
  constructor(document){this.accept(document);}
  accept(document){this.document=model.validateDocument(document);this.dirty=false;}
  rows(){return [...this.document.projects].sort((a,b)=>a.sortOrder-b.sortOrder||a.id.localeCompare(b.id));}
  snapshot(){return structuredClone(this.document);}
  upsert(row){const next=this.snapshot(),at=next.projects.findIndex(item=>item.id===row.id);if(at<0)next.projects.push(row);else next.projects[at]=row;this.document=model.validateDocument(next);this.dirty=true;}
  remove(id){this.document.projects=this.document.projects.filter(row=>row.id!==id);this.dirty=true;}
  move(id,direction){const rows=this.rows(),at=rows.findIndex(row=>row.id===id),target=at+direction;if(at<0||target<0||target>=rows.length)return;[rows[at],rows[target]]=[rows[target],rows[at]];this.document.projects=rows.map((row,index)=>({...row,sortOrder:index}));this.dirty=true;}
 };
});
