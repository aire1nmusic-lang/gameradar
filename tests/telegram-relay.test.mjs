import test from 'node:test'
import assert from 'node:assert/strict'
import {relayNotice,deliverRelayNotice} from '../worker/lib/telegram-relay.ts'
const dto={event:'projection.recovered',eventRef:'a'.repeat(32)}
test('relay rejects PII, arbitrary messages, destinations and malformed references before outbound',async()=>{
 for(const field of ['email','ip','message','chat_id','token','Authorization','evidence','url']) {
  await assert.rejects(deliverRelayNotice({botToken:'test',chatId:'test'},{...dto,[field]:'synthetic'},async()=>assert.fail('must not call Telegram')),/relay_payload_rejected/)
 }
 for(const eventRef of ['synthetic@example.test','127.0.0.1','short','a'.repeat(65)])assert.throws(()=>relayNotice({...dto,eventRef}),/relay_payload_rejected/)
 assert.throws(()=>relayNotice({...dto,event:'raw private incident'}),/relay_payload_rejected/)
})
test('relay uses fixed destination, minimal template and never echoes Telegram identity',async()=>{
 const sent=[]
 const result=await deliverRelayNotice({botToken:'test-token',chatId:'test-chat'},dto,async(url,init)=>{
  sent.push({url,init});return new Response(JSON.stringify({ok:true,result:{chat:{id:'private'}}}))
 })
 assert.deepEqual(result,{ok:true})
 assert.equal(sent[0].url,'https://api.telegram.org/bottest-token/sendMessage')
 assert.equal(sent[0].init.redirect,'manual')
 assert.deepEqual(JSON.parse(sent[0].init.body),{chat_id:'test-chat',text:'GameScout: projection.recovered\nEvent: '+dto.eventRef,protect_content:true,disable_notification:false})
 await assert.rejects(deliverRelayNotice({},dto),/relay_unconfigured/)
 await assert.rejects(deliverRelayNotice({botToken:'test',chatId:'test'},dto,async()=>new Response(JSON.stringify({ok:false}))),/relay_delivery_failed/)
 await assert.rejects(deliverRelayNotice({botToken:'test',chatId:'test'},dto,async()=>new Response('',{status:302,headers:{Location:'https://untrusted.invalid'}})),/relay_telegram_http_302/)
 await assert.rejects(deliverRelayNotice({botToken:'test',chatId:'test'},dto,async()=>{throw new Error('synthetic secret URL')}),/^Error: relay_transport_failed$/)
})
