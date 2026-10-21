/** Owner-approved eight-archive cleanup through the owner's existing Yandex CLI profile. */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export const REMOVE = new Map([
 ['d85745a3132b9ac818d1d73ec1c255102cbedeb1',82715342],
 ['50b43cb42acb4e0ce74162560ef4995c9a4a6de3',84010005],
 ['9a090b0e44275baefe547f3409da5269e0c56703',84010155],
 ['a4fc87f3eac5fcba0beb3c195bad643a2b1ca8a2',84011097],
 ['8559de3dc1b86ac1e5943e3d72194785abacf583',83982396],
 ['38989d269f2dec936fe615b66254aedf400adc10',83982696],
 ['6068a95d67a42b3b193349ea3900d6659ba55593',84010157],
 ['9dfd81eeedce153a094497a2adfd68813a2b07ec',84010085],
])
export const KEEP = new Map([
 ['9583ce107954565a8543a6d96edd3cf66064e3e4',84008578],
 ['ee627d294892c17a70ed16503134ad385ecb298b',86613421],
 ['334e7ddbaab8593f1d4ca9699972034341de8f5f',86586109],
])
export function plan(rows) {
 const pick=(sha,bytes,required)=>{
  const found=rows.filter(row=>row.key.startsWith(`_deployment-backups/${sha}/`))
  if(!found.length&&!required)return []
  if(found.length!==1||found[0].size!==bytes||!/^_deployment-backups\/[a-f0-9]{40}\/\d+-\d+\/site-rollback.tar.gz$/.test(found[0].key))throw Error(`Archive verification failed: ${sha}`)
  return found
 }
 return {keep:[...KEEP].flatMap(([sha,size])=>pick(sha,size,true)),remove:[...REMOVE].flatMap(([sha,size])=>pick(sha,size,false))}
}
export async function cleanup({call,apply=false}) {
 const list=()=>{
  let token;const rows=[]
  for(let page=0;page<30;page++){
   const r=call('list-objects-v2',['--prefix','_deployment-backups/',...(token?['--continuation-token',token]:[])])
   rows.push(...(r.contents??r.Contents??[]).map(row=>({key:row.key??row.Key,size:Number(row.size??row.Size)})))
   token=r.next_continuation_token??r.NextContinuationToken
   if(!token){if(r.is_truncated??r.IsTruncated)throw Error('Incomplete archive inventory');return rows}
  }
  throw Error('Archive pagination limit')
 }
 const before=list(),selected=plan(before)
 for(const row of [...selected.keep,...selected.remove]){
  const head=call('head-object',['--key',row.key])
  if(Number(head.content_length??head.ContentLength)!==row.size)throw Error('Archive HEAD verification failed')
 }
 console.log(JSON.stringify({apply,archivesToDelete:selected.remove.length,controlArchives:3,bytesToFree:selected.remove.reduce((sum,row)=>sum+row.size,0)}))
 if(!apply)return selected
 for(const row of selected.remove){call('delete-object',['--key',row.key]);console.log('DELETED '+row.key)}
 const after=list(),remaining=plan(after)
 if(remaining.remove.length)throw Error('Approved archive remains after delete')
 const removed=new Set(selected.remove.map(row=>row.key))
 for(const row of before)if(!removed.has(row.key)&&!after.some(next=>next.key===row.key&&next.size===row.size))throw Error('Unrelated archive changed')
 console.log('CLEANUP_VERIFIED '+JSON.stringify({archivesDeleted:selected.remove.length,controlArchivesKept:3,bytesFreed:selected.remove.reduce((sum,row)=>sum+row.size,0)}))
 return selected
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{
  const yc=process.env.YC_CLI??join(homedir(),'yandex-cloud','bin',process.platform==='win32'?'yc.exe':'yc')
  if(!existsSync(yc))throw Error('Existing Yandex CLI not found. Set YC_CLI to its existing executable path.')
  const call=(operation,args)=>{
   const r=spawnSync(yc,['storage','s3api',operation,'--bucket','gamescout-ru-site',...args,'--format','json','--retry','0'],{encoding:'utf8',windowsHide:true,timeout:180000,maxBuffer:2000000})
   if(r.error||r.status!==0){const code=(r.stderr??'').match(/AccessDenied|PermissionDenied|Unauthenticated|UNAUTHENTICATED|PERMISSION_DENIED|Forbidden/);throw Error(`${operation} failed${code?': '+code[0]:''}. Existing CLI profile must have access to this bucket.`)}
   return r.stdout.trim()?JSON.parse(r.stdout):{}
  }
  await cleanup({call,apply:process.argv.includes('--apply')})
 }catch(e){console.error(e.message);process.exitCode=1}
}
