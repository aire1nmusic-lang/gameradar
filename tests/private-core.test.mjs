import test from 'node:test'
import assert from 'node:assert/strict'
import { PGlite } from '@electric-sql/pglite'
import { createHash } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { createApp } from '../private-api/app.mjs'
import { migrate } from '../private-api/db.mjs'
import { digest, unseal } from '../private-api/crypto.mjs'
import { dispatch, outboxHealth } from '../private-api/outbox.mjs'
import { dispatchNicknameReview, reviewNickname } from '../private-api/nickname-review.mjs'
import { analyzeCopyright, dispatchCopyrightAI, dispatchTelegram } from '../private-api/copyright.mjs'
import { checkProjectionLag } from '../private-api/projection-alert.mjs'
import { checkOpenRouterBalance } from '../private-api/openrouter-balance.mjs'
import { isMaintenanceEvent, runMaintenance } from '../private-api/maintenance.mjs'
import { localClientIp, yandexClientIp } from '../private-api/ingress.mjs'
import { applyPublicSnapshot, parsePublicSnapshot, projectionSql } from '../worker/lib/public-projection.ts'
import { serverDto } from '../worker/lib/dto.ts'

const origin='http://127.0.0.1:5173', password='correct horse battery staple'
const config={origin,environment:'development',mailEnabled:true,mailKey:'a'.repeat(64),rateKey:'b'.repeat(64),
  oauth:{GOOGLE_CLIENT_ID:'test',GOOGLE_CLIENT_SECRET:'test',YANDEX_CLIENT_ID:'test',YANDEX_CLIENT_SECRET:'test',VK_CLIENT_ID:'test'}}
