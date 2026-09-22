import {runWrangler,stateArgs} from './tooling.mjs';
runWrangler(['d1','migrations','apply','gamescout','--local',...stateArgs()]);
