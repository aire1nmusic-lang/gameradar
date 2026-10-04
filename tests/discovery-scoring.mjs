import assert from 'node:assert/strict'
import {balancedCatalog,hasFreshOnline} from '../src/services/discoveryRanking.ts'
const card=(id,gameId,votes,coins,current,known=true)=>({id,name:id,gameId,votes,support:{coins},online:{current,playersKnown:known,freshness:'fresh',status:known?'VERIFIED':'UNKNOWN'}})
const a=card('a','l2',100,0,0),b=card('b','l2',0,1000000,0),c=card('c','l2',0,0,100000000)
assert.deepEqual(balancedCatalog([c,b,a]).map(s=>s.id),['a','b','c'],'Equal strongest category despite different unit scales')
assert.equal(hasFreshOnline(card('unknown','l2',0,0,999999999,false)),false)
assert.deepEqual(balancedCatalog([card('unknown','l2',0,0,999999999,false),a]).map(s=>s.id),['a','unknown'],'Unknown online never scores')
const x=card('x','mc',1,1,1),y=card('y','mc',1,1,1)
assert.deepEqual(balancedCatalog([y,x]).map(s=>s.id),['x','y'],'Ties deterministic')
assert.deepEqual(balancedCatalog([x,a,b,c]).filter(s=>s.gameId==='l2').map(s=>s.id),['a','b','c'],'Other games do not change relative order')
assert.deepEqual(balancedCatalog([]),[])
assert.equal(a.votes,100,'Sorting does not mutate votes')
console.log('PASS equal weights, unit scale independence, missing evidence, ties, game isolation, empty and non-mutation')
