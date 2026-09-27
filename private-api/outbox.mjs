import { token, unseal } from './crypto.mjs'

// At-least-once delivery. A lost ACK causes the same version to be resent.
// Leases prevent parallel workers acknowledging somebody else's newer attempt.
export async function dispatch(db, kind, deliver, mailKey) {
  if (!['public','mail'].includes(kind)) throw new Error('invalid_outbox')
  const table = kind === 'public' ? 'gs_public_outbox' : 'gs_mail_outbox'
  const lease = token()
  const row = await db.transaction(async tx => (await tx.query(`UPDATE ${table} SET
    lease_until=now()+interval '30 seconds', lease_token=$1, attempts=attempts+1
    WHERE id=(SELECT id FROM ${table} WHERE delivered_at IS NULL AND available_at<=now()
      AND (lease_until IS NULL OR lease_until<now()) ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1)
    RETURNING *`, [lease])).rows[0])
  if (!row) return false
  try {
    const payload = kind === 'public' ? row.payload : unseal(mailKey, row.ciphertext)
    await deliver(payload, String(row.id))
    await db.query(`UPDATE ${table} SET delivered_at=now(), lease_until=NULL, last_error=NULL${kind === 'mail' ? ",ciphertext=''" : ''}
      WHERE id=$1 AND lease_token=$2`, [row.id,lease])
  } catch {
    const seconds = Math.min(3600, 2 ** Math.min(row.attempts, 11))
    await db.query(`UPDATE ${table} SET available_at=now()+($1*interval '1 second'),lease_until=NULL,last_error='delivery_failed'
      WHERE id=$2 AND lease_token=$3`, [seconds,row.id,lease])
  }
  return true
}
export async function outboxHealth(db) {
  return (await db.query(`SELECT count(*)::integer AS pending,
    COALESCE(EXTRACT(EPOCH FROM now()-min(created_at)),0)::integer AS oldest_seconds,
    COALESCE(max(attempts),0)::integer AS max_attempts
    FROM gs_public_outbox WHERE delivered_at IS NULL`)).rows[0]
}
