const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {loadDriveConfig}=require('../scripts/drive-config.cjs');
test('Drive configuration publishes only a validated public Client ID and always selects Drive',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'drive-config-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 assert.deepEqual(await loadDriveConfig(root,{}),{mode:'drive',googleClientId:''});
 await fs.writeFile(path.join(root,'bookmarks.config.json'),JSON.stringify({mode:'local',googleClientId:'123-test.apps.googleusercontent.com',clientSecret:'DO_NOT_PUBLISH',privateFile:'secret'}));
 const config=await loadDriveConfig(root,{});assert.equal(config.mode,'drive');assert.equal(config.googleClientId,'123-test.apps.googleusercontent.com');assert(!JSON.stringify(config).includes('DO_NOT_PUBLISH'));
 assert.equal((await loadDriveConfig(root,{BOOKMARKS_GOOGLE_CLIENT_ID:'456-other.apps.googleusercontent.com'})).googleClientId,'456-other.apps.googleusercontent.com');
 await assert.rejects(loadDriveConfig(root,{BOOKMARKS_GOOGLE_CLIENT_ID:'secret-or-invalid'}),/Client ID/);
});
