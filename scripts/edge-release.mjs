import {spawnSync} from 'node:child_process'
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs'
import {setTimeout as delay} from 'node:timers/promises'
const config='wrangler.emergency-preview.toml'
const statePath='output/edge-release.json'
mkdirSync('output',{recursive:true})
function wrangler(args,capture=false){
  const run=spawnSync(process.execPath,['node_modules/wrangler/bin/wrangler.js',...args,'--config',config],{encoding:'utf8',stdio:capture?'pipe':'inherit'})
  if(run.status!==0)throw new Error(`Wrangler command failed: ${args[0]} ${args[1]}`)
  return run.stdout
}
function latest(){
  const entries=JSON.parse(wrangler(['deployments','list','--json'],true))
  const current=entries.sort((a,b)=>a.created_on.localeCompare(b.created_on)).at(-1)
  if(current?.versions?.length!==1||current.versions[0].percentage!==100)throw new Error('Expected one active version at 100%; refusing mixed deployment')
  return current.versions[0].version_id
}
const phase=process.argv[2]
if(phase==='upload'){
  const previous=latest()
  writeFileSync(statePath,JSON.stringify({previous},null,2))
  const log=wrangler(['versions','upload','--keep-vars','--tag',`top3-${(process.env.GITHUB_SHA||'local').slice(0,8)}`,'--preview-alias','top3-review'],true)
  const candidate=log.match(/Worker Version ID:\s*([a-f0-9-]{36})/i)?.[1]
  const preview=log.match(/Version Preview URL:\s*(https:\/\/\S+)/i)?.[1]
  if(!candidate||!preview)throw new Error('Upload metadata missing; active version unchanged')
  writeFileSync(statePath,JSON.stringify({previous,candidate,preview},null,2))
  console.log(JSON.stringify({previous,candidate,preview}))
}else if(phase==='deploy'){
  const state=JSON.parse(readFileSync(statePath,'utf8'))
  if(latest()!==state.previous)throw new Error('Active version changed since preflight; refusing overwrite')
  wrangler(['versions','deploy',`${state.candidate}@100`,'--yes','--message','Approved TOP-3 and real prerender 404; preserve Supabase entry'])
}else if(phase==='wait-live'){
  const expected=readFileSync('dist/index.html','utf8').match(/\/assets\/index-[A-Za-z0-9_-]+\.js/)?.[0]
  if(!expected)throw new Error('Expected build entry missing')
  const deadline=Date.now()+120000
  let ready=false
  while(Date.now()<deadline){
    try {
      const home=await fetch('https://gamescout.online/',{headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(10000)})
      const source=await home.text()
      const missing=await fetch('https://gamescout.online/nonexistent-seo-route-7249',{headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(10000)})
      const missingBody=await missing.text()
      ready=home.status===200&&source.includes(expected)&&missing.status===404&&missingBody.includes('noindex, nofollow')
      console.log(JSON.stringify({freshBuild:source.includes(expected),missingStatus:missing.status,missingCache:missing.headers.get('CF-Cache-Status')}))
      if(ready)break
    }catch { console.log('Waiting for canonical frontend readiness') }
    await delay(5000)
  }
  if(!ready)throw new Error('Canonical version/404 readiness timed out; postflight must roll back')
}else if(phase==='rollback'){
  const state=JSON.parse(readFileSync(statePath,'utf8'))
  if(latest()!==state.candidate)throw new Error('Active version changed; refusing to roll back another release')
  wrangler(['versions','deploy',`${state.previous}@100`,'--yes','--message','Rollback failed TOP-3 postflight'])
  if(latest()!==state.previous)throw new Error('Rollback readback failed')
}else throw new Error('Use upload, deploy, wait-live or rollback')
