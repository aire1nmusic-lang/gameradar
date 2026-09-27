import { token } from './crypto.mjs'

/** Atomically record a state transition, audit it, and queue one admin notice. */
export async function transitionSystemAlert(db,{key,active,snapshot,openedEvent,closedEvent,openedMessage,closedMessage}) {
  return db.transaction(async tx=>{
    await tx.query('INSERT INTO gs_system_alerts(key) VALUES($1) ON CONFLICT DO NOTHING',[key])
    const state=(await tx.query('SELECT active FROM gs_system_alerts WHERE key=$1 FOR UPDATE',[key])).rows[0]
    if(state.active===active)return false
    const event=active?openedEvent:closedEvent
    const message=active?openedMessage:closedMessage
    await tx.query(`UPDATE gs_system_alerts SET active=$1,
      opened_at=CASE WHEN $1 THEN now() ELSE opened_at END,
      resolved_at=CASE WHEN $1 THEN NULL ELSE now() END,last_snapshot=$2 WHERE key=$3`,
      [active,JSON.stringify(snapshot),key])
    await tx.query('INSERT INTO gs_audit(action,target,details) VALUES($1,$2,$3)',
      [event,key,JSON.stringify(snapshot)])
    await tx.query('INSERT INTO gs_telegram_outbox(id,event,message) VALUES($1,$2,$3)',[token(),event,message])
    return true
  })
}
