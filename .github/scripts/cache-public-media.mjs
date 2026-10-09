import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {pathToFileURL} from 'node:url'
const exec=promisify(execFile)
const execute=(command,args)=>exec(command,args,{timeout:60000,maxBuffer:4*1024*1024})
export function cachePolicy(key) {
  if (!key.startsWith('media/') || !/\.(?:webp|avif|png|jpe?g|svg)$/i.test(key)) return null
  return /(?:[-.]v\d+|-[a-f0-9]{8,})\.(?:webp|avif|png|jpe?g|svg)$/i.test(key)
    ? 'public,max-age=31536000,immutable' : 'public,max-age=3600,stale-while-revalidate=86400'
}
export function aclIdentity(acl) {
  if(!Array.isArray(acl?.Grants)||(!acl.Grants.length&&!acl.Owner?.ID)) throw new Error('Existing media permissions unavailable')
  return JSON.stringify({owner:acl.Owner?.ID??null,grants:acl.Grants.map(g=>[g.Permission,g.Grantee?.Type,g.Grantee?.ID??g.Grantee?.URI??g.Grantee?.EmailAddress??null]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))})
}
export function mediaCopyArgs({bucket,key,head,acl}) {
  const policy=cachePolicy(key)
  aclIdentity(acl)
  if (!policy) throw new Error('Only public media images can receive this cache policy')
  if(!head.ETag) throw new Error('Object content identity required')
  const args=['s3api','copy-object','--bucket',bucket,'--key',key,'--copy-source',bucket+'/'+encodeURIComponent(key).replaceAll('%2F','/'),'--metadata-directive','REPLACE','--cache-control',policy,'--copy-source-if-match',head.ETag]
  for(const [field,flag] of Object.entries({ContentType:'--content-type',ContentEncoding:'--content-encoding',ContentLanguage:'--content-language',ContentDisposition:'--content-disposition',Expires:'--expires',WebsiteRedirectLocation:'--website-redirect-location',StorageClass:'--storage-class',ServerSideEncryption:'--server-side-encryption',SSEKMSKeyId:'--ssekms-key-id'})) if(head[field]) args.push(flag,String(head[field]))
  if(Object.keys(head.Metadata??{}).length) args.push('--metadata',JSON.stringify(head.Metadata))
  // Keep exact existing permissions in the metadata copy, including owner access.
  const flags={FULL_CONTROL:'--grant-full-control',READ:'--grant-read',READ_ACP:'--grant-read-acp',WRITE_ACP:'--grant-write-acp'}
  const groups=new Map()
  // A confirmed empty Yandex object ACL inherits bucket/IAM access.
  // The default ACL of the new copy is also empty; verify this after copying.
  for(const grant of acl.Grants) {
    const flag=flags[grant.Permission]
    const names={CanonicalUser:['id','ID'],Group:['uri','URI'],AmazonCustomerByEmail:['emailAddress','EmailAddress']}
    const fields=names[grant.Grantee?.Type]
    const value=fields&&grant.Grantee[fields[1]]
    if(!flag||!value||/["\r\n]/.test(value)) throw new Error('Unsupported existing media grant')
    groups.set(flag,[...(groups.get(flag)??[]),fields[0]+'="'+value+'"'])
  }
  for(const [flag,grants] of groups) args.push(flag,grants.join(','))
  return args
}
export async function cacheMedia({bucket,endpoint,origin,run=execute,verify=fetch,log=console.log}) {
  if(!bucket||!endpoint||origin!=='https://gamescout.online') throw new Error('Invalid public media cache configuration')
  const aws=async args=>JSON.parse((await run('aws',[...args,'--endpoint-url',endpoint])).stdout||'{}')
  const listed=await aws(['s3api','list-objects-v2','--bucket',bucket,'--prefix','media/','--output','json'])
  const keys=(listed.Contents??[]).map(item=>item.Key).filter(key=>cachePolicy(key))
  if(!keys.length) throw new Error('No public media images found')
  let changed=0
  for(const key of keys) {
    const head=await aws(['s3api','head-object','--bucket',bucket,'--key',key,'--output','json'])
    if(head.CacheControl===cachePolicy(key)) continue
    const acl=await aws(['s3api','get-object-acl','--bucket',bucket,'--key',key,'--output','json'])
    await aws([...mediaCopyArgs({bucket,key,head,acl}),'--output','json'])
    const checked=await aws(['s3api','head-object','--bucket',bucket,'--key',key,'--output','json'])
    if(checked.CacheControl!==cachePolicy(key)||checked.ContentLength!==head.ContentLength||checked.ContentType!==head.ContentType) throw new Error('Media cache readback failed: '+key)
    const afterAcl=await aws(['s3api','get-object-acl','--bucket',bucket,'--key',key,'--output','json'])
    if(aclIdentity(afterAcl)!==aclIdentity(acl)) throw new Error('Media permissions readback changed: '+key)
    for(const field of ['ContentEncoding','ContentLanguage','ContentDisposition','StorageClass','ServerSideEncryption','SSEKMSKeyId']) if(checked[field]!==head[field]) throw new Error('Media metadata readback changed: '+field)
    const metadata=value=>JSON.stringify(Object.entries(value??{}).sort(([a],[b])=>a.localeCompare(b)))
    if(metadata(checked.Metadata)!==metadata(head.Metadata)) throw new Error('Custom metadata readback changed')
    changed++
  }
  for(const key of ['media/hub/nave-m-1080.webp','media/hub/nave-1920.webp','media/ranks/gold-v1.webp','media/ranks/silver-v1.webp','media/ranks/bronze-v1.webp']) {
    const response=await verify(origin+'/'+key,{method:'HEAD',signal:AbortSignal.timeout(15000)})
    const policy=response.headers.get('cache-control')??''
    if(!response.ok||!cachePolicy(key).split(',').every(token=>policy.includes(token))||/no-store|no-cache/.test(policy)) throw new Error('Public image cache policy not effective: '+key)
  }
  const html=await verify(origin+'/',{method:'HEAD',signal:AbortSignal.timeout(15000)})
  if(!html.ok||!/(?:no-cache|no-store)/i.test(html.headers.get('cache-control')??'')) throw new Error('HTML freshness policy changed unexpectedly')
  log('Verified public image caching; changed '+changed+' of '+keys.length+' images; HTML freshness preserved')
  return {changed,total:keys.length}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) cacheMedia({
  bucket:process.env.YC_BUCKET,endpoint:process.env.YC_S3_ENDPOINT,origin:'https://gamescout.online',
}).catch(error=>{console.error(error.stderr?.trim()||error.message);process.exitCode=1})
