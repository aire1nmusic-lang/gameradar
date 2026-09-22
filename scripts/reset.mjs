import {existsSync,renameSync,mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {runWrangler,statePath,stateArgs} from './tooling.mjs';
import {seedSql} from './seed.mjs';
// Keep the previous state as a backup. Never delete a database automatically.
if(statePath!==path.resolve('.wrangler/state')||!statePath.startsWith(path.resolve('.wrangler')+path.sep))throw new Error('Unexpected state path');
if(existsSync(statePath)){
 const backup=path.resolve('.wrangler/state-backup-'+new Date().toISOString().replaceAll(':','-').replaceAll('.','-'));
 renameSync(statePath,backup);console.log('Previous local database retained at '+backup);
}
runWrangler(['d1','migrations','apply','gamescout','--local',...stateArgs()]);
mkdirSync('.wrangler',{recursive:true});writeFileSync('.wrangler/dev-seed.sql',seedSql());
runWrangler(['d1','execute','gamescout','--local',...stateArgs(),'--file','.wrangler/dev-seed.sql']);
