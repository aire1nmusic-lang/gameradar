import { seal, token } from './crypto.mjs'
import { createPublicSnapshot } from './public-snapshot.mjs'
import { copyrightPresence, telegramNotice } from './egress.mjs'

export async function analyzeCopyright(config,claim,request=fetch) {
  const flags=copyrightPresence(claim)
  // Completeness is not proof of copyright. The intake already verifies target.
  // Raw evidence stays in RU; all complete cases require human review.
  return Object.values(flags).every(Boolean)
    ?{classification:'DOUBTFUL',requiresHumanReview:true,reason:'Local completeness check passed; human rights review required before restriction'}
    :{classification:'INCOMPLETE',reason:'Local completeness check requires missing information'}
}

export async function enqueueTelegram(tx,event,claimId,serverId,scope,classification) {
  const message=`GameScout: ${event}\nClaim: ${claimId}\nServer: ${serverId}\nScope: ${scope}`
    +(classification?`\nAI: ${classification}`:'')
  await tx.query('INSERT INTO gs_telegram_outbox(id,event,message) VALUES($1,$2,$3)',[token(),event,message])
}

export async function dispatchCopyrightAI(db,analyze,model,mailKey) {
  const lease=token()
  const row=await db.transaction(async tx=>(await tx.query(`UPDATE gs_copyright_ai_jobs SET
    lease_until=now()+interval '45 seconds',lease_token=$1,attempts=attempts+1
    WHERE claim_id=(SELECT claim_id FROM gs_copyright_ai_jobs WHERE completed_at IS NULL
      AND attempts<3 AND available_at<=now() AND (lease_until IS NULL OR lease_until<now())
      ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`,[lease])).rows[0])
  if(!row)return false
  try {
    const claim=(await db.query('SELECT * FROM gs_copyright_claims WHERE id=$1',[row.claim_id])).rows[0]
    if(!claim||claim.status!=='PENDING_AI') {
      await db.query(`UPDATE gs_copyright_ai_jobs SET completed_at=now(),lease_until=NULL,lease_token=NULL
        WHERE claim_id=$1 AND lease_token=$2`,[row.claim_id,lease])
      return true
    }
    const decision=await analyze(claim)
    if(!['VALID','DOUBTFUL','FAKE','INCOMPLETE'].includes(decision?.classification)
      ||typeof decision.reason!=='string'||decision.reason.length<5||decision.reason.length>1000)
      throw new Error('invalid_ai_decision')
    await db.transaction(async tx=>{
      const current=(await tx.query(`SELECT j.*,c.status,c.server_id,c.material_key FROM gs_copyright_ai_jobs j
        JOIN gs_copyright_claims c ON c.id=j.claim_id WHERE j.claim_id=$1 AND j.lease_token=$2 FOR UPDATE`,
        [row.claim_id,lease])).rows[0]
      if(!current||current.status!=='PENDING_AI')return
      const humanOnly=decision.requiresHumanReview===true
      const restrict=!humanOnly&&['VALID','DOUBTFUL'].includes(decision.classification)
      // Existing PENDING_AI enum is retained for compatibility: job completed,
      // case pending HUMAN review. Completeness alone never causes a hold.
      const status=humanOnly?'PENDING_AI':restrict?'REVIEW_RESTRICTED':decision.classification==='FAKE'?'REJECTED_FAKE':'NEEDS_INFO'
      await tx.query(`UPDATE gs_copyright_claims SET status=$1,ai_classification=$2,ai_reason=$3 WHERE id=$4`,
        [status,decision.classification,decision.reason,row.claim_id])
      if(restrict) {
        await tx.query(`INSERT INTO gs_material_restrictions(id,claim_id,server_id,material_key)
          VALUES($1,$2,$3,$4)`,[token(),row.claim_id,current.server_id,current.material_key])
        const server=(await tx.query('UPDATE gs_server_registry SET version=version+1 WHERE server_id=$1 RETURNING version',
          [current.server_id])).rows[0]
        const snapshot=await createPublicSnapshot(tx,current.server_id,server.version)
        await tx.query('INSERT INTO gs_public_outbox(server_id,version,payload) VALUES($1,$2,$3)',
          [current.server_id,server.version,JSON.stringify(snapshot)])
      }
      await tx.query(`UPDATE gs_copyright_ai_jobs SET completed_at=now(),lease_until=NULL,lease_token=NULL,last_error=NULL
        WHERE claim_id=$1`,[row.claim_id])
      await tx.query(`INSERT INTO gs_audit(action,target,details) VALUES($1,$2,$3)`,
        [model==='local-policy-v1'?'copyright.local_triage':'copyright.ai_triage',row.claim_id,
          JSON.stringify({classification:decision.classification,status,humanOnly,scope:current.material_key,model})])
      if(status==='NEEDS_INFO'&&mailKey) await tx.query('INSERT INTO gs_mail_outbox(id,ciphertext) VALUES($1,$2)',
        [token(),seal(mailKey,{to:claim.contact_email,purpose:'COPYRIGHT_INFO',claimId:row.claim_id})])
      await enqueueTelegram(tx,humanOnly?'copyright.review_required':restrict?'copyright.restricted':status==='REJECTED_FAKE'?'copyright.suspected_fake':'copyright.needs_info',
        row.claim_id,current.server_id,current.material_key,decision.classification)
    })
  } catch {
    const seconds=Math.min(3600,2**Math.min(row.attempts,11))
    await db.query(`UPDATE gs_copyright_ai_jobs SET available_at=now()+($1*interval '1 second'),
      lease_until=NULL,lease_token=NULL,last_error=$4 WHERE claim_id=$2 AND lease_token=$3`,
      [seconds,row.claim_id,lease,row.attempts>=3?'analysis_exhausted':'analysis_failed'])
    if(row.attempts===1) {
      const claim=(await db.query('SELECT server_id,material_key FROM gs_copyright_claims WHERE id=$1',[row.claim_id])).rows[0]
      if(claim) await db.transaction(tx=>enqueueTelegram(tx,'copyright.ai_error',row.claim_id,claim.server_id,claim.material_key))
    }
  }
  return true
}

