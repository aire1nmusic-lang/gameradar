import test from 'node:test'
import assert from 'node:assert/strict'
import { checkClaimProof, proofTarget } from '../private-api/claim-proof.mjs'
import { digest } from '../private-api/crypto.mjs'
test('official proof targets cannot be selected by applicants; exact SITE/DNS match, manual never auto-passes',async()=>{
  assert.equal(proofTarget('https://game-server.com/news','SITE'),'https://game-server.com/.well-known/gamescout-verification.txt')
  assert.equal(proofTarget('https://game-server.com','DNS'),'_gamescout.game-server.com')
  for(const url of ['http://game-server.com','https://127.0.0.1','https://user:password@game-server.com','https://game-server.com:8443'])
    assert.throws(()=>proofTarget(url,'SITE'))
  const proof={method:'SITE',target:'https://game-server.com/.well-known/gamescout-verification.txt',token_hash:digest('issued-code')}
  assert.equal(await checkClaimProof(proof,{readSite:async()=> 'issued-code'}),true)
  assert.equal(await checkClaimProof(proof,{readSite:async()=> 'prefix issued-code suffix'}),false)
  assert.equal(await checkClaimProof({...proof,method:'DNS'},{readDns:async()=>[['issued-','code']]}),true)
  assert.equal(await checkClaimProof({...proof,method:'MANUAL'}),false)
})
