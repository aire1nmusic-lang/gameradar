import { createServer } from 'node:http'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import { createApp } from './app.mjs'
import { migrate, postgresStore } from './db.mjs'
import { isMaintenanceEvent, runMaintenance } from './maintenance.mjs'
import { localClientIp, yandexClientIp } from './ingress.mjs'
import { mailEnabled } from '../worker/lib/mailer.ts'

const development=process.argv.includes('--local')
const port=Number(process.env.PORT??8789)
let db, config, inbox=[]
if (development) {
  const { PGlite }=await import('@electric-sql/pglite')
  await mkdir('output/private-core',{recursive:true})
  const pg=new PGlite('output/private-core/db')
  db={query:(sql,args=[])=>pg.query(sql,args),transaction:fn=>pg.transaction(fn),close:()=>pg.close()}
  let keys
  try { keys=JSON.parse(await readFile('output/private-core/keys.json','utf8')) }
  catch(error) {
    if (error.code!=='ENOENT') throw error
    keys={mailKey:randomBytes(32).toString('hex'),rateKey:randomBytes(32).toString('hex')}
    await writeFile('output/private-core/keys.json',JSON.stringify(keys),{flag:'wx'})
  }
  config={...keys,origin:'http://127.0.0.1:5173',environment:'development',mailEnabled:true,publicApi:'http://127.0.0.1:8787'}
  await migrate(db)
} else {
  if (!process.env.DATABASE_URL || (!process.env.PG_CA_FILE && !process.env.PG_CA_PEM)) throw new Error('DATABASE_URL_and_PostgreSQL_CA_required')
  db=postgresStore(process.env.DATABASE_URL,process.env.PG_CA_PEM??await readFile(process.env.PG_CA_FILE,'utf8'))
  const mailEnv={ENVIRONMENT:'production',MAIL_DRIVER:process.env.MAIL_DRIVER,MAIL_FROM:process.env.MAIL_FROM,
    RESEND_API_KEY:process.env.RESEND_API_KEY,UNISENDER_API_KEY:process.env.UNISENDER_API_KEY}
  config={origin:process.env.PUBLIC_ORIGIN,environment:'production',mailKey:process.env.MAIL_ENCRYPTION_KEY,
    rateKey:process.env.RATE_HASH_KEY,mailEnabled:mailEnabled(mailEnv),mailEnv,publicApi:process.env.PUBLIC_CATALOG_ORIGIN,
    publicProjection:process.env.PUBLIC_PROJECTION_URL,projectionSecret:process.env.PUBLIC_PROJECTION_SECRET,
    turnstileSecret:process.env.TURNSTILE_SECRET,turnstileSiteKey:process.env.TURNSTILE_SITE_KEY,
    oauth:Object.fromEntries(Object.entries(process.env).filter(([key])=>/^(GOOGLE|VK|YANDEX|DISCORD)_CLIENT_(ID|SECRET)$/.test(key))),
    maintenanceTriggerId:process.env.YANDEX_MAINTENANCE_TRIGGER_ID,folderId:process.env.YANDEX_FOLDER_ID,
    maintenanceTokenHash:process.env.YANDEX_MAINTENANCE_TOKEN_SHA256}
  // No implicit production migration; mail stays disabled until verified provider secrets exist.
}
config.enableTestPayments=process.env.ENABLE_TEST_PAYMENTS==='1'
config.robokassa={merchantLogin:process.env.ROBOKASSA_TEST_LOGIN,testPassword1:process.env.ROBOKASSA_TEST_PASSWORD_1,
  testPassword2:process.env.ROBOKASSA_TEST_PASSWORD_2,receiptSno:process.env.ROBOKASSA_RECEIPT_SNO,
  receiptTax:process.env.ROBOKASSA_RECEIPT_TAX,receiptPaymentObject:process.env.ROBOKASSA_RECEIPT_PAYMENT_OBJECT,
  receiptPaymentMethod:process.env.ROBOKASSA_RECEIPT_PAYMENT_METHOD,itemName:process.env.ROBOKASSA_RECEIPT_ITEM_NAME}