async function harness(t,options={}) {
  const pg=new PGlite()
  const db={query:(sql,args=[])=>pg.query(sql,args),transaction:fn=>pg.transaction(fn)}
  await migrate(db);await migrate(db)
  t.after(()=>pg.close())
  const app=createApp({db,config:{...config,...options.config},captchaVerify:options.captchaVerify,publicFetch:options.publicFetch,
    oauthExchange:async(_env,provider,code)=>({id:code,displayName:`Player ${provider}`,email:'player@example.com',emailVerified:true})})
  const request=async(path,body,cookie='',extra={},env={})=>{
    const r=await app.request(origin+'/api/v1'+path,{method:body===undefined?'GET':'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:cookie,...extra},...(body===undefined?{}:{body:JSON.stringify(body)})},{clientIp:'127.0.0.1',...env})
    return {r,status:r.status,body:await r.clone().json().catch(()=>null),cookie:r.headers.getSetCookie().filter(x=>x.startsWith('gs_private_session=')).map(x=>x.split(';')[0]).join('; ')}
  }
  async function link(email,purpose) {
    const mails=(await db.query('SELECT ciphertext FROM gs_mail_outbox ORDER BY created_at DESC')).rows
    const mail=mails.map(r=>unseal(config.mailKey,r.ciphertext)).find(m=>m.to===email&&m.purpose===purpose)
    assert.ok(mail,'transactional mail exists')
    return new URLSearchParams(new URL(mail.link).hash.slice(1)).get('token')
  }
  async function register(email='player@example.com') {
    assert.equal((await request('/auth/register',{email,password,displayName:'Player'})).status,202)
    const raw=await link(email,'REGISTER')
    const result=await request('/auth/register/confirm',{token:raw})
    assert.equal(result.status,200,JSON.stringify(result.body))
    return {...result,user:result.body.user,raw}
  }
  return {db,app,request,link,register}
}

test('email → confirmation → session → reset: atomic, single-use, no raw tokens or passwords',async t=>{
  const h=await harness(t), user=await h.register()
  assert.equal(user.user.emailVerified,true)
  const stored=(await h.db.query('SELECT * FROM gs_users')).rows[0]
  assert.match(stored.password_hash,/^scrypt\$131072\$8\$1\$/)
  assert.ok(!stored.password_hash.includes(password))
  assert.equal((await h.request('/auth/register/confirm',{token:user.raw})).status,400)
  assert.equal((await h.request('/auth/me',undefined,user.cookie)).body.user.id,user.user.id)
  assert.equal((await h.request('/auth/login',{email:'player@example.com',password:'incorrect password'})).status,401)
  assert.equal((await h.request('/auth/login',{email:'player@example.com',password},'',{Origin:'https://evil.invalid'})).status,403)
  assert.equal((await h.request('/auth/login',{email:'player@example.com',password},'',{Origin:''})).status,403)
  const duplicate=await h.request('/auth/register',{email:'player@example.com',password:'different long password',displayName:'Attacker'})
  assert.equal(duplicate.status,202)
  assert.equal((await h.db.query('SELECT count(*)::int n FROM gs_users')).rows[0].n,1)
  await h.request('/auth/password/reset/request',{email:'player@example.com'})
  const reset=await h.link('player@example.com','RESET')
  const result=await h.request('/auth/password/reset',{token:reset,password:'new secure password'});assert.equal(result.status,200)
  assert.equal((await h.request('/auth/me',undefined,user.cookie)).body.user,null)
  assert.equal((await h.request('/auth/password/reset',{token:reset,password})).status,400)
  assert.equal((await h.request('/auth/login',{email:'player@example.com',password})).status,401)
  const login=await h.request('/auth/login',{email:'player@example.com',password:'new secure password'})
  assert.equal(login.status,200)
  assert.match(login.r.headers.get('Set-Cookie'),/HttpOnly; SameSite=Lax/)
  const sessions=(await h.db.query('SELECT token_hash FROM gs_sessions')).rows
  assert.ok(sessions.every(x=>x.token_hash.length===64&&!login.cookie.includes(x.token_hash)))
  assert.equal((await h.request('/auth/logout',{},login.cookie)).status,200)
  assert.equal((await h.request('/auth/me',undefined,login.cookie)).body.user,null)
})

test('bounded maintenance drains mail on invocation and rejects forged timer events',async t=>{
  const secret='maintenance-secret-with-at-least-32-characters',hash=createHash('sha256').update(secret).digest('hex')
  const event={messages:[{event_metadata:{event_type:'yandex.cloud.events.serverless.triggers.TimerMessage',folder_id:'folder-1'},details:{trigger_id:'timer-1',payload:secret}}]}
  assert.equal(isMaintenanceEvent(event,'timer-1','folder-1',hash),true)
  assert.equal(isMaintenanceEvent(event,'timer-2','folder-1',hash),false)
  assert.equal(isMaintenanceEvent({...event,messages:[...event.messages,...event.messages]},'timer-1','folder-1',hash),false)
  assert.equal(isMaintenanceEvent(event,undefined,'folder-1',hash),false)
  assert.equal(isMaintenanceEvent(event,'timer-1','folder-1','f'.repeat(64)),false)
  const h=await harness(t)
  await h.request('/auth/register',{email:'maintenance@example.com',password,displayName:'Maintenance'})
  const sent=[]
  const options={development:true,onLocalMail:mail=>sent.push(mail),maxPerQueue:2}
  const first=await runMaintenance(h.db,config,options)
  assert.equal(first.mail,1)
  assert.equal(sent[0].to,'maintenance@example.com')
  assert.equal((await runMaintenance(h.db,config,options)).mail,0)
  assert.equal((await h.db.query('SELECT count(*)::integer n FROM gs_mail_outbox WHERE delivered_at IS NOT NULL')).rows[0].n,1)
  assert.equal((await h.db.query("SELECT count(*)::integer n FROM gs_maintenance_schedule WHERE key='openrouter_balance'")).rows[0].n,1)
})

test('Yandex ingress uses the appended caller IP, not a spoofed first XFF entry',()=>{
  assert.equal(yandexClientIp({'x-forwarded-for':'1.2.3.4, 203.0.113.19'},'10.0.0.1'),'203.0.113.19')
  assert.equal(yandexClientIp({'x-forwarded-for':'spoofed, invalid'},'10.0.0.1'),'unknown')
  assert.equal(yandexClientIp({},'10.0.0.1'),'unknown')
  assert.equal(localClientIp('127.0.0.1'),'127.0.0.1')
})

test('ADMIN configures rolling vote window and risk thresholds with audit; reader cannot write',async t=>{
  const h=await harness(t),admin=await h.register('rules-admin@example.com'),reader=await h.register('rules-reader@example.com')
  await h.db.query("INSERT INTO gs_user_roles(user_id,role) VALUES($1,'ADMIN'),($2,'MODERATOR')",[admin.user.id,reader.user.id])
  await h.db.query("INSERT INTO gs_server_registry(server_id,game_id,name,slug) VALUES('rules-l2','lineage2','Rules L2','rules-l2')")
  const initial=(await h.request('/admin/vote-rules',undefined,reader.cookie)).body
  assert.equal(initial.windowHours,24)
  assert.equal((await h.request('/admin/vote-rules',{...initial,reason:'Reader must not edit'},reader.cookie)).status,403)
  assert.equal((await h.request('/admin/vote-rules',{...initial,windowHours:0,reason:'Invalid window'},admin.cookie)).status,400)
  assert.equal((await h.request('/admin/vote-rules',{...initial,reason:'No actual changes'},admin.cookie)).body.changed,false)
  const next={windowHours:48,maxPerWindow:2,ipDailyLimit:12,deviceDailyLimit:6,asnDailyLimit:250,
    reason:'Reviewed risk policy for a longer rolling window'}
  const updated=await h.request('/admin/vote-rules',next,admin.cookie)
  assert.equal(updated.status,200)
  assert.deepEqual(updated.body.rules,{windowHours:48,maxPerWindow:2,ipDailyLimit:12,deviceDailyLimit:6,asnDailyLimit:250})
  assert.equal(updated.body.changed,true)
  assert.equal((await h.request('/admin/vote-rules',next,admin.cookie)).body.changed,false)
  const eligibility=(await h.request('/people-rating/eligibility?serverId=rules-l2',undefined,reader.cookie)).body
  assert.equal(eligibility.windowHours,48)
  assert.equal(eligibility.limit,2)
  const events=(await h.db.query("SELECT actor_id,details FROM gs_audit WHERE action='vote.rules_changed'")).rows
  assert.equal(events.length,1)
  assert.equal(events[0].actor_id,admin.user.id)
  assert.equal(events[0].details.previous.windowHours,24)
  assert.equal(events[0].details.next.windowHours,48)
})

test('expired tokens, concurrent consumption, rate limits and transactional rollback',async t=>{
  const h=await harness(t)
  await h.request('/auth/register',{email:'expired@example.com',password,displayName:'Player'})
  const raw=await h.link('expired@example.com','REGISTER')
  await h.db.query("UPDATE gs_tokens SET expires_at=now()-interval '1 second'")
  assert.equal((await h.request('/auth/register/confirm',{token:raw})).status,400)
  await h.request('/auth/register',{email:'race@example.com',password,displayName:'Player'})
  const race=await h.link('race@example.com','REGISTER')
  const responses=await Promise.all([h.request('/auth/register/confirm',{token:race}),h.request('/auth/register/confirm',{token:race})])
  assert.deepEqual(responses.map(r=>r.status).sort(),[200,400])
  for(let i=0;i<5;i++) assert.equal((await h.request('/auth/password/reset/request',{email:'absent@example.com'})).status,202)
  assert.equal((await h.request('/auth/password/reset/request',{email:'absent@example.com'})).status,429)
  await assert.rejects(h.db.transaction(async tx=>{
    await tx.query("INSERT INTO gs_users(id,display_name) VALUES('rollback','rollback')")
    throw new Error('simulated_failure')
  }))
  assert.equal((await h.db.query("SELECT * FROM gs_users WHERE id='rollback'")).rows.length,0)
})

async function oauth(h,provider,subject,cookie='',link=false) {
  const start=await h.request(`/auth/${provider}?next=/account${link?'&link=1':''}`,undefined,cookie)
  assert.equal(start.status,302)
  const state=new URL(start.r.headers.get('Location')).searchParams.get('state')
  const browser=start.r.headers.getSetCookie()[0].split(';')[0]
  const callback=`/auth/${provider}/callback?state=${state}&code=${subject}&device_id=test-device`
  return {callback,browser,result:await h.request(callback,undefined,[cookie,browser].filter(Boolean).join('; '))}
}
test('Google/VK/Yandex callbacks use subject; same email never merges; link is session-bound and single use',async t=>{
  const h=await harness(t), emailUser=await h.register()
  for(const p of ['google','vk','yandex']) {
    const o=await oauth(h,p,`subject-${p}`)
    assert.equal(o.result.status,302,JSON.stringify(o.result.body))
    const me=(await h.request('/auth/me',undefined,o.result.cookie)).body.user
    assert.notEqual(me.id,emailUser.user.id);assert.equal(me.email,null);assert.equal(me.emailVerified,false)
    assert.equal((await h.request(o.callback,undefined,o.browser)).status,400)
    assert.equal((await h.request('/claims',{serverId:'test',evidence:'I own this game server'},o.result.cookie)).status,403)
  }
  const linked=await oauth(h,'google','new-subject',emailUser.cookie,true)
  assert.equal(linked.result.status,302)
  const login=await oauth(h,'google','new-subject')
  assert.equal((await h.request('/auth/me',undefined,login.result.cookie)).body.user.id,emailUser.user.id)
  assert.equal((await oauth(h,'google','subject-google',emailUser.cookie,true)).result.status,409)
  const start=await h.request('/auth/vk?link=1',undefined,emailUser.cookie)
  const state=new URL(start.r.headers.get('Location')).searchParams.get('state'), browser=start.r.headers.getSetCookie()[0].split(';')[0]
  const other=await h.register('other@example.com')
  assert.equal((await h.request(`/auth/vk/callback?state=${state}&code=other`,undefined,other.cookie+'; '+browser)).status,403)
})

test('L2, Minecraft, GTA: player → Claim → admin review → private grant → public outbox; no cross-server grant',async t=>{
  const h=await harness(t), owner=await h.register(), admin=await h.register('admin@example.com'), other=await h.register('other@example.com')
  await h.db.query("INSERT INTO gs_permissions(user_id,permission) VALUES($1,'claims.review'),($1,'system.read')",[admin.user.id])
  assert.equal((await h.request('/admin/claims',undefined,owner.cookie)).status,403)
  for(const game of ['lineage2','minecraft','gtarp']) {
    await h.db.query('INSERT INTO gs_server_registry(server_id,game_id,name,slug) VALUES($1,$1,$1,$1)',[game])
    const body={serverId:game,evidence:'Ownership evidence reviewed by administrator'}
    const claim=await h.request('/claims',body,owner.cookie);assert.equal(claim.status,201)
    assert.equal((await h.request('/claims',body,owner.cookie)).body.id,claim.body.id)
    assert.equal((await h.request(`/servers/${game}/manage-access`,undefined,owner.cookie)).status,403)
    const decision={status:'VERIFIED',reason:'Проверено администратором по доказательствам'}
    assert.equal((await h.request(`/admin/claims/${claim.body.id}/resolve`,decision,owner.cookie)).status,403)
    const approve=await h.request(`/admin/claims/${claim.body.id}/resolve`,decision,admin.cookie)
    assert.equal(approve.status,200,JSON.stringify(approve.body))
    assert.equal((await h.request(`/admin/claims/${claim.body.id}/resolve`,decision,admin.cookie)).status,200)
    assert.equal((await h.request(`/servers/${game}/manage-access`,undefined,owner.cookie)).status,200)
    assert.equal((await h.request(`/servers/${game}/manage-access`,undefined,other.cookie)).status,403)
    assert.equal((await h.request('/claims',body,other.cookie)).status,409)
  }
  const outbox=(await h.db.query('SELECT * FROM gs_public_outbox')).rows
  assert.equal(outbox.length,3)
  for(const row of outbox) { assert.deepEqual(Object.keys(row.payload).sort(),['claimed','restrictedLinks','restrictedMaterials','serverId','supportCoins','supportParticipants','version']); assert.ok(!JSON.stringify(row.payload).includes(owner.user.id)) }
  assert.equal((await h.request('/owners/me/servers',undefined,owner.cookie)).body.length,3)
  await assert.rejects(h.db.query("DELETE FROM gs_audit"),/append only/)
  // Simulate outbox failure: ownership and audit must roll back as one transaction.
  await h.db.query("INSERT INTO gs_server_registry(server_id,game_id,name,slug) VALUES('broken','minecraft','Broken','broken')")
  const broken=await h.request('/claims',{serverId:'broken',evidence:'Enough evidence for private owner claim'},owner.cookie)
  await h.db.query(`CREATE FUNCTION fail_outbox() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test'; END $$`)
  await h.db.query('CREATE TRIGGER fail_outbox BEFORE INSERT ON gs_public_outbox FOR EACH ROW EXECUTE FUNCTION fail_outbox()')
  assert.equal((await h.request(`/admin/claims/${broken.body.id}/resolve`,{status:'VERIFIED',reason:'Test rollback failure'},admin.cookie)).status,500)
  assert.equal((await h.db.query("SELECT owner_id FROM gs_server_registry WHERE server_id='broken'")).rows[0].owner_id,null)
  assert.equal((await h.db.query('SELECT status FROM gs_claims WHERE id=$1',[broken.body.id])).rows[0].status,'PENDING')
})

test('public delivery: missing ACK, retries, stale versions, PII allowlist, mail encryption',async t=>{
  const h=await harness(t)
  const sqlite=new DatabaseSync(':memory:');t.after(()=>sqlite.close())
  sqlite.exec("CREATE TABLE public_server_projection(server_id TEXT PRIMARY KEY,version INTEGER,claimed INTEGER,restricted_links TEXT NOT NULL DEFAULT '[]',restricted_materials TEXT NOT NULL DEFAULT '[]',support_coins INTEGER NOT NULL DEFAULT 0,support_participants INTEGER NOT NULL DEFAULT 0,received_at TEXT)")
  const receive=payload=>{const p=parsePublicSnapshot(payload);sqlite.prepare(projectionSql).run(p.serverId,p.version,+p.claimed,JSON.stringify(p.restrictedLinks??[]),JSON.stringify(p.restrictedMaterials??[]),p.supportCoins??0,p.supportParticipants??0,new Date().toISOString())}
  assert.throws(()=>receive({serverId:'mc',version:1,claimed:true,email:'private@example.com'}))
  receive({serverId:'mc',version:2,claimed:false});receive({serverId:'mc',version:1,claimed:true})
  assert.equal(sqlite.prepare('SELECT claimed FROM public_server_projection').get().claimed,0)
  await h.db.query("INSERT INTO gs_server_registry(server_id,game_id,name,slug) VALUES('mc','minecraft','MC','mc')")
  await h.db.query(`INSERT INTO gs_public_outbox(server_id,version,payload) VALUES('mc',3,$1)`,[JSON.stringify({serverId:'mc',version:3,claimed:true})])
  await dispatch(h.db,'public',async payload=>{receive(payload);throw new Error('ACK lost')})
  assert.equal((await outboxHealth(h.db)).pending,1)
  assert.equal((await h.db.query('SELECT attempts,last_error FROM gs_public_outbox')).rows[0].last_error,'delivery_failed')
  await h.db.query("UPDATE gs_public_outbox SET available_at=now()-interval '1 second'")
  await dispatch(h.db,'public',receive)
  assert.equal((await outboxHealth(h.db)).pending,0)
  assert.equal(sqlite.prepare('SELECT version FROM public_server_projection').get().version,3)
  await h.request('/auth/register',{email:'mail@example.com',password,displayName:'Player'})
  const cipher=(await h.db.query('SELECT ciphertext FROM gs_mail_outbox')).rows[0].ciphertext
  assert.ok(!cipher.includes('mail@example.com'));assert.ok(!cipher.includes('/account'))
  const sent=[];await dispatch(h.db,'mail',async payload=>sent.push(payload),config.mailKey)
  assert.equal(sent.length,1);assert.equal((await h.db.query('SELECT ciphertext FROM gs_mail_outbox')).rows[0].ciphertext,'')
})

test('People rating: verified accounts only, rolling window, idempotency and risk gate across all three games',async t=>{
  const h=await harness(t), player=await h.register(), other=await h.register('other@example.com')
  for(const game of ['lineage2','minecraft','gtarp'])
    await h.db.query('INSERT INTO gs_server_registry(server_id,game_id,name,slug) VALUES($1,$1,$1,$1)',[game])
  const cast=(serverId,idem,cookie=player.cookie,deviceSignal='device_signal_12345')=>h.request('/people-rating/votes',
    {serverId,deviceSignal,pageAgeMs:5000},cookie,{'Idempotency-Key':idem})
  assert.equal((await cast('lineage2','1'.repeat(32),'')).status,401)
  const google=await oauth(h,'google','another-subject')
  assert.equal((await cast('lineage2','2'.repeat(32),google.result.cookie)).status,403)
  const ids=[]
  for(const [i,game] of ['lineage2','minecraft','gtarp'].entries()) {
    const result=await cast(game,String(i+3).repeat(32));assert.equal(result.status,201,JSON.stringify(result.body));ids.push(result.body.id)
    const replay=await cast(game,String(i+3).repeat(32));assert.equal(replay.status,200);assert.equal(replay.body.id,result.body.id)
    assert.equal((await cast(game,String(i+6).repeat(32))).status,409)
  }
  assert.equal((await cast('minecraft','3'.repeat(32))).status,409,'idempotency key cannot change server')
  const rating=(await h.request('/people-rating')).body
  assert.equal(rating.filter(r=>r.votes===1).length,3)
  assert.equal((await h.request('/people-rating?limit=1&offset=1')).body.length,1)
  assert.equal((await h.request('/people-rating?limit=101')).status,400)
  assert.equal((await h.request('/people-rating/eligibility?serverId=lineage2',undefined,player.cookie)).body.eligible,false)
  const storage=(await h.db.query('SELECT * FROM gs_votes')).rows
  assert.equal(storage.length,3)
  assert.ok(storage.every(r=>r.ip_hash.length===64&&r.device_hash.length===64&&!JSON.stringify(r).includes('device_signal_12345')))
  await h.db.query('UPDATE gs_vote_rules SET ip_daily_limit=3,device_daily_limit=3 WHERE id=1')
  assert.equal((await cast('lineage2','9'.repeat(32),other.cookie)).body.error.code,'captcha_required')
  // Changing the window only changes eligibility and rankings; it never deletes vote history.
  await h.db.query("UPDATE gs_votes SET created_at=now()-interval '25 hours'")
  assert.equal((await h.request('/people-rating/eligibility?serverId=lineage2',undefined,player.cookie)).body.eligible,true)
  assert.equal((await h.request('/people-rating')).body.find(r=>r.server_id==='lineage2').votes,0)
  assert.equal((await h.db.query('SELECT count(*)::int n FROM gs_votes')).rows[0].n,3)
})

test('vote risk: missing/fast signals and ASN threshold require a real server-validated challenge',async t=>{
  const h=await harness(t,{config:{turnstileSecret:'test-secret',turnstileSiteKey:'test-site'},
    captchaVerify:async token=>({success:token==='valid',hostname:'127.0.0.1',action:'vote'})})
  const first=await h.register('risk-one@example.com'),second=await h.register('risk-two@example.com')
  await h.db.query("INSERT INTO gs_server_registry(server_id,game_id,name,slug) VALUES('risk-mc','minecraft','Risk MC','risk-mc')")
  const headers=key=>({'Idempotency-Key':key})
  const info=(await h.request('/people-rating/eligibility?serverId=risk-mc',undefined,first.cookie)).body
  assert.equal(info.captchaSiteKey,'test-site')
  const missing=await h.request('/people-rating/votes',{serverId:'risk-mc',pageAgeMs:5000},first.cookie,headers('m'.repeat(32)))
  assert.equal(missing.body.error.code,'captcha_required')
  const fast=await h.request('/people-rating/votes',{serverId:'risk-mc',deviceSignal:'device_signal_12345',pageAgeMs:10},first.cookie,headers('f'.repeat(32)))
  assert.equal(fast.body.error.code,'captcha_required')
  const bad=await h.request('/people-rating/votes',{serverId:'risk-mc',deviceSignal:'device_signal_12345',pageAgeMs:5000,captcha:'bad'},first.cookie,headers('b'.repeat(32)))
  await h.db.query('UPDATE gs_vote_rules SET asn_daily_limit=1,ip_daily_limit=100,device_daily_limit=100 WHERE id=1')
  assert.equal(bad.status,201,'a low-risk vote never consumes an unnecessary captcha token')
  const asnRisk=await h.request('/people-rating/votes',{serverId:'risk-mc',deviceSignal:'different_device_signal',pageAgeMs:5000},second.cookie,headers('a'.repeat(32)),{clientAsn:'64500'})
  assert.equal(asnRisk.status,201,'first ASN vote is below threshold')
  await h.db.query("UPDATE gs_votes SET asn='64500' WHERE user_id=$1",[first.user.id])
  const third=await h.register('risk-three@example.com')
  const challenged=await h.request('/people-rating/votes',{serverId:'risk-mc',deviceSignal:'third_device_signal_123',pageAgeMs:5000},third.cookie,headers('c'.repeat(32)),{clientAsn:'64500'})
  assert.equal(challenged.body.error.code,'captcha_required')
  const rejected=await h.request('/people-rating/votes',{serverId:'risk-mc',deviceSignal:'third_device_signal_123',pageAgeMs:5000,captcha:'invalid'},third.cookie,headers('c'.repeat(32)),{clientAsn:'64500'})
  assert.equal(rejected.body.error.code,'captcha_invalid')
  const accepted=await h.request('/people-rating/votes',{serverId:'risk-mc',deviceSignal:'third_device_signal_123',pageAgeMs:5000,captcha:'valid'},third.cookie,headers('c'.repeat(32)),{clientAsn:'64500'})
  assert.equal(accepted.status,201)
  assert.equal((await h.db.query('SELECT count(*)::int AS n FROM gs_votes')).rows[0].n,3)
})

test('Coins ledger and Support: atomic balance, replay, anonymity and all core games',async t=>{
  const h=await harness(t),player=await h.register('support-player@example.com'),other=await h.register('support-other@example.com')
  for(const game of ['lineage2','minecraft','gtarp'])
    await h.db.query('INSERT INTO gs_server_registry(server_id,game_id,name,slug) VALUES($1,$1,$1,$1)',[game])
  const post=(path,body,cookie,key)=>h.request(path,body,cookie,{'Idempotency-Key':key})
  assert.equal((await post('/support',{serverId:'lineage2',coins:1},player.cookie,'n'.repeat(32))).body.error.code,'insufficient_coins')
  assert.equal((await h.db.query('SELECT count(*)::int n FROM gs_coin_ledger')).rows[0].n,0)
  const credit=await post('/__dev/coins',{coins:20},player.cookie,'g'.repeat(32))
  assert.equal(credit.status,201)
  assert.equal((await post('/__dev/coins',{coins:20},player.cookie,'g'.repeat(32))).status,200)
  assert.equal((await post('/__dev/coins',{coins:21},player.cookie,'g'.repeat(32))).status,409)
  const l2=await post('/support',{serverId:'lineage2',coins:5,anonymous:false},player.cookie,'s'.repeat(32))
  assert.equal(l2.status,201,JSON.stringify(l2.body))
  assert.equal((await post('/support',{serverId:'lineage2',coins:5,anonymous:false},player.cookie,'s'.repeat(32))).status,200)
  assert.equal((await post('/support',{serverId:'minecraft',coins:5,anonymous:false},player.cookie,'s'.repeat(32))).status,409)
  assert.equal((await post('/support',{serverId:'minecraft',coins:3,anonymous:true},player.cookie,'t'.repeat(32))).status,201)
  assert.equal((await post('/support',{serverId:'gtarp',coins:2,anonymous:false},player.cookie,'u'.repeat(32))).status,201)
  const balance=(await h.request('/coins/me',undefined,player.cookie)).body
  assert.equal(balance.balance,10)
  assert.deepEqual(balance.ledger.map(row=>row.kind).sort(),['ADJUSTMENT','SUPPORT','SUPPORT','SUPPORT'].sort())
  assert.equal(balance.ledger.reduce((sum,row)=>sum+row.delta,0),10)
  const l2Summary=(await h.request('/support/servers/lineage2')).body
  assert.equal(l2Summary.coins,5);assert.equal(l2Summary.participants,1)
  assert.equal(l2Summary.recent[0].public_nick,'Player')
  const mcSummary=(await h.request('/support/servers/minecraft')).body
  assert.equal(mcSummary.recent[0].public_nick,'Анонимно')
  assert.ok(!JSON.stringify(mcSummary).includes(player.user.id))
  assert.equal((await h.request('/support/ranking')).body.filter(row=>row.coins>0).length,3)
  const ledgerId=balance.ledger[0].id
  await assert.rejects(h.db.query('UPDATE gs_coin_ledger SET delta=100 WHERE id=$1',[ledgerId]),/append only/)
  await assert.rejects(h.db.query('DELETE FROM gs_coin_ledger WHERE id=$1',[ledgerId]),/append only/)
  await h.db.query("UPDATE gs_users SET display_name='https://spam.example' WHERE id=$1",[other.user.id])
  await post('/__dev/coins',{coins:2},other.cookie,'x'.repeat(32))
  const hidden=await post('/support',{serverId:'lineage2',coins:2,anonymous:false},other.cookie,'y'.repeat(32))
  assert.equal(hidden.status,201)
  assert.equal((await h.request('/support/servers/lineage2')).body.recent[0].public_nick,'Анонимно')
  assert.equal((await h.request('/coins/me',undefined,other.cookie)).body.balance,0)
  const raced=await Promise.all([
    post('/support',{serverId:'lineage2',coins:8,anonymous:true},player.cookie,'1'.repeat(32)),
    post('/support',{serverId:'minecraft',coins:8,anonymous:true},player.cookie,'2'.repeat(32)),
  ])
  assert.equal(raced.filter(result=>result.status===201).length,1)
  assert.equal((await h.request('/coins/me',undefined,player.cookie)).body.balance,2)
  assert.equal((await h.db.query('SELECT min(balance) AS n FROM gs_coin_accounts')).rows[0].n,0)
  assert.equal((await h.request('/coins/transfer',{to:other.user.id,coins:1},player.cookie)).status,501)
})

test('Robokassa test order: signed ResultURL credits once, mismatches roll back, reconciliation is private',async t=>{
  const robokassa={merchantLogin:'unit-test-shop',testPassword1:'test-one',testPassword2:'test-two',
    receiptSno:'osn',receiptTax:'none',receiptPaymentObject:'service',receiptPaymentMethod:'full_payment',itemName:'GS Coins test'}
  const h=await harness(t,{config:{enableTestPayments:true,robokassa}}),player=await h.register('payment@example.com')
  const order=await h.request('/payments/test/orders',{coins:10},player.cookie,{'Idempotency-Key':'p'.repeat(32)})
  assert.equal(order.status,200,JSON.stringify(order.body))
  const checkout=order.body.checkout,fields=checkout.fields
  assert.equal(checkout.action,'https://auth.robokassa.ru/Merchant/Index.aspx')
  assert.equal(checkout.method,'POST')
  assert.equal(fields.IsTest,'1')
  assert.equal(fields.OutSum,'500.00')
  assert.equal(fields.Email,'payment@example.com')
  assert.equal(JSON.parse(decodeURIComponent(fields.Receipt)).items[0].sum,500)
  assert.equal((await h.request('/payments/test/orders',{coins:10},player.cookie,{'Idempotency-Key':'p'.repeat(32)})).body.id,order.body.id)
  assert.equal((await h.request('/payments/test/orders',{coins:11},player.cookie,{'Idempotency-Key':'p'.repeat(32)})).status,409)
  const nonce=fields.Shp_order,id=order.body.id
  const notice=(amount,secret=robokassa.testPassword2)=>{
    const signature=createHash('md5').update(`${amount}:${id}:${secret}:Shp_order=${nonce}`).digest('hex')
    return new URLSearchParams({OutSum:amount,InvId:id,Shp_order:nonce,SignatureValue:signature}).toString()
  }
  const callback=async body=>{
    const response=await h.app.request(origin+'/api/v1/payments/robokassa/result',
      {method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body})
    return {status:response.status,body:await response.text()}
  }
  assert.equal((await callback(notice('500.00','wrong-password'))).status,400)
  assert.equal((await callback(notice('550.00'))).status,400)
  assert.equal((await callback(notice('500.001000'))).status,400)
  assert.equal((await callback(notice('500.00')+'&Shp_order=duplicate')).status,400)
  assert.equal((await h.request('/coins/me',undefined,player.cookie)).body.balance,0)
  await h.db.query(`CREATE FUNCTION gs_fail_test_purchase() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.kind='PURCHASE' THEN RAISE EXCEPTION 'simulated ledger failure'; END IF; RETURN NEW; END $$`)
  await h.db.query('CREATE TRIGGER gs_test_purchase_failure BEFORE INSERT ON gs_coin_ledger FOR EACH ROW EXECUTE FUNCTION gs_fail_test_purchase()')
  assert.equal((await callback(notice('500.00'))).status,500)
  assert.equal((await h.request('/coins/me',undefined,player.cookie)).body.balance,0)
  assert.equal((await h.db.query('SELECT status FROM gs_test_payments WHERE id=$1',[id])).rows[0].status,'TEST_PENDING')
  await h.db.query('DROP TRIGGER gs_test_purchase_failure ON gs_coin_ledger')
  await h.db.query('DROP FUNCTION gs_fail_test_purchase()')
  const accepted=await callback(notice('500.00'))
  assert.deepEqual(accepted,{status:200,body:`OK${id}`})
  assert.equal((await callback(notice('500.000000'))).body,`OK${id}`)
  assert.equal((await h.request('/payments/test/orders',{coins:10},player.cookie,{'Idempotency-Key':'p'.repeat(32)})).body.checkout,null)
  assert.equal((await h.request('/coins/me',undefined,player.cookie)).body.balance,10)
  const ledger=(await h.db.query("SELECT * FROM gs_coin_ledger WHERE kind='PURCHASE'")).rows
  assert.equal(ledger.length,1);assert.equal(ledger[0].delta,10)
  assert.equal((await h.request('/admin/payments/reconciliation',undefined,player.cookie)).status,403)
  await h.db.query("INSERT INTO gs_permissions(user_id,permission) VALUES($1,'payments.read')",[player.user.id])
  const reconciled=(await h.request('/admin/payments/reconciliation',undefined,player.cookie)).body
  assert.deepEqual(reconciled,{orderMismatch:[],balanceMismatch:[]})
  const disabled=await harness(t)
  const another=await disabled.register('disabled-pay@example.com')
  assert.equal((await disabled.request('/payments/test/orders',{coins:1},another.cookie,{'Idempotency-Key':'d'.repeat(32)})).status,503)
  assert.equal((await disabled.request('/payments/test/config')).body.available,false)
})

test('admin roles enforce section permissions and audit role changes',async t=>{
  const h=await harness(t),admin=await h.register('admin@example.com'),player=await h.register('ordinary@example.com')
  await h.db.query("INSERT INTO gs_user_roles(user_id,role) VALUES($1,'ADMIN')",[admin.user.id])
  const me=(await h.request('/auth/me',undefined,admin.cookie)).body.user
  assert.ok(me.roles.includes('ADMIN'))
  assert.ok(me.permissions.includes('roles.manage'))
  for(const path of ['/admin/overview','/admin/users','/admin/servers','/admin/votes','/admin/support',
    '/admin/coins/ledger','/admin/payments','/admin/system']) {
    assert.equal((await h.request(path,undefined,player.cookie)).status,403,path)
    assert.equal((await h.request(path,undefined,admin.cookie)).status,200,path)
  }
  assert.equal((await h.request('/admin/users',undefined,admin.cookie)).body.length,2)
  assert.equal((await h.request(`/admin/users/${player.user.id}/roles`,{role:'ADMIN',action:'GRANT'},admin.cookie)).status,400)
  assert.equal((await h.request(`/admin/users/${admin.user.id}/roles`,{role:'MODERATOR',action:'GRANT'},admin.cookie)).status,403)
  assert.equal((await h.request(`/admin/users/${player.user.id}/roles`,{role:'MODERATOR',action:'GRANT'},player.cookie)).status,403)
  assert.equal((await h.request(`/admin/users/${player.user.id}/roles`,{role:'MODERATOR',action:'GRANT'},admin.cookie)).status,200)
  assert.equal((await h.request('/admin/votes',undefined,player.cookie)).status,200)
  assert.equal((await h.request('/admin/payments',undefined,player.cookie)).status,403)
  assert.equal((await h.request(`/admin/users/${player.user.id}/roles`,{role:'MODERATOR',action:'REVOKE'},admin.cookie)).status,200)
  assert.equal((await h.request('/admin/votes',undefined,player.cookie)).status,403)
  const audit=(await h.db.query("SELECT action FROM gs_audit WHERE action LIKE 'role.%' ORDER BY id")).rows
  assert.deepEqual(audit.map(x=>x.action),['role.grant','role.revoke'])
})

test('user moderation revokes sessions, preserves ledger and requires ADMIN audit',async t=>{
  const h=await harness(t),admin=await h.register('ban-admin@example.com'),player=await h.register('ban-player@example.com'),moderator=await h.register('ban-moderator@example.com')
  await h.db.query("INSERT INTO gs_user_roles(user_id,role) VALUES($1,'ADMIN'),($2,'MODERATOR')",[admin.user.id,moderator.user.id])
  assert.equal((await h.request('/__dev/coins',{coins:5},player.cookie,{'Idempotency-Key':'b'.repeat(32)})).status,201)
  const ledgerBefore=(await h.db.query('SELECT count(*)::integer n FROM gs_coin_ledger WHERE user_id=$1',[player.user.id])).rows[0].n
  const path=`/admin/users/${player.user.id}/moderation`,reason='Повторное нарушение правил площадки'
  assert.equal((await h.request(path,{action:'BAN',reason},moderator.cookie)).status,403)
  assert.equal((await h.request(`/admin/users/${admin.user.id}/moderation`,{action:'BAN',reason},admin.cookie)).status,403)
  const ban=await h.request(path,{action:'BAN',reason},admin.cookie)
  assert.equal(ban.status,200);assert.equal(ban.body.banned,true)
  assert.equal((await h.request(path,{action:'BAN',reason},admin.cookie)).body.replay,true)
  assert.equal((await h.request('/auth/me',undefined,player.cookie)).body.user,null)
  assert.equal((await h.request('/auth/login',{email:'ban-player@example.com',password})).status,401)
  assert.equal((await h.db.query('SELECT count(*)::integer n FROM gs_coin_ledger WHERE user_id=$1',[player.user.id])).rows[0].n,ledgerBefore)
  assert.equal((await h.db.query("SELECT count(*)::integer n FROM gs_audit WHERE target=$1 AND action='user.ban'",[player.user.id])).rows[0].n,1)
  const unban=await h.request(path,{action:'UNBAN',reason:'Апелляция рассмотрена и удовлетворена'},admin.cookie)
  assert.equal(unban.status,200);assert.equal(unban.body.banned,false)
  assert.equal((await h.request('/auth/me',undefined,player.cookie)).body.user,null)
  assert.equal((await h.request('/auth/login',{email:'ban-player@example.com',password})).status,200)
  assert.equal((await h.db.query("SELECT count(*)::integer n FROM gs_audit WHERE target=$1 AND action='user.unban'",[player.user.id])).rows[0].n,1)
})

test('ambiguous nickname review never reverses Support or ledger; AI and manual decisions are scoped',async t=>{
  const h=await harness(t),player=await h.register('nickname@example.com'),admin=await h.register('nick-admin@example.com')
  await h.db.query("INSERT INTO gs_user_roles(user_id,role) VALUES($1,'MODERATOR')",[admin.user.id])
  await h.db.query("INSERT INTO gs_server_registry(server_id,game_id,name,slug) VALUES('nick-mc','minecraft','Nick MC','nick-mc')")
  await h.db.query("UPDATE gs_users SET display_name='Player!!!' WHERE id=$1",[player.user.id])
  assert.equal((await h.request('/__dev/coins',{coins:2},player.cookie,{'Idempotency-Key':'n'.repeat(32)})).status,201)
  const support=await h.request('/support',{serverId:'nick-mc',coins:1,anonymous:false},player.cookie,{'Idempotency-Key':'s'.repeat(32)})
  assert.equal(support.status,201)
  assert.equal((await h.request('/support/servers/nick-mc')).body.recent[0].public_nick,'Анонимно')
  assert.equal((await h.request('/coins/me',undefined,player.cookie)).body.balance,1)
  assert.equal((await h.request('/admin/moderation/nicknames',undefined,player.cookie)).status,403)
  assert.equal((await h.request('/admin/moderation/nicknames',undefined,admin.cookie)).body.length,1)
  await dispatchNicknameReview(h.db,async()=>{throw new Error('provider_failed')},'test-model')
  assert.equal((await h.db.query('SELECT status FROM gs_nickname_reviews')).rows[0].status,'PENDING')
  assert.equal((await h.request('/coins/me',undefined,player.cookie)).body.balance,1)
  await h.db.query("UPDATE gs_nickname_reviews SET available_at=now()-interval '1 second'")
  await dispatchNicknameReview(h.db,async nick=>{assert.equal(nick,'Player!!!');return 'ALLOW'},'test-model')
  assert.equal((await h.request('/support/servers/nick-mc')).body.recent[0].public_nick,'Player!!!')
  assert.equal((await h.db.query("SELECT count(*)::integer n FROM gs_coin_ledger WHERE kind='SUPPORT'")).rows[0].n,1)
  const second=await h.request('/support',{serverId:'nick-mc',coins:1,anonymous:false},player.cookie,{'Idempotency-Key':'t'.repeat(32)})
  assert.equal(second.status,201)
  assert.equal((await h.request(`/admin/moderation/nicknames/${second.body.id}/resolve`,
    {decision:'ANONYMOUS',reason:'Публичный ник требует ручного ограничения'},admin.cookie)).status,200)
  assert.equal((await h.request('/support/servers/nick-mc')).body.recent[0].public_nick,'Анонимно')
  assert.equal((await h.request('/coins/me',undefined,player.cookie)).body.balance,0)
  const ai=await reviewNickname({key:'test-key',model:'test-model'},'Ambiguous',async(url,init)=>{
    assert.equal(url,'https://openrouter.ai/api/v1/chat/completions')
    assert.equal(init.headers.Authorization,'Bearer test-key')
    assert.ok(!init.body.includes('nickname@example.com'))
    return new Response(JSON.stringify({choices:[{message:{content:'REVIEW'}}]}),{status:200})
  })
  assert.equal(ai,'REVIEW')
})

test('copyright: exact link scope, AI triage, reversible restriction, public allowlist and Telegram privacy',async t=>{
  const publicFetch=async()=>new Response(JSON.stringify({id:'rights-mc',slug:'rights-mc',summary:'Factual Minecraft project description.',links:{site:'https://rights.example/work',
    discord:'https://discord.example/rights',telegram:'https://t.me/rights'}}),{status:200})
  const h=await harness(t,{publicFetch,config:{publicApi:'https://catalog.example'}}),admin=await h.register('rights-admin@example.com'),viewer=await h.register('rights-viewer@example.com')
  await h.db.query("INSERT INTO gs_user_roles(user_id,role) VALUES($1,'COPYRIGHT')",[admin.user.id])
  await h.db.query("INSERT INTO gs_server_registry(server_id,game_id,name,slug) VALUES('rights-mc','minecraft','Rights MC','rights-mc')")
  const base={serverId:'rights-mc',materialKey:'site',materialUrl:'https://rights.example/work',
    claimantName:'Rights Holder',contactEmail:'rights@example.com',rightsBasis:'I own the artwork identified here.',
    workDescription:'The original game artwork and the disputed image.',evidence:'Original publication and registration details.'}
  const incomplete=await h.request('/copyright/claims',{...base,rightsBasis:'unclear'})
  assert.equal(incomplete.status,201);assert.equal(incomplete.body.status,'NEEDS_INFO')
  const infoMail=(await h.db.query('SELECT ciphertext FROM gs_mail_outbox ORDER BY created_at DESC LIMIT 1')).rows[0]
  assert.equal(unseal(config.mailKey,infoMail.ciphertext).purpose,'COPYRIGHT_INFO')
  assert.ok(!infoMail.ciphertext.includes('rights@example.com'))
  assert.deepEqual((await h.request('/copyright/restrictions/rights-mc')).body.restrictedLinks,[])
  const wrong=await h.request('/copyright/claims',{...base,materialUrl:'https://different.example/work'})
  assert.equal(wrong.body.status,'NEEDS_INFO')
  const claim=await h.request('/copyright/claims',base)
  assert.equal(claim.body.status,'PENDING_AI')
  assert.equal((await h.request('/admin/copyright',undefined,viewer.cookie)).status,403)
  assert.equal((await h.request('/admin/copyright',undefined,admin.cookie)).body.length,3)
  await dispatchCopyrightAI(h.db,async()=>({classification:'DOUBTFUL',reason:'Specific linked material needs human review'}),'mock-model')
  assert.deepEqual((await h.request('/copyright/restrictions/rights-mc')).body.restrictedLinks,['site'])
  const saved=(await h.db.query('SELECT status FROM gs_copyright_claims WHERE id=$1',[claim.body.id])).rows[0]
  assert.equal(saved.status,'REVIEW_RESTRICTED')
  const snapshot=(await h.db.query('SELECT payload FROM gs_public_outbox ORDER BY id DESC LIMIT 1')).rows[0].payload
  assert.deepEqual(snapshot.restrictedLinks,['site'])
  assert.ok(!JSON.stringify(snapshot).includes('rights@example.com'))
  assert.ok(!JSON.stringify(snapshot).includes('artwork'))
  const overlapping=await h.request('/copyright/claims',base)
  await dispatchCopyrightAI(h.db,async()=>({classification:'VALID',reason:'Second claimant requires separate review'}),'mock-model')
  assert.deepEqual((await h.request('/copyright/restrictions/rights-mc')).body.restrictedLinks,['site'])
  assert.equal((await h.request(`/admin/copyright/${claim.body.id}/resolve`,
    {action:'RESTORE',reason:'Manual evidence review completed'},viewer.cookie)).status,403)
  assert.equal((await h.request(`/admin/copyright/${claim.body.id}/resolve`,
    {action:'RESTORE',reason:'Manual evidence review completed'},admin.cookie)).status,200)
  assert.deepEqual((await h.request('/copyright/restrictions/rights-mc')).body.restrictedLinks,['site'],
    'a different active claim still restricts the same link')
  assert.equal((await h.request(`/admin/copyright/${overlapping.body.id}/resolve`,
    {action:'RESTORE',reason:'Second evidence review completed'},admin.cookie)).status,200)
  assert.deepEqual((await h.request('/copyright/restrictions/rights-mc')).body.restrictedLinks,[])
  assert.deepEqual((await h.db.query('SELECT payload FROM gs_public_outbox ORDER BY id DESC LIMIT 1')).rows[0].payload.restrictedLinks,[])
  const fake=await h.request('/copyright/claims',{...base,materialKey:'discord',materialUrl:'https://discord.example/rights'})
  await dispatchCopyrightAI(h.db,async()=>({classification:'FAKE',reason:'Clearly irrelevant asserted work'}),'mock-model')
  assert.equal((await h.db.query('SELECT status FROM gs_copyright_claims WHERE id=$1',[fake.body.id])).rows[0].status,'REJECTED_FAKE')
  assert.deepEqual((await h.request('/copyright/restrictions/rights-mc')).body.restrictedLinks,[])
  const retry=await h.request('/copyright/claims',{...base,contactEmail:'retry@example.com',materialKey:'telegram',materialUrl:'https://t.me/rights'})
  assert.equal(retry.status,201,JSON.stringify(retry.body))
  await h.db.query(`CREATE FUNCTION fail_copyright_outbox() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'simulated projection failure'; END $$`)
  await h.db.query('CREATE TRIGGER fail_copyright_outbox BEFORE INSERT ON gs_public_outbox FOR EACH ROW EXECUTE FUNCTION fail_copyright_outbox()')
  await dispatchCopyrightAI(h.db,async()=>({classification:'VALID',reason:'Specific URL needs review'}),'mock-model')
  assert.equal((await h.db.query('SELECT status FROM gs_copyright_claims WHERE id=$1',[retry.body.id])).rows[0].status,'PENDING_AI')
  assert.deepEqual((await h.request('/copyright/restrictions/rights-mc')).body.restrictedLinks,[])
  await h.db.query('DROP TRIGGER fail_copyright_outbox ON gs_public_outbox')
  await h.db.query('DROP FUNCTION fail_copyright_outbox()')
  await h.db.query("UPDATE gs_copyright_ai_jobs SET available_at=now()-interval '1 second' WHERE claim_id=$1",[retry.body.id])
  await dispatchCopyrightAI(h.db,async()=>({classification:'VALID',reason:'Specific URL needs review'}),'mock-model')
  assert.deepEqual((await h.request('/copyright/restrictions/rights-mc')).body.restrictedLinks,['telegram'])
  assert.equal((await h.request(`/admin/copyright/${retry.body.id}/resolve`,
    {action:'RESTORE',reason:'Reviewed after transient projection failure'},admin.cookie)).status,200)
  const messages=(await h.db.query('SELECT message FROM gs_telegram_outbox')).rows.map(x=>x.message).join('\n')
  assert.ok(messages.includes('copyright.suspected_fake'))
  assert.ok(!messages.includes('rights@example.com'));assert.ok(!messages.includes('Original publication'))
  await dispatchTelegram(h.db,{botToken:'fake',chatId:'123'},async(url,init)=>{
    assert.ok(url.endsWith('/sendMessage'));assert.ok(!init.body.includes('rights@example.com'))
    return new Response(JSON.stringify({ok:true}),{status:200})
  })
  assert.equal((await h.db.query('SELECT count(*)::integer n FROM gs_telegram_outbox WHERE delivered_at IS NOT NULL')).rows[0].n,1)
  const ai=await analyzeCopyright({key:'fake',model:'test'},(await h.db.query('SELECT * FROM gs_copyright_claims WHERE id=$1',[claim.body.id])).rows[0],
    async(_url,init)=>{assert.ok(!init.body.includes('rights@example.com'));return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({classification:'VALID',reason:'Specific link requires review'})}}]}),{status:200})})
  assert.equal(ai.classification,'VALID')
})

