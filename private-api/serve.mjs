import { createServer } from 'node:http'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import { createApp } from './app.mjs'
import { migrate, postgresStore } from './db.mjs'
import { drainMailQueue, isMaintenanceEvent, runMaintenance } from './maintenance.mjs'
import { localClientIp, vmProxyClientIp, yandexClientIp } from './ingress.mjs'
import { productionConfig } from './production-config.mjs'

const development=process.argv.includes('--local')
const port=Number(process.env.PORT??8789)
let db, config, inbox=[], projectionAlertSeconds=300,runtime='development',proxySecret
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
  const localProjectionSecret=process.env.LOCAL_PUBLIC_PROJECTION_SECRET
  if(localProjectionSecret && localProjectionSecret.length<16) throw new Error('LOCAL_PUBLIC_PROJECTION_SECRET_too_short')
  config={...keys,origin:'http://127.0.0.1:5173',environment:'development',mailEnabled:true,
    publicApi:'http://127.0.0.1:8787',
    ...(localProjectionSecret?{publicProjection:'http://127.0.0.1:8787/api/internal/public-projection',
      projectionSecret:localProjectionSecret}:{})}
  await migrate(db)
} else {
  const loaded=await productionConfig()
  db=postgresStore(loaded.connectionString,loaded.ca)
  config=loaded.config
  runtime=loaded.runtime
  proxySecret=loaded.proxySecret
  projectionAlertSeconds=loaded.projectionAlertSeconds
  // No implicit production migration; mail stays disabled until verified provider secrets exist.
}
if(development) {
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
}
const app=createApp({db,config})
if(runtime==='yandex-container' && (!config.maintenanceTriggerId||!config.folderId||!config.maintenanceTokenHash))throw new Error('Yandex_maintenance_trigger_required')
if(development) {
  projectionAlertSeconds=Number(process.env.PUBLIC_PROJECTION_ALERT_SECONDS??300)
  if(!Number.isInteger(projectionAlertSeconds)||projectionAlertSeconds<60||projectionAlertSeconds>3600)
    throw new Error('PUBLIC_PROJECTION_ALERT_SECONDS_must_be_60_to_3600')
  if(!Number.isFinite(config.openrouterBalance.thresholdUsd)||config.openrouterBalance.thresholdUsd<0.01
    ||config.openrouterBalance.thresholdUsd>1000)throw new Error('OPENROUTER_LOW_BALANCE_USD_must_be_0.01_to_1000')
}
const server=createServer(async(req,res)=>{
  try {
    const chunks=[]; let size=0
    for await (const chunk of req) {
      size+=chunk.length
      if(size>16384) { res.writeHead(413); res.end(); return }
      chunks.push(chunk)
    }
    const url=new URL(req.url,config.origin)
    if (runtime==='vm' && url.pathname==='/__internal/maintenance') {
      res.writeHead(404,{'Cache-Control':'no-store'});res.end();return
    }
    if (runtime==='yandex-container' && url.pathname==='/__internal/maintenance') {
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
    const appHeaders={...req.headers}
    delete appHeaders['x-gs-proxy-secret']
    delete appHeaders['x-gs-client-ip']
    const response=await app.fetch(new Request(url,{method:req.method,headers:appHeaders,
      ...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})}),
      {clientIp:runtime==='development'?localClientIp(req.socket.remoteAddress):
        runtime==='vm'?vmProxyClientIp(req.headers,proxySecret):yandexClientIp(req.headers,req.socket.remoteAddress)})
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
// VM: the once-a-minute cron stays as a safety net, but letters leave within seconds.
let mailBusy=false
const mailTimer=runtime==='vm'&&config.mailEnabled?setInterval(async()=>{
  if (mailBusy) return
  mailBusy=true
  try { await drainMailQueue(db,config) }
  catch { console.error('mail_dispatch_failed') }
  finally { mailBusy=false }
},3000):null
async function close() { if(timer)clearInterval(timer); if(mailTimer)clearInterval(mailTimer); server.close(); await db.close(); process.exit(0) }
process.on('SIGINT',close); process.on('SIGTERM',close)
