// Reserve an unattached, empty-file manifest; never upload bytes or deploy/activate a version.
import {pathToFileURL} from 'node:url'
import {resolve} from 'node:path'
export async function inspectUploadSession({token,accountId,fetcher=fetch,now=Date.now()}){
  if(!token||!accountId)throw Error('Existing CI credentials required')
  const r=await fetcher(`https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/gamescout-emergency-preview/assets-upload-session`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({manifest:{'/__diagnostic_empty_file__.txt':{hash:'e3b0c44298fc1c149afbf4c8996fb924',size:0}}}),signal:AbortSignal.timeout(20000)})
  let j;try{j=await r.json()}catch{j=null}
  const report={http:r.status,ok:r.ok&&j?.success===true,codes:(j?.errors??[]).map(x=>x.code).filter(Number.isFinite)}
  if(!report.ok)return report
  const result=j.result, jwt=result?.jwt
  report.tokenPresent=typeof jwt==='string'&&jwt.length>0
  report.bucketCount=Array.isArray(result?.buckets)?result.buckets.length:null
  report.requestedFiles=Array.isArray(result?.buckets)?result.buckets.flat().length:null
  if(typeof jwt==='string')try{const claims=JSON.parse(Buffer.from(jwt.split('.')[1],'base64url'));report.remainingSeconds=Number.isFinite(claims.exp)?Math.floor(claims.exp-now/1000):null;report.notBeforeSeconds=Number.isFinite(claims.nbf)?Math.floor(claims.nbf-now/1000):null}catch{report.jwtClaimsReadable=false}
  report.ok=report.ok&&report.tokenPresent&&report.bucketCount!==null
  return report
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){try{const r=await inspectUploadSession({token:process.env.CLOUDFLARE_API_TOKEN,accountId:process.env.CLOUDFLARE_ACCOUNT_ID});console.log(JSON.stringify(r,null,2));if(!r.ok)process.exitCode=1}catch{console.error('Upload session diagnostic failed; no token or raw response logged');process.exitCode=1}}
