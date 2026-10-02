import {existsSync,writeFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
if(!existsSync('.dev.vars')){
 const key=()=>randomBytes(32).toString('hex');
 writeFileSync('.dev.vars',['# Local only. Do not commit or reuse for production.','ENVIRONMENT=development','DEV_AUTH_ENABLED=true','PUBLIC_ONLY=false','DEV_AUTH_SECRET='+key(),'ADMIN_TOKEN='+key(),'IP_HASH_SECRET='+key(),'ALLOWED_ORIGIN=http://localhost:5173','DEV_ALLOWED_ORIGINS=http://127.0.0.1:8790,http://localhost:8790',''].join('\n'),{mode:0o600});
 console.log('Created .dev.vars. Use DEV_AUTH_SECRET from this file to sign in.');
}else console.log('Keeping existing .dev.vars.');
