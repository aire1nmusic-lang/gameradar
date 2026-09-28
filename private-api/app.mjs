import { Hono } from 'hono'
import { digest, equal, hashPassword, keyed, passwordValid, seal, token, verifyPassword } from './crypto.mjs'
import { outboxHealth } from './outbox.mjs'
import { classifyLocalNickname } from './nickname.mjs'
import { paymentReceipt, parseTestResult, testCheckoutForm, testPaymentConfig } from './robokassa.mjs'
import { createPublicSnapshot } from './public-snapshot.mjs'
import { enqueueTelegram } from './copyright.mjs'
import { assertPort, assertPublicHost, assertPublicUrl } from '../worker/adapters/network.ts'
// Keep the provider-specific transports already present in the repository.
import { authorizeUrl, enabledProviders, exchangeProfile, isProvider, safeNext } from '../worker/lib/oauth.ts'

class Failure extends Error {
  constructor(status, code, message) { super(message); this.status=status; this.code=code }
}
const fail = (status, code, message) => { throw new Failure(status,code,message) }
const emailOf = value => {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (email.length>254 || !/^[^\s@]{1,64}@[^\s@]+\.[^\s@]+$/.test(email)) fail(400,'email_invalid','Введите корректный email')
  return email
}
const textOf = (v,min,max) => {
  if (typeof v !== 'string' || v.trim().length<min || v.length>max || /[\u0000-\u001f]/.test(v)) fail(400,'invalid_input',`Ожидается текст от ${min} до ${max} символов`)
  return v.trim()
}
const ownerFact = (field,input) => {
  if(['site','discord','telegram'].includes(field)) {
    if(input==='')return '' // An explicit removal, reviewed like any other change.
    if(typeof input!=='string'||input.length>500)fail(400,'invalid_link','Некорректная ссылка')
    let url
    try {url=new URL(input.trim())}catch{fail(400,'invalid_link','Некорректная ссылка')}
    const host=url.hostname.toLowerCase().replace(/\.$/,'')
    if(url.protocol!=='https:'||url.username||url.password||url.hash||!host.includes('.')
      ||host==='localhost'||/\.(?:localhost|local|internal|lan|test)$/.test(host)
      ||/^\d+\.\d+\.\d+\.\d+$/.test(host)||host.startsWith('['))
      fail(400,'invalid_link','Нужен публичный HTTPS-адрес без учётных данных и фрагмента')
    return url.toString()
  }
  if(!['version','rates','region','openedAt','modes','country'].includes(field)) fail(400,'invalid_field','Недопустимое поле карточки')
  const value=textOf(input,1,80)
  if(/[<>]|\b(?:https?:\/\/|www\.)/i.test(value)) fail(400,'invalid_fact','Используйте только значение характеристики без ссылок и разметки')
  if(field==='openedAt' && (!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(`${value}T00:00:00Z`))
    ||new Date(`${value}T00:00:00Z`).toISOString().slice(0,10)!==value)) fail(400,'invalid_date','Укажите дату в формате ГГГГ-ММ-ДД')
  if(field==='modes') {
    const modes=value.split(',').map(mode=>mode.trim())
    if(modes.length>5 || modes.some(mode=>!mode || mode.length>30) || new Set(modes.map(mode=>mode.toLowerCase())).size!==modes.length)
      fail(400,'invalid_modes','Укажите от одного до пяти разных режимов через запятую')
    return modes.join(', ')
  }
  return value
}
const ownerMonitoring = (body,gameId) => {
  if(body.enabled===false)return {enabled:false,method:null,host:null,port:null,apiUrl:null}
  const method={minecraft:'GAME_PROTOCOL',lineage2:'LOGIN_SERVER',gtarp:'SERVER_API'}[gameId]
  if(body.method!==method)fail(400,'invalid_method','Метод проверки не соответствует игре')
  try {
    if(method==='SERVER_API') {
      if(typeof body.apiUrl!=='string'||body.apiUrl.length>500)throw new Error('invalid_url')
      const url=assertPublicUrl(body.apiUrl)
      if(url.pathname!=='/'||url.search||/(^|\.)(cfx\.re|fivem\.net|cfx-services\.net)$/i.test(url.hostname))throw new Error('invalid_url')
      return {enabled:true,method,host:null,port:null,apiUrl:url.toString()}
    }
    const host=assertPublicHost(body.host)
    const port=body.port===undefined||body.port===null||body.port===''?null:assertPort(Number(body.port))
    if(method==='LOGIN_SERVER'&&!port)throw new Error('port_required')
    return {enabled:true,method,host,port,apiUrl:null}
  } catch {fail(400,'invalid_target','Укажите публичный адрес сервера без секретов и приватных сетей')}
}
const passwordOf = v => { if (!passwordValid(v)) fail(400,'password_weak','Пароль — от 12 до 128 символов'); return v }
const cookieValue = (c,name) => (c.req.header('Cookie')??'').split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'='))?.slice(name.length+1) ?? ''
const audit = (tx,actor,action,target,details={}) => tx.query('INSERT INTO gs_audit(actor_id,action,target,details) VALUES($1,$2,$3,$4)',[actor,action,target,JSON.stringify(details)])
const voteRulesDto = row => ({windowHours:row.window_hours,maxPerWindow:row.max_per_window,
  ipDailyLimit:row.ip_daily_limit,deviceDailyLimit:row.device_daily_limit,asnDailyLimit:row.asn_daily_limit})