test('copyright description: exact page scope, private restriction and reversible D1 redaction',async t=>{
  const descriptionUrl='https://gamescout.online/server/rights-gta#description'
  const publicFetch=async()=>new Response(JSON.stringify({id:'rights-gta',slug:'rights-gta',
    summary:'Original factual description of the GTA RP server.',links:{site:'https://rights.example/site'}}),{status:200})
  const h=await harness(t,{publicFetch,config:{publicApi:'https://catalog.example'}})
  const admin=await h.register('description-admin@example.com')
  await h.db.query("INSERT INTO gs_user_roles(user_id,role) VALUES($1,'COPYRIGHT')",[admin.user.id])
  await h.db.query("INSERT INTO gs_server_registry(server_id,game_id,name,slug) VALUES('rights-gta','gtarp','Rights GTA','rights-gta')")
  const base={serverId:'rights-gta',materialKey:'description',materialUrl:descriptionUrl,
    claimantName:'Rights Holder',contactEmail:'description@example.com',
    rightsBasis:'I own the original text used in this description.',
    workDescription:'My original published description of the project.',
    evidence:'Dated original publication and authorship records.'}
  const wrong=await h.request('/copyright/claims',{...base,materialUrl:'https://gamescout.online/server/another#description'})
  assert.equal(wrong.body.status,'NEEDS_INFO')
  const claim=await h.request('/copyright/claims',base)
  assert.equal(claim.body.status,'PENDING_AI')
  await dispatchCopyrightAI(h.db,async()=>({classification:'DOUBTFUL',reason:'The description needs human review'}),'mock-model')
  const active=(await h.request('/copyright/restrictions/rights-gta')).body
  assert.deepEqual(active,{restrictedLinks:[],restrictedMaterials:['description']})
  const snapshot=(await h.db.query('SELECT payload FROM gs_public_outbox ORDER BY id DESC LIMIT 1')).rows[0].payload
  assert.deepEqual(snapshot.restrictedMaterials,['description'])
  assert.deepEqual(snapshot.restrictedLinks,[])
  assert.ok(!JSON.stringify(snapshot).includes('description@example.com'))
  const sqlite=new DatabaseSync(':memory:');t.after(()=>sqlite.close())
  sqlite.exec(`CREATE TABLE servers(id TEXT PRIMARY KEY,summary TEXT,updated_at TEXT);
    CREATE TABLE public_server_projection(server_id TEXT PRIMARY KEY REFERENCES servers(id),
      version INTEGER,claimed INTEGER,restricted_links TEXT,restricted_materials TEXT,
      support_coins INTEGER,support_participants INTEGER,received_at TEXT);
    INSERT INTO servers(id,summary) VALUES('rights-gta','Original factual description of the GTA RP server.')`)
  const db={prepare(sql){return {bind(...args){return {run(){return sqlite.prepare(sql).run(...args)}}}}},
    async batch(steps){sqlite.exec('BEGIN');try{for(const step of steps)step.run();sqlite.exec('COMMIT')}
      catch(error){sqlite.exec('ROLLBACK');throw error}}}
  await applyPublicSnapshot(db,parsePublicSnapshot(snapshot))
  const projected=sqlite.prepare("SELECT s.summary,p.restricted_links,p.restricted_materials FROM servers s JOIN public_server_projection p ON p.server_id=s.id").get()
  assert.equal(projected.summary,'Original factual description of the GTA RP server.')
  const dto=serverDto({id:'rights-gta',slug:'rights-gta',name:'Rights GTA',game_id:'gtarp',
    summary:projected.summary,description:'Other disputed description text.',highlights:'["Disputed highlight"]',
    modes:'[]',tags:'[]',languages:'[]',website:'https://rights.example/site',
    restricted_links:projected.restricted_links,restricted_materials:projected.restricted_materials})
  assert.equal(dto.descriptionRestricted,true)
  assert.equal(dto.summary,'');assert.equal(dto.description,'');assert.deepEqual(dto.highlights,[])
  assert.equal(dto.links.site,'https://rights.example/site')
  assert.throws(()=>parsePublicSnapshot({...snapshot,version:snapshot.version+1,
    restrictedMaterials:['description','site']}),/invalid_projection/)
  assert.equal((await h.request(`/admin/copyright/${claim.body.id}/resolve`,
    {action:'RESTORE',reason:'Original publication verified; restore the description'},admin.cookie)).status,200)
  assert.deepEqual((await h.request('/copyright/restrictions/rights-gta')).body.restrictedMaterials,[])
  const restored=(await h.db.query('SELECT payload FROM gs_public_outbox ORDER BY id DESC LIMIT 1')).rows[0].payload
  await applyPublicSnapshot(db,parsePublicSnapshot(restored))
  const back=sqlite.prepare('SELECT restricted_materials FROM public_server_projection').get()
  assert.equal(back.restricted_materials,'[]')
  assert.equal(sqlite.prepare('SELECT count(*) n FROM servers').get().n,1)
})