config.openrouter={key:process.env.OPENROUTER_API_KEY,model:process.env.OPENROUTER_NICKNAME_MODEL}
config.copyrightAI={key:process.env.OPENROUTER_API_KEY,model:process.env.OPENROUTER_COPYRIGHT_MODEL}
config.telegram={botToken:process.env.TELEGRAM_BOT_TOKEN,chatId:process.env.TELEGRAM_ADMIN_CHAT_ID}
config.openrouterBalance={key:process.env.OPENROUTER_MANAGEMENT_KEY,
  thresholdUsd:Number(process.env.OPENROUTER_LOW_BALANCE_USD??5)}
const app=createApp({db,config})
if(!development && (!config.maintenanceTriggerId||!config.folderId||!config.maintenanceTokenHash))throw new Error('Yandex_maintenance_trigger_required')
const projectionAlertSeconds=Number(process.env.PUBLIC_PROJECTION_ALERT_SECONDS??300)
if(!Number.isInteger(projectionAlertSeconds)||projectionAlertSeconds<60||projectionAlertSeconds>3600)
  throw new Error('PUBLIC_PROJECTION_ALERT_SECONDS_must_be_60_to_3600')
if(!Number.isFinite(config.openrouterBalance.thresholdUsd)||config.openrouterBalance.thresholdUsd<0.01
  ||config.openrouterBalance.thresholdUsd>1000)throw new Error('OPENROUTER_LOW_BALANCE_USD_must_be_0.01_to_1000')
const server=createServer(async(req,res)=>{
  try {
    const chunks=[]; let size=0
    for await (const chunk of req) {
      size+=chunk.length
      if(size>16384) { res.writeHead(413); res.end(); return }
      chunks.push(chunk)
    }
    const url=new URL(req.url,config.origin)
    if (!development && url.pathname==='/__internal/maintenance') {
      let event
      try { event=JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { event=null }
      if(req.method!=='POST'||!isMaintenanceEvent(event,config.maintenanceTriggerId,config.folderId,config.maintenanceTokenHash)) {
        res.writeHead(403,{'Cache-Control':'no-store'});res.end();return
      }
      const result=await runMaintenance(db,config,{projectionAlertSeconds})
      res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'})
      res.end(JSON.stringify({ok:true,processed:result}));return
    }
    if (development && url.pathname==='/__dev/mail' && req.method==='GET') {
      res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'}); res.end(JSON.stringify(inbox)); return
    }
    const response=await app.fetch(new Request(url,{method:req.method,headers:req.headers,
      ...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})}),
      {clientIp:development?localClientIp(req.socket.remoteAddress):yandexClientIp(req.headers,req.socket.remoteAddress)})
    const headers=Object.fromEntries([...response.headers].filter(([k])=>k!=='set-cookie'))
    const cookies=response.headers.getSetCookie(); if(cookies.length) headers['Set-Cookie']=cookies
    res.writeHead(response.status,headers)
    res.end(Buffer.from(await response.arrayBuffer()))
  } catch { if (!res.headersSent) res.writeHead(500); res.end() }
})
const host=development?'127.0.0.1':'0.0.0.0'
server.listen(port,host,()=>console.log(`Private API listening on ${host}:${port}`))
let busy=false
const timer=development?setInterval(async()=>{
  if (busy) return
  busy=true
  try { await runMaintenance(db,config,{development,onLocalMail:mail=>{inbox=[mail,...inbox].slice(0,20)},projectionAlertSeconds,maxPerQueue:1}) }
  catch { console.error('outbox_dispatch_failed') }
  finally { busy=false }
},1000):null
async function close() { if(timer)clearInterval(timer); server.close(); await db.close(); process.exit(0) }
process.on('SIGINT',close); process.on('SIGTERM',close)
