import {pathToFileURL} from 'node:url'
import {resolve} from 'node:path'
export async function checkPrimaryAccess({token,accountId,fetcher=fetch}) {
  if(!token||!accountId)throw Error('Missing existing Cloudflare CI credentials')
  const root=`https://api.cloudflare.com/client/v4/accounts/${accountId}`
  const checks=[['domains','/workers/domains'],['settings','/workers/scripts/gamescout-emergency-preview/settings'],['deployments','/workers/scripts/gamescout-emergency-preview/deployments']]
  const evidence=[]
  for(const [label,path] of checks){
    const r=await fetcher(root+path,{method:'GET',headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(20000)})
    let j;try{j=await r.json()}catch{j=null}
    const item={check:label,http:r.status,success:r.ok&&j?.success===true,codes:(j?.errors??[]).map(e=>e.code).filter(Number.isFinite)}
    evidence.push(item)
    if(!item.success)return {ok:false,stage:label,evidence,reason:[401,403].includes(r.status)?'CI credential access denied; do not retry or expand permissions automatically':'Provider read failed'}
    const data=j.result
    if(label==='domains'&&!data?.some(d=>d.hostname==='gamescout.online'&&d.service==='gamescout-emergency-preview'))return {ok:false,stage:label,evidence,reason:'Primary domain target changed; review required'}
    if(label==='settings'&&!(data?.bindings?.length===2&&data.bindings.some(b=>b.type==='assets'&&b.name==='ASSETS')&&data.bindings.some(b=>b.type==='service'&&b.name==='GAME_API')))return {ok:false,stage:label,evidence,reason:'Worker bindings changed; review required'}
    if(label==='deployments'&&!data?.deployments?.[0]?.versions?.length)return {ok:false,stage:label,evidence,reason:'No current deployment; review required'}
  }
  return {ok:true,evidence,reason:'Existing CI credential can read the actual primary Worker. Asset-session upload authorization remains unverified; browser login is not a CI credential repair.'}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  try{const report=await checkPrimaryAccess({token:process.env.CLOUDFLARE_API_TOKEN,accountId:process.env.CLOUDFLARE_ACCOUNT_ID});console.log(JSON.stringify(report,null,2));if(!report.ok)process.exitCode=1}
  catch{console.error('Read-only primary access check failed; no credential or response body logged');process.exitCode=1}
}
