import test from 'node:test'
import assert from 'node:assert/strict'
import { PGlite } from '@electric-sql/pglite'
import { DatabaseSync } from 'node:sqlite'
import { createApp } from '../private-api/app.mjs'
import { migrate } from '../private-api/db.mjs'
import { digest, unseal } from '../private-api/crypto.mjs'
import { dispatch, outboxHealth } from '../private-api/outbox.mjs'
import { parsePublicSnapshot, projectionSql } from '../worker/lib/public-projection.ts'

const origin='http://127.0.0.1:5173', password='correct horse battery staple'
const config={origin,environment:'development',mailEnabled:true,mailKey:'a'.repeat(64),rateKey:'b'.repeat(64),
  oauth:{GOOGLE_CLIENT_ID:'test',GOOGLE_CLIENT_SECRET:'test',YANDEX_CLIENT_ID:'test',YANDEX_CLIENT_SECRET:'test',VK_CLIENT_ID:'test'}}
async function harness(t,options={}) {
  const pg=new PGlite()
  const db={query:(sql,args=[])=>pg.query(sql,args),transaction:fn=>pg.transaction(fn)}
  await migrate(db);await migrate(db)
  t.after(()=>pg.close())
  const app=createApp({db,config:{...config,...options.config},captchaVerify:options.captchaVerify,
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
  for(const row of outbox) { assert.deepEqual(Object.keys(row.payload).sort(),['claimed','serverId','version']); assert.ok(!JSON.stringify(row.payload).includes(owner.user.id)) }
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
  sqlite.exec('CREATE TABLE public_server_projection(server_id TEXT PRIMARY KEY,version INTEGER,claimed INTEGER,received_at TEXT)')
  const receive=payload=>{const p=parsePublicSnapshot(payload);sqlite.prepare(projectionSql).run(p.serverId,p.version,+p.claimed,new Date().toISOString())}
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
