import assert from 'node:assert/strict'
import {projectSupport,supportOrder} from '../src/services/supportProjection.ts'
const card=(id,coins,participants=1,gameId='lineage2')=>({id,name:id,gameId,support:{coins,participants}})
const rows=[card('a',100,2),card('b',50),card('c',0),card('d',0),card('other',10000,1,'minecraft')]
const before=JSON.stringify(rows)
assert.deepEqual([...rows.slice(0,4)].sort(supportOrder).map(s=>s.id),['a','b','c','d'])
let p=projectSupport(rows,'c',50);assert.equal(p.current,3);assert.equal(p.first,2);assert.equal(p.last,3);assert.equal(p.count,4)
p=projectSupport(rows,'c',101);assert.equal(p.first,1);assert.equal(p.last,1);assert.equal(p.total,101)
p=projectSupport(rows,'a',1);assert.equal(p.current,1);assert.equal(p.position,1)
assert.equal(JSON.stringify(rows),before,'preview never mutates actual scores')
for(const amount of [0,-1,1.5,NaN,Infinity,10001])assert.equal(projectSupport(rows,'a',amount),undefined)
assert.equal(projectSupport(rows,'missing',10),undefined)
p=projectSupport([card('only',0)],'only',10000);assert.equal(p.first,1);assert.equal(p.last,1);assert.equal(p.rows.length,1)
assert.equal(projectSupport(rows,'d',1).rows.every(s=>s.gameId==='lineage2'),true)
console.log('PASS projection: equal-total range, game isolation, zero scores, invalid input, immutability')
