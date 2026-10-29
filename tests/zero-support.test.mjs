import assert from 'node:assert/strict'
import {test} from 'node:test'
import {shuffleZeroIds} from '../src/services/zeroSupport.ts'
test('shuffle preserves every zero server without mutating input',()=>{const ids=['a','b','c','d'],before=[...ids],next=shuffleZeroIds(ids,[],()=>0);assert.deepEqual([...next].sort(),ids);assert.deepEqual(ids,before)})
test('identical draw cannot repeat the prior complete order',()=>{const ids=['a','b','c'];assert.notDeepEqual(shuffleZeroIds(ids,ids,()=>.999),ids)})
test('empty and single candidate remain valid',()=>{assert.deepEqual(shuffleZeroIds([]),[]);assert.deepEqual(shuffleZeroIds(['a'],['a']),['a'])})

import { presentationOrder, profilePlaceFor, rankingPeriod, readRankingContext } from '../src/services/rankingPresentation.ts'
const servers=(gameId='lineage2')=>Array.from({length:12},(_,i)=>({id:`${gameId}-${i}`,gameId,votes:0,support:{coins:0,participants:0},online:{current:10000-i,status:'VERIFIED',playersKnown:true,freshness:'fresh'}}))
test('shared zero presentation survives input order/remount and expires exactly at the common30second boundary',()=>{
 for(const game of ['lineage2','minecraft','gtarp'])for(const board of ['support','people']){
  const all=servers(game),time=30000*5000
  const before=presentationOrder(all,board,rankingPeriod(time))
  assert.deepEqual(presentationOrder([...all].reverse(),board,rankingPeriod(time+29999)),before)
  const after=presentationOrder(all,board,rankingPeriod(time+30000))
  assert.notEqual(after[0].id,before[0].id)
  assert.deepEqual(after.map(s=>s.id).sort(),all.map(s=>s.id).sort())
  for(let i=0;i<3;i++)assert.deepEqual(profilePlaceFor(before[i],all,rankingPeriod(time+29999),board),{place:i+1,board,rotating:true})
  assert.equal(profilePlaceFor(before[0],all,rankingPeriod(time+30000),board),null,'Old first place leaves TOP3 instead of keeping a stale award')
 }
})
test('positive scores always outrank rotating zeroes and retain canonical ties',()=>{
 const all=servers();all[3].support={coins:5,participants:1};all[4].support={coins:5,participants:2};all[5].support={coins:10,participants:1};all[8].votes=7;all[7].votes=12
 for(const period of [0,1,999]){
  assert.deepEqual(presentationOrder(all,'support',period).slice(0,3).map(s=>s.id),[all[5].id,all[4].id,all[3].id])
  assert.deepEqual(presentationOrder(all,'people',period).slice(0,2).map(s=>s.id),[all[7].id,all[8].id])
 }
})
test('online cannot award a shield, cross-game peers cannot change a world slot, subset context recomputes',()=>{
 const all=servers(),period=4
 const support=presentationOrder(all,'support',period),people=presentationOrder(all,'people',period)
 const ordinary=all.find(s=>!support.slice(0,3).includes(s)&&!people.slice(0,3).includes(s));assert.ok(ordinary)
 assert.equal(profilePlaceFor(ordinary,all,period),null)
 assert.deepEqual(presentationOrder([...all,...servers('minecraft')],'people',period).filter(s=>s.gameId==='lineage2'),people)
 const subset=all.slice(3,9),top=presentationOrder(subset,'people',period)[0]
 assert.deepEqual(profilePlaceFor(top,subset,period,'people'),{place:1,board:'people',rotating:true})
 assert.equal(readRankingContext({gameId:'minecraft',board:'support',ids:['x']},'lineage2'),undefined)
 assert.equal(readRankingContext({gameId:'lineage2',board:'online',ids:['x']},'lineage2'),undefined)
 assert.equal(readRankingContext({gameId:'lineage2',board:'people',ids:['a',5]},'lineage2'),undefined)
 assert.deepEqual(readRankingContext({gameId:'lineage2',board:'people',ids:['a','a']},'lineage2'),{gameId:'lineage2',board:'people',ids:['a']})
 assert.equal(profilePlaceFor({...ordinary,id:'missing'},all,period,'people'),null)
})
test('empty and single zero-score world remain valid, window does not mutate data',()=>{
 assert.deepEqual(presentationOrder([],'people',0),[])
 const all=servers().slice(0,1),copy=structuredClone(all)
 assert.equal(profilePlaceFor(all[0],all,100,'support').place,1)
 presentationOrder(all,'people',99);assert.deepEqual(all,copy)
})
