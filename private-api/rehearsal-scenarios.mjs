// Run only against an empty, disposable database. Provider transports are never invoked.
import assert from 'node:assert/strict'
import {createHash,randomBytes} from 'node:crypto'
import {createApp} from './app.mjs'
import {unseal} from './crypto.mjs'

export async function rehearseCoreScenarios(db) {
  assert.equal(Number((await db.query('SELECT count(*) n FROM gs_users')).rows[0].n),0,'Rehearsal requires an empty disposable database')
  const games=['lineage2','minecraft','gtarp'],origin='http://127.0.0.1:5173'
  const robokassa={merchantLogin:'isolated-rehearsal',testPassword1:randomBytes(32).toString('hex'),
    testPassword2:randomBytes(32).toString('hex'),receiptSno:'osn',receiptTax:'none',
    receiptPaymentObject:'service',receiptPaymentMethod:'full_payment',itemName:'Synthetic GS Coins test'}
  const config={origin,environment:'development',mailEnabled:true,mailKey:randomBytes(32).toString('hex'),
    rateKey:randomBytes(32).toString('hex'),enableTestPayments:true,robokassa,publicApi:'https://catalog.example.invalid'}
  let catalogFixtureReads=0
  const app=createApp({db,config,publicFetch:async target=>{
    const url=new URL(target),id=url.pathname.split('/').at(-1)
    assert.equal(url.origin,config.publicApi,'Only synthetic catalog lookups are permitted')
    assert.equal(url.pathname,`/api/v1/servers/${id}`)
    assert.ok(games.includes(id),'Unknown synthetic catalog card')
    catalogFixtureReads++
    return new Response(JSON.stringify({id,links:{site:`https://rehearsal.example/${id}`}}))
  }})
  const request=async(path,body,cookie='',key)=>{
    const response=await app.request(origin+'/api/v1'+path,{method:body===undefined?'GET':'POST',
      headers:{Origin:origin,'Content-Type':'application/json',Cookie:cookie,...(key?{'Idempotency-Key':key}:{})},
      ...(body===undefined?{}:{body:JSON.stringify(body)})},{clientIp:'127.0.0.1'})
    return {status:response.status,body:await response.json(),
      cookie:response.headers.getSetCookie().filter(value=>value.startsWith('gs_private_session=')).map(value=>value.split(';')[0]).join('; ')}
  }
  const status=(response,expected,label)=>{assert.equal(response.status,expected,label);return response}
  const mailToken=async(email,purpose)=>{
    const rows=(await db.query('SELECT ciphertext FROM gs_mail_outbox ORDER BY created_at DESC')).rows
    const mail=rows.map(row=>unseal(config.mailKey,row.ciphertext)).find(value=>value.to===email&&value.purpose===purpose)
    assert.ok(mail,'Synthetic encrypted mail exists')
    return new URLSearchParams(new URL(mail.link).hash.slice(1)).get('token')
  }
  const registered=async label=>{
    const email=`${label}@example.invalid`,password=randomBytes(24).toString('hex')
    status(await request('/auth/register',{email,password,displayName:label}),202,'Registration queues email')
    const token=await mailToken(email,'REGISTER')
    const result=status(await request('/auth/register/confirm',{token}),200,'Registration confirmation')
    assert.equal(result.body.user.emailVerified,true)
    status(await request('/auth/register/confirm',{token}),400,'Confirmation token is single-use')
    return {...result,email,password}
  }
  const player=await registered('rehearsal-player'),admin=await registered('rehearsal-admin'),other=await registered('rehearsal-other-admin')
  await db.query("INSERT INTO gs_user_roles(user_id,role) VALUES($1,'ADMIN'),($2,'ADMIN')",[admin.body.user.id,other.body.user.id])

  // The password path is exercised through the same API as the browser. Mail stays in this database.
  const registrationSession=player.cookie
  status(await request('/auth/logout',{},player.cookie),200,'Logout')
  assert.equal((await request('/auth/me',undefined,registrationSession)).body.user,null)
  const login=status(await request('/auth/login',{email:player.email,password:player.password}),200,'Password login')
  status(await request('/auth/password/reset/request',{email:player.email}),202,'Password reset queues email')
  const resetToken=await mailToken(player.email,'RESET'),newPassword=randomBytes(24).toString('hex')
  status(await request('/auth/password/reset',{token:resetToken,password:newPassword}),200,'Password reset')
  assert.equal((await request('/auth/me',undefined,login.cookie)).body.user,null,'Reset revokes existing sessions')
  status(await request('/auth/password/reset',{token:resetToken,password:newPassword}),400,'Reset token is single-use')
  status(await request('/auth/login',{email:player.email,password:player.password}),401,'Old password rejected')
  player.cookie=status(await request('/auth/login',{email:player.email,password:newPassword}),200,'New password accepted').cookie

  // This signs a synthetic ResultURL locally; it never visits Robokassa or enables real sales.
  const order=status(await request('/payments/test/orders',{coins:9},player.cookie,'rehearsal-payment-order'),200,'Synthetic test order')
  const fields=order.body.checkout.fields
  assert.equal(fields.IsTest,'1');assert.equal(fields.OutSum,'450.00')
  assert.equal((await request('/payments/test/config')).body.realSalesEnabled,false)
  assert.equal(status(await request('/payments/test/orders',{coins:9},player.cookie,'rehearsal-payment-order'),200).body.id,order.body.id)
  const notice=(amount=fields.OutSum,secret=robokassa.testPassword2)=>new URLSearchParams({OutSum:amount,InvId:order.body.id,Shp_order:fields.Shp_order,
    SignatureValue:createHash('md5').update(`${amount}:${order.body.id}:${secret}:Shp_order=${fields.Shp_order}`).digest('hex')}).toString()
  const callback=async body=>{
    const response=await app.request(origin+'/api/v1/payments/robokassa/result',{
      method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body})
    return {status:response.status,body:await response.text()}
  }
  status(await callback(notice('450.00','wrong-synthetic-secret')),400,'Forged payment callback')
  status(await callback(notice('500.00')),400,'Signed mismatched amount')
  assert.equal((await request('/coins/me',undefined,player.cookie)).body.balance,0)
  const paid=await Promise.all([callback(notice()),callback(notice())])
  assert.deepEqual(paid,[{status:200,body:`OK${order.body.id}`},{status:200,body:`OK${order.body.id}`}])
  assert.equal((await request('/coins/me',undefined,player.cookie)).body.balance,9)
  assert.equal(Number((await db.query("SELECT count(*) n FROM gs_coin_ledger WHERE kind='PURCHASE'")).rows[0].n),1)

  const latestProjection=async game=>(await db.query('SELECT payload FROM gs_public_outbox WHERE server_id=$1 ORDER BY version DESC LIMIT 1',[game])).rows[0]?.payload
  const supports=[]
  for(const game of games) {
    await db.query('INSERT INTO gs_server_registry(server_id,game_id,name,slug) VALUES($1,$1,$1,$1)',[game])
    const claim=status(await request('/claims',{serverId:game,evidence:'Synthetic isolated ownership evidence for the rehearsal.'},player.cookie),201,'Claim submission')
    const resolvePath=`/admin/claims/${claim.body.id}/resolve`,decision={status:'VERIFIED',reason:'Synthetic manual proof reviewed in disposable database'}
    const missingProof=status(await request(resolvePath,decision,admin.cookie),409,'Missing proof cannot grant ownership')
    assert.equal(missingProof.body.error.code,'proof_required')
    status(await request(`/servers/${game}/manage-access`,undefined,player.cookie),403,'No management before proof')
    const proof=status(await request(`/claims/${claim.body.id}/proof`,{method:'MANUAL'},player.cookie),201,'Issue manual proof')
    status(await request(resolvePath,{...decision,observedToken:'incorrect-code'},admin.cookie),409,'Wrong proof cannot grant ownership')
    status(await request(resolvePath,{...decision,observedToken:proof.body.code},admin.cookie),200,'Reviewed manual proof grants scoped access')
    assert.equal((await request(`/servers/${game}/manage-access`,undefined,player.cookie)).body.canManage,true)
    status(await request(`/servers/${game}/manage-access`,undefined,other.cookie),403,'Another account cannot manage claimed server')

    const summary=`Synthetic neutral summary of the isolated ${game} project.`
    const edit=status(await request(`/owners/me/servers/${game}/summary-edits`,{summary},player.cookie),201,'Owner summary awaits moderation')
    assert.equal((await latestProjection(game)).summary,undefined,'Pending summary is not public')
    status(await request(`/admin/server-edits/${edit.body.id}/resolve`,{status:'APPROVED',reason:'Synthetic summary verified in rehearsal'},admin.cookie),200,'Admin approves summary')
    assert.equal((await latestProjection(game)).summary,summary)
    const fact=status(await request(`/owners/me/servers/${game}/fact-edits`,{field:'region',value:'Europe',evidence:'Synthetic official region evidence for isolated rehearsal.'},player.cookie),201,'Owner fact awaits moderation')
    assert.equal((await latestProjection(game)).facts?.region,undefined,'Pending fact is not public')
    status(await request(`/admin/server-fact-edits/${fact.body.id}/resolve`,{status:'APPROVED',reason:'Synthetic region evidence reviewed'},admin.cookie),200,'Admin approves fact')
    assert.equal((await latestProjection(game)).facts.region,'Europe')

    status(await request('/people-rating/votes',{serverId:game,deviceSignal:'rehearsal_device_signal',pageAgeMs:5000},player.cookie,'rehearsal-vote-'+game),201,'Accepted vote')
    const support=status(await request('/support',{serverId:game,coins:1,anonymous:true},player.cookie,'rehearsal-support-'+game),201,'Support purchase')
    supports.push(support.body.id)
    assert.equal((await request('/people-rating')).body.find(row=>row.server_id===game).votes,1,'Support must not buy votes')

    const copyright=status(await request('/copyright/claims',{serverId:game,materialKey:'site',materialUrl:`https://rehearsal.example/${game}`,
      claimantName:'Synthetic Rights Holder',contactEmail:'rehearsal-rights@example.invalid',rightsBasis:'Synthetic ownership basis for an isolated test.',
      workDescription:'Synthetic original work description for an isolated test.',evidence:'Synthetic publication evidence for isolated review only.'}),201,'Copyright intake')
    assert.equal(copyright.body.status,'PENDING_AI')
    const copyrightPath=`/admin/copyright/${copyright.body.id}/resolve`
    status(await request(copyrightPath,{action:'RESTRICT',reason:'Synthetic material restriction requires manual review'},player.cookie),403,'Player cannot restrict material')
    status(await request(copyrightPath,{action:'RESTRICT',reason:'Synthetic scoped manual restriction in rehearsal'},admin.cookie),200,'Admin restricts exact material')
    assert.deepEqual((await request(`/copyright/restrictions/${game}`)).body,{restrictedLinks:['site'],restrictedMaterials:[]})
    assert.deepEqual((await latestProjection(game)).restrictedLinks,['site'])
    status(await request(copyrightPath,{action:'RESTORE',reason:'Synthetic manual review restores the exact material'},admin.cookie),200,'Admin restores material')
    assert.deepEqual((await request(`/copyright/restrictions/${game}`)).body,{restrictedLinks:[],restrictedMaterials:[]})
    assert.deepEqual((await latestProjection(game)).restrictedLinks,[])
  }

  const votesBefore=(await request('/people-rating')).body
  const raced=await Promise.all(['lineage2','minecraft'].map(game=>request('/support',{serverId:game,coins:4},player.cookie,'rehearsal-race-'+game)))
  assert.deepEqual(raced.map(result=>result.status).sort(),[201,409])
  supports.push(raced.find(result=>result.status===201).body.id)
  for(const id of supports) {
    const path=`/admin/support/${id}/refund`,reason='Controlled cancellation in isolated rehearsal database'
    const refunds=await Promise.all([request(path,{reason},admin.cookie,'rehearsal-refund-'+id),request(path,{reason},other.cookie,'rehearsal-other-'+id)])
    assert.deepEqual(refunds.map(result=>result.status).sort(),[201,409])
  }
  const wallet=(await request('/coins/me',undefined,player.cookie)).body
  assert.equal(wallet.balance,9);assert.equal(wallet.ledger.reduce((sum,row)=>sum+row.delta,0),9)
  assert.equal(wallet.ledger.filter(row=>row.kind==='PURCHASE').length,1)
  assert.equal(wallet.ledger.filter(row=>row.kind==='REFUND').length,4)
  assert.equal(wallet.ledger.filter(row=>row.kind==='ADJUSTMENT').length,0,'No dev credit substitutes for signed test payment')
  assert.ok((await request('/support/ranking')).body.every(row=>row.coins===0&&row.participants===0))
  assert.deepEqual((await request('/people-rating')).body,votesBefore,'Financial operations never change People rating')
  assert.equal(Number((await db.query('SELECT count(*) n FROM gs_votes')).rows[0].n),3)
  assert.equal((await request('/owners/me/servers',undefined,player.cookie)).body.length,3)
  status(await request('/admin/support',undefined,player.cookie),403,'Admin API remains private')
  assert.deepEqual((await request('/admin/payments/reconciliation',undefined,admin.cookie)).body,{orderMismatch:[],balanceMismatch:[]})
  for(const game of games) {
    const projection=await latestProjection(game)
    assert.equal(projection.claimed,true);assert.equal(projection.supportCoins,0);assert.deepEqual(projection.restrictedLinks,[])
  }
  const publicRows=JSON.stringify((await db.query('SELECT payload FROM gs_public_outbox')).rows)
  assert.ok(!publicRows.includes('@example.invalid'),'Mail identity stays out of public projection')
  status(await request('/auth/logout',{},player.cookie),200,'Final logout')
  assert.equal((await request('/auth/me',undefined,player.cookie)).body.user,null)
  return {games:3,claims:3,manualProofs:3,missingProofRejected:3,ownerSummaries:3,ownerFacts:3,
    passwordReset:true,sessionRevocation:true,copyrightRestricted:3,copyrightRestored:3,
    votes:3,support:4,refunds:4,syntheticTestPurchases:1,concurrentPaymentCallbacks:2,
    concurrentSpend:'one accepted',concurrentRefund:'one accepted',catalogFixtureReads,
    externalMail:false,externalPayments:false,externalCatalog:false,externalAI:false,externalTelegram:false,
    productionDataChanged:false}
}