test('projection lag alert is deduplicated, private and resolves after delivery',async t=>{
  const h=await harness(t),admin=await h.register('ops-admin@example.com')
  await h.db.query("INSERT INTO gs_user_roles(user_id,role) VALUES($1,'ADMIN')",[admin.user.id])
  await h.db.query("INSERT INTO gs_server_registry(server_id,game_id,name,slug) VALUES('alert-l2','lineage2','Alert L2','alert-l2')")
  assert.equal((await checkProjectionLag(h.db,300)).changed,false)
  await h.db.query(`INSERT INTO gs_public_outbox(server_id,version,payload,created_at)
    VALUES('alert-l2',1,$1,now()-interval '400 seconds')`,[JSON.stringify({name:'Private recipient should not appear',contact:'secret@example.com'})])
  const first=await checkProjectionLag(h.db,300)
  assert.equal(first.changed,true);assert.equal(first.active,true)
  assert.equal((await checkProjectionLag(h.db,300)).changed,false)
  let messages=(await h.db.query('SELECT event,message FROM gs_telegram_outbox')).rows
  assert.equal(messages.length,1);assert.equal(messages[0].event,'projection.lag')
  assert.ok(!messages[0].message.includes('secret@example.com'))
  const system=(await h.request('/admin/system',undefined,admin.cookie)).body
  assert.equal(system.alerts[0].active,true)
  assert.equal(system.projection.pending,1)
  await h.db.query("UPDATE gs_public_outbox SET delivered_at=now() WHERE server_id='alert-l2'")
  assert.equal((await checkProjectionLag(h.db,300)).active,false)
  assert.equal((await checkProjectionLag(h.db,300)).changed,false)
  messages=(await h.db.query('SELECT event FROM gs_telegram_outbox ORDER BY created_at')).rows
  assert.deepEqual(messages.map(x=>x.event),['projection.lag','projection.recovered'])
  const audit=(await h.db.query("SELECT action FROM gs_audit WHERE action LIKE 'projection.%' ORDER BY id")).rows
  assert.deepEqual(audit.map(x=>x.action),['projection.lag','projection.recovered'])
  await h.db.query(`INSERT INTO gs_public_outbox(server_id,version,payload,attempts)
    VALUES('alert-l2',2,'{}',3)`)
  assert.equal((await checkProjectionLag(h.db,300)).active,true,'failed retries also alert before the age threshold')
  await assert.rejects(checkProjectionLag(h.db,1),/invalid_projection_threshold/)
})

