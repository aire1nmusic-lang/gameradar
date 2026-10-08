import {test} from 'node:test'
import assert from 'node:assert/strict'
import {cachePolicy,mediaCopyArgs,cacheMedia} from './cache-public-media.mjs'
const head={CacheControl:'no-cache, no-store',ContentLength:123,ContentType:'image/webp',ContentEncoding:'gzip',Metadata:{source:'original'}}
const acl={Grants:[{Permission:'FULL_CONTROL',Grantee:{Type:'CanonicalUser',ID:'owner'}},{Permission:'READ',Grantee:{Type:'Group',URI:'http://acs.amazonaws.com/groups/global/AllUsers'}}]}
test('only media images are cached; unversioned art is bounded and versioned art immutable',()=>{
 assert.equal(cachePolicy('index.html'),null);assert.equal(cachePolicy('media/settings.json'),null)
 assert.match(cachePolicy('media/hub/nave-1920.webp'),/max-age=3600,/)
 assert.match(cachePolicy('media/ranks/gold-v1.webp'),/max-age=31536000,immutable/)
})
test('metadata copy preserves content type, encoding, custom metadata and exact object access',()=>{
 const args=mediaCopyArgs({bucket:'site',key:'media/art space.webp',head,acl})
 const after=flag=>args[args.indexOf(flag)+1]
 assert.equal(after('--copy-source'),'site/media/art%20space.webp')
 assert.equal(after('--content-type'),head.ContentType);assert.equal(after('--content-encoding'),head.ContentEncoding)
 assert.deepEqual(JSON.parse(after('--metadata')),head.Metadata)
 assert.equal(after('--grant-full-control'),'id="owner"')
 assert.equal(after('--grant-read'),'uri="http://acs.amazonaws.com/groups/global/AllUsers"')
 assert.throws(()=>mediaCopyArgs({bucket:'site',key:'index.html',head,acl}),/Only public media/)
 assert.throws(()=>mediaCopyArgs({bucket:'site',key:'media/art.webp',head,acl:{}}),/permissions unavailable/)
})
test('unchanged byte metadata and new cache policy are read back; public image/HTML policies verified',async()=>{
 const calls=[];let copied=false
 const run=async(command,args)=>{
  calls.push(args);const action=args[1]
  const value=action==='list-objects-v2'?{Contents:[{Key:'media/art.webp'},{Key:'media/info.json'}]}:action==='get-object-acl'?acl:action==='copy-object'?(copied=true,{}):{...head,CacheControl:copied?cachePolicy('media/art.webp'):head.CacheControl}
  return {stdout:JSON.stringify(value)}
 }
 const verified=[]
 const verify=async(url)=>{verified.push(url);return {ok:true,headers:new Headers({'cache-control':url.endsWith('/')?'no-cache, no-store':cachePolicy(new URL(url).pathname.slice(1))})}}
 const result=await cacheMedia({bucket:'site',endpoint:'https://storage.invalid',origin:'https://gamescout.online',run,verify,log:()=>{}})
 assert.deepEqual(result,{changed:1,total:1});assert.equal(calls.filter(a=>a[1]==='copy-object').length,1);assert.equal(verified.length,6)
 assert.equal(calls.filter(a=>a[1]==='head-object').length,2)
})
test('missing permission data stops before a metadata write',async()=>{
 let copied=false
 const run=async(command,args)=>{const action=args[1];if(action==='copy-object')copied=true;return {stdout:JSON.stringify(action==='list-objects-v2'?{Contents:[{Key:'media/art.webp'}]}:action==='head-object'?head:{})}}
 await assert.rejects(cacheMedia({bucket:'site',endpoint:'https://storage.invalid',origin:'https://gamescout.online',run,verify:()=>{throw Error('unexpected')},log:()=>{}}),/permissions unavailable/)
 assert.equal(copied,false)
})
