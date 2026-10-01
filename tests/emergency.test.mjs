import test from 'node:test'
import assert from 'node:assert/strict'
import {emergencyBlocks,emergencyLimit} from '../private-api/security.mjs'
test('emergency write circuit breaker preserves reads, payments, existing login and permissioned admin routes',()=>{
 for(const path of ['/api/v1/claims','/api/v1/support','/api/v1/coins/grant','/api/v1/auth/register','/api/v1/copyright/claims','/api/v1/me/profile']) {
  assert.equal(emergencyBlocks('POST',path,true),true)
  assert.equal(emergencyBlocks('POST',path,false),false)
  for(const method of ['GET','HEAD','OPTIONS'])assert.equal(emergencyBlocks(method,path,true),false)
 }
 for(const path of ['/api/v1/payments/robokassa/result','/api/v1/auth/login','/api/v1/auth/logout','/api/v1/admin/claims/test/resolve'])assert.equal(emergencyBlocks('POST',path,true),false)
 assert.equal(emergencyBlocks('POST','/api/v1/payments/robokassa/result/forged',true),true)
 assert.equal(emergencyBlocks('POST','/api/v1/admin-forged',true),true)
 assert.equal(emergencyLimit(12,true),3)
 assert.equal(emergencyLimit(1,true),1)
 assert.equal(emergencyLimit(12,false),12)
})