test('OpenRouter balance monitor uses management endpoint, deduplicates alerts and reports check failures',async t=>{
  const h=await harness(t)
  let calls=0
  const request=async(url,init)=>{
    calls++
    assert.equal(url,'https://openrouter.ai/api/v1/credits')
    assert.equal(init.headers.Authorization,'Bearer management-secret')
    return new Response(JSON.stringify({data:{total_credits:100.5,total_usage:97}}),{status:200})
  }
  assert.deepEqual(await checkOpenRouterBalance(h.db,{thresholdUsd:5},request),{status:'disabled'})
  assert.equal(calls,0)
  const low=await checkOpenRouterBalance(h.db,{key:'management-secret',thresholdUsd:5},request)
  assert.equal(low.status,'low');assert.equal(low.remainingUsd,3.5);assert.equal(low.changed,true)
  assert.equal((await checkOpenRouterBalance(h.db,{key:'management-secret',thresholdUsd:5},request)).changed,false)
  assert.equal((await h.db.query("SELECT count(*)::integer n FROM gs_telegram_outbox WHERE event='openrouter.low_balance'")).rows[0].n,1)
  const unavailable=()=>checkOpenRouterBalance(h.db,{key:'management-secret',thresholdUsd:5},
    async()=>new Response('{}',{status:403}))
  assert.equal((await unavailable()).status,'unavailable')
  assert.equal((await unavailable()).status,'unavailable')
  assert.equal((await h.db.query("SELECT active FROM gs_system_alerts WHERE key='openrouter_low_balance'")).rows[0].active,true)
  const recovered=await checkOpenRouterBalance(h.db,{key:'management-secret',thresholdUsd:5},
    async()=>new Response(JSON.stringify({data:{total_credits:100,total_usage:80}}),{status:200}))
  assert.equal(recovered.status,'ok')
  const events=(await h.db.query('SELECT event FROM gs_telegram_outbox')).rows.map(row=>row.event)
  assert.equal(events.filter(event=>event==='openrouter.balance_unavailable').length,1)
  assert.equal(events.filter(event=>event==='openrouter.balance_check_recovered').length,1)
  assert.equal(events.filter(event=>event==='openrouter.balance_recovered').length,1)
  const messages=(await h.db.query('SELECT message FROM gs_telegram_outbox')).rows.map(row=>row.message).join('\n')
  assert.ok(!messages.includes('management-secret'))
  await assert.rejects(checkOpenRouterBalance(h.db,{key:'management-secret',thresholdUsd:0},request),/invalid_balance_threshold/)
})

