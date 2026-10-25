// 各站測試使用自己的工作目錄，讓現有相對資源路徑保持正確。
const {spawnSync}=require('node:child_process'),path=require('node:path'),fs=require('node:fs');
for(const directory of ['apps/bookmarks','apps/growth','apps/shared','apps/admin','scripts']){
 const cwd=path.join(__dirname,'..',directory);
 const files=fs.readdirSync(path.join(cwd,'tests')).filter(file=>file.endsWith('.test.cjs')).map(file=>path.join('tests',file));
 const result=spawnSync(process.execPath,['--test',...files],{cwd,stdio:'inherit'});
 if(result.status!==0){process.exitCode=result.status??1;break;}
}
