import { outboxHealth } from './outbox.mjs'
import { transitionSystemAlert } from './system-alert.mjs'

/** One alert per outage, one recovery message. No private row payload enters Telegram. */
export async function checkProjectionLag(db,thresholdSeconds=300) {
  if(!Number.isInteger(thresholdSeconds)||thresholdSeconds<60||thresholdSeconds>3600) throw new Error('invalid_projection_threshold')
  const health=await outboxHealth(db)
  const delayed=health.pending>0&&(health.oldest_seconds>=thresholdSeconds||health.max_attempts>=3)
  const changed=await transitionSystemAlert(db,{
    key:'public_projection_lag',active:delayed,
    snapshot:{pending:health.pending,oldestSeconds:health.oldest_seconds,maxAttempts:health.max_attempts,thresholdSeconds},
    openedEvent:'projection.lag',closedEvent:'projection.recovered',
    openedMessage:`GameScout: задержка публичной проекции\nОжидают: ${health.pending}\nСтарейшее событие: ${health.oldest_seconds} с\nПопыток: ${health.max_attempts}`,
    closedMessage:'GameScout: публичная проекция восстановлена',
  })
  return {changed,active:delayed,health}
}