test('L2, Minecraft and GTA owners submit moderated summaries through a versioned public outbox',async t=>{
  const h=await harness(t),owner=await h.register('summary-owner@example.com'),admin=await h.register('summary-admin@example.com'),stranger=await h.register('summary-stranger@example.com')
  await h.db.query("INSERT INTO gs_user_roles(user_id,role) VALUES($1,'ADMIN')",[admin.user.id])
  for(const [id,game] of [['edit-l2','lineage2'],['edit-mc','minecraft'],['edit-gta','gtarp']]) {
    await h.db.query('INSERT INTO gs_server_registry(server_id,game_id,name,slug) VALUES($1,$2,$3,$4)',[id,game,id,id])
    const claim=await h.request('/claims',{serverId:id,evidence:'Official site ownership proof is available.'},owner.cookie)
    assert.equal(claim.status,201)
    assert.equal((await h.request(`/admin/claims/${claim.body.id}/resolve`,
      {status:'VERIFIED',reason:'Ownership proof checked against official site'},admin.cookie)).status,200)
  }
  assert.equal((await h.request('/owners/me/servers',undefined,owner.cookie)).body.length,3)
  const summary='Нейтральное описание сервера с подтверждёнными характеристиками.'
  assert.equal((await h.request('/owners/me/servers/edit-l2/summary-edits',{summary},stranger.cookie)).status,403)
  assert.equal((await h.request('/owners/me/servers/edit-l2/summary-edits',{summary:'https://example.com advertising text'},owner.cookie)).status,400)
  const ids=[]
  for(const id of ['edit-l2','edit-mc','edit-gta']) {
    const edit=await h.request(`/owners/me/servers/${id}/summary-edits`,{summary:`${summary} ${id}`},owner.cookie)
    assert.equal(edit.status,201,JSON.stringify(edit.body));ids.push(edit.body.id)
    assert.equal((await h.request(`/owners/me/servers/${id}/summary-edits`,{summary},owner.cookie)).status,409)
  }
  assert.equal((await h.request('/admin/server-edits',undefined,stranger.cookie)).status,403)
  assert.equal((await h.request('/admin/server-edits',undefined,admin.cookie)).body.length,3)
  await h.db.query("INSERT INTO gs_user_roles(user_id,role) VALUES($1,'MODERATOR')",[owner.user.id])
  assert.equal((await h.request(`/admin/server-edits/${ids[0]}/resolve`,
    {status:'APPROVED',reason:'Neutral description verified'},owner.cookie)).status,403)
  await h.db.query(`CREATE FUNCTION fail_summary_outbox() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'simulated D1 queue failure'; END $$`)
  await h.db.query('CREATE TRIGGER fail_summary_outbox BEFORE INSERT ON gs_public_outbox FOR EACH ROW EXECUTE FUNCTION fail_summary_outbox()')
  assert.equal((await h.request(`/admin/server-edits/${ids[0]}/resolve`,
    {status:'APPROVED',reason:'Neutral description verified'},admin.cookie)).status,500)
  assert.equal((await h.db.query('SELECT status FROM gs_owner_summary_edits WHERE id=$1',[ids[0]])).rows[0].status,'PENDING')
  await h.db.query('DROP TRIGGER fail_summary_outbox ON gs_public_outbox')
  await h.db.query('DROP FUNCTION fail_summary_outbox()')
  for(const id of ids)assert.equal((await h.request(`/admin/server-edits/${id}/resolve`,
    {status:'APPROVED',reason:'Neutral description verified'},admin.cookie)).status,200)
  const snapshots=(await h.db.query('SELECT payload FROM gs_public_outbox ORDER BY id')).rows.map(row=>row.payload)
  assert.equal(snapshots.filter(row=>row.summary).length,3)
  for(const row of snapshots.filter(row=>row.summary)) {
    assert.equal(parsePublicSnapshot(row).summary.includes('Нейтральное описание'),true)
    assert.ok(!JSON.stringify(row).includes('summary-owner@example.com'))
  }
  const denied=await h.request('/owners/me/servers/edit-gta/summary-edits',undefined,stranger.cookie)
  assert.equal(denied.status,403)
  const newEdit=await h.request('/owners/me/servers/edit-gta/summary-edits',{summary:'Другое нейтральное описание игрового сервера.'},owner.cookie)
  assert.equal((await h.request(`/admin/server-edits/${newEdit.body.id}/resolve`,
    {status:'REJECTED',reason:'Факты не подтверждены источником'},admin.cookie)).status,200)
  assert.equal((await h.db.query('SELECT count(*)::integer n FROM gs_public_outbox')).rows[0].n,snapshots.length)
})

test('D1 summary projection is atomic and ignores older versions',async t=>{
  const sqlite=new DatabaseSync(':memory:');t.after(()=>sqlite.close())
  sqlite.exec(`CREATE TABLE servers(id TEXT PRIMARY KEY,summary TEXT,updated_at TEXT);
    CREATE TABLE public_server_projection(server_id TEXT PRIMARY KEY REFERENCES servers(id),
      version INTEGER,claimed INTEGER,restricted_links TEXT,restricted_materials TEXT,support_coins INTEGER,support_participants INTEGER,received_at TEXT);
    INSERT INTO servers(id,summary) VALUES('mc','Original summary')`)
  const db={
    prepare(sql){return {bind(...args){return {run(){return sqlite.prepare(sql).run(...args)}}}}},
    async batch(steps){sqlite.exec('BEGIN');try{for(const step of steps)step.run();sqlite.exec('COMMIT')}
      catch(error){sqlite.exec('ROLLBACK');throw error}},
  }
  const project=payload=>applyPublicSnapshot(db,parsePublicSnapshot(payload))
  const approved='Проверенное нейтральное описание Minecraft-сервера.'
  await project({serverId:'mc',version:2,claimed:true,restrictedLinks:[],summary:approved,supportCoins:3,supportParticipants:2})
  await project({serverId:'mc',version:1,claimed:false,summary:'Старый вариант описания Minecraft-сервера.'})
  assert.equal(sqlite.prepare("SELECT summary FROM servers WHERE id='mc'").get().summary,approved)
  assert.equal(sqlite.prepare("SELECT version FROM public_server_projection WHERE server_id='mc'").get().version,2)
  assert.equal(sqlite.prepare("SELECT support_coins FROM public_server_projection WHERE server_id='mc'").get().support_coins,3)
  await project({serverId:'mc',version:3,claimed:true,restrictedLinks:['site']})
  assert.equal(sqlite.prepare("SELECT summary FROM servers WHERE id='mc'").get().summary,approved)
  assert.throws(()=>parsePublicSnapshot({serverId:'mc',version:4,claimed:true,summary:'<script>alert(1)</script>'}))
  sqlite.exec("CREATE TRIGGER reject_summary BEFORE UPDATE ON servers BEGIN SELECT RAISE(ABORT,'failed'); END")
  await assert.rejects(project({serverId:'mc',version:4,claimed:true,summary:'Следующее нейтральное описание игрового сервера.'}),/failed/)
  assert.equal(sqlite.prepare("SELECT version FROM public_server_projection WHERE server_id='mc'").get().version,3)
})

test('owner facts require scoped Claim and human review in all three games',async t=>{
  const h=await harness(t),owner=await h.register('fact-owner@example.com'),admin=await h.register('fact-admin@example.com'),other=await h.register('fact-other@example.com')
  await h.db.query("INSERT INTO gs_user_roles(user_id,role) VALUES($1,'ADMIN')",[admin.user.id])
  const ids=[]
  for(const [id,game] of [['fact-l2','lineage2'],['fact-mc','minecraft'],['fact-gta','gtarp']]) {
    await h.db.query('INSERT INTO gs_server_registry(server_id,game_id,name,slug) VALUES($1,$2,$3,$4)',[id,game,id,id])
    const claim=await h.request('/claims',{serverId:id,evidence:'Ownership proof is available at the official site.'},owner.cookie)
    assert.equal((await h.request(`/admin/claims/${claim.body.id}/resolve`,{status:'VERIFIED',reason:'Official ownership evidence checked'},admin.cookie)).status,200)
    const path=`/owners/me/servers/${id}/fact-edits`
    const body={field:'version',value:'Interlude',evidence:'Official release page confirms this version.'}
    assert.equal((await h.request(path,body,other.cookie)).status,403)
    assert.equal((await h.request(path,{...body,field:'openedAt',value:'2026-02-30'},owner.cookie)).status,400)
    const edit=await h.request(path,body,owner.cookie)
    assert.equal(edit.status,201,JSON.stringify(edit.body));ids.push(edit.body.id)
    assert.equal((await h.request(path,body,owner.cookie)).status,409)
  }
  assert.equal((await h.request('/admin/server-fact-edits',undefined,other.cookie)).status,403)
  assert.equal((await h.request('/admin/server-fact-edits',undefined,admin.cookie)).body.length,3)
  await h.db.query("INSERT INTO gs_user_roles(user_id,role) VALUES($1,'MODERATOR')",[owner.user.id])
  assert.equal((await h.request(`/admin/server-fact-edits/${ids[0]}/resolve`,{status:'APPROVED',reason:'Official source checked'},owner.cookie)).status,403)
  await h.db.query(`CREATE FUNCTION fail_fact_outbox() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'simulated outbox failure'; END $$`)
  await h.db.query('CREATE TRIGGER fail_fact_outbox BEFORE INSERT ON gs_public_outbox FOR EACH ROW EXECUTE FUNCTION fail_fact_outbox()')
  assert.equal((await h.request(`/admin/server-fact-edits/${ids[0]}/resolve`,{status:'APPROVED',reason:'Official source checked'},admin.cookie)).status,500)
  assert.equal((await h.db.query('SELECT status FROM gs_owner_fact_edits WHERE id=$1',[ids[0]])).rows[0].status,'PENDING')
  await h.db.query('DROP TRIGGER fail_fact_outbox ON gs_public_outbox')
  await h.db.query('DROP FUNCTION fail_fact_outbox()')
  for(const id of ids) {
    const path=`/admin/server-fact-edits/${id}/resolve`
    assert.equal((await h.request(path,{status:'APPROVED',reason:'Official source checked'},admin.cookie)).status,200)
    assert.equal((await h.request(path,{status:'APPROVED',reason:'Official source checked'},admin.cookie)).body.replay,true)
  }
  const snapshots=(await h.db.query('SELECT payload FROM gs_public_outbox ORDER BY id')).rows.map(row=>row.payload)
  assert.equal(snapshots.filter(row=>row.facts?.version==='Interlude').length,3)
  for(const row of snapshots) {
    assert.ok(!JSON.stringify(row).includes('fact-owner@example.com'))
    assert.ok(!JSON.stringify(row).includes('Official release page'))
    parsePublicSnapshot(row)
  }
  const rejected=await h.request('/owners/me/servers/fact-gta/fact-edits',
    {field:'rates',value:'x100',evidence:'Official rates page confirms this number.'},owner.cookie)
  assert.equal((await h.request(`/admin/server-fact-edits/${rejected.body.id}/resolve`,{status:'REJECTED',reason:'Source does not support this rate'},admin.cookie)).status,200)
  assert.equal((await h.db.query('SELECT count(*)::integer n FROM gs_public_outbox')).rows[0].n,snapshots.length)
  assert.equal((await h.request('/owners/me/servers/fact-mc/fact-edits',
    {field:'modes',value:'PvP, PvP',evidence:'Official server rules describe its modes.'},owner.cookie)).status,400)
  for(const [field,value] of [['modes','Survival, PvP'],['country','DE']]) {
    const edit=await h.request('/owners/me/servers/fact-mc/fact-edits',
      {field,value,evidence:'Official server information confirms this value.'},owner.cookie)
    assert.equal(edit.status,201)
    assert.equal((await h.request(`/admin/server-fact-edits/${edit.body.id}/resolve`,
      {status:'APPROVED',reason:'Official page confirms this field'},admin.cookie)).status,200)
  }
  const latest=(await h.db.query("SELECT payload FROM gs_public_outbox WHERE server_id='fact-mc' ORDER BY version DESC LIMIT 1")).rows[0].payload
  assert.deepEqual(latest.facts.modes,['Survival','PvP'])
  assert.equal(latest.facts.country,'DE')
  assert.ok(!JSON.stringify(latest).includes('Official server information'))
})

