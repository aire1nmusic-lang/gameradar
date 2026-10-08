import assert from 'node:assert/strict'
import test from 'node:test'
import { fetchPublishedCatalog } from '../scripts/reconcile-public-html.mjs'

const card={id:'public-only',slug:'public-only',gameId:'lineage2'}
const valid=()=>Response.json({items:[card],total:1,offset:0,limit:100})

test('public catalog gate retries a transient GET and validates the fresh page',async()=>{
  for(const failure of [502,503,504,'timeout']){
    let calls=0
    const rows=await fetchPublishedCatalog('https://example.invalid',async(url,init)=>{
      assert.equal(url.pathname,'/api/v1/servers');assert.equal(init.headers['Cache-Control'],'no-cache');assert.ok(init.signal)
      calls++
      if(calls===1){if(failure==='timeout')throw new DOMException('Timeout','TimeoutError');return new Response('',{status:failure})}
      return valid()
    })
    assert.equal(calls,2);assert.deepEqual(rows,[card])
  }
})

test('permanent API errors or invalid pages never become a successful gate',async()=>{
  let calls=0
  await assert.rejects(fetchPublishedCatalog('https://example.invalid',async()=>{calls++;return new Response('',{status:403})}),/HTTP 403/);assert.equal(calls,1)
  calls=0
  await assert.rejects(fetchPublishedCatalog('https://example.invalid',async()=>{calls++;return new Response('',{status:503})}),/HTTP 503/);assert.equal(calls,2)
  calls=0
  await assert.rejects(fetchPublishedCatalog('https://example.invalid',async()=>{calls++;return Response.json({items:[card],total:1,offset:7,limit:100})}),/Invalid catalog page/);assert.equal(calls,1)
})
