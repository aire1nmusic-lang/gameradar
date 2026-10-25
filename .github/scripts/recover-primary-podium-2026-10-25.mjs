import assert from 'node:assert/strict'
import {readFile,writeFile,mkdir} from 'node:fs/promises'
import {workerName,deploymentSnapshot,promoteVersion,verifySite} from '../../scripts/publish-primary-worker.mjs'

// Exact previous version from durable artifact primary-rollback-40174268139-1.
const targetBuild='c3de1730e0b3fbf7e82b97426a9e6164b1d054c6'
const expectedBuild='8309d4b843b79e4b5354d668871320314f8897ea'
const targetVersion='24f73c44-8f8e-4186-ac70-f2588a3a736b'
const path='output/podium-recovery/rollback.json'
assert.ok(process.env.CLOUDFLARE_ACCOUNT_ID&&process.env.CLOUDFLARE_API_TOKEN,'Existing credentials required')
const base='https://api.cloudflare.com/client/v4/accounts/'+process.env.CLOUDFLARE_ACCOUNT_ID
const api=async(endpoint,init={})=>{
  const response=await fetch(base+endpoint,{...init,headers:{Authorization:'Bearer '+process.env.CLOUDFLARE_API_TOKEN,...init.headers},signal:AbortSignal.timeout(30000)})
  assert.ok(response.ok,'Cloudflare operation failed: HTTP '+response.status)
  const json=await response.json();assert.ok(json.success,'Cloudflare rejected recovery');return json.result
}
const route='/workers/scripts/'+workerName
const current=async()=>deploymentSnapshot((await api(route+'/deployments')).deployments[0])
const persist=async value=>{await mkdir('output/podium-recovery',{recursive:true});await writeFile(path,JSON.stringify(value,null,2)+'\n',{mode:0o600})}
const domains=await api('/workers/domains')
assert.ok(domains.some(d=>d.hostname==='gamescout.online'&&d.service===workerName),'Primary domain target changed')
if(process.argv[2]==='prepare'){
  await verifySite(expectedBuild)
  const before=await current()
  const account=await api('/workers/subdomain')
  assert.match(account.subdomain,/^[a-z0-9-]+$/)
  const preview='https://'+targetVersion.slice(0,8)+'-'+workerName+'.'+account.subdomain+'.workers.dev'
  await verifySite(targetBuild,fetch,preview,false)
  await persist({schema:1,worker:workerName,sha:targetBuild,previous:before,previousBuild:expectedBuild,candidate:targetVersion,status:'uploaded',createdAt:new Date().toISOString()})
  console.log('Known-good existing version preflight verified; current split saved for reversible recovery')
}else{
  assert.equal(process.argv[2],'activate')
  const manifest=JSON.parse(await readFile(path,'utf8'))
  assert.equal(manifest.sha,targetBuild);assert.equal(manifest.candidate,targetVersion);assert.equal(manifest.previousBuild,expectedBuild)
  const age=Date.now()-Date.parse(manifest.createdAt);assert.ok(age>=0&&age<600000,'Recovery snapshot expired')
  await verifySite(expectedBuild)
  await promoteVersion(manifest,{current,persist,
    deploy:versions=>api(route+'/deployments',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({strategy:'percentage',versions})}),
    verify:async()=>{let error;for(let i=0;i<20;i++){try{await verifySite(targetBuild);return}catch(e){error=e}await new Promise(r=>setTimeout(r,3000))}throw error},
    verifyRollback:()=>verifySite(expectedBuild),
  })
  console.log('VERIFIED primary recovery to '+targetBuild+'; no bucket, DNS, routes or API configuration changes')
}
