import assert from 'node:assert/strict'
import { test } from 'node:test'
import { build, transform } from 'esbuild'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const originalFetch = globalThis.fetch
const load = code => import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'))
const format = await load((await transform(await readFile('src/lib/format.ts','utf8'), { loader:'ts', format:'esm' })).code)
const reads = await load((await transform(await readFile('src/repositories/http/publicRead.ts','utf8'), { loader:'ts', format:'esm' })).code)
const bundled = await build({entryPoints:['src/services/catalogService.ts'],bundle:true,write:false,format:'esm',platform:'node',alias:{'@':resolve('src')},plugins:[{
  name:'read-only-catalog-fixture',setup(b){b.onResolve({filter:/^@\/repositories$/},()=>({path:'repo',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const repo={servers:{query:async()=>({items:globalThis.catalogCards,total:globalThis.catalogCards.length,offset:0,limit:100})}}',loader:'js'}))},
}]})
const catalog = await load(bundled.outputFiles[0].text)

test('live countdown: seconds, days, exact boundary and invalid timestamp',()=>{
  const now=Date.parse('2026-10-08T03:00:00Z')
  assert.equal(format.formatLiveCountdown('2026-10-09T04:02:03Z',now),'1 д 01:02:03')
  assert.equal(format.formatLiveCountdown('2026-10-08T03:00:01Z',now+999),'00:00:01')
  assert.equal(format.formatLiveCountdown('2026-10-08T03:00:01Z',now+1000),'Открыт')
  assert.equal(format.formatLiveCountdown('invalid',now),'Время не указано')
})

test('public server GET retries transient 503 once; POST never retries',async()=>{
  try{
    let calls=0
    globalThis.fetch=async()=>new Response('{}',{status:++calls===1?503:200})
    assert.equal((await reads.fetchApiResponse('/api/v1/servers',{})).status,200)
    assert.equal(calls,2)
    calls=0
    assert.equal((await reads.fetchApiResponse('/api/v1/servers',{method:'POST'})).status,503)
    assert.equal(calls,1)
  }finally{globalThis.fetch=originalFetch}
})

test('aggregate 503 does not hide cards or replace available catalog values with zero',async()=>{
  try{
    globalThis.catalogCards=[{id:'a',votes:7,support:{coins:4,participants:2}},{id:'b',votes:2,support:{coins:0,participants:0}}]
    for(const missing of ['people-rating','support/ranking','both']){
      catalog.invalidateDiscoveryCache()
      globalThis.fetch=async url=>new Response(JSON.stringify(String(url).includes('people-rating')?[{server_id:'a',votes:9}]:[{server_id:'a',coins:6,participants:3}]),{status:missing==='both'||String(url).includes(missing)?503:200})
      const cards=await catalog.discoveryServers()
      assert.equal(cards.length,2)
      assert.equal(cards[0].votes,missing==='people-rating'||missing==='both'?7:9)
      assert.equal(cards[0].support.coins,missing==='support/ranking'||missing==='both'?4:6)
      assert.equal(cards[0].rankingAvailability.votes,missing!=='people-rating'&&missing!=='both')
      assert.equal(cards[0].rankingAvailability.support,missing!=='support/ranking'&&missing!=='both')
    }
  }finally{globalThis.fetch=originalFetch;delete globalThis.catalogCards}
})

test('public cards publish before a stalled ranking, then update with actual scores', {timeout:3000}, async()=>{
  let releasePeople
  try{
    catalog.invalidateDiscoveryCache()
    globalThis.catalogCards=[{id:'fast',votes:7,support:{coins:4,participants:2}}]
    globalThis.fetch=async url=>String(url).includes('people-rating')
      ?new Promise(resolve=>{releasePeople=()=>resolve(new Response(JSON.stringify([{server_id:'fast',votes:9}])))})
      :new Response(JSON.stringify([{server_id:'fast',coins:6,participants:3}]))
    let publish,complete=false
    const first=new Promise(resolve=>{publish=resolve})
    const result=catalog.discoveryServers({},false,publish).then(rows=>{complete=true;return rows})
    const snapshot=await first
    assert.equal(complete,false,'Slow optional ranking cannot block public cards')
    assert.equal(snapshot[0].id,'fast')
    assert.equal(snapshot[0].votes,7,'Preserve available catalog values while loading')
    assert.equal(snapshot[0].rankingAvailability.pending,true)
    releasePeople()
    const final=await result
    assert.equal(final[0].votes,9)
    assert.equal(final[0].support.coins,6)
    assert.equal(final[0].rankingAvailability.pending,false)
  }finally{releasePeople?.();globalThis.fetch=originalFetch;delete globalThis.catalogCards;catalog.invalidateDiscoveryCache()}
})

test('concurrent public reads share one request and independent bodies; private reads and writes stay fresh',async()=>{
  try{
    reads.invalidatePublicReads()
    let calls=0,release
    const response=()=>new Response(JSON.stringify({items:[{id:'public'}]}),{headers:{'content-type':'application/json'}})
    globalThis.fetch=async()=>{calls++;return calls===1?new Promise(resolve=>{release=()=>resolve(response())}):response()}
    const a=reads.fetchApiResponse('/api/v1/servers?limit=100',{}),b=reads.fetchApiResponse('/api/v1/servers?limit=100',{})
    assert.equal(calls,1);release()
    assert.deepEqual(await (await a).json(),await (await b).json())
    assert.equal((await (await reads.fetchApiResponse('/api/v1/servers?limit=100',{})).json()).items[0].id,'public')
    assert.equal(calls,1)
    reads.invalidatePublicReads()
    await reads.fetchApiResponse('/api/v1/servers?limit=100',{});assert.equal(calls,2)
    for(const path of ['/api/v1/auth/me','/api/v1/coins/balance','/api/v1/servers']){
      const init=path.endsWith('/servers')?{method:'POST'}:{}
      await reads.fetchApiResponse(path,init);await reads.fetchApiResponse(path,init)
    }
    assert.equal(calls,8,'Never cache private state or mutations')
  }finally{globalThis.fetch=originalFetch;reads.invalidatePublicReads()}
})

