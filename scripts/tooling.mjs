import {spawnSync} from 'node:child_process';
import path from 'node:path';
export const statePath=path.resolve('.wrangler/state');
export const stateArgs=()=>['--persist-to',statePath];
export function runWrangler(args){const r=spawnSync(process.execPath,['node_modules/wrangler/bin/wrangler.js',...args],{stdio:'inherit',windowsHide:true,env:{...process.env,WRANGLER_SEND_METRICS:'false'}});if(r.error)throw r.error;if(r.status!==0)process.exit(r.status??1);}
