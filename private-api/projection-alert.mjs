import { token } from './crypto.mjs'
import { outboxHealth } from './outbox.mjs'

/** One alert per outage, one recovery message. No private row payload enters Telegram. */
export async function checkProjectionLag(db,thresholdSeconds=300) {
  if(!Number.isInteger(thresholdSeconds)||thresholdSeconds<60||thresholdSeconds>3600) throw new Error('invalid_projection_threshold')
  const health=await outboxHealth(db)
  const delayed=health.pending>0&&(health.oldest_seconds>=thresholdSeconds||health.max_attempts>=3)
  return db.transaction(async tx=>{
    await tx.query("INSERT INTO gs_system_alerts(key) VALUES('public_projection_lag') ON CONFLICT DO NOTHING")
    const state=(await tx.query("SELECT active FROM gs_system_alerts WHERE key='public_projection_lag' FOR UPDATE")).rows[0]
    if(state.active===delayed)return {changed:false,active:delayed,health}
    const event=delayed?'projection.lag':'projection.recovered'
    const snapshot={pending:health.pending,oldestSeconds:health.oldest_seconds,maxAttempts:health.max_attempts,thresholdSeconds}
    await tx.query(`UPDATE gs_system_alerts SET active=$1,
      opened_at=CASE WHEN $1 THEN now() ELSE opened_at END,
      resolved_at=CASE WHEN $1 THEN NULL ELSE now() END,last_snapshot=$2 WHERE key='public_projection_lag'`,
      [delayed,JSON.stringify(snapshot)])
    await tx.query('INSERT INTO gs_audit(action,target,details) VALUES($1,$2,$3)',
      [event,'public_projection',JSON.stringify(snapshot)])
    const message=delayed
      ?`GameScout: задержка публичной проекции\nОжидают: ${health.pending}\nСтарейшее событие: ${health.oldest_seconds} с\nПопыток: ${health.max_attempts}`
      :'GameScout: публичная проекция восстановлена'
    await tx.query('INSERT INTO gs_telegram_outbox(id,event,message) VALUES($1,$2,$3)',[token(),event,message])
    return {changed:true,active:delayed,health}
  })
}
