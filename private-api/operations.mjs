import { transitionSystemAlert } from './system-alert.mjs'

/** Existing private operational table, no new schema or external telemetry. */
export async function recordMaintenanceHeartbeat(db) {
  await db.query(`INSERT INTO gs_system_alerts(key,last_snapshot)
    VALUES('maintenance_heartbeat',jsonb_build_object('succeededAt',now()))
    ON CONFLICT(key) DO UPDATE SET last_snapshot=excluded.last_snapshot`)
}

export async function operationalSnapshot(db,now=Date.now()) {
  const started=performance.now()
  await db.query('SELECT 1')
  const latencyMs=Math.ceil(performance.now()-started)
  const row=(await db.query("SELECT last_snapshot FROM gs_system_alerts WHERE key='maintenance_heartbeat'")).rows[0]
  const stamp=row?.last_snapshot?.succeededAt
  const parsed=typeof stamp==='string'?Date.parse(stamp):NaN
  const ageSeconds=Number.isFinite(parsed)?Math.max(0,Math.floor((now-parsed)/1000)):null
  const queues=(await db.query(`SELECT
    (SELECT count(*)::integer FROM gs_copyright_ai_jobs WHERE completed_at IS NULL AND attempts>=3) AS copyright_stopped,
    (SELECT count(*)::integer FROM gs_nickname_reviews WHERE status='PENDING' AND attempts>=3) AS nickname_stopped,
    (SELECT count(*)::integer FROM gs_telegram_outbox WHERE delivered_at IS NULL AND attempts>=3) AS telegram_stopped,
    (SELECT count(*)::integer FROM gs_nickname_reviews WHERE status='REVIEW') AS nickname_human_review`)).rows[0]
  return {database:{status:'ok',latencyMs},maintenance:{status:ageSeconds===null?'unknown':ageSeconds>300?'stale':'ok',
    ageSeconds},backup:{status:'unknown',reason:'independent_backup_heartbeat_not_connected'},queues}
}

/** One outage/recovery event; messages never contain queue payloads or errors. */
export async function checkStoppedJobs(db) {
  const snapshot=await operationalSnapshot(db)
  const {copyright_stopped,nickname_stopped,telegram_stopped}=snapshot.queues
  await transitionSystemAlert(db,{key:'operations_jobs_stalled',
    active:copyright_stopped+nickname_stopped+telegram_stopped>0,
    snapshot:{copyrightStopped:copyright_stopped,nicknameStopped:nickname_stopped,telegramStopped:telegram_stopped},
    openedEvent:'operations.jobs_stalled',closedEvent:'operations.jobs_recovered',
    openedMessage:'GameScout: задания остановлены после лимита попыток',
    closedMessage:'GameScout: остановленных заданий больше нет'})
  return snapshot
}
