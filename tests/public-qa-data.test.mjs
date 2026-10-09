import assert from 'node:assert/strict'
import test from 'node:test'
import {readPublicGames,readPublicCatalog} from './public-qa-data.mjs'
test('QA fixture reads recover once from transient HTTP, reject permanent and invalid bodies',async()=>{
 let calls=0
 const games=await readPublicGames(async(url,init)=>{assert.ok(init.signal);calls++;return calls===1?new Response('',{status:503}):Response.json([{id:'lineage2'}])})
 assert.equal(calls,2);assert.equal(games[0].id,'lineage2')
 calls=0;await assert.rejects(readPublicGames(async()=>{calls++;return new Response('',{status:403})}),/HTTP 403/);assert.equal(calls,1)
 await assert.rejects(readPublicGames(async()=>Response.json({error:'Unavailable'})),/Invalid public games fixture/)
})
test('browser catalog fixtures paginate the current public catalog',async()=>{
 const items=Array.from({length:101},(_,i)=>({id:String(i)})),offsets=[]
 const result=await readPublicCatalog(async url=>{const offset=Number(url.searchParams.get('offset'));offsets.push(offset);return Response.json({items:items.slice(offset,offset+100),total:101,offset,limit:100})})
 assert.deepEqual(offsets,[0,100]);assert.deepEqual(result.items,items)
})
