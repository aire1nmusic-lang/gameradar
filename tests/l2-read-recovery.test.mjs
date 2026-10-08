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
