import test from 'node:test'
import assert from 'node:assert/strict'
import { telegramNotice, externalAIPayload, copyrightPresence } from '../private-api/egress.mjs'
import { analyzeCopyright } from '../private-api/copyright.mjs'
import { reviewNickname } from '../private-api/nickname-review.mjs'

const forbiddenNetwork=async()=>assert.fail('No network allowed for private triage')
test('outbound schemas reject private fields, unknown channels and raw AI',()=>{
  for(const field of ['email','ip','cookie','Authorization','evidence','nickname','passwordHash','token'])
    assert.throws(()=>telegramNotice({event:'projection.lag',eventRef:'a'.repeat(32),[field]:'synthetic'}),/egress_payload_rejected/)
  for(const channel of ['copyright','nickname','arbitrary'])assert.throws(()=>externalAIPayload(channel),/egress_/)
  for(const eventRef of ['synthetic@example.test','127.0.0.1','abc\nAuthorization: secret','https://example.test'])
    assert.throws(()=>telegramNotice({event:'projection.lag',eventRef}),/egress_payload_rejected/)
  assert.throws(()=>telegramNotice({event:'arbitrary raw message',eventRef:'a'.repeat(32)}),/egress_payload_rejected/)
})
test('Telegram uses a fixed template and opaque event reference',()=>{
  assert.equal(telegramNotice({event:'projection.lag',eventRef:'a'.repeat(32)}),
    'GameScout: Задержка публичной проекции\nEvent: '+ 'a'.repeat(32))
})
test('copyright checks presence locally even with a configured external key',async()=>{
  const claim={material_key:'description',material_url:'https://example.test/?token=synthetic',
    rights_basis:'synthetic@example.test',work_description:'127.0.0.1',evidence:'Authorization: synthetic',
    claimant_name:'Synthetic Name',contact_email:'synthetic@example.test'}
  assert.equal(JSON.stringify(copyrightPresence(claim)).includes('synthetic'),false)
  assert.equal((await analyzeCopyright({key:'synthetic'},claim,forbiddenNetwork)).classification,'DOUBTFUL')
  assert.equal((await analyzeCopyright(null,{...claim,evidence:''},forbiddenNetwork)).classification,'INCOMPLETE')
})
test('unsafe nickname is anonymous; ambiguous nickname waits for human without inference',async()=>{
  assert.equal(await reviewNickname({key:'synthetic'},'synthetic@example.test',forbiddenNetwork),'ANONYMOUS')
  assert.equal(await reviewNickname({key:'synthetic'},'Player!!!',forbiddenNetwork),'REVIEW')
})
