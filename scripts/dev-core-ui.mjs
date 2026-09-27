import { spawn } from 'node:child_process'
const child=spawn(process.execPath,['node_modules/vite/bin/vite.js'],{stdio:'inherit',windowsHide:true,env:{...process.env,GS_PRIVATE_CORE:'true'}})
child.on('exit',code=>process.exit(code??1))