test('D1 factual correction is atomic and ignores stale versions',async t=>{
  const sqlite=new DatabaseSync(':memory:');t.after(()=>sqlite.close())
  sqlite.exec(`CREATE TABLE servers(id TEXT PRIMARY KEY,version TEXT,rates TEXT,modes TEXT,region TEXT,country TEXT,opened_at TEXT,updated_at TEXT);
    CREATE TABLE public_server_projection(server_id TEXT PRIMARY KEY REFERENCES servers(id),
      version INTEGER,claimed INTEGER,restricted_links TEXT,restricted_materials TEXT,support_coins INTEGER,support_participants INTEGER,received_at TEXT);
    INSERT INTO servers(id,version,region) VALUES('mc','1.20','EU')`)
  const db={prepare(sql){return {bind(...args){return {run(){return sqlite.prepare(sql).run(...args)}}}}},
    async batch(steps){sqlite.exec('BEGIN');try{for(const step of steps)step.run();sqlite.exec('COMMIT')}
      catch(error){sqlite.exec('ROLLBACK');throw error}}}
  const project=payload=>applyPublicSnapshot(db,parsePublicSnapshot(payload))
  await project({serverId:'mc',version:2,claimed:true,facts:{version:'1.21',rates:'x10',modes:['Survival','PvP'],region:'EU',country:'DE',openedAt:'2026-09-27'}})
  await project({serverId:'mc',version:1,claimed:false,facts:{version:'1.19'}})
  assert.deepEqual({...sqlite.prepare("SELECT version,rates,modes,region,country,opened_at FROM servers WHERE id='mc'").get()},
    {version:'1.21',rates:'x10',modes:'["Survival","PvP"]',region:'EU',country:'DE',opened_at:'2026-09-27'})
  assert.throws(()=>parsePublicSnapshot({serverId:'mc',version:3,claimed:true,facts:{openedAt:'2026-02-30'}}))
  assert.throws(()=>parsePublicSnapshot({serverId:'mc',version:3,claimed:true,facts:{modes:['PvP','PvP']}}))
  sqlite.exec("CREATE TRIGGER reject_fact BEFORE UPDATE ON servers BEGIN SELECT RAISE(ABORT,'failed'); END")
  await assert.rejects(project({serverId:'mc',version:3,claimed:true,facts:{rates:'x20'}}),/failed/)
  assert.equal(sqlite.prepare("SELECT version FROM public_server_projection WHERE server_id='mc'").get().version,2)
})

test('reviewed owner links project or remove by version without bypassing copyright',async t=>{
  const h=await harness(t),owner=await h.register('links-owner@example.com'),admin=await h.register('links-admin@example.com'),other=await h.register('links-other@example.com')
  await h.db.query("INSERT INTO gs_user_roles(user_id,role) VALUES($1,'ADMIN')",[admin.user.id])
  for(const [id,game] of [['links-l2','lineage2'],['links-mc','minecraft'],['links-gta','gtarp']]) {
    await h.db.query('INSERT INTO gs_server_registry(server_id,game_id,name,slug) VALUES($1,$2,$3,$4)',[id,game,id,id])
    const claim=await h.request('/claims',{serverId:id,evidence:'Official ownership proof is available for review.'},owner.cookie)
    assert.equal((await h.request(`/admin/claims/${claim.body.id}/resolve`,{status:'VERIFIED',reason:'Official ownership proof reviewed'},admin.cookie)).status,200)
  }
  const sitePath='/owners/me/servers/links-l2/fact-edits'
  const input={field:'site',value:'https://l2.example.org/project',evidence:'Official domain ownership and project page checked.'}
  assert.equal((await h.request(sitePath,input,other.cookie)).status,403)
  for(const value of ['http://l2.example.org/','https://127.0.0.1/','https://user:pass@l2.example.org/','https://l2.example.org/#token'])
    assert.equal((await h.request(sitePath,{...input,value},owner.cookie)).status,400)
  assert.equal((await h.request(sitePath,{...input,field:'other'},owner.cookie)).status,400)
  const site=await h.request(sitePath,input,owner.cookie)
  assert.equal(site.status,201)
  assert.equal((await h.request(sitePath,input,owner.cookie)).status,409)
  assert.equal((await h.request(`/admin/server-fact-edits/${site.body.id}/resolve`,
    {status:'APPROVED',reason:'Owner reviewed the official link'},admin.cookie)).status,200)
  assert.equal((await h.db.query("SELECT website FROM gs_server_registry WHERE server_id='links-l2'")).rows[0].website,input.value)
  const first=(await h.db.query("SELECT payload FROM gs_public_outbox WHERE server_id='links-l2' ORDER BY version DESC LIMIT 1")).rows[0].payload
  assert.equal(first.links.site,input.value)
  assert.ok(!JSON.stringify(first).includes('domain ownership'))
  assert.deepEqual(parsePublicSnapshot(first),first)

  const sqlite=new DatabaseSync(':memory:');t.after(()=>sqlite.close())
  sqlite.exec(`CREATE TABLE servers(id TEXT PRIMARY KEY,website TEXT,discord TEXT,telegram TEXT,updated_at TEXT);
    CREATE TABLE public_server_projection(server_id TEXT PRIMARY KEY REFERENCES servers(id),
      version INTEGER,claimed INTEGER,restricted_links TEXT,restricted_materials TEXT,
      support_coins INTEGER,support_participants INTEGER,received_at TEXT);
    INSERT INTO servers(id,website) VALUES('links-l2','https://old.example.org/')`)
  const db={prepare(sql){return {bind(...args){return {run(){return sqlite.prepare(sql).run(...args)}}}}},
    async batch(steps){sqlite.exec('BEGIN');try{for(const step of steps)step.run();sqlite.exec('COMMIT')}
      catch(error){sqlite.exec('ROLLBACK');throw error}}}
  const project=payload=>applyPublicSnapshot(db,parsePublicSnapshot(payload))
  await project(first)
  assert.equal(sqlite.prepare("SELECT website FROM servers WHERE id='links-l2'").get().website,input.value)
  assert.throws(()=>parsePublicSnapshot({...first,links:{site:'javascript:alert(1)'}}),/invalid_projection/)

  await h.db.query(`INSERT INTO gs_copyright_claims(id,server_id,claimant_name,contact_email,rights_basis,
    work_description,material_key,material_url,evidence,status) VALUES
    ('link-claim','links-l2','Rights Holder','rights@example.org','Rights basis','Protected work','site',$1,'Evidence','REVIEW_RESTRICTED')`,[input.value])
  await h.db.query(`INSERT INTO gs_material_restrictions(id,claim_id,server_id,material_key)
    VALUES('link-restriction','link-claim','links-l2','site')`)
  const changed=await h.request(sitePath,{...input,value:'https://l2.example.org/new'},owner.cookie)
  assert.equal(changed.status,201)
  await h.db.query(`CREATE FUNCTION fail_link_outbox() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'simulated outbox failure'; END $$`)
  await h.db.query('CREATE TRIGGER fail_link_outbox BEFORE INSERT ON gs_public_outbox FOR EACH ROW EXECUTE FUNCTION fail_link_outbox()')
  assert.equal((await h.request(`/admin/server-fact-edits/${changed.body.id}/resolve`,
    {status:'APPROVED',reason:'Updated official site verified'},admin.cookie)).status,500)
  assert.equal((await h.db.query('SELECT status FROM gs_owner_fact_edits WHERE id=$1',[changed.body.id])).rows[0].status,'PENDING')
  assert.equal((await h.db.query("SELECT website FROM gs_server_registry WHERE server_id='links-l2'")).rows[0].website,input.value)
  await h.db.query('DROP TRIGGER fail_link_outbox ON gs_public_outbox')
  await h.db.query('DROP FUNCTION fail_link_outbox()')
  assert.equal((await h.request(`/admin/server-fact-edits/${changed.body.id}/resolve`,
    {status:'APPROVED',reason:'Updated official site verified'},admin.cookie)).status,200)
  const second=(await h.db.query("SELECT payload FROM gs_public_outbox WHERE server_id='links-l2' ORDER BY version DESC LIMIT 1")).rows[0].payload
  assert.deepEqual(second.restrictedLinks,['site'])
  await project(second)
  await project(first)
  const current=sqlite.prepare("SELECT s.website,p.restricted_links,p.version FROM servers s JOIN public_server_projection p ON p.server_id=s.id").get()
  assert.equal(current.website,'https://l2.example.org/new')
  assert.equal(current.restricted_links,'["site"]')
  assert.equal(serverDto({id:'links-l2',slug:'links-l2',game_id:'lineage2',website:current.website,
    restricted_links:current.restricted_links,modes:'[]',tags:'[]',languages:'[]'}).links.site,'')

  const removed=await h.request(sitePath,{field:'site',value:'',evidence:'The owner confirms the site must be removed.'},owner.cookie)
  assert.equal(removed.status,201)
  assert.equal((await h.request(`/admin/server-fact-edits/${removed.body.id}/resolve`,
    {status:'APPROVED',reason:'Removal request verified with owner'},admin.cookie)).status,200)
  const last=(await h.db.query("SELECT payload FROM gs_public_outbox WHERE server_id='links-l2' ORDER BY version DESC LIMIT 1")).rows[0].payload
  assert.equal(last.links.site,'')
  await project(last)
  assert.equal(sqlite.prepare("SELECT website FROM servers WHERE id='links-l2'").get().website,null)
  assert.equal((await h.db.query("SELECT website FROM gs_server_registry WHERE server_id='links-l2'")).rows[0].website,null)
  for(const [id,field,value] of [['links-mc','discord','https://discord.gg/example'],['links-gta','telegram','https://t.me/example']]) {
    const edit=await h.request(`/owners/me/servers/${id}/fact-edits`,
      {field,value,evidence:'Official community channel ownership was checked.'},owner.cookie)
    assert.equal(edit.status,201)
    assert.equal((await h.request(`/admin/server-fact-edits/${edit.body.id}/resolve`,
      {status:'APPROVED',reason:'Official community channel verified'},admin.cookie)).status,200)
    const snapshot=(await h.db.query('SELECT payload FROM gs_public_outbox WHERE server_id=$1 ORDER BY version DESC LIMIT 1',[id])).rows[0].payload
    assert.equal(snapshot.links[field],value)
    parsePublicSnapshot(snapshot)
  }
})

