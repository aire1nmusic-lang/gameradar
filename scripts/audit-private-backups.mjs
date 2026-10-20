// Read metadata only: no recovery key, download, decryption or storage mutation.
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {homedir} from 'node:os'
import {join} from 'node:path'
import {pathToFileURL} from 'node:url'
import {mkdir,writeFile} from 'node:fs/promises'
const bucket='gamescout-private-backups'
const keyPattern=/^private-postgres\/\d{4}\/\d{2}\/\d{2}\/gamescout-\d{8}T\d{6}Z\.dump\.gpg$/
export function backupFreshness(objects,{now=Date.now(),maxAgeHours=25}={}){
  if(!Array.isArray(objects)||!Number.isFinite(now)||!Number.isFinite(maxAgeHours)||maxAgeHours<1||maxAgeHours>168)throw new Error('invalid_backup_audit_configuration')
  const entries=objects.filter(o=>keyPattern.test(o?.key)&&Number.isSafeInteger(Number(o.size))&&Number(o.size)>0&&Number.isFinite(Date.parse(o.last_modified)))
    .sort((a,b)=>Date.parse(b.last_modified)-Date.parse(a.last_modified))
  const latest=entries[0],ageSeconds=latest?Math.floor((now-Date.parse(latest.last_modified))/1000):null
  return {bucket,objectsAnalyzed:entries.length,maxAgeHours,status:!latest||ageSeconds < -300?'unknown':ageSeconds>maxAgeHours*3600?'stale':'recent_object',
    latest:latest?{key:latest.key,modified:latest.last_modified,bytes:Number(latest.size)}:null,ageSeconds,
    metadataOnly:true,restoreVerified:false,cronVerified:false}
}
export async function auditPrivateBackups(readPage,options){
  let continuation,objects=[]
  for(let page=0;page<50;page++){
    const listing=await readPage(continuation)
    if(!listing||!Array.isArray(listing.contents??[]))throw new Error('invalid_storage_listing')
    objects.push(...listing.contents??[])
    const next=listing.next_continuation_token
    if(!next){if(listing.is_truncated)throw new Error('incomplete_backup_listing');return backupFreshness(objects,options)}
    if(next===continuation)throw new Error('repeated_backup_listing_cursor')
    continuation=next
  }
  throw new Error('backup_listing_page_limit')
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{
    const yc=process.env.YC_CLI||(process.platform==='win32'?join(homedir(),'yandex-cloud/bin/yc.exe'):'yc')
    const report=await auditPrivateBackups(async cursor=>{
      let result
      try{result=await promisify(execFile)(yc,['storage','s3api','list-objects-v2','--bucket',bucket,'--prefix','private-postgres/',
        '--max-keys','1000',...(cursor?['--continuation-token',cursor]:[]),'--format','json','--retry','0'],{windowsHide:true,timeout:30000,maxBuffer:2*1024*1024})}
      catch{throw new Error('backup_metadata_access_failed')}
      return JSON.parse(result.stdout)
    })
    await mkdir('output',{recursive:true});await writeFile('output/private-backup-audit.json',JSON.stringify(report,null,2)+'\n')
    console.log(JSON.stringify(report));if(report.status!=='recent_object')process.exitCode=2
  }catch(error){console.error(error.message);process.exitCode=1}
}
