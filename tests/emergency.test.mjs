import test from 'node:test'
import assert from 'node:assert/strict'
import {emergencyBlocks,emergencyLimit} from '../private-api/security.mjs'
import {spawnSync} from 'node:child_process'
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
test('operator emergency CLI refuses retired defaults and incomplete SSH pins before connecting',()=>{
 const result=spawnSync(process.execPath,['scripts/vm-emergency.mjs','on'],{encoding:'utf8',timeout:5000,
  env:{...process.env,VM_SSH_HOST:'',VM_SSH_USER:'',VM_DEPLOY_PATH:'',VM_SSH_IDENTITY_FILE:'',VM_SSH_KNOWN_HOSTS_FILE:''}})
 assert.equal(result.status,1);assert.match(result.stderr,/verified_current_VM_SSH_identity/)
 assert.doesNotMatch(result.stderr,/epddo56|Permission denied|Host key verification|ECONN/)
})
