/** Owner PC: download encrypted bytes only. Never load a recovery key or decrypt PostgreSQL. */
import {spawnSync} from 'node:child_process'
import {existsSync,mkdirSync,readFileSync,renameSync,writeFileSync,statSync} from 'node:fs'
import {createHash} from 'node:crypto'
import path from 'node:path'
import os from 'node:os'
const yc=path.join(os.homedir(),'yandex-cloud','bin','yc.exe'),bucket='gamescout-private-backups'
const directory=path.resolve('cold-backups')
function command(args){const r=spawnSync(yc,[...args,'--format','json','--retry','0'],{encoding:'utf8',windowsHide:true,timeout:60000,maxBuffer:1000000});if(r.status!==0)throw new Error('backup_storage_operation_failed');return JSON.parse(r.stdout)}
let continuation,objects=[]
for(let page=0;page<30;page++){
 const listing=command(['storage','s3api','list-objects-v2','--bucket',bucket,'--prefix','private-postgres/',...(continuation?['--continuation-token',continuation]:[])])
 objects.push(...(listing.contents??[]))
 continuation=listing.next_continuation_token
 if(!continuation){if(listing.is_truncated)throw new Error('listing_pagination_incomplete');break}
 if(page===29)throw new Error('listing_page_limit')
}
objects=objects.filter(row=>/^private-postgres\/\d{4}\/\d{2}\/\d{2}\/gamescout-\d{8}T\d{6}Z\.dump\.gpg$/.test(row.key)&&Number(row.size)>0)
objects.sort((a,b)=>Date.parse(b.last_modified)-Date.parse(a.last_modified))
const latest=objects[0]
if(!latest)throw new Error('encrypted_backup_not_found')
const metadata=command(['storage','s3api','head-object','--bucket',bucket,'--key',latest.key])
const expected=metadata.metadata?.sha256
if(!/^[a-f0-9]{64}$/.test(expected??''))throw new Error('backup_sha256_metadata_required')
mkdirSync(directory,{recursive:true})
const target=path.join(directory,path.basename(latest.key)),temporary=target+'.part'
const verify=file=>statSync(file).size===Number(latest.size)&&createHash('sha256').update(readFileSync(file)).digest('hex')===expected
if(existsSync(target)){
 if(!verify(target))throw new Error('existing_cold_backup_mismatch_do_not_overwrite')
}else{
 if(existsSync(temporary))throw new Error('partial_download_exists_review_before_retry')
 command(['storage','s3api','get-object','--bucket',bucket,'--key',latest.key,'--if-match',latest.etag,temporary])
 if(!verify(temporary))throw new Error('download_integrity_failed')
 renameSync(temporary,target)
}
writeFileSync(target+'.metadata.json',JSON.stringify({bucket,key:latest.key,bytes:Number(latest.size),sha256:expected,objectModified:latest.last_modified,downloadedAt:new Date().toISOString(),encrypted:true},null,2))
console.log(JSON.stringify({downloaded:true,encrypted:true,bytes:Number(latest.size),sha256Verified:true,path:target,recoveryKeyLoaded:false}))
