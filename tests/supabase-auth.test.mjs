import test from 'node:test'
import assert from 'node:assert/strict'
import { PGlite } from '@electric-sql/pglite'
import { migrate } from '../private-api/db.mjs'
import { createApp } from '../private-api/app.mjs'
import { digest } from '../private-api/crypto.mjs'
import { supabaseAuthConfiguration, verifiedSupabaseUser } from '../private-api/supabase-auth.mjs'

const url='https://abcdefghijklmnopqrst.supabase.co', key='sb_publishable_synthetic', origin='https://gamescout.online'
const subject='11111111-1111-4111-8111-111111111111', accessToken='synthetic-access-token-not-a-real-credential'
const profile={id:subject,email:'player@example.test',email_confirmed_at:'2026-10-12T00:00:00Z',user_metadata:{display_name:'Player',roles:['ADMIN']},app_metadata:{provider:'google'}}
test('Auth verifier pins destination, checks remote user, and ignores user-supplied privileges',async()=>{
  for(const bad of ['http://abcdefghijklmnopqrst.supabase.co','https://127.0.0.1','https://abcdefghijklmnopqrst.supabase.co/path'])
    assert.throws(()=>supabaseAuthConfiguration(bad,key))
  assert.throws(()=>supabaseAuthConfiguration(url,'sb_secret_synthetic'))
  const cfg=supabaseAuthConfiguration(url,key)
  const verified=await verifiedSupabaseUser(cfg,accessToken,async(target,init)=>{
    assert.equal(target,url+'/auth/v1/user');assert.equal(init.headers.Authorization,'Bearer '+accessToken)
    assert.equal(init.redirect,'error');return Response.json(profile)
  })
  assert.deepEqual(verified,{subject,email:profile.email,displayName:'Player',method:'google'})
  await assert.rejects(()=>verifiedSupabaseUser(cfg,accessToken,async()=>Response.json({...profile,email_confirmed_at:null})))
  await assert.rejects(()=>verifiedSupabaseUser(cfg,accessToken,async()=>new Response('',{status:401})))
})

test('SQL bridge preserves old account rights only after explicit proof; no email auto-merge or metadata roles',async t=>{
  const pg=new PGlite();t.after(()=>pg.close())
  const db={query:(sql,args=[])=>pg.query(sql,args),transaction:fn=>pg.transaction(fn)}
  await migrate(db)
  const config={origin,environment:'development',mailEnabled:true,mailKey:'a'.repeat(64),rateKey:'b'.repeat(64),registrationOpen:true,
    supabaseUrl:url,supabasePublishableKey:key}
  let user=profile, reject=false, unavailable=false
  const app=createApp({db,config,supabaseFetch:async()=>unavailable?new Response('',{status:503}):reject?new Response('',{status:401}):Response.json(user)})
  const call=(body,cookie='',requestOrigin=origin)=>app.request(origin+'/api/v1/auth/supabase',{method:'POST',headers:{Origin:requestOrigin,'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify(body)},{clientIp:'192.0.2.1'})
  assert.equal((await call({accessToken},'','https://evil.example')).status,403)
  reject=true;assert.equal((await call({accessToken})).status,401);reject=false
  unavailable=true;assert.equal((await call({accessToken})).status,503);unavailable=false
  await db.query('INSERT INTO gs_users(id,email,display_name,email_verified_at) VALUES($1,$2,$3,now())',['old',profile.email,'Old'])
  await db.query("INSERT INTO gs_user_roles(user_id,role) VALUES('old','ADMIN')")
  assert.equal((await call({accessToken})).status,409)
  assert.equal((await call({accessToken,link:true})).status,401)
  assert.equal((await db.query('SELECT count(*)::integer n FROM gs_identities')).rows[0].n,0)
  const oldToken='old-session-proof'
  await db.query("INSERT INTO gs_sessions(token_hash,user_id,expires_at,login_method) VALUES($1,'old',now()+interval '1 hour','email')",[digest(oldToken)])
  await db.query("UPDATE gs_sessions SET created_at=now()-interval '11 minutes' WHERE token_hash=$1",[digest(oldToken)])
  assert.equal((await call({accessToken,link:true},'gs_private_session='+oldToken)).status,401)
  await db.query('UPDATE gs_sessions SET created_at=now() WHERE token_hash=$1',[digest(oldToken)])
  const linked=await call({accessToken,link:true},'gs_private_session='+oldToken)
  assert.equal(linked.status,200)
  const cookie=linked.headers.get('set-cookie').split(';')[0]
  const me=await (await app.request(origin+'/api/v1/auth/me',{headers:{Cookie:cookie}})).json()
  assert.equal(me.user.id,'old');assert.ok(me.user.roles.includes('ADMIN'));assert.equal(me.user.loginMethod,'google')
  assert.equal((await call({accessToken})).status,200)
  user={...profile,id:'22222222-2222-4222-8222-222222222222',email:'new@example.test'}
  const fresh=await call({accessToken}), freshCookie=fresh.headers.get('set-cookie').split(';')[0]
  assert.equal(fresh.status,200)
  const freshMe=await (await app.request(origin+'/api/v1/auth/me',{headers:{Cookie:freshCookie}})).json()
  assert.deepEqual(freshMe.user.roles,['PLAYER']);assert.equal(freshMe.user.emailVerified,true)
  assert.notEqual(freshMe.user.id,'old')
  user=profile
  assert.equal((await call({accessToken,link:true},freshCookie)).status,409)
  await db.query("UPDATE gs_users SET banned_at=now() WHERE id='old'")
  assert.equal((await call({accessToken})).status,403)
})