test('Claim-scoped monitoring publishes only safe endpoints and disabling hides stale online',async t=>{
  const h=await harness(t),owner=await h.register('monitor-owner@example.com'),admin=await h.register('monitor-admin@example.com'),other=await h.register('monitor-other@example.com')
  await h.db.query("INSERT INTO gs_user_roles(user_id,role) VALUES($1,'ADMIN')",[admin.user.id])
  const targets=[['owner-mc','minecraft',{method:'GAME_PROTOCOL',host:'play.example.org',port:25565}],
    ['owner-l2','lineage2',{method:'LOGIN_SERVER',host:'login.example.org',port:2106}],
    ['owner-gta','gtarp',{method:'SERVER_API',apiUrl:'https://rp.example.org:30120/'}]]
  for(const [id,game,target] of targets) {
    await h.db.query('INSERT INTO gs_server_registry(server_id,game_id,name,slug) VALUES($1,$2,$3,$4)',[id,game,`Monitor ${game}`,id])
    const claim=await h.request('/claims',{serverId:id,evidence:'Official ownership proof can be checked by the reviewer.'},owner.cookie)
    assert.equal((await h.request(`/admin/claims/${claim.body.id}/resolve`,
      {status:'VERIFIED',reason:'Official ownership proof checked'},admin.cookie)).status,200)
    const path=`/owners/me/servers/${id}/monitoring`,body={...target,reason:'Public endpoint checked by owner'}
    assert.equal((await h.request(path,body,other.cookie)).status,403)
    const result=await h.request(path,body,owner.cookie)
    assert.equal(result.status,200,JSON.stringify(result.body))
    assert.equal(result.body.changed,true)
    assert.equal((await h.request(path,body,owner.cookie)).body.changed,false)
    const snapshot=(await h.db.query('SELECT payload FROM gs_public_outbox WHERE server_id=$1 ORDER BY version DESC LIMIT 1',[id])).rows[0].payload
    assert.equal(snapshot.monitoring.enabled,true)
    assert.equal(snapshot.monitoring.method,target.method)
    assert.ok(!JSON.stringify(snapshot).includes(owner.user.id))
    assert.deepEqual(parsePublicSnapshot(snapshot),snapshot)
  }
  assert.equal((await h.request('/owners/me/servers/owner-mc/monitoring',
    {method:'GAME_PROTOCOL',host:'127.0.0.1',reason:'Reject private address'},owner.cookie)).status,400)
  assert.equal((await h.request('/owners/me/servers/owner-mc/monitoring',
    {method:'SERVER_API',apiUrl:'https://example.org/',reason:'Reject wrong method'},owner.cookie)).status,400)
  assert.equal((await h.request('/owners/me/servers/owner-gta/monitoring',
    {method:'SERVER_API',apiUrl:'https://user:secret@rp.example.org/',reason:'Reject credentials'},owner.cookie)).status,400)
  assert.throws(()=>parsePublicSnapshot({serverId:'owner-mc',version:10,claimed:true,
    monitoring:{enabled:true,method:'GAME_PROTOCOL',host:'localhost'}}),/invalid_projection/)

  const snapshot=(await h.db.query("SELECT payload FROM gs_public_outbox WHERE server_id='owner-mc' ORDER BY version DESC LIMIT 1")).rows[0].payload
  const sqlite=new DatabaseSync(':memory:');t.after(()=>sqlite.close())
  sqlite.exec(`CREATE TABLE servers(id TEXT PRIMARY KEY);
    CREATE TABLE public_server_projection(server_id TEXT PRIMARY KEY REFERENCES servers(id),version INTEGER,
      claimed INTEGER,restricted_links TEXT,restricted_materials TEXT,support_coins INTEGER,
      support_participants INTEGER,received_at TEXT);
    CREATE TABLE monitoring_targets(server_id TEXT PRIMARY KEY REFERENCES servers(id),method TEXT,host TEXT,
      port INTEGER,api_url TEXT,expect_name TEXT,enabled INTEGER,agent_token TEXT);
    CREATE TABLE server_online(server_id TEXT PRIMARY KEY REFERENCES servers(id),status TEXT,current INTEGER,
      players_known INTEGER,max_known INTEGER,checked_at TEXT,observed_at TEXT,source TEXT,source_tier TEXT,
      source_url TEXT,note TEXT);
    INSERT INTO servers(id) VALUES('owner-mc');
    INSERT INTO server_online(server_id,status,current,players_known,max_known,checked_at,source)
      VALUES('owner-mc','LIVE',42,1,1,'2026-01-01T00:00:00Z','Old source')`)
  const db={prepare(sql){return {bind(...args){return {run(){return sqlite.prepare(sql).run(...args)}}}}},
    async batch(steps){sqlite.exec('BEGIN');try{for(const step of steps)step.run();sqlite.exec('COMMIT')}
      catch(error){sqlite.exec('ROLLBACK');throw error}}}
  const project=payload=>applyPublicSnapshot(db,parsePublicSnapshot(payload))
  sqlite.exec("CREATE TRIGGER fail_monitor_target BEFORE INSERT ON monitoring_targets BEGIN SELECT RAISE(ABORT,'failed'); END")
  await assert.rejects(project(snapshot),/failed/)
  assert.equal(sqlite.prepare('SELECT count(*) n FROM public_server_projection').get().n,0)
  sqlite.exec('DROP TRIGGER fail_monitor_target')
  await project(snapshot)
  assert.equal(sqlite.prepare("SELECT host FROM monitoring_targets WHERE server_id='owner-mc'").get().host,'play.example.org')
  assert.deepEqual({...sqlite.prepare("SELECT status,current,players_known FROM server_online WHERE server_id='owner-mc'").get()},
    {status:'UNKNOWN',current:0,players_known:0})
  const disabled=await h.request('/owners/me/servers/owner-mc/monitoring',
    {enabled:false,reason:'Owner disabled this source'},owner.cookie)
  assert.equal(disabled.status,200)
  const off=(await h.db.query("SELECT payload FROM gs_public_outbox WHERE server_id='owner-mc' ORDER BY version DESC LIMIT 1")).rows[0].payload
  assert.deepEqual(off.monitoring,{enabled:false})
  await project(off);await project(snapshot)
  assert.equal(sqlite.prepare("SELECT enabled FROM monitoring_targets WHERE server_id='owner-mc'").get().enabled,0)
  assert.equal(sqlite.prepare("SELECT version FROM public_server_projection WHERE server_id='owner-mc'").get().version,off.version)
})

test('Support projects only public aggregates with ledger rollback and idempotency',async t=>{
  const h=await harness(t),one=await h.register('support-projection-1@example.com'),two=await h.register('support-projection-2@example.com')
  await h.db.query("INSERT INTO gs_server_registry(server_id,game_id,name,slug) VALUES('support-gta','gtarp','Support GTA','support-gta')")
  assert.equal((await h.request('/__dev/coins',{coins:5},one.cookie,{'Idempotency-Key':'a'.repeat(32)})).status,201)
  assert.equal((await h.request('/__dev/coins',{coins:5},two.cookie,{'Idempotency-Key':'b'.repeat(32)})).status,201)
  const first=await h.request('/support',{serverId:'support-gta',coins:2,anonymous:true},one.cookie,{'Idempotency-Key':'c'.repeat(32)})
  assert.equal(first.status,201)
  assert.equal((await h.request('/support',{serverId:'support-gta',coins:2,anonymous:true},one.cookie,{'Idempotency-Key':'c'.repeat(32)})).body.replay,true)
  const second=await h.request('/support',{serverId:'support-gta',coins:1,anonymous:false},two.cookie,{'Idempotency-Key':'d'.repeat(32)})
  assert.equal(second.status,201)
  let snapshots=(await h.db.query('SELECT payload FROM gs_public_outbox ORDER BY id')).rows.map(x=>x.payload)
  assert.equal(snapshots.length,2)
  assert.deepEqual(snapshots.map(x=>[x.supportCoins,x.supportParticipants]),[[2,1],[3,2]])
  for(const snapshot of snapshots) {
    assert.ok(!JSON.stringify(snapshot).includes(one.user.id))
    assert.ok(!JSON.stringify(snapshot).includes('support-projection'))
    assert.ok(!JSON.stringify(snapshot).includes('Анонимно'))
    assert.deepEqual(parsePublicSnapshot(snapshot),snapshot)
  }
  await h.db.query(`CREATE FUNCTION fail_support_outbox() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'simulated queue failure'; END $$`)
  await h.db.query('CREATE TRIGGER fail_support_outbox BEFORE INSERT ON gs_public_outbox FOR EACH ROW EXECUTE FUNCTION fail_support_outbox()')
  assert.equal((await h.request('/support',{serverId:'support-gta',coins:1,anonymous:false},one.cookie,{'Idempotency-Key':'e'.repeat(32)})).status,500)
  assert.equal((await h.request('/coins/me',undefined,one.cookie)).body.balance,3)
  assert.equal((await h.db.query("SELECT count(*)::integer n FROM gs_coin_ledger WHERE kind='SUPPORT'")).rows[0].n,2)
  await h.db.query('DROP TRIGGER fail_support_outbox ON gs_public_outbox')
  await h.db.query('DROP FUNCTION fail_support_outbox()')
  snapshots=(await h.db.query('SELECT payload FROM gs_public_outbox ORDER BY id')).rows.map(x=>x.payload)
  assert.equal(snapshots.length,2)
})

test('local player → owner → admin journey spans L2, Minecraft and GTA RP without cross-database writes',async t=>{
  const publicFetch=async url=>new Response(JSON.stringify({id:new URL(url).pathname.split('/').at(-1),
    links:{site:'https://official.example/game'}}),{status:200})
  const h=await harness(t,{publicFetch,config:{publicApi:'https://catalog.example'}})
  const player=await h.register('journey-player@example.com'),admin=await h.register('journey-admin@example.com')
  await h.db.query("INSERT INTO gs_user_roles(user_id,role) VALUES($1,'ADMIN')",[admin.user.id])
  const games=[['journey-l2','lineage2'],['journey-mc','minecraft'],['journey-gta','gtarp']]
  for(const [id,game] of games)
    await h.db.query('INSERT INTO gs_server_registry(server_id,game_id,name,slug) VALUES($1,$2,$3,$4)',[id,game,id,id])
  assert.equal((await h.request('/__dev/coins',{coins:9},player.cookie,{'Idempotency-Key':'c'.repeat(32)})).status,201)
  for(const [index,[id]] of games.entries()) {
    const vote=await h.request('/people-rating/votes',{serverId:id,deviceSignal:'journey_device_123456',pageAgeMs:5000},
      player.cookie,{'Idempotency-Key':String(index+1).repeat(32)})
    assert.equal(vote.status,201,JSON.stringify(vote.body))
    assert.equal((await h.request('/support',{serverId:id,coins:index+1,anonymous:index===1},
      player.cookie,{'Idempotency-Key':String(index+4).repeat(32)})).status,201)
    const claim=await h.request('/claims',{serverId:id,evidence:'Official website proof and operator contact are available.'},player.cookie)
    assert.equal(claim.status,201)
    assert.equal((await h.request(`/admin/claims/${claim.body.id}/resolve`,
      {status:'VERIFIED',reason:'Official ownership proof verified'},admin.cookie)).status,200)
    assert.equal((await h.request(`/servers/${id}/manage-access`,undefined,player.cookie)).body.canManage,true)
    const edit=await h.request(`/owners/me/servers/${id}/summary-edits`,
      {summary:`Нейтральное описание проекта для игры ${id} с проверенными фактами.`},player.cookie)
    assert.equal(edit.status,201)
    assert.equal((await h.request(`/admin/server-edits/${edit.body.id}/resolve`,
      {status:'APPROVED',reason:'Описание соответствует фактам'},admin.cookie)).status,200)
  }
  assert.equal((await h.request('/owners/me/servers',undefined,player.cookie)).body.length,3)
  assert.equal((await h.request('/people-rating')).body.filter(row=>row.votes===1).length,3)
  const support=(await h.request('/support/ranking')).body.filter(row=>row.coins>0)
  assert.deepEqual(support.map(row=>row.coins),[3,2,1])
  assert.equal((await h.request('/coins/me',undefined,player.cookie)).body.balance,3)
  const copyright=await h.request('/copyright/claims',{serverId:'journey-mc',materialKey:'site',
    materialUrl:'https://official.example/game',claimantName:'Rights Holder',contactEmail:'rights@example.com',
    rightsBasis:'I own the identified artwork and seek review.',workDescription:'Artwork on the linked project page.',
    evidence:'Original publication and ownership records are available.'})
  assert.equal(copyright.status,201)
  assert.equal(copyright.body.status,'PENDING_AI')
  await dispatchCopyrightAI(h.db,async()=>({classification:'DOUBTFUL',reason:'Specific link merits human review'}),'mock-model')
  assert.deepEqual((await h.request('/copyright/restrictions/journey-mc')).body.restrictedLinks,['site'])
  assert.equal((await h.request(`/admin/copyright/${copyright.body.id}/resolve`,
    {action:'RESTORE',reason:'Human reviewed and cleared the linked material'},admin.cookie)).status,200)
  assert.deepEqual((await h.request('/copyright/restrictions/journey-mc')).body.restrictedLinks,[])
  const outbox=(await h.db.query('SELECT server_id,version,payload FROM gs_public_outbox ORDER BY id')).rows
  for(const [id] of games) {
    const events=outbox.filter(row=>row.server_id===id)
    assert.deepEqual(events.map(row=>Number(row.version)),id==='journey-mc'?[1,2,3,4,5]:[1,2,3],id)
    assert.equal(events.at(-1).payload.supportCoins,games.findIndex(row=>row[0]===id)+1)
  }
  assert.ok(!JSON.stringify(outbox).includes('journey-player@example.com'))
  assert.ok(!JSON.stringify(outbox).includes('rights@example.com'))
  assert.equal((await h.db.query("SELECT count(*)::integer n FROM gs_coin_ledger WHERE kind='SUPPORT'")).rows[0].n,3)
})
