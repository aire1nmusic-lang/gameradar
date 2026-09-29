import { dispatch } from './outbox.mjs'
import { dispatchNicknameReview, reviewNickname } from './nickname-review.mjs'
import { analyzeCopyright, dispatchCopyrightAI, dispatchTelegram } from './copyright.mjs'
import { checkProjectionLag } from './projection-alert.mjs'
import { checkOpenRouterBalance } from './openrouter-balance.mjs'
import { linkMail, sendMail } from '../worker/lib/mailer.ts'
import { createHash, timingSafeEqual } from 'node:crypto'

/** The gateway must not expose this path. A private Yandex timer invokes it with IAM. */
export function isMaintenanceEvent(event,triggerId,folderId,tokenHash) {
  if(!triggerId||!folderId||!/^[a-f0-9]{64}$/.test(tokenHash??'')||!event||typeof event!=='object'||!Array.isArray(event.messages)||event.messages.length!==1)return false
  const message=event.messages[0]
  const payload=message?.details?.payload
  if(typeof payload!=='string'||payload.length<32||payload.length>128)return false
  const actual=Buffer.from(createHash('sha256').update(payload).digest('hex'),'hex')
  if(!timingSafeEqual(actual,Buffer.from(tokenHash,'hex')))return false
  return message?.event_metadata?.event_type==='yandex.cloud.events.serverless.triggers.TimerMessage'
    &&message?.event_metadata?.folder_id===folderId&&message?.details?.trigger_id===triggerId
}

export async function runMaintenance(db,config,{development=false,onLocalMail=()=>{},projectionAlertSeconds=300,maxPerQueue=10,maxMillis=25000}={}) {
  const deadline=Date.now()+maxMillis
  const counts={mail:0,public:0,nickname:0,copyright:0,telegram:0}
  const drain=async(kind,deliver)=>{
    for(let i=0;i<maxPerQueue&&Date.now()<deadline;i++) {
      if(!(await deliver()))break
      counts[kind]++
    }
  }
  if(config.mailEnabled)await drain('mail',()=>dispatch(db,'mail',async mail=>{
    if(development)onLocalMail(mail)
    else if(mail.purpose==='COPYRIGHT_INFO')await sendMail(config.mailEnv,{to:mail.to,
      subject:'GameScout: нужны уточнения по обращению',
      text:`По обращению ${mail.claimId} нужны уточнения о правах, доказательствах или точной ссылке. Отправьте форму повторно с полными сведениями и укажите этот номер в поле доказательств.`,
      html:`<p>По вашему обращению нужны уточнения. Отправьте форму повторно с полными сведениями и укажите номер ${mail.claimId} в поле доказательств.</p>`})
    else await sendMail(config.mailEnv,linkMail(mail.to,mail.purpose,mail.link))
  },config.mailKey))
  if(config.publicProjection&&config.projectionSecret)await drain('public',()=>dispatch(db,'public',async payload=>{
    const response=await fetch(config.publicProjection,{method:'POST',headers:{Authorization:`Bearer ${config.projectionSecret}`,'Content-Type':'application/json'},
      body:JSON.stringify(payload),redirect:'error',signal:AbortSignal.timeout(10000)})
    if(!response.ok)throw new Error('projection_unavailable')
  }))
  await checkProjectionLag(db,projectionAlertSeconds)
  if(config.openrouterBalance?.key) {
    const due=(await db.query(`UPDATE gs_maintenance_schedule SET next_at=now()+interval '1 hour'
      WHERE key='openrouter_balance' AND next_at<=now() RETURNING key`)).rows.length>0
    if(due)await checkOpenRouterBalance(db,config.openrouterBalance)
  }
  if(config.openrouter?.key&&config.openrouter?.model)await drain('nickname',()=>dispatchNicknameReview(db,
    nickname=>reviewNickname(config.openrouter,nickname),config.openrouter.model))
  if(config.copyrightAI?.key&&config.copyrightAI?.model)await drain('copyright',()=>dispatchCopyrightAI(db,
    claim=>analyzeCopyright(config.copyrightAI,claim),config.copyrightAI.model,config.mailKey))
  if(config.telegram?.botToken&&config.telegram?.chatId)await drain('telegram',()=>dispatchTelegram(db,config.telegram))
  return counts
}
