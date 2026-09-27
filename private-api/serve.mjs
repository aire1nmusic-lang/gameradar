import { createServer } from 'node:http'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import { createApp } from './app.mjs'
import { migrate, postgresStore } from './db.mjs'
import { dispatch } from './outbox.mjs'
import { mailEnabled, sendMail } from '../worker/lib/mailer.ts'

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
  if (!process.env.DATABASE_URL || !process.env.PG_CA_FILE) throw new Error('DATABASE_URL_and_PG_CA_FILE_required')
  db=postgresStore(process.env.DATABASE_URL,await readFile(process.env.PG_CA_FILE,'utf8'))
  const mailEnv={ENVIRONMENT:'production',MAIL_DRIVER:process.env.MAIL_DRIVER,MAIL_FROM:process.env.MAIL_FROM,
    RESEND_API_KEY:process.env.RESEND_API_KEY,UNISENDER_API_KEY:process.env.UNISENDER_API_KEY}
  config={origin:process.env.PUBLIC_ORIGIN,environment:'production',mailKey:process.env.MAIL_ENCRYPTION_KEY,
    rateKey:process.env.RATE_HASH_KEY,mailEnabled:mailEnabled(mailEnv),mailEnv,publicApi:process.env.PUBLIC_CATALOG_ORIGIN,
    publicProjection:process.env.PUBLIC_PROJECTION_URL,projectionSecret:process.env.PUBLIC_PROJECTION_SECRET,
    turnstileSecret:process.env.TURNSTILE_SECRET,turnstileSiteKey:process.env.TURNSTILE_SITE_KEY,
    oauth:Object.fromEntries(Object.entries(process.env).filter(([key])=>/^(GOOGLE|VK|YANDEX|DISCORD)_CLIENT_(ID|SECRET)$/.test(key)))}
  // No implicit production migration; mail stays disabled until verified provider secrets exist.
}
config.enableTestPayments=process.env.ENABLE_TEST_PAYMENTS==='1'
config.robokassa={merchantLogin:process.env.ROBOKASSA_TEST_LOGIN,testPassword1:process.env.ROBOKASSA_TEST_PASSWORD_1,
  testPassword2:process.env.ROBOKASSA_TEST_PASSWORD_2,receiptSno:process.env.ROBOKASSA_RECEIPT_SNO,
  receiptTax:process.env.ROBOKASSA_RECEIPT_TAX,receiptPaymentObject:process.env.ROBOKASSA_RECEIPT_PAYMENT_OBJECT,
  receiptPaymentMethod:process.env.ROBOKASSA_RECEIPT_PAYMENT_METHOD,itemName:process.env.ROBOKASSA_RECEIPT_ITEM_NAME}
const app=createApp({db,config})
const server=createServer(async(req,res)=>{
  try {
    const chunks=[]; let size=0
    for await (const chunk of req) {
      size+=chunk.length
      if(size>16384) { res.writeHead(413); res.end(); return }
      chunks.push(chunk)
    }
    const url=new URL(req.url,config.origin)
    if (development && url.pathname==='/__dev/mail' && req.method==='GET') {
      res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'}); res.end(JSON.stringify(inbox)); return
    }
    const response=await app.fetch(new Request(url,{method:req.method,headers:req.headers,
      ...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})}),{clientIp:req.socket.remoteAddress})
    const headers=Object.fromEntries([...response.headers].filter(([k])=>k!=='set-cookie'))
    const cookies=response.headers.getSetCookie(); if(cookies.length) headers['Set-Cookie']=cookies
    res.writeHead(response.status,headers)
    res.end(Buffer.from(await response.arrayBuffer()))
  } catch { if (!res.headersSent) res.writeHead(500); res.end() }
})
// This service is local-only until a separately reviewed Yandex deployment is configured.
server.listen(port,'127.0.0.1',()=>console.log(`Private API: http://127.0.0.1:${port}; local mail: /__dev/mail`))
let busy=false
const timer=setInterval(async()=>{
  if (busy) return
  busy=true
  try {
    if (config.mailEnabled) await dispatch(db,'mail',async mail=>{
      if (development) inbox=[mail,...inbox].slice(0,20)
      else await sendMail(config.mailEnv,{to:mail.to,subject:`GameScout: ${mail.purpose}`,text:`Откройте ссылку в течение 20 минут: ${mail.link}`,html:`<p>Подтвердите действие по ссылке из текстовой версии письма.</p>`})
    },config.mailKey)
    if (config.publicProjection && config.projectionSecret) await dispatch(db,'public',async payload=>{
      const response=await fetch(config.publicProjection,{method:'POST',headers:{Authorization:`Bearer ${config.projectionSecret}`,'Content-Type':'application/json'},
        body:JSON.stringify(payload),redirect:'error',signal:AbortSignal.timeout(10000)})
      if(!response.ok) throw new Error('projection_unavailable')
    })
  } catch { console.error('outbox_dispatch_failed') }
  finally { busy=false }
},1000)
async function close() { clearInterval(timer); server.close(); await db.close(); process.exit(0) }
process.on('SIGINT',close); process.on('SIGTERM',close)
