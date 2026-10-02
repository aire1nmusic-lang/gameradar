import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {stripTypeScriptTypes} from 'node:module'
import {Miniflare,convertV4MiniflareOptions} from 'miniflare'
test('relay runs in real workerd with fully intercepted outbound and refuses redirects',async()=>{
 const source=stripTypeScriptTypes(readFileSync('worker/lib/telegram-relay.ts','utf8'))
 let outbound=0,redirect=false
 const script=source+`\nexport default {async fetch(){try {return Response.json(await deliverRelayNotice({botToken:'synthetic',chatId:'synthetic'},{event:'projection.recovered',eventRef:'a'.repeat(32)}))}catch(e){return Response.json({error:e.message},{status:502})}}}`
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script,compatibilityDate:'2026-09-01',outboundService:async request=>{
  outbound++
  assert.equal(new URL(request.url).hostname,'api.telegram.org')
  const dto=await request.json()
  assert.deepEqual(Object.keys(dto).sort(),['chat_id','disable_notification','protect_content','text'])
  return redirect?new Response('',{status:302,headers:{Location:'https://untrusted.invalid'}}):Response.json({ok:true})
 }}))
 try{
  const first=await mf.dispatchFetch('http://localhost')
  assert.equal(first.status,200)
  assert.deepEqual(await first.json(),{ok:true})
  redirect=true
  const second=await mf.dispatchFetch('http://localhost')
  assert.equal(second.status,502)
  assert.deepEqual(await second.json(),{error:'relay_telegram_http_302'})
  assert.equal(outbound,2,'redirect must never follow a third outbound request')
 }finally{await mf.dispose()}
})
