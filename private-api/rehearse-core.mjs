// Explicit, isolated PostgreSQL rehearsal. Never writes to the configured source database.
import assert from 'node:assert/strict'
import {randomBytes} from 'node:crypto'
import {createApp} from './app.mjs'
import {migrate,postgresStore} from './db.mjs'
import {productionConfig} from './production-config.mjs'
import {unseal} from './crypto.mjs'

if(process.env.PRIVATE_REHEARSAL!=='1')throw new Error('explicit_private_rehearsal_required')
const loaded=await productionConfig(),source=new URL(loaded.connectionString)
const name=`gamescout_e2e_${Date.now()}_${randomBytes(4).toString('hex')}`
if(!/^gamescout_e2e_\d+_[a-f0-9]{8}$/.test(name))throw new Error('unsafe_rehearsal_name')
const control=postgresStore(source.toString(),loaded.ca)
let db,created=false
try {
  // CREATE DATABASE cannot be inside a transaction. The random, verified name is identifier-only.
  await control.query(`CREATE DATABASE "${name}"`);created=true
  source.pathname='/'+name
  db=postgresStore(source.toString(),loaded.ca)
  await migrate(db)
  const origin='http://127.0.0.1:5173',config={origin,environment:'development',mailEnabled:true,
    mailKey:randomBytes(32).toString('hex'),rateKey:randomBytes(32).toString('hex')}
  const app=createApp({db,config})
  const request=async(path,body,cookie='',key)=>{
    const r=await app.request(origin+'/api/v1'+path,{method:body===undefined?'GET':'POST',
      headers:{Origin:origin,'Content-Type':'application/json',Cookie:cookie,...(key?{'Idempotency-Key':key}:{})},
      ...(body===undefined?{}:{body:JSON.stringify(body)})},{clientIp:'127.0.0.1'})
    return {status:r.status,body:await r.json(),cookie:r.headers.getSetCookie().filter(c=>c.startsWith('gs_private_session=')).map(c=>c.split(';')[0]).join('; ')}
  }
  const registered=async label=>{
    const email=`${label}@example.invalid`,password=randomBytes(24).toString('hex')
    assert.equal((await request('/auth/register',{email,password,displayName:label})).status,202)
    const rows=(await db.query('SELECT ciphertext FROM gs_mail_outbox')).rows
    const mail=rows.map(row=>unseal(config.mailKey,row.ciphertext)).find(mail=>mail.to===email)
    const token=new URLSearchParams(new URL(mail.link).hash.slice(1)).get('token')
    const result=await request('/auth/register/confirm',{token})
    assert.equal(result.status,200);return result
  }
  const player=await registered('rehearsal-player'),admin=await registered('rehearsal-admin'),other=await registered('rehearsal-other-admin')
  await db.query("INSERT INTO gs_user_roles(user_id,role) VALUES($1,'ADMIN'),($2,'ADMIN')",[admin.body.user.id,other.body.user.id])
  const supports=[]
  assert.equal((await request('/__dev/coins',{coins:9},player.cookie,'rehearsal-credit-key')).status,201)
  for(const game of ['lineage2','minecraft','gtarp']) {
    await db.query('INSERT INTO gs_server_registry(server_id,game_id,name,slug) VALUES($1,$1,$1,$1)',[game])
    const claim=await request('/claims',{serverId:game,evidence:'Isolated rehearsal server belongs to this test player.'},player.cookie)
    assert.equal(claim.status,201)
    assert.equal((await request(`/admin/claims/${claim.body.id}/resolve`,{status:'VERIFIED',reason:'Synthetic ownership proof reviewed in isolated database'},admin.cookie)).status,200)
    assert.equal((await request(`/servers/${game}/manage-access`,undefined,player.cookie)).body.canManage,true)
    assert.equal((await request('/people-rating/votes',{serverId:game,deviceSignal:'rehearsal_device_signal',pageAgeMs:5000},player.cookie,'rehearsal-vote-'+game)).status,201)
    const support=await request('/support',{serverId:game,coins:1,anonymous:true},player.cookie,'rehearsal-support-'+game)
    assert.equal(support.status,201);supports.push(support.body.id)
  }
  const raced=await Promise.all(['lineage2','minecraft'].map(game=>request('/support',{serverId:game,coins:4},player.cookie,'rehearsal-race-'+game)))
  assert.deepEqual(raced.map(r=>r.status).sort(),[201,409])
  supports.push(raced.find(r=>r.status===201).body.id)
  for(const id of supports) {
    const path=`/admin/support/${id}/refund`,reason='Controlled cancellation in isolated rehearsal database'
    const refunds=await Promise.all([request(path,{reason},admin.cookie,'rehearsal-refund-'+id),request(path,{reason},other.cookie,'rehearsal-other-'+id)])
    assert.deepEqual(refunds.map(r=>r.status).sort(),[201,409])
  }
  const wallet=(await request('/coins/me',undefined,player.cookie)).body
  assert.equal(wallet.balance,9);assert.equal(wallet.ledger.reduce((sum,row)=>sum+row.delta,0),9)
  assert.equal(wallet.ledger.filter(row=>row.kind==='REFUND').length,4)
  assert.ok((await request('/support/ranking')).body.every(row=>row.coins===0&&row.participants===0))
  assert.equal((await db.query('SELECT count(*)::integer n FROM gs_votes')).rows[0].n,3)
  assert.equal((await request('/owners/me/servers',undefined,player.cookie)).body.length,3)
  assert.equal((await request('/admin/support',undefined,player.cookie)).status,403)
  console.log(JSON.stringify({scope:'isolated-postgresql',games:3,claims:3,votes:3,support:4,refunds:4,
    concurrentSpend:'one accepted',concurrentRefund:'one accepted',externalMail:false,productionDataChanged:false}))
} finally {
  if(db)await db.close()
  try {if(created){await control.query(`DROP DATABASE "${name}"`);console.log('isolated_database_removed')}}
  finally {await control.close()}
}