export function createApp({ db, config, oauthExchange=exchangeProfile, publicFetch=fetch, captchaVerify }) {
  if (!/^[a-f0-9]{64}$/.test(config.mailKey??'') || (config.rateKey??'').length<32) throw new Error('private_keys_required')
  if (!!config.turnstileSecret !== !!config.turnstileSiteKey) throw new Error('turnstile_key_pair_required')
  const origin = new URL(config.origin).origin
  const local = config.environment === 'development' && ['127.0.0.1','localhost'].includes(new URL(origin).hostname)
  if (!local && !origin.startsWith('https://')) throw new Error('https_required')
  const oauthEnv = { ...config.oauth, ALLOWED_ORIGIN:origin, ENVIRONMENT:local?'development':'production' }
  const paymentConfig=config.enableTestPayments===true?testPaymentConfig(config):null
  const app = new Hono()
  const cookie = (name,value,seconds) => `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${seconds}${local?'':'; Secure'}`
  const sessionHash = c => digest(cookieValue(c,'gs_private_session'))
  const queryUser = async c => (await db.query(`SELECT u.*,s.created_at AS authenticated_at FROM gs_sessions s
    JOIN gs_users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.banned_at IS NULL`,[sessionHash(c)])).rows[0]
  const requireUser = async (c,verified=false) => {
    const user = await queryUser(c)
    if (!user) fail(401,'unauthorized','Войдите в аккаунт')
    if (verified && !user.email_verified_at) fail(403,'email_unverified','Подтвердите email')
    return user
  }
  const permission = async (c,name) => {
    const user=await requireUser(c,true)
    if (!(await db.query(`SELECT 1 FROM gs_permissions WHERE user_id=$1 AND permission=$2
      UNION SELECT 1 FROM gs_user_roles ur JOIN gs_role_permissions rp ON rp.role=ur.role
      WHERE ur.user_id=$1 AND rp.permission=$2 LIMIT 1`,[user.id,name])).rows.length) fail(403,'forbidden','Недостаточно прав')
    return user
  }
  async function dto(user) {
    const identities=(await db.query('SELECT provider,created_at FROM gs_identities WHERE user_id=$1',[user.id])).rows
    const permissions=(await db.query(`SELECT permission FROM gs_permissions WHERE user_id=$1
      UNION SELECT rp.permission FROM gs_user_roles ur JOIN gs_role_permissions rp ON rp.role=ur.role WHERE ur.user_id=$1`,[user.id])).rows.map(x=>x.permission)
    const assigned=(await db.query('SELECT role FROM gs_user_roles WHERE user_id=$1 ORDER BY role',[user.id])).rows.map(x=>x.role)
    const owns=(await db.query('SELECT 1 FROM gs_server_registry WHERE owner_id=$1 LIMIT 1',[user.id])).rows.length>0
    return { id:user.id,email:user.email,displayName:user.display_name,provider:'EMAIL',emailVerified:!!user.email_verified_at,
      hasPassword:!!user.password_hash,roles:['PLAYER',...(owns?['OWNER']:[]),...assigned],permissions,createdAt:user.created_at,
      identities:identities.map(x=>({provider:x.provider,linkedAt:x.created_at})) }
  }
  async function startSession(c,tx,userId) {
    const raw=token()
    // Rotate the incoming session even when switching accounts.
    await tx.query('DELETE FROM gs_sessions WHERE token_hash=$1',[sessionHash(c)])
    await tx.query("INSERT INTO gs_sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '7 days')",[digest(raw),userId])
    return raw
  }
  async function json(c) {
    let body
    try { body=JSON.parse(await c.req.text()) } catch { fail(400,'invalid_json','Ожидается JSON') }
    if (!body || typeof body!=='object' || Array.isArray(body)) fail(400,'invalid_json','Ожидается объект')
    return body
  }
  async function limit(c,bucket,subject,max=10) {
    // Direct client IP is set by our HTTP server / trusted Yandex event adapter, never a public header.
    const ip=c.env?.clientIp??'unknown'
    for (const [value,bound] of [[`ip:${ip}`,max*4],[`subject:${subject}`,max]]) {
      const key=keyed(config.rateKey,`${bucket}:${value}`)
      const window=Math.floor(Date.now()/900000)
      const row=(await db.query(`INSERT INTO gs_rate_limits(key,bucket_window,count) VALUES($1,$2,1)
        ON CONFLICT(key,bucket_window) DO UPDATE SET count=gs_rate_limits.count+1 RETURNING count`,[key,window])).rows[0]
      if (row.count>bound) fail(429,'rate_limited','Слишком много запросов. Повторите через 15 минут.')
    }
  }
  async function issue(tx,email,purpose,payload) {
    const raw=token()
    await tx.query(`INSERT INTO gs_tokens(token_hash,email,purpose,payload,expires_at) VALUES($1,$2,$3,$4,now()+interval '20 minutes')
      ON CONFLICT(email,purpose) DO UPDATE SET token_hash=excluded.token_hash,payload=excluded.payload,expires_at=excluded.expires_at`,[digest(raw),email,purpose,JSON.stringify(payload)])
    const link=`${origin}/account#${new URLSearchParams({token:raw,purpose:purpose.toLowerCase()})}`
    await tx.query('INSERT INTO gs_mail_outbox(id,ciphertext) VALUES($1,$2)',[token(),seal(config.mailKey,{to:email,purpose,link})])
  }
  async function consume(tx,raw,purpose) {
    if (typeof raw!=='string' || raw.length>128) fail(400,'token_invalid','Ссылка недействительна или устарела')
    const row=(await tx.query('DELETE FROM gs_tokens WHERE token_hash=$1 AND purpose=$2 AND expires_at>now() RETURNING *',[digest(raw),purpose])).rows[0]
    if (!row) fail(400,'token_invalid','Ссылка недействительна или устарела')
    return row
  }
  app.use('*',async(c,next)=>{
    c.header('Cache-Control','no-store'); c.header('X-Content-Type-Options','nosniff'); c.header('Referrer-Policy','no-referrer')
    if (!['GET','HEAD','OPTIONS'].includes(c.req.method)) {
      const paymentCallback=c.req.method==='POST' && new URL(c.req.url).pathname==='/api/v1/payments/robokassa/result'
      if (!paymentCallback && c.req.header('Origin')!==origin) fail(403,'origin_forbidden','Источник запроса не разрешён')
      // Bound bytes, including chunked requests, before parsing or password hashing.
      const bytes=await c.req.raw.arrayBuffer()
      if (bytes.byteLength>16384) fail(413,'body_too_large','Запрос слишком большой')
      c.req.raw=new Request(c.req.url,{method:c.req.method,headers:c.req.raw.headers,body:bytes})
      const expected=paymentCallback?'application/x-www-form-urlencoded':'application/json'
      if (!(c.req.header('Content-Type')??'').startsWith(expected)) fail(415,'content_type',`Ожидается ${expected}`)
    }
    await next()
  })
  app.onError((error,c)=>{
    if (error instanceof Failure) return c.json({error:{code:error.code,message:error.message}},error.status)
    if (error.code==='23505') return c.json({error:{code:'conflict',message:'Запись уже существует. Обновите страницу.'}},409)
    // Never log request bodies, email, DB query parameters, tokens or provider responses.
    console.error('private_api_error',error.code??error.name)
    return c.json({error:{code:'internal_error',message:'Внутренняя ошибка'}},500)
  })
  app.get('/api/v1/health',async c=>{ await db.query('SELECT 1'); return c.json({status:'ok',storage:'private-postgresql'}) })
  app.get('/api/v1/auth/me',async c=>{
    const user=await queryUser(c)
    return c.json({user:user?await dto(user):null,providers:enabledProviders(oauthEnv),emailLogin:!!config.mailEnabled,privateCore:true,devAuthEnabled:false})
  })
  app.post('/api/v1/auth/register',async c=>{
    if (!config.mailEnabled) fail(503,'mail_disabled','Почта ещё не подключена')
    const body=await json(c), email=emailOf(body.email), password=passwordOf(body.password), name=textOf(body.displayName,2,40)
    await limit(c,'mail',email,5)
    const hash=await hashPassword(password)
    await db.transaction(async tx=>{
      // Serialize concurrent registration/resend/reset for the same email.
      await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))',[email])
      if (!(await tx.query('SELECT 1 FROM gs_users WHERE email=$1',[email])).rows.length) await issue(tx,email,'REGISTER',{hash,name})
    })
    return c.json({sent:true,message:'Если адрес доступен для регистрации, письмо отправлено.'},202)
  })
  app.post('/api/v1/auth/register/confirm',async c=>{
    const body=await json(c)
    const result=await db.transaction(async tx=>{
      const row=await consume(tx,body.token,'REGISTER'), userId=token()
      await tx.query('INSERT INTO gs_users(id,email,display_name,password_hash,email_verified_at) VALUES($1,$2,$3,$4,now())',[userId,row.email,row.payload.name,row.payload.hash])
      await audit(tx,userId,'account.verified',userId)
      return {raw:await startSession(c,tx,userId),userId}
    })
    c.header('Set-Cookie',cookie('gs_private_session',result.raw,604800))
    return c.json({user:await dto((await db.query('SELECT * FROM gs_users WHERE id=$1',[result.userId])).rows[0])})
  })
  // Same-cost failure path when the email is unknown.
  const dummyHash=hashPassword(token())
  app.post('/api/v1/auth/login',async c=>{
    const body=await json(c), email=emailOf(body.email), password=passwordOf(body.password)
    await limit(c,'login',email)
    const user=(await db.query('SELECT * FROM gs_users WHERE email=$1',[email])).rows[0]
    const valid=await verifyPassword(password,user?.password_hash??await dummyHash)
    if (!user || !valid || user.banned_at) fail(401,'invalid_credentials','Неверный email или пароль')
    const raw=await db.transaction(async tx=>{
      const current=(await tx.query('SELECT * FROM gs_users WHERE id=$1 FOR UPDATE',[user.id])).rows[0]
      if (current.banned_at || current.password_hash!==user.password_hash) fail(401,'invalid_credentials','Повторите вход')
      return startSession(c,tx,user.id)
    })
    c.header('Set-Cookie',cookie('gs_private_session',raw,604800)); return c.json({user:await dto(user)})
  })
  app.post('/api/v1/auth/password/reset/request',async c=>{
    if (!config.mailEnabled) fail(503,'mail_disabled','Почта ещё не подключена')
    const email=emailOf((await json(c)).email); await limit(c,'mail',email,5)
    await db.transaction(async tx=>{
      const user=(await tx.query('SELECT * FROM gs_users WHERE email=$1 AND email_verified_at IS NOT NULL AND banned_at IS NULL',[email])).rows[0]
      if (user) await issue(tx,email,'RESET',{userId:user.id})
    })
    return c.json({sent:true},202)
  })
  app.post('/api/v1/auth/password/reset',async c=>{
    const body=await json(c); await limit(c,'reset',digest(String(body.token??'')))
    const hash=await hashPassword(passwordOf(body.password))
    await db.transaction(async tx=>{
      const row=await consume(tx,body.token,'RESET')
      const user=(await tx.query('SELECT * FROM gs_users WHERE id=$1 FOR UPDATE',[row.payload.userId])).rows[0]
      if (!user || user.banned_at || user.email!==row.email) fail(400,'token_invalid','Ссылка недействительна')
      await tx.query('UPDATE gs_users SET password_hash=$1 WHERE id=$2',[hash,user.id])
      await tx.query('DELETE FROM gs_sessions WHERE user_id=$1',[user.id])
      await audit(tx,user.id,'password.reset',user.id)
    })
    c.header('Set-Cookie',cookie('gs_private_session','',0)); return c.json({ok:true})
  })
  app.post('/api/v1/auth/logout',async c=>{
    await db.query('DELETE FROM gs_sessions WHERE token_hash=$1',[sessionHash(c)])
    c.header('Set-Cookie',cookie('gs_private_session','',0)); return c.json({ok:true})
  })
  app.post('/api/v1/me/email',async c=>{
    if (!config.mailEnabled) fail(503,'mail_disabled','Почта ещё не подключена')
    const user=await requireUser(c), email=emailOf((await json(c)).email)
    if (user.email) fail(409,'email_exists','Email уже привязан; изменение требует отдельной проверки')
    await limit(c,'mail',email,5)
    await db.transaction(tx=>issue(tx,email,'EMAIL',{userId:user.id}))
    return c.json({sent:true},202)
  })
  app.post('/api/v1/me/email/confirm',async c=>{
    const user=await requireUser(c), body=await json(c)
    await db.transaction(async tx=>{
      const row=await consume(tx,body.token,'EMAIL')
      if (row.payload.userId!==user.id) fail(403,'forbidden','Ссылка выдана другому аккаунту')
      await tx.query('UPDATE gs_users SET email=$1,email_verified_at=now() WHERE id=$2 AND email IS NULL',[row.email,user.id])
      await audit(tx,user.id,'email.verified',user.id)
    })
    return c.json({ok:true})
  })
  app.get('/api/v1/auth/:provider',async c=>{
    const provider=c.req.param('provider')
    if (!isProvider(provider) || !enabledProviders(oauthEnv).includes(provider)) fail(404,'provider_disabled','Провайдер не подключён')
    await limit(c,'oauth',provider,30)
    const link=c.req.query('link')==='1'
    if (link) {
      const user=await requireUser(c)
      if (Date.now()-new Date(user.authenticated_at).getTime()>600000) fail(401,'reauth_required','Войдите повторно перед привязкой')
    }
    const state=token(), browser=token(), verifier=token()
    await db.query(`INSERT INTO gs_oauth_states(state_hash,browser_hash,provider,verifier,next_path,link_session_hash,expires_at)
      VALUES($1,$2,$3,$4,$5,$6,now()+interval '10 minutes')`,[digest(state),digest(browser),provider,verifier,safeNext(c.req.query('next')),link?sessionHash(c):null])
    c.header('Set-Cookie',cookie('gs_private_oauth',browser,600))
    return c.redirect(await authorizeUrl(oauthEnv,provider,state,verifier))
  })
  app.get('/api/v1/auth/:provider/callback',async c=>{
    const provider=c.req.param('provider'), state=c.req.query('state')??'', code=c.req.query('code')??''
    if (!isProvider(provider) || !enabledProviders(oauthEnv).includes(provider)) fail(404,'provider_disabled','Провайдер не подключён')
    if (!code || code.length>1024 || state.length>128) fail(400,'oauth_invalid','Вход не подтверждён')
    const row=(await db.query(`DELETE FROM gs_oauth_states WHERE state_hash=$1 AND browser_hash=$2 AND provider=$3 AND expires_at>now() RETURNING *`,
      [digest(state),digest(cookieValue(c,'gs_private_oauth')),provider])).rows[0]
    c.header('Set-Cookie',cookie('gs_private_oauth','',0))
    if (!row) fail(400,'oauth_invalid','Вход не подтверждён или ссылка уже использована')
    let profile
    try { profile=await oauthExchange(oauthEnv,provider,code,new URL(c.req.url).searchParams,row.verifier) }
    catch { fail(502,'oauth_failed','Провайдер не подтвердил вход') }
    const result=await db.transaction(async tx=>{
      await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`${provider}:${profile.id}`])
      const identity=(await tx.query('SELECT * FROM gs_identities WHERE provider=$1 AND subject=$2',[provider,profile.id])).rows[0]
      let userId=identity?.user_id
      if (row.link_session_hash) {
        if (!equal(row.link_session_hash,sessionHash(c))) fail(403,'session_changed','Аккаунт изменился, повторите привязку')
        const me=(await tx.query(`SELECT u.id FROM gs_sessions s JOIN gs_users u ON u.id=s.user_id
          WHERE s.token_hash=$1 AND s.expires_at>now() AND u.banned_at IS NULL FOR UPDATE OF u`,[sessionHash(c)])).rows[0]
        if (!me) fail(401,'unauthorized','Войдите повторно')
        if (identity && userId!==me.id) fail(409,'linked_elsewhere','Провайдер уже привязан к другому аккаунту')
        userId=me.id
      }
      if (!userId) {
        userId=token()
        // No provider email enters the account email column. Separate mailbox proof is required.
        await tx.query('INSERT INTO gs_users(id,display_name) VALUES($1,$2)',[userId,textOf(profile.displayName,1,40)])
      }
      const user=(await tx.query('SELECT * FROM gs_users WHERE id=$1 FOR UPDATE',[userId])).rows[0]
      if (user.banned_at) fail(403,'banned','Аккаунт заблокирован')
      if (!identity) await tx.query('INSERT INTO gs_identities(provider,subject,user_id) VALUES($1,$2,$3)',[provider,profile.id,userId])
      await audit(tx,userId,row.link_session_hash?'identity.linked':'identity.login',provider)
      return row.link_session_hash?null:await startSession(c,tx,userId)
    })
    if (result) c.header('Set-Cookie',cookie('gs_private_session',result,604800),{append:true})
    return c.redirect(row.next_path)
  })

  app.post('/api/v1/claims',async c=>{
    const user=await requireUser(c,true), body=await json(c), serverId=textOf(body.serverId,1,100), evidence=textOf(body.evidence,20,3000)
    await limit(c,'claims',user.id,10)
    const claim=await db.transaction(async tx=>{
      const server=(await tx.query('SELECT * FROM gs_server_registry WHERE server_id=$1 FOR UPDATE',[serverId])).rows[0]
      if (!server) fail(404,'not_found','Сервер ещё не импортирован в приватный реестр')
      if (server.owner_id && server.owner_id!==user.id) fail(409,'already_claimed','Владелец уже подтверждён')
      const existing=(await tx.query("SELECT * FROM gs_claims WHERE server_id=$1 AND user_id=$2 AND status='PENDING'",[serverId,user.id])).rows[0]
      if (existing) return existing
      const created=(await tx.query('INSERT INTO gs_claims(id,server_id,user_id,evidence) VALUES($1,$2,$3,$4) RETURNING *',[token(),serverId,user.id,evidence])).rows[0]
      await audit(tx,user.id,'claim.created',created.id)
      return created
    })
    return c.json(claim,201)
  })
  app.get('/api/v1/owners/me/claims',async c=>{
    const user=await requireUser(c)
    return c.json((await db.query('SELECT id,server_id,status,evidence,reason,created_at FROM gs_claims WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100',[user.id])).rows)
  })
  app.get('/api/v1/owners/me/servers',async c=>{
    const user=await requireUser(c)
    return c.json((await db.query('SELECT server_id,game_id,name,slug FROM gs_server_registry WHERE owner_id=$1',[user.id])).rows)
  })
  app.get('/api/v1/servers/:id/manage-access',async c=>{
    const user=await requireUser(c,true)
    const allowed=(await db.query('SELECT 1 FROM gs_server_registry WHERE server_id=$1 AND owner_id=$2',[c.req.param('id'),user.id])).rows.length>0
    if (!allowed) fail(403,'forbidden','Нет подтверждённых прав на сервер')
    return c.json({canManage:true})
  })
  app.get('/api/v1/owners/me/servers/:id/summary-edits',async c=>{
    const user=await requireUser(c,true),serverId=c.req.param('id')
    if(!(await db.query('SELECT 1 FROM gs_server_registry WHERE server_id=$1 AND owner_id=$2',[serverId,user.id])).rows.length)
      fail(403,'forbidden','Нет подтверждённых прав на сервер')
    return c.json((await db.query(`SELECT id,summary,status,reason,created_at,resolved_at
      FROM gs_owner_summary_edits WHERE server_id=$1 AND user_id=$2 ORDER BY created_at DESC LIMIT 20`,[serverId,user.id])).rows)
  })
  app.post('/api/v1/owners/me/servers/:id/summary-edits',async c=>{
    const user=await requireUser(c,true),body=await json(c),serverId=c.req.param('id')
    const summary=textOf(body.summary,20,280)
    if(/<|>|\b(?:https?:\/\/|www\.)|\[[^\]]+\]\(/i.test(summary))
      fail(400,'invalid_summary','Описание должно содержать только нейтральный текст без ссылок и разметки')
    await limit(c,'owner_summary',user.id,10)
    const edit=await db.transaction(async tx=>{
      const server=(await tx.query('SELECT * FROM gs_server_registry WHERE server_id=$1 FOR UPDATE',[serverId])).rows[0]
      if(!server||server.owner_id!==user.id) fail(403,'forbidden','Нет подтверждённых прав на сервер')
      if((await tx.query("SELECT 1 FROM gs_owner_summary_edits WHERE server_id=$1 AND status='PENDING'",[serverId])).rows.length)
        fail(409,'pending_edit','Изменение уже ждёт проверки')
      const row=(await tx.query('INSERT INTO gs_owner_summary_edits(id,server_id,user_id,summary) VALUES($1,$2,$3,$4) RETURNING *',
        [token(),serverId,user.id,summary])).rows[0]
      await audit(tx,user.id,'server.summary_submitted',row.id,{serverId})
      return row
    })
    return c.json({id:edit.id,status:edit.status},201)
  })
  app.get('/api/v1/owners/me/servers/:id/monitoring',async c=>{
    const user=await requireUser(c,true),serverId=c.req.param('id')
    if(!(await db.query('SELECT 1 FROM gs_server_registry WHERE server_id=$1 AND owner_id=$2',[serverId,user.id])).rows.length)
      fail(403,'forbidden','Нет подтверждённых прав на сервер')
    const row=(await db.query(`SELECT m.enabled,m.method,m.host,m.port,m.api_url,m.updated_at,
      COALESCE(h.active,false) AS held FROM gs_owner_monitoring_overrides m
      LEFT JOIN gs_monitoring_holds h ON h.server_id=m.server_id WHERE m.server_id=$1`,[serverId])).rows[0]
    return c.json(row??{configured:false,held:false})
  })
  app.post('/api/v1/owners/me/servers/:id/monitoring',async c=>{
    const user=await requireUser(c,true),body=await json(c),serverId=c.req.param('id')
    const reason=textOf(body.reason,10,500)
    await limit(c,'owner_monitoring',user.id,12)
    const result=await db.transaction(async tx=>{
      const server=(await tx.query('SELECT * FROM gs_server_registry WHERE server_id=$1 FOR UPDATE',[serverId])).rows[0]
      if(!server||server.owner_id!==user.id)fail(403,'forbidden','Нет подтверждённых прав на сервер')
      const target=ownerMonitoring(body,server.game_id)
      if(target.enabled&&(await tx.query('SELECT 1 FROM gs_monitoring_holds WHERE server_id=$1 AND active=true',[serverId])).rows.length)
        fail(409,'monitoring_held','Администратор временно приостановил проверку. Обратитесь за пересмотром.')
      const previous=(await tx.query('SELECT * FROM gs_owner_monitoring_overrides WHERE server_id=$1',[serverId])).rows[0]
      if(previous&&previous.enabled===target.enabled&&previous.method===target.method
        &&previous.host===target.host&&previous.port===target.port&&previous.api_url===target.apiUrl)
        return {changed:false,version:Number(server.version)}
      await tx.query(`INSERT INTO gs_owner_monitoring_overrides(server_id,enabled,method,host,port,api_url,updated_by)
        VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(server_id) DO UPDATE SET
        enabled=excluded.enabled,method=excluded.method,host=excluded.host,port=excluded.port,
        api_url=excluded.api_url,updated_by=excluded.updated_by,updated_at=now()`,
        [serverId,target.enabled,target.method,target.host,target.port,target.apiUrl,user.id])
      const changed=(await tx.query('UPDATE gs_server_registry SET version=version+1 WHERE server_id=$1 RETURNING version',
        [serverId])).rows[0]
      const snapshot=await createPublicSnapshot(tx,serverId,changed.version)
      await tx.query('INSERT INTO gs_public_outbox(server_id,version,payload) VALUES($1,$2,$3)',
        [serverId,changed.version,JSON.stringify(snapshot)])
      await audit(tx,user.id,'server.monitoring_updated',serverId,{enabled:target.enabled,method:target.method,reason})
      return {changed:true,version:Number(changed.version)}
    })
    return c.json(result)
  })
  app.get('/api/v1/owners/me/servers/:id/fact-edits',async c=>{
    const user=await requireUser(c,true),serverId=c.req.param('id')
    if(!(await db.query('SELECT 1 FROM gs_server_registry WHERE server_id=$1 AND owner_id=$2',[serverId,user.id])).rows.length)
      fail(403,'forbidden','Нет подтверждённых прав на сервер')
    return c.json((await db.query(`SELECT id,field,value,evidence,status,reason,created_at,resolved_at
      FROM gs_owner_fact_edits WHERE server_id=$1 AND user_id=$2 ORDER BY created_at DESC LIMIT 30`,[serverId,user.id])).rows)
  })
  app.post('/api/v1/owners/me/servers/:id/fact-edits',async c=>{
    const user=await requireUser(c,true),body=await json(c),serverId=c.req.param('id')
    const field=body.field,value=ownerFact(field,body.value),evidence=textOf(body.evidence,20,1000)
    await limit(c,'owner_fact',user.id,12)
    const edit=await db.transaction(async tx=>{
      const server=(await tx.query('SELECT * FROM gs_server_registry WHERE server_id=$1 FOR UPDATE',[serverId])).rows[0]
      if(!server||server.owner_id!==user.id)fail(403,'forbidden','Нет подтверждённых прав на сервер')
      if((await tx.query("SELECT 1 FROM gs_owner_fact_edits WHERE server_id=$1 AND field=$2 AND status='PENDING'",[serverId,field])).rows.length)
        fail(409,'pending_edit','Правка этого поля уже ждёт проверки')
      const row=(await tx.query(`INSERT INTO gs_owner_fact_edits(id,server_id,user_id,field,value,evidence)
        VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,[token(),serverId,user.id,field,value,evidence])).rows[0]
      await audit(tx,user.id,'server.fact_submitted',row.id,{serverId,field})
      return row
    })
    return c.json({id:edit.id,status:edit.status},201)
  })
  // The People's rating uses only accepted gs_votes. Paid support never enters this query.
  app.get('/api/v1/people-rating',async c=>{
    const rules=(await db.query('SELECT * FROM gs_vote_rules WHERE id=1')).rows[0]
    const limit=Number(c.req.query('limit')??100),offset=Number(c.req.query('offset')??0)
    if(!Number.isSafeInteger(limit)||limit<1||limit>100||!Number.isSafeInteger(offset)||offset<0||offset>1000000)
      fail(400,'invalid_page','Некорректная страница рейтинга')
    return c.json((await db.query(`SELECT r.server_id,r.slug,r.name,r.game_id,count(v.id)::integer AS votes
      FROM gs_server_registry r LEFT JOIN gs_votes v ON v.server_id=r.server_id
        AND v.review_status='ACCEPTED' AND v.created_at>now()-($1*interval '1 hour')
      GROUP BY r.server_id ORDER BY votes DESC,r.server_id LIMIT $2 OFFSET $3`,[rules.window_hours,limit,offset])).rows)
  })
  app.get('/api/v1/people-rating/eligibility',async c=>{
    const user=await requireUser(c,true), serverId=c.req.query('serverId')??''
    const rules=(await db.query('SELECT * FROM gs_vote_rules WHERE id=1')).rows[0]
    const recent=(await db.query(`SELECT count(*)::integer AS n,max(created_at) AS last FROM gs_votes
      WHERE user_id=$1 AND server_id=$2 AND created_at>now()-($3*interval '1 hour')`,[user.id,serverId,rules.window_hours])).rows[0]
    return c.json({eligible:recent.n<rules.max_per_window,used:recent.n,limit:rules.max_per_window,windowHours:rules.window_hours,
      captchaSiteKey:config.turnstileSecret?config.turnstileSiteKey??null:null})
  })
  app.post('/api/v1/people-rating/votes',async c=>{
    const user=await requireUser(c,true), body=await json(c)
    const serverId=textOf(body.serverId,1,100), idem=textOf(c.req.header('Idempotency-Key'),16,128)
    const device=typeof body.deviceSignal==='string' && /^[a-zA-Z0-9_-]{16,128}$/.test(body.deviceSignal)?body.deviceSignal:null
    const ip=c.env?.clientIp??'unknown', ipHash=keyed(config.rateKey,'ip:'+ip), deviceHash=device?keyed(config.rateKey,'device:'+device):null
    const asn=typeof c.env?.clientAsn==='string' && /^\d{1,10}$/.test(c.env.clientAsn)?c.env.clientAsn:null
    const pageAgeMs=Number.isSafeInteger(body.pageAgeMs) && body.pageAgeMs>=0 && body.pageAgeMs<=86400000?body.pageAgeMs:null
    await limit(c,'vote',user.id,20)
    const existing=(await db.query('SELECT id,server_id,review_status FROM gs_votes WHERE user_id=$1 AND idempotency_key=$2',[user.id,idem])).rows[0]
    if(existing) { if(existing.server_id!==serverId) fail(409,'idempotency_conflict','Ключ уже использован для другого сервера');return c.json({id:existing.id,accepted:existing.review_status==='ACCEPTED',replay:true}) }
    const rules=(await db.query('SELECT * FROM gs_vote_rules WHERE id=1')).rows[0]
    const totals=(await db.query(`SELECT
      count(*) FILTER(WHERE ip_hash=$1 AND created_at>now()-interval '1 day')::integer AS ip_count,
      count(*) FILTER(WHERE device_hash=$2 AND created_at>now()-interval '1 day')::integer AS device_count,
      count(*) FILTER(WHERE asn=$3 AND created_at>now()-interval '1 day')::integer AS asn_count
      FROM gs_votes WHERE created_at>now()-interval '1 day'`,[ipHash,deviceHash,asn])).rows[0]
    // Browser signals are weak evidence: they raise scrutiny, never establish a unique person.
    const suspicious=!deviceHash || pageAgeMs===null || pageAgeMs<2000 || totals.ip_count>=rules.ip_daily_limit
      || totals.device_count>=rules.device_daily_limit || (asn && totals.asn_count>=rules.asn_daily_limit)
    if(suspicious) {
      if(!config.turnstileSecret || typeof body.captcha!=='string' || body.captcha.length>2048) fail(403,'captcha_required','Требуется дополнительная проверка')
      let valid=false
      try {
        const result=captchaVerify?await captchaVerify(body.captcha,ip):await (await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{
          method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({secret:config.turnstileSecret,response:body.captcha,remoteip:ip}),signal:AbortSignal.timeout(5000)})).json()
        valid=result.success===true && result.hostname===new URL(origin).hostname && result.action==='vote'
      } catch {}
      if(!valid) fail(403,'captcha_invalid','Дополнительная проверка не пройдена')
    }
    const result=await db.transaction(async tx=>{
      // Serialize a user's votes to this card even if two requests hit different replicas.
      await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`${user.id}:${serverId}`])
      const replay=(await tx.query('SELECT id,server_id,review_status FROM gs_votes WHERE user_id=$1 AND idempotency_key=$2',[user.id,idem])).rows[0]
      if(replay) { if(replay.server_id!==serverId) fail(409,'idempotency_conflict','Ключ уже использован'); return {id:replay.id,replay:true,accepted:replay.review_status==='ACCEPTED'} }
      const server=(await tx.query('SELECT 1 FROM gs_server_registry WHERE server_id=$1',[serverId])).rows[0]
      if(!server) fail(404,'not_found','Сервер не найден')
      const count=(await tx.query(`SELECT count(*)::integer AS n FROM gs_votes WHERE user_id=$1 AND server_id=$2
        AND created_at>now()-($3*interval '1 hour')`,[user.id,serverId,rules.window_hours])).rows[0].n
      if(count>=rules.max_per_window) fail(409,'vote_window','Вы уже голосовали в этом окне')
      const id=token()
      await tx.query('INSERT INTO gs_votes(id,server_id,user_id,idempotency_key,device_hash,ip_hash,asn) VALUES($1,$2,$3,$4,$5,$6,$7)',[id,serverId,user.id,idem,deviceHash,ipHash,asn])
      await audit(tx,user.id,'vote.accepted',id,{serverId})
      return {id,replay:false,accepted:true}
    })
    return c.json({id:result.id,accepted:result.accepted,replay:result.replay},result.replay?200:201)
  })
  app.get('/api/v1/coins/me',async c=>{
    const user=await requireUser(c)
    const balance=(await db.query('SELECT balance FROM gs_coin_accounts WHERE user_id=$1',[user.id])).rows[0]?.balance??0
    const ledger=(await db.query(`SELECT id,kind,delta,related_id,created_at FROM gs_coin_ledger
      WHERE user_id=$1 ORDER BY created_at DESC,id DESC LIMIT 100`,[user.id])).rows
    return c.json({balance,nominalRub:50,ledger})
  })
  app.get('/api/v1/payments/test/config',c=>c.json({available:!!paymentConfig,testOnly:true,realSalesEnabled:false}))
  app.get('/api/v1/payments/me',async c=>{
    const user=await requireUser(c)
    const rows=(await db.query(`SELECT id,coins,amount_kopecks,status,created_at,paid_at FROM gs_test_payments
      WHERE user_id=$1 ORDER BY id DESC LIMIT 100`,[user.id])).rows
    return c.json(rows)
  })
  app.post('/api/v1/payments/test/orders',async c=>{
    if(!paymentConfig) fail(503,'test_payments_disabled','Тестовая Robokassa не настроена')
    const user=await requireUser(c,true),body=await json(c),coins=body.coins
    const idem=textOf(c.req.header('Idempotency-Key'),16,128)
    if(!Number.isSafeInteger(coins)||coins<1||coins>10000) fail(400,'invalid_coins','Укажите от 1 до 10000 Coins')
    await limit(c,'payment_order',user.id,10)
    const order=await db.transaction(async tx=>{
      await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))',[user.id])
      const prior=(await tx.query('SELECT * FROM gs_test_payments WHERE user_id=$1 AND idempotency_key=$2',[user.id,idem])).rows[0]
      if(prior) {
        if(prior.coins!==coins) fail(409,'idempotency_conflict','Ключ уже использован для другого заказа')
        return prior
      }
      const amount=coins*5000,receipt=paymentReceipt(paymentConfig,amount),nonce=digest(token())
      const inserted=(await tx.query(`INSERT INTO gs_test_payments(user_id,coins,amount_kopecks,nonce,receipt,idempotency_key)
        VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,[user.id,coins,amount,nonce,JSON.stringify(receipt),idem])).rows[0]
      await audit(tx,user.id,'payment.test_created',String(inserted.id),{coins,amountKopecks:amount})
      return inserted
    })
    return c.json({id:String(order.id),coins:order.coins,amountRub:order.amount_kopecks/100,status:order.status,
      testOnly:true,checkout:order.status==='TEST_PENDING'?testCheckoutForm(paymentConfig,order,user.email):null})
  })
  // Robokassa ResultURL: a provider-to-server form callback, never a browser success redirect.
  app.post('/api/v1/payments/robokassa/result',async c=>{
    if(!paymentConfig) fail(503,'test_payments_disabled','Тестовая Robokassa не настроена')
    let result
    try { result=parseTestResult(paymentConfig,await c.req.text()) }
    catch { fail(400,'invalid_payment_notice','Некорректное уведомление об оплате') }
    await db.transaction(async tx=>{
      const order=(await tx.query('SELECT * FROM gs_test_payments WHERE id=$1 FOR UPDATE',[result.id])).rows[0]
      if(!order || order.nonce!==result.nonce || order.amount_kopecks!==result.kopecks)
        fail(400,'payment_mismatch','Уведомление не совпадает с заказом')
      if(order.status==='TEST_PAID') {
        if(!(await tx.query('SELECT 1 FROM gs_coin_ledger WHERE id=$1 AND kind=$2 AND delta=$3',
          [order.ledger_id,'PURCHASE',order.coins])).rows.length) fail(409,'payment_reconciliation','Платёж требует сверки')
        return
      }
      const ledgerId=token()
      await tx.query('INSERT INTO gs_coin_accounts(user_id,balance) VALUES($1,0) ON CONFLICT DO NOTHING',[order.user_id])
      await tx.query('UPDATE gs_coin_accounts SET balance=balance+$1 WHERE user_id=$2',[order.coins,order.user_id])
      await tx.query(`INSERT INTO gs_coin_ledger(id,user_id,kind,delta,related_id,idempotency_key,details)
        VALUES($1,$2,'PURCHASE',$3,$4,$5,$6)`,[ledgerId,order.user_id,order.coins,String(order.id),`robokassa-test:${order.id}`,
        JSON.stringify({provider:'robokassa',test:true,amountKopecks:order.amount_kopecks})])
      await tx.query(`UPDATE gs_test_payments SET status='TEST_PAID',paid_at=now(),ledger_id=$1 WHERE id=$2`,[ledgerId,order.id])
      await audit(tx,order.user_id,'payment.test_paid',String(order.id),{coins:order.coins,amountKopecks:order.amount_kopecks})
    })
    return c.text(`OK${result.id}`)
  })
  // A local-only fixture lets the player→Support path run without claiming a real payment.
  if(local) app.post('/api/v1/__dev/coins',async c=>{
    const user=await requireUser(c,true),body=await json(c)
    const coins=body.coins,idem=textOf(c.req.header('Idempotency-Key'),16,128)
    if(!Number.isSafeInteger(coins)||coins<1||coins>1000) fail(400,'invalid_coins','Тестовое начисление: 1–1000 Coins')
    const result=await db.transaction(async tx=>{
      await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))',[user.id])
      const prior=(await tx.query('SELECT * FROM gs_coin_ledger WHERE user_id=$1 AND idempotency_key=$2',[user.id,idem])).rows[0]
      if(prior) {
        if(prior.kind!=='ADJUSTMENT'||prior.delta!==coins||prior.details?.source!=='local-fixture') fail(409,'idempotency_conflict','Ключ уже использован')
        return {id:prior.id,replay:true}
      }
      await tx.query('INSERT INTO gs_coin_accounts(user_id,balance) VALUES($1,0) ON CONFLICT DO NOTHING',[user.id])
      await tx.query('UPDATE gs_coin_accounts SET balance=balance+$1 WHERE user_id=$2',[coins,user.id])
      const id=token()
      await tx.query(`INSERT INTO gs_coin_ledger(id,user_id,kind,delta,idempotency_key,details)
        VALUES($1,$2,'ADJUSTMENT',$3,$4,$5)`,[id,user.id,coins,idem,JSON.stringify({source:'local-fixture'})])
      await audit(tx,user.id,'coins.local_fixture',id,{coins})
      return {id,replay:false}
    })
    return c.json(result,result.replay?200:201)
  })
  app.get('/api/v1/support/ranking',async c=>{
    const pageLimit=Number(c.req.query('limit')??100),offset=Number(c.req.query('offset')??0)
    if(!Number.isSafeInteger(pageLimit)||pageLimit<1||pageLimit>100||!Number.isSafeInteger(offset)||offset<0||offset>1000000)
      fail(400,'invalid_page','Некорректная страница Поддержки')
    const rows=(await db.query(`SELECT r.server_id,r.slug,r.name,r.game_id,
      COALESCE(sum(s.coins),0)::integer AS coins,count(DISTINCT s.user_id)::integer AS participants
      FROM gs_server_registry r LEFT JOIN gs_support s ON s.server_id=r.server_id
      GROUP BY r.server_id ORDER BY coins DESC,participants DESC,r.server_id LIMIT $1 OFFSET $2`,[pageLimit,offset])).rows
    return c.json(rows)
  })
  app.get('/api/v1/support/servers/:id',async c=>{
    const serverId=c.req.param('id')
    if(!(await db.query('SELECT 1 FROM gs_server_registry WHERE server_id=$1',[serverId])).rows.length)
      fail(404,'not_found','Сервер не найден')
    const summary=(await db.query(`SELECT COALESCE(sum(coins),0)::integer AS coins,
      count(DISTINCT user_id)::integer AS participants FROM gs_support WHERE server_id=$1`,[serverId])).rows[0]
    const recent=(await db.query(`SELECT public_nick,anonymous,coins,created_at FROM gs_support
      WHERE server_id=$1 ORDER BY created_at DESC,id DESC LIMIT 10`,[serverId])).rows
    return c.json({...summary,recent})
  })
  app.post('/api/v1/support',async c=>{
    const user=await requireUser(c,true),body=await json(c)
    const serverId=textOf(body.serverId,1,100),coins=body.coins,anonymous=body.anonymous===true
    const idem=textOf(c.req.header('Idempotency-Key'),16,128)
    if(!Number.isSafeInteger(coins)||coins<1||coins>10000) fail(400,'invalid_coins','Укажите от 1 до 10000 Coins')
    await limit(c,'support',user.id,20)
    const result=await db.transaction(async tx=>{
      await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))',[user.id])
      const prior=(await tx.query('SELECT * FROM gs_support WHERE user_id=$1 AND idempotency_key=$2',[user.id,idem])).rows[0]
      if(prior) {
        if(prior.server_id!==serverId||prior.coins!==coins||prior.anonymous!==anonymous)
          fail(409,'idempotency_conflict','Ключ уже использован для другой поддержки')
        return {id:prior.id,replay:true}
      }
      if(!(await tx.query('SELECT 1 FROM gs_server_registry WHERE server_id=$1',[serverId])).rows.length)
        fail(404,'not_found','Сервер не найден')
      const updated=(await tx.query(`UPDATE gs_coin_accounts SET balance=balance-$1
        WHERE user_id=$2 AND balance>=$1 RETURNING balance`,[coins,user.id])).rows[0]
      if(!updated) fail(409,'insufficient_coins','Недостаточно Coins')
      const id=token(),ledgerId=token(),nick=classifyLocalNickname(user.display_name)
      const decision=anonymous?{decision:'ANONYMOUS',publicNick:'Анонимно'}:nick
      await tx.query(`INSERT INTO gs_coin_ledger(id,user_id,kind,delta,related_id,idempotency_key,details)
        VALUES($1,$2,'SUPPORT',$3,$4,$5,$6)`,[ledgerId,user.id,-coins,id,idem,JSON.stringify({serverId})])
      await tx.query(`INSERT INTO gs_support(id,server_id,user_id,ledger_id,coins,anonymous,public_nick,nickname_decision,idempotency_key)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[id,serverId,user.id,ledgerId,coins,anonymous,decision.publicNick,decision.decision,idem])
      if(decision.decision==='REVIEW') await tx.query('INSERT INTO gs_nickname_reviews(support_id,nickname) VALUES($1,$2)',[id,user.display_name])
      const changed=(await tx.query('UPDATE gs_server_registry SET version=version+1 WHERE server_id=$1 RETURNING version',[serverId])).rows[0]
      const snapshot=await createPublicSnapshot(tx,serverId,changed.version)
      await tx.query('INSERT INTO gs_public_outbox(server_id,version,payload) VALUES($1,$2,$3)',
        [serverId,changed.version,JSON.stringify(snapshot)])
      await audit(tx,user.id,'support.created',id,{serverId,coins,anonymous,decision:decision.decision})
      return {id,replay:false,balance:updated.balance}
    })
    return c.json(result,result.replay?200:201)
  })
  app.get('/api/v1/admin/payments/reconciliation',async c=>{
    await permission(c,'payments.read')
    const orderMismatch=(await db.query(`SELECT p.id,p.status,p.coins,p.amount_kopecks,p.created_at
      FROM gs_test_payments p LEFT JOIN gs_coin_ledger l ON l.id=p.ledger_id
      WHERE (p.status='TEST_PAID' AND (l.id IS NULL OR l.kind IS DISTINCT FROM 'PURCHASE'
        OR l.delta IS DISTINCT FROM p.coins OR l.related_id IS DISTINCT FROM p.id::text))
         OR (p.status='TEST_PENDING' AND p.created_at<now()-interval '1 hour')
      ORDER BY p.id DESC LIMIT 100`)).rows
    const balanceMismatch=(await db.query(`SELECT a.user_id,a.balance,COALESCE(sum(l.delta),0)::integer AS ledger_balance
      FROM gs_coin_accounts a LEFT JOIN gs_coin_ledger l ON l.user_id=a.user_id
      GROUP BY a.user_id HAVING a.balance<>COALESCE(sum(l.delta),0) LIMIT 100`)).rows
    return c.json({orderMismatch,balanceMismatch})
  })
  app.get('/api/v1/admin/overview',async c=>{
    await permission(c,'system.read')
    const row=(await db.query(`SELECT
      (SELECT count(*)::integer FROM gs_users) AS users,
      (SELECT count(*)::integer FROM gs_server_registry) AS servers,
      (SELECT count(*)::integer FROM gs_claims WHERE status='PENDING') AS pending_claims,
      (SELECT count(*)::integer FROM gs_votes) AS votes,
      (SELECT count(*)::integer FROM gs_support) AS support_events,
      (SELECT count(*)::integer FROM gs_test_payments WHERE status='TEST_PENDING') AS pending_test_payments`)).rows[0]
    return c.json(row)
  })
  app.get('/api/v1/admin/users',async c=>{
    await permission(c,'users.read')
    return c.json((await db.query(`SELECT u.id,u.email,u.display_name,u.email_verified_at,u.banned_at,u.created_at,
      COALESCE(array_agg(ur.role ORDER BY ur.role) FILTER (WHERE ur.role IS NOT NULL),'{}') AS roles
      FROM gs_users u LEFT JOIN gs_user_roles ur ON ur.user_id=u.id
      GROUP BY u.id ORDER BY u.created_at DESC LIMIT 100`)).rows)
  })
  app.post('/api/v1/admin/users/:id/moderation',async c=>{
    const admin=await permission(c,'users.manage'),body=await json(c)
    const action=body.action,reason=textOf(body.reason,10,1000),userId=c.req.param('id')
    if(!['BAN','UNBAN'].includes(action))fail(400,'invalid_action','Укажите действие')
    if(userId===admin.id)fail(403,'self_moderation','Нельзя блокировать собственный аккаунт')
    const result=await db.transaction(async tx=>{
      const target=(await tx.query('SELECT id,banned_at FROM gs_users WHERE id=$1 FOR UPDATE',[userId])).rows[0]
      if(!target)fail(404,'not_found','Пользователь не найден')
      if((await tx.query("SELECT 1 FROM gs_user_roles WHERE user_id=$1 AND role='ADMIN'",[userId])).rows.length)
        fail(403,'admin_protected','Блокировка ADMIN через этот API запрещена')
      const banned=!!target.banned_at
      if((action==='BAN')===banned)return {ok:true,replay:true,banned}
      await tx.query('UPDATE gs_users SET banned_at=$1 WHERE id=$2',[action==='BAN'?new Date():null,userId])
      if(action==='BAN')await tx.query('DELETE FROM gs_sessions WHERE user_id=$1',[userId])
      await audit(tx,admin.id,`user.${action.toLowerCase()}`,userId,{reason})
      return {ok:true,replay:false,banned:action==='BAN'}
    })
    return c.json(result)
  })
  app.post('/api/v1/admin/users/:id/roles',async c=>{
    const admin=await permission(c,'roles.manage'),body=await json(c)
    if(!['MODERATOR','FINANCE','COPYRIGHT','SUPPORT'].includes(body.role)||!['GRANT','REVOKE'].includes(body.action))
      fail(400,'invalid_role_change','Недопустимое изменение роли')
    if(admin.id===c.req.param('id')) fail(403,'self_role_change','Нельзя менять собственные роли')
    await db.transaction(async tx=>{
      if(!(await tx.query('SELECT 1 FROM gs_users WHERE id=$1',[c.req.param('id')])).rows.length) fail(404,'not_found','Пользователь не найден')
      if(body.action==='GRANT') await tx.query('INSERT INTO gs_user_roles(user_id,role,granted_by) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',
        [c.req.param('id'),body.role,admin.id])
      else await tx.query('DELETE FROM gs_user_roles WHERE user_id=$1 AND role=$2',[c.req.param('id'),body.role])
      await audit(tx,admin.id,`role.${body.action.toLowerCase()}`,c.req.param('id'),{role:body.role})
    })
    return c.json({ok:true})
  })
  app.get('/api/v1/admin/servers',async c=>{
    await permission(c,'servers.read')
    return c.json((await db.query(`SELECT r.server_id,r.game_id,r.name,r.slug,r.owner_id,r.version,
      m.enabled AS monitoring_enabled,m.method AS monitoring_method,
      COALESCE(h.active,false) AS monitoring_held,
      count(c.id) FILTER (WHERE c.status='PENDING')::integer AS pending_claims
      FROM gs_server_registry r LEFT JOIN gs_claims c ON c.server_id=r.server_id
      LEFT JOIN gs_owner_monitoring_overrides m ON m.server_id=r.server_id
      LEFT JOIN gs_monitoring_holds h ON h.server_id=r.server_id
      GROUP BY r.server_id,m.enabled,m.method,h.active ORDER BY r.game_id,r.name LIMIT 100`)).rows)
  })
  app.post('/api/v1/admin/servers/:id/monitoring-hold',async c=>{
    const admin=await permission(c,'servers.review'),body=await json(c)
    const action=body.action,reason=textOf(body.reason,10,1000),serverId=c.req.param('id')
    if(!['SUSPEND','RESTORE'].includes(action))fail(400,'invalid_action','Укажите действие')
    const result=await db.transaction(async tx=>{
      const server=(await tx.query('SELECT * FROM gs_server_registry WHERE server_id=$1 FOR UPDATE',[serverId])).rows[0]
      if(!server)fail(404,'not_found','Сервер не найден')
      if(server.owner_id===admin.id)fail(403,'self_review','Нельзя проверять собственный сервер')
      const monitor=(await tx.query('SELECT enabled FROM gs_owner_monitoring_overrides WHERE server_id=$1',[serverId])).rows[0]
      const hold=(await tx.query('SELECT active FROM gs_monitoring_holds WHERE server_id=$1',[serverId])).rows[0]
      if(action==='SUSPEND'&&!monitor?.enabled)fail(409,'no_owner_monitoring','Адрес владельца не включён')
      if(action==='RESTORE'&&!hold)fail(404,'no_monitoring_hold','Ограничение не найдено')
      const active=action==='SUSPEND'
      if(hold?.active===active)return {changed:false,version:Number(server.version),held:active}
      await tx.query(`INSERT INTO gs_monitoring_holds(server_id,active,reason,reviewed_by)
        VALUES($1,$2,$3,$4) ON CONFLICT(server_id) DO UPDATE SET active=excluded.active,
        reason=excluded.reason,reviewed_by=excluded.reviewed_by,updated_at=now()`,
        [serverId,active,reason,admin.id])
      const changed=(await tx.query('UPDATE gs_server_registry SET version=version+1 WHERE server_id=$1 RETURNING version',
        [serverId])).rows[0]
      const snapshot=await createPublicSnapshot(tx,serverId,changed.version)
      await tx.query('INSERT INTO gs_public_outbox(server_id,version,payload) VALUES($1,$2,$3)',
        [serverId,changed.version,JSON.stringify(snapshot)])
      await audit(tx,admin.id,`server.monitoring_${action.toLowerCase()}`,serverId,{reason})
      return {changed:true,version:Number(changed.version),held:active}
    })
    return c.json(result)
  })
  app.get('/api/v1/admin/votes',async c=>{
    await permission(c,'votes.read')
    return c.json((await db.query(`SELECT id,server_id,user_id,asn,created_at,review_status,review_reason,reviewed_at FROM gs_votes
      ORDER BY created_at DESC,id DESC LIMIT 100`)).rows)
  })
  app.post('/api/v1/admin/votes/:id/review',async c=>{
    const reviewer=await permission(c,'votes.manage'),body=await json(c)
    const action=body.action,reason=textOf(body.reason,10,1000)
    if(!['VOID','RESTORE'].includes(action)) fail(400,'invalid_action','Укажите действие')
    const result=await db.transaction(async tx=>{
      const vote=(await tx.query('SELECT id,user_id,server_id,review_status FROM gs_votes WHERE id=$1 FOR UPDATE',
        [c.req.param('id')])).rows[0]
      if(!vote)fail(404,'not_found','Голос не найден')
      if(vote.user_id===reviewer.id)fail(403,'self_review','Нельзя проверять собственный голос')
      const status=action==='VOID'?'VOIDED':'ACCEPTED'
      if(vote.review_status===status)return {changed:false,status}
      await tx.query(`UPDATE gs_votes SET review_status=$1,reviewed_by=$2,review_reason=$3,reviewed_at=now()
        WHERE id=$4`,[status,reviewer.id,reason,vote.id])
      await audit(tx,reviewer.id,`vote.${action.toLowerCase()}`,vote.id,{serverId:vote.server_id,reason})
      return {changed:true,status}
    })
    return c.json(result)
  })
  app.get('/api/v1/admin/vote-rules',async c=>{
    await permission(c,'votes.read')
    return c.json(voteRulesDto((await db.query('SELECT * FROM gs_vote_rules WHERE id=1')).rows[0]))
  })
  app.post('/api/v1/admin/vote-rules',async c=>{
    const admin=await permission(c,'votes.configure'),body=await json(c)
    const ranges={windowHours:[1,2160],maxPerWindow:[1,20],ipDailyLimit:[1,100],
      deviceDailyLimit:[1,100],asnDailyLimit:[1,100000]}
    for(const [name,[min,max]] of Object.entries(ranges))
      if(!Number.isInteger(body[name])||body[name]<min||body[name]>max) fail(400,'invalid_vote_rule',`${name}: ${min}–${max}`)
    const reason=textOf(body.reason,10,1000)
    const next=Object.fromEntries(Object.keys(ranges).map(name=>[name,body[name]]))
    const result=await db.transaction(async tx=>{
      const row=(await tx.query('SELECT * FROM gs_vote_rules WHERE id=1 FOR UPDATE')).rows[0]
      const previous=voteRulesDto(row)
      if(Object.keys(ranges).every(name=>previous[name]===next[name])) return {rules:previous,changed:false}
      await tx.query(`UPDATE gs_vote_rules SET window_hours=$1,max_per_window=$2,ip_daily_limit=$3,
        device_daily_limit=$4,asn_daily_limit=$5 WHERE id=1`,Object.values(next))
      await audit(tx,admin.id,'vote.rules_changed','gs_vote_rules:1',{previous,next,reason})
      return {rules:next,changed:true}
    })
    return c.json(result)
  })
  app.get('/api/v1/admin/support',async c=>{
    await permission(c,'support.read')
    return c.json((await db.query(`SELECT id,server_id,user_id,coins,anonymous,public_nick,nickname_decision,created_at
      FROM gs_support ORDER BY created_at DESC,id DESC LIMIT 100`)).rows)
  })
  app.get('/api/v1/admin/coins/ledger',async c=>{
    await permission(c,'coins.read')
    return c.json((await db.query(`SELECT id,user_id,kind,delta,related_id,created_at
      FROM gs_coin_ledger ORDER BY created_at DESC,id DESC LIMIT 100`)).rows)
  })
  app.get('/api/v1/admin/payments',async c=>{
    await permission(c,'payments.read')
    return c.json((await db.query(`SELECT id,user_id,coins,amount_kopecks,status,created_at,paid_at
      FROM gs_test_payments ORDER BY id DESC LIMIT 100`)).rows)
  })
  app.get('/api/v1/admin/moderation/nicknames',async c=>{
    await permission(c,'moderation.manage')
    return c.json((await db.query(`SELECT n.support_id,n.nickname,n.status,n.attempts,n.last_error,n.created_at,
      s.server_id,s.user_id FROM gs_nickname_reviews n JOIN gs_support s ON s.id=n.support_id
      WHERE n.status IN ('PENDING','REVIEW') ORDER BY n.created_at LIMIT 100`)).rows)
  })
  app.post('/api/v1/admin/moderation/nicknames/:id/resolve',async c=>{
    const admin=await permission(c,'moderation.manage'),body=await json(c)
    if(!['ALLOW','ANONYMOUS'].includes(body.decision)) fail(400,'invalid_decision','Укажите решение')
    const reason=textOf(body.reason,10,1000)
    await db.transaction(async tx=>{
      const review=(await tx.query('SELECT * FROM gs_nickname_reviews WHERE support_id=$1 FOR UPDATE',[c.req.param('id')])).rows[0]
      if(!review) fail(404,'not_found','Ник не найден')
      const support=(await tx.query('SELECT * FROM gs_support WHERE id=$1',[review.support_id])).rows[0]
      if(support.user_id===admin.id) fail(403,'self_review','Нельзя проверять свой ник')
      if(!['PENDING','REVIEW'].includes(review.status)) fail(409,'review_closed','Ник уже рассмотрен')
      await tx.query(`UPDATE gs_nickname_reviews SET status=$1,reviewed_at=now(),lease_token=NULL,lease_until=NULL
        WHERE support_id=$2`,[body.decision,review.support_id])
      await tx.query('UPDATE gs_support SET nickname_decision=$1,public_nick=$2 WHERE id=$3',
        [body.decision,body.decision==='ALLOW'?review.nickname:'Анонимно',review.support_id])
      await audit(tx,admin.id,'nickname.manual_review',review.support_id,{decision:body.decision,reason})
    })
    return c.json({ok:true})
  })
  app.get('/api/v1/copyright/restrictions/:id',async c=>{
    const scopes=(await db.query(`SELECT DISTINCT material_key FROM gs_material_restrictions
      WHERE server_id=$1 AND active=true ORDER BY material_key`,[c.req.param('id')])).rows.map(row=>row.material_key)
    return c.json({restrictedLinks:scopes.filter(key=>key!=='description'),
      restrictedMaterials:scopes.filter(key=>key==='description')})
  })
  app.post('/api/v1/copyright/claims',async c=>{
    const body=await json(c)
    const serverId=textOf(body.serverId,1,100),materialKey=textOf(body.materialKey,1,20)
    if(!['site','discord','telegram','description'].includes(materialKey)) fail(400,'invalid_scope','Укажите конкретный материал')
    const contact=emailOf(body.contactEmail),claimant=textOf(body.claimantName,2,120)
    const rights=typeof body.rightsBasis==='string'?body.rightsBasis.trim().slice(0,3000):''
    const work=typeof body.workDescription==='string'?body.workDescription.trim().slice(0,3000):''
    const evidence=typeof body.evidence==='string'?body.evidence.trim().slice(0,3000):''
    const materialUrl=typeof body.materialUrl==='string'?body.materialUrl.trim().slice(0,2048):''
    await limit(c,'copyright',contact,5)
    if(!(await db.query('SELECT 1 FROM gs_server_registry WHERE server_id=$1',[serverId])).rows.length)
      fail(404,'not_found','Сервер не найден')
    let complete=rights.length>=20&&work.length>=20&&evidence.length>=20
    let target
    try {target=new URL(materialUrl);if(!['http:','https:'].includes(target.protocol)||target.username||target.password) complete=false} catch {complete=false}
    if(complete) {
      if(!config.publicApi) fail(503,'public_catalog_unavailable','Проверка ссылки сейчас недоступна')
      const response=await publicFetch(new URL(`/api/v1/servers/${encodeURIComponent(serverId)}`,config.publicApi),
        {signal:AbortSignal.timeout(8000),redirect:'error'})
      if(!response.ok) fail(503,'public_catalog_unavailable','Проверка ссылки сейчас недоступна')
      const server=await response.json()
      let current=''
      if(materialKey==='description') {
        if(server.slug && (server.summary?.trim() || server.description?.trim()))
          current=new URL(`/server/${encodeURIComponent(server.slug)}#description`,'https://gamescout.online').toString()
      } else try {current=new URL(server.links?.[materialKey]).toString()} catch {}
      if(server.id!==serverId || current!==target.toString()) complete=false
    }
    const id=token(),status=complete?'PENDING_AI':'NEEDS_INFO'
    await db.transaction(async tx=>{
      await tx.query(`INSERT INTO gs_copyright_claims(id,server_id,claimant_name,contact_email,rights_basis,
        work_description,material_key,material_url,evidence,status)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[id,serverId,claimant,contact,rights,work,materialKey,materialUrl,evidence,status])
      if(complete) await tx.query('INSERT INTO gs_copyright_ai_jobs(claim_id) VALUES($1)',[id])
      else await tx.query('INSERT INTO gs_mail_outbox(id,ciphertext) VALUES($1,$2)',[token(),seal(config.mailKey,
        {to:contact,purpose:'COPYRIGHT_INFO',claimId:id})])
      await audit(tx,null,'copyright.submitted',id,{serverId,scope:materialKey,status})
      await enqueueTelegram(tx,'copyright.submitted',id,serverId,materialKey)
    })
    return c.json({id,status,message:complete?'Претензия передана на проверку.':'Нужны уточнения по правам, доказательствам или точному материалу.'},201)
  })
  app.get('/api/v1/admin/copyright',async c=>{
    await permission(c,'copyright.read')
    return c.json((await db.query(`SELECT id,server_id,claimant_name,contact_email,rights_basis,work_description,
      material_key,material_url,evidence,status,ai_classification,ai_reason,created_at,resolution_reason
      FROM gs_copyright_claims ORDER BY created_at DESC LIMIT 100`)).rows)
  })
  app.post('/api/v1/admin/copyright/:id/resolve',async c=>{
    const admin=await permission(c,'copyright.review'),body=await json(c)
    if(!['RESTRICT','RESTORE','REJECT','REQUEST_INFO'].includes(body.action)) fail(400,'invalid_action','Укажите действие')
    const reason=textOf(body.reason,10,1000)
    await db.transaction(async tx=>{
      const claim=(await tx.query('SELECT * FROM gs_copyright_claims WHERE id=$1 FOR UPDATE',[c.req.param('id')])).rows[0]
      if(!claim) fail(404,'not_found','Претензия не найдена')
      if(body.action==='RESTORE'&&claim.status!=='REVIEW_RESTRICTED') fail(409,'invalid_state','Активного ограничения нет')
      if(body.action==='RESTRICT'&&!['PENDING_AI','NEEDS_INFO'].includes(claim.status)) fail(409,'invalid_state','Претензия уже рассмотрена')
      if(['REJECT','REQUEST_INFO'].includes(body.action)&&claim.status==='REVIEW_RESTRICTED')
        fail(409,'restore_first','Сначала явно восстановите ограничение')
      if(['REJECT','REQUEST_INFO'].includes(body.action)&&!['PENDING_AI','NEEDS_INFO'].includes(claim.status))
        fail(409,'invalid_state','Претензия уже рассмотрена')
      const restricting=body.action==='RESTRICT',restoring=body.action==='RESTORE'
      if(restricting) await tx.query(`INSERT INTO gs_material_restrictions(id,claim_id,server_id,material_key)
        VALUES($1,$2,$3,$4)`,[token(),claim.id,claim.server_id,claim.material_key])
      if(restoring) await tx.query(`UPDATE gs_material_restrictions SET active=false,restored_at=now(),restored_by=$1,restore_reason=$2
        WHERE claim_id=$3 AND active=true`,[admin.id,reason,claim.id])
      const status=restricting?'REVIEW_RESTRICTED':restoring?'RESTORED':body.action==='REJECT'?'REJECTED':'NEEDS_INFO'
      await tx.query(`UPDATE gs_copyright_claims SET status=$1,reviewer_id=$2,resolution_reason=$3,resolved_at=now()
        WHERE id=$4`,[status,admin.id,reason,claim.id])
      if(restricting||restoring) {
        const server=(await tx.query('UPDATE gs_server_registry SET version=version+1 WHERE server_id=$1 RETURNING version',
          [claim.server_id])).rows[0]
        const snapshot=await createPublicSnapshot(tx,claim.server_id,server.version)
        await tx.query('INSERT INTO gs_public_outbox(server_id,version,payload) VALUES($1,$2,$3)',
          [claim.server_id,server.version,JSON.stringify(snapshot)])
      }
      await audit(tx,admin.id,`copyright.${body.action.toLowerCase()}`,claim.id,
        {serverId:claim.server_id,scope:claim.material_key,reason})
      if(body.action==='REQUEST_INFO') await tx.query('INSERT INTO gs_mail_outbox(id,ciphertext) VALUES($1,$2)',
        [token(),seal(config.mailKey,{to:claim.contact_email,purpose:'COPYRIGHT_INFO',claimId:claim.id})])
      await enqueueTelegram(tx,`copyright.${body.action.toLowerCase()}`,claim.id,claim.server_id,claim.material_key)
    })
    return c.json({ok:true})
  })
  app.get('/api/v1/admin/server-edits',async c=>{
    await permission(c,'servers.review')
    return c.json((await db.query(`SELECT e.id,e.server_id,e.user_id,e.summary,e.status,e.created_at,
      r.name,r.game_id FROM gs_owner_summary_edits e JOIN gs_server_registry r USING(server_id)
      WHERE e.status='PENDING' ORDER BY e.created_at LIMIT 100`)).rows)
  })
  app.post('/api/v1/admin/server-edits/:id/resolve',async c=>{
    const reviewer=await permission(c,'servers.review'),body=await json(c)
    const status=body.status,reason=textOf(body.reason,10,1000)
    if(!['APPROVED','REJECTED'].includes(status)) fail(400,'invalid_status','Укажите решение')
    const result=await db.transaction(async tx=>{
      const edit=(await tx.query('SELECT * FROM gs_owner_summary_edits WHERE id=$1 FOR UPDATE',[c.req.param('id')])).rows[0]
      if(!edit)fail(404,'not_found','Изменение не найдено')
      if(edit.user_id===reviewer.id)fail(403,'self_review','Нельзя утверждать своё изменение')
      if(edit.status!=='PENDING') {
        if(edit.status===status)return {id:edit.id,status:edit.status,replay:true}
        fail(409,'edit_closed','Изменение уже рассмотрено')
      }
      const server=(await tx.query('SELECT * FROM gs_server_registry WHERE server_id=$1 FOR UPDATE',[edit.server_id])).rows[0]
      if(!server||server.owner_id!==edit.user_id)fail(409,'owner_changed','Права владельца изменились')
      await tx.query('UPDATE gs_owner_summary_edits SET status=$1,reviewer_id=$2,reason=$3,resolved_at=now() WHERE id=$4',
        [status,reviewer.id,reason,edit.id])
      if(status==='APPROVED') {
        const changed=(await tx.query('UPDATE gs_server_registry SET version=version+1 WHERE server_id=$1 RETURNING version',
          [edit.server_id])).rows[0]
        const snapshot=await createPublicSnapshot(tx,edit.server_id,changed.version)
        await tx.query('INSERT INTO gs_public_outbox(server_id,version,payload) VALUES($1,$2,$3)',
          [edit.server_id,changed.version,JSON.stringify(snapshot)])
      }
      await audit(tx,reviewer.id,'server.summary_'+status.toLowerCase(),edit.id,{serverId:edit.server_id,reason})
      return {id:edit.id,status,replay:false}
    })
    return c.json(result)
  })
  app.get('/api/v1/admin/server-fact-edits',async c=>{
    await permission(c,'servers.review')
    return c.json((await db.query(`SELECT e.id,e.server_id,e.user_id,e.field,e.value,e.evidence,e.status,e.created_at,
      r.name,r.game_id FROM gs_owner_fact_edits e JOIN gs_server_registry r USING(server_id)
      WHERE e.status='PENDING' ORDER BY e.created_at LIMIT 100`)).rows)
  })
  app.post('/api/v1/admin/server-fact-edits/:id/resolve',async c=>{
    const reviewer=await permission(c,'servers.review'),body=await json(c)
    const status=body.status,reason=textOf(body.reason,10,1000)
    if(!['APPROVED','REJECTED'].includes(status))fail(400,'invalid_status','Укажите решение')
    const result=await db.transaction(async tx=>{
      const edit=(await tx.query('SELECT * FROM gs_owner_fact_edits WHERE id=$1 FOR UPDATE',[c.req.param('id')])).rows[0]
      if(!edit)fail(404,'not_found','Правка не найдена')
      if(edit.user_id===reviewer.id)fail(403,'self_review','Нельзя утверждать свою правку')
      if(edit.status!=='PENDING') {
        if(edit.status===status)return {id:edit.id,status,replay:true}
        fail(409,'edit_closed','Правка уже рассмотрена')
      }
      const server=(await tx.query('SELECT * FROM gs_server_registry WHERE server_id=$1 FOR UPDATE',[edit.server_id])).rows[0]
      if(!server||server.owner_id!==edit.user_id)fail(409,'owner_changed','Права владельца изменились')
      await tx.query('UPDATE gs_owner_fact_edits SET status=$1,reviewer_id=$2,reason=$3,resolved_at=now() WHERE id=$4',
        [status,reviewer.id,reason,edit.id])
      if(status==='APPROVED') {
        if(edit.field==='site')await tx.query('UPDATE gs_server_registry SET website=$1 WHERE server_id=$2',
          [edit.value||null,edit.server_id])
        const changed=(await tx.query('UPDATE gs_server_registry SET version=version+1 WHERE server_id=$1 RETURNING version',
          [edit.server_id])).rows[0]
        const snapshot=await createPublicSnapshot(tx,edit.server_id,changed.version)
        await tx.query('INSERT INTO gs_public_outbox(server_id,version,payload) VALUES($1,$2,$3)',
          [edit.server_id,changed.version,JSON.stringify(snapshot)])
      }
      await audit(tx,reviewer.id,'server.fact_'+status.toLowerCase(),edit.id,{serverId:edit.server_id,field:edit.field,reason})
      return {id:edit.id,status,replay:false}
    })
    return c.json(result)
  })
  app.get('/api/v1/admin/claims',async c=>{
    await permission(c,'claims.review')
    return c.json((await db.query("SELECT c.*,s.name,s.game_id FROM gs_claims c JOIN gs_server_registry s USING(server_id) WHERE c.status='PENDING' ORDER BY c.created_at LIMIT 100")).rows)
  })
  app.post('/api/v1/admin/claims/:id/resolve',async c=>{
    const admin=await permission(c,'claims.review'), body=await json(c), reason=textOf(body.reason,10,1000)
    if (!['VERIFIED','REJECTED'].includes(body.status)) fail(400,'invalid_status','Укажите решение')
    const result=await db.transaction(async tx=>{
      const claim=(await tx.query('SELECT * FROM gs_claims WHERE id=$1 FOR UPDATE',[c.req.param('id')])).rows[0]
      if (!claim) fail(404,'not_found','Заявка не найдена')
      if (claim.user_id===admin.id) fail(403,'self_review','Нельзя подтверждать собственную заявку')
      if (claim.status!== 'PENDING') {
        if (claim.status===body.status) return claim
        fail(409,'claim_closed','Заявка уже рассмотрена')
      }
      const server=(await tx.query('SELECT * FROM gs_server_registry WHERE server_id=$1 FOR UPDATE',[claim.server_id])).rows[0]
      if (body.status==='VERIFIED') {
        if (server.owner_id && server.owner_id!==claim.user_id) fail(409,'already_claimed','Владелец уже подтверждён')
        const changed=(await tx.query('UPDATE gs_server_registry SET owner_id=$1,version=version+1 WHERE server_id=$2 RETURNING version',[claim.user_id,server.server_id])).rows[0]
        const snapshot=await createPublicSnapshot(tx,server.server_id,changed.version)
        await tx.query('INSERT INTO gs_public_outbox(server_id,version,payload) VALUES($1,$2,$3)',[server.server_id,changed.version,JSON.stringify(snapshot)])
      }
      const updated=(await tx.query('UPDATE gs_claims SET status=$1,reviewer_id=$2,reason=$3,resolved_at=now() WHERE id=$4 RETURNING *',[body.status,admin.id,reason,claim.id])).rows[0]
      await audit(tx,admin.id,'claim.'+body.status.toLowerCase(),claim.id,{serverId:server.server_id})
      return updated
    })
    return c.json(result)
  })
  app.get('/api/v1/admin/system',async c=>{
    await permission(c,'system.read')
    const queues=(await db.query(`SELECT
      (SELECT count(*)::integer FROM gs_nickname_reviews WHERE status='PENDING') AS nickname_reviews,
      (SELECT count(*)::integer FROM gs_copyright_ai_jobs WHERE completed_at IS NULL) AS copyright_ai,
      (SELECT count(*)::integer FROM gs_telegram_outbox WHERE delivered_at IS NULL) AS telegram,
      (SELECT COALESCE(EXTRACT(EPOCH FROM now()-min(created_at)),0)::integer
        FROM gs_telegram_outbox WHERE delivered_at IS NULL) AS telegram_oldest_seconds`)).rows[0]
    return c.json({projection:await outboxHealth(db),
      alerts:(await db.query('SELECT key,active,opened_at,resolved_at,last_snapshot FROM gs_system_alerts ORDER BY key')).rows,queues,
      events:(await db.query('SELECT id,action,target,created_at FROM gs_audit ORDER BY id DESC LIMIT 50')).rows})
  })
  // Explicit public allowlist. Private cookies and identifying headers never reach D1.
  app.get('*',async c=>{
    const path=new URL(c.req.url).pathname
    if (config.publicApi && /^\/api\/v1\/(games|rating|servers(?:\/[^/]+(?:\/online-history)?)?|sitemap\.xml)$/.test(path)) {
      const url=new URL(path+new URL(c.req.url).search,config.publicApi)
      const response=await publicFetch(url,{headers:{Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(10000)})
      const headers=new Headers(response.headers)
      // Node fetch decompresses upstream bytes; retaining these headers corrupts the relay response.
      for(const name of ['Set-Cookie','Content-Encoding','Content-Length','Transfer-Encoding']) headers.delete(name)
      return new Response(response.body,{status:response.status,headers})
    }
    fail(404,'not_found','Маршрут не найден')
  })
  app.notFound(c=>c.json({error:{code:'private_route_unavailable',message:'Этот сценарий ещё не перенесён в приватное хранилище'}},501))
  return app
}