export async function dispatchTelegram(db,config,request=fetch) {
  if(!config?.botToken||!config.chatId)return false
  const lease=token()
  const row=await db.transaction(async tx=>(await tx.query(`UPDATE gs_telegram_outbox SET
    lease_until=now()+interval '30 seconds',lease_token=$1,attempts=attempts+1
    WHERE id=(SELECT id FROM gs_telegram_outbox WHERE delivered_at IS NULL AND attempts<3 AND available_at<=now()
      AND (lease_until IS NULL OR lease_until<now()) ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1)
    RETURNING *`,[lease])).rows[0])
  if(!row)return false
  try {
    const message=telegramNotice({event:row.event,eventRef:row.id})
    const relay=!!config.relayUrl
    if(relay&&(config.relayUrl!=='https://gamescout-origin.aire1n-music.workers.dev/api/internal/telegram-relay'
      ||typeof config.relaySecret!=='string'||config.relaySecret.length<32))throw new Error('invalid_telegram_relay')
    const response=await request(relay?config.relayUrl:`https://api.telegram.org/bot${config.botToken}/sendMessage`,{
      method:'POST',headers:{'Content-Type':'application/json',...(relay?{Authorization:`Bearer ${config.relaySecret}`}:{})},
      body:JSON.stringify(relay?{event:row.event,eventRef:row.id}:{chat_id:config.chatId,text:message,
        protect_content:true,disable_notification:false}),redirect:'error',signal:AbortSignal.timeout(10000),
    })
    if(!response.ok || !(await response.json()).ok) throw new Error('telegram_delivery_failed')
    await db.query('UPDATE gs_telegram_outbox SET delivered_at=now(),lease_until=NULL,lease_token=NULL,last_error=NULL WHERE id=$1 AND lease_token=$2',
      [row.id,lease])
  } catch {
    const seconds=Math.min(3600,2**Math.min(row.attempts,11))
    await db.query(`UPDATE gs_telegram_outbox SET available_at=now()+($1*interval '1 second'),lease_until=NULL,
      lease_token=NULL,last_error='delivery_failed' WHERE id=$2 AND lease_token=$3`,[seconds,row.id,lease])
  }
  return true
}
