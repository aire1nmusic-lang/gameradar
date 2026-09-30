import { transitionSystemAlert } from './system-alert.mjs'

/** Existing private operational table, no new schema or external telemetry. */
export async function recordMaintenanceHeartbeat(db) {
  await db.query(`INSERT INTO gs_system_alerts(key,last_snapshot)
    VALUES('maintenance_heartbeat',jsonb_build_object('succeededAt',now()))
    ON CONFLICT(key) DO UPDATE SET last_snapshot=excluded.last_snapshot`)
}

/** Called only after Object Storage PUT and HEAD size/hash verification. */
export async function recordBackupUpload(db,bytes) {
  if(!Number.isSafeInteger(bytes)||bytes<=0)throw new Error('invalid_backup_size')
  await db.query(`INSERT INTO gs_system_alerts(key,last_snapshot)
    VALUES('backup_heartbeat',jsonb_build_object('uploadedAt',now(),'bytes',$1::bigint))
    ON CONFLICT(key) DO UPDATE SET last_snapshot=excluded.last_snapshot`,[bytes])
}

export async function operationalSnapshot(db,now=Date.now()) {
  const started=performance.now()
  await db.query('SELECT 1')
  const latencyMs=Math.ceil(performance.now()-started)
  const states=(await db.query("SELECT key,last_snapshot FROM gs_system_alerts WHERE key IN ('maintenance_heartbeat','backup_heartbeat')")).rows
  const row=states.find(row=>row.key==='maintenance_heartbeat')
  const stamp=row?.last_snapshot?.succeededAt
  const parsed=typeof stamp==='string'?Date.parse(stamp):NaN
  const ageSeconds=Number.isFinite(parsed)?Math.max(0,Math.floor((now-parsed)/1000)):null
  const backupStamp=states.find(row=>row.key==='backup_heartbeat')?.last_snapshot?.uploadedAt
  const backupTime=typeof backupStamp==='string'?Date.parse(backupStamp):NaN
  const backupAge=Number.isFinite(backupTime)?Math.max(0,Math.floor((now-backupTime)/1000)):null
  const queues=(await db.query(`SELECT
    (SELECT count(*)::integer FROM gs_copyright_ai_jobs WHERE completed_at IS NULL AND attempts>=3) AS copyright_stopped,
    (SELECT count(*)::integer FROM gs_nickname_reviews WHERE status='PENDING' AND attempts>=3) AS nickname_stopped,
    (SELECT count(*)::integer FROM gs_telegram_outbox WHERE delivered_at IS NULL AND attempts>=3) AS telegram_stopped,
    (SELECT count(*)::integer FROM gs_nickname_reviews WHERE status='REVIEW') AS nickname_human_review`)).rows[0]
  return {database:{status:'ok',latencyMs},maintenance:{status:ageSeconds===null?'unknown':ageSeconds>300?'stale':'ok',
    ageSeconds},backup:{status:backupAge===null?'unknown':backupAge>90000?'stale':'upload_verified',
      ageSeconds:backupAge,restoreStatus:'not_observed_by_heartbeat'},queues}
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
  if(snapshot.backup.status!=='unknown')await transitionSystemAlert(db,{key:'backup_upload_stale',
    active:snapshot.backup.status==='stale',snapshot:{ageSeconds:snapshot.backup.ageSeconds},
    openedEvent:'backup.upload_stale',closedEvent:'backup.upload_recovered',
    openedMessage:'GameScout: резервная копия давно не загружалась',
    closedMessage:'GameScout: загрузка резервной копии восстановлена'})
  return snapshot
}
