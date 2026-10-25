const {main}=require('../../../scripts/home-site-start.cjs');
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={main};
