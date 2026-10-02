/** Owner CLI only. No cloud IAM, DNS, database schema or paid resource changes. */
import {spawnSync} from 'node:child_process'
import path from 'node:path'
import os from 'node:os'
const mode=process.argv[2]
if(!['on','off'].includes(mode))throw new Error('Usage: node scripts/vm-emergency.mjs on|off')
const enabled=mode==='on'
const script=`set -euo pipefail
cd /home/spl23071994/gamescout-staging/deploy/vm
python3 - <<'PY'
import os,tempfile
from pathlib import Path
p=Path('.env')
original=p.read_bytes()
backup=p.with_name('.env.emergency-before')
fd=os.open(backup,os.O_WRONLY|os.O_CREAT|os.O_TRUNC,0o600)
with os.fdopen(fd,'wb') as f: f.write(original)
lines=original.decode().splitlines()
if sum(line.startswith('EMERGENCY_MODE=') for line in lines)>1: raise SystemExit('duplicate_mode_setting')
lines=[line for line in lines if not line.startswith('EMERGENCY_MODE=')]+['EMERGENCY_MODE=${enabled}']
fd,name=tempfile.mkstemp(prefix='.env.emergency-',dir='.')
os.fchmod(fd,0o600)
with os.fdopen(fd,'w') as f:
 f.write('\\n'.join(lines)+'\\n');f.flush();os.fsync(f.fileno())
os.replace(name,p)
PY
sudo -n docker compose up -d --no-deps api </dev/null
sudo -n docker compose exec -T api node --input-type=module <<'NODE'
import {productionConfig} from './private-api/production-config.mjs'
import {postgresStore} from './private-api/db.mjs'
const loaded=await productionConfig()
if(loaded.config.emergencyMode!==${enabled})throw new Error('mode_not_loaded')
const db=postgresStore(loaded.connectionString,loaded.ca)
try{await db.query('INSERT INTO gs_audit(action,target,details) VALUES($1,$2,$3)', ['security.emergency.${enabled?'enabled':'disabled'}','private-api',JSON.stringify({source:'owner-cli',enabled:${enabled},rollback:'owner-cli-off'})])}finally{await db.close()}
const r=await fetch('http://127.0.0.1:8080/api/v1/health',{signal:AbortSignal.timeout(5000)})
if(!r.ok)throw new Error('health_failed')
console.log(JSON.stringify({emergencyMode:${enabled},health:r.status,auditRecorded:true}))
NODE
`
const r=spawnSync(path.join(os.homedir(),'yandex-cloud','bin','yc.exe'),['compute','ssh','--id','epddo56nft32itnfrakl','--public-address','--','bash -s'],{input:script,encoding:'utf8',windowsHide:true,timeout:45000,maxBuffer:100000})
if(r.stdout)process.stdout.write(r.stdout)
if(r.status!==0)throw new Error('emergency_toggle_failed_review_vm_privately')
