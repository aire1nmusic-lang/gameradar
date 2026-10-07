import assert from 'node:assert/strict'
import {test} from 'node:test'
import {shuffleZeroIds} from '../src/services/zeroSupport.ts'
test('shuffle preserves every zero server without mutating input',()=>{const ids=['a','b','c','d'],before=[...ids],next=shuffleZeroIds(ids,[],()=>0);assert.deepEqual([...next].sort(),ids);assert.deepEqual(ids,before)})
test('identical draw cannot repeat the prior complete order',()=>{const ids=['a','b','c'];assert.notDeepEqual(shuffleZeroIds(ids,ids,()=>.999),ids)})
test('empty and single candidate remain valid',()=>{assert.deepEqual(shuffleZeroIds([]),[]);assert.deepEqual(shuffleZeroIds(['a'],['a']),['a'])})
