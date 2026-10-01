import { lookup, resolveTxt } from 'node:dns/promises'
import { request } from 'node:https'
import { assertPublicHost, isPublicIpv4, withDeadline } from '../worker/adapters/network.ts'
import { digest } from './crypto.mjs'

export function proofTarget(website, method) {
  if(method==='MANUAL')return 'PUBLIC_RESOURCE_ADMIN_REVIEW'
  const url=new URL(website)
  if(url.protocol!=='https:'||url.username||url.password||url.port)throw new Error('official_https_site_required')
  const host=assertPublicHost(url.hostname)
  return method==='DNS'?`_gamescout.${host}`:new URL('/.well-known/gamescout-verification.txt',url.origin).href
}

// Owner input never chooses a URL: it is derived from the locked private registry.
// Pin DNS to a checked IPv4; no redirects, cookies, credentials or external DNS API.
async function siteText(target) {
  const url=new URL(target)
  const addresses=await withDeadline(lookup(url.hostname,{family:4,all:true}),5000)
  if(!addresses.length||addresses.some(a=>!isPublicIpv4(a.address)))throw new Error('private_target')
  return new Promise((resolve,reject)=>{
    const req=request(url,{method:'GET',headers:{Accept:'text/plain'},
      lookup:(_host,options,callback)=>callback(null,options.all?[{address:addresses[0].address,family:4}]:addresses[0].address,4)},res=>{
      if(res.statusCode!==200){res.destroy();reject(new Error('proof_http_status'));return}
      const chunks=[];let bytes=0
      res.on('data',chunk=>{bytes+=chunk.length;if(bytes>4096)res.destroy(new Error('proof_too_large'));else chunks.push(chunk)})
      res.on('end',()=>resolve(Buffer.concat(chunks).toString('utf8').trim()))
      res.on('error',reject)
    })
    const timer=setTimeout(()=>req.destroy(new Error('proof_timeout')),5000)
    req.on('close',()=>clearTimeout(timer));req.on('error',reject);req.end()
  })
}

export async function checkClaimProof(proof,{readSite=siteText,readDns=resolveTxt}={}) {
  if(proof.method==='SITE')return digest(await readSite(proof.target))===proof.token_hash
  if(proof.method==='DNS') {
    const records=await withDeadline(readDns(proof.target),5000)
    return records.slice(0,32).some(chunks=>digest(chunks.join(''))===proof.token_hash)
  }
  return false // Manual proof is checked only by ADMIN and never grants access itself.
}
