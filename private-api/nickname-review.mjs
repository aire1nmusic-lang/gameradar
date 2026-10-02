import { token } from './crypto.mjs'
import { classifyLocalNickname } from './nickname.mjs'

export async function reviewNickname(config,nickname,request=fetch) {
  // Compatibility signature retained. Neither config nor request is used:
  // ambiguous private nicknames stay anonymous until a moderator resolves them.
  return classifyLocalNickname(nickname).decision==='ANONYMOUS'?'ANONYMOUS':'REVIEW'
}

export async function dispatchNicknameReview(db,review,model) {
  const lease=token()
  const row=await db.transaction(async tx=>(await tx.query(`UPDATE gs_nickname_reviews SET
    lease_until=now()+interval '30 seconds',lease_token=$1,attempts=attempts+1
    WHERE support_id=(SELECT support_id FROM gs_nickname_reviews WHERE status='PENDING'
      AND attempts<3 AND available_at<=now() AND (lease_until IS NULL OR lease_until<now())
      ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`,[lease])).rows[0])
  if(!row)return false
  try {
    const decision=await review(row.nickname)
    if(!['ALLOW','ANONYMOUS','REVIEW'].includes(decision)) throw new Error('invalid_ai_decision')
    await db.transaction(async tx=>{
      const current=(await tx.query(`SELECT * FROM gs_nickname_reviews WHERE support_id=$1
        AND status='PENDING' AND lease_token=$2 FOR UPDATE`,[row.support_id,lease])).rows[0]
      if(!current)return
      await tx.query(`UPDATE gs_nickname_reviews SET status=$1,model=$2,reviewed_at=now(),
        lease_until=NULL,lease_token=NULL,last_error=NULL WHERE support_id=$3`,[decision,model,row.support_id])
      if(decision!=='REVIEW') await tx.query(`UPDATE gs_support SET public_nick=$1,nickname_decision=$2 WHERE id=$3`,
        [decision==='ALLOW'?row.nickname:'Анонимно',decision,row.support_id])
      await tx.query(`INSERT INTO gs_audit(action,target,details) VALUES('nickname.ai_review',$1,$2)`,
        [row.support_id,JSON.stringify({decision,model})])
    })
  } catch {
    if(row.attempts>=3) {
      await db.query(`UPDATE gs_nickname_reviews SET status='REVIEW',reviewed_at=now(),
        lease_until=NULL,lease_token=NULL,last_error='review_exhausted' WHERE support_id=$1 AND lease_token=$2`,[row.support_id,lease])
      return true
    }
    const seconds=Math.min(3600,2**Math.min(row.attempts,11))
    await db.query(`UPDATE gs_nickname_reviews SET available_at=now()+($1*interval '1 second'),
      lease_until=NULL,lease_token=NULL,last_error='review_failed' WHERE support_id=$2 AND lease_token=$3`,
      [seconds,row.support_id,lease])
  }
  return true
}
