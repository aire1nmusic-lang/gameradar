/**
 * Bounded cleanup for short-lived authentication and abuse-prevention rows.
 * Business records, votes, claims, audit, payments and ledger are deliberately
 * outside this function.
 */
export async function cleanupTransientData(db) {
  const result=await db.query(`WITH due AS (
    INSERT INTO gs_maintenance_schedule(key,next_at)
    VALUES('transient_retention',now()+interval '1 hour')
    ON CONFLICT(key) DO UPDATE SET next_at=now()+interval '1 hour'
      WHERE gs_maintenance_schedule.next_at<=now()
    RETURNING 1
  ), expired_sessions AS (
    DELETE FROM gs_sessions WHERE expires_at<=now() AND EXISTS(SELECT 1 FROM due) RETURNING 1
  ), expired_tokens AS (
    DELETE FROM gs_tokens WHERE expires_at<=now() AND EXISTS(SELECT 1 FROM due) RETURNING 1
  ), expired_oauth AS (
    DELETE FROM gs_oauth_states WHERE expires_at<=now() AND EXISTS(SELECT 1 FROM due) RETURNING 1
  ), old_limits AS (
    DELETE FROM gs_rate_limits
      WHERE bucket_window < floor(extract(epoch from now())/900)-96
        AND EXISTS(SELECT 1 FROM due) RETURNING 1
  ) SELECT EXISTS(SELECT 1 FROM due) AS ran,
    (SELECT count(*)::integer FROM expired_sessions) AS sessions,
    (SELECT count(*)::integer FROM expired_tokens) AS tokens,
    (SELECT count(*)::integer FROM expired_oauth) AS oauth_states,
    (SELECT count(*)::integer FROM old_limits) AS rate_limits`)
  return result.rows[0]
}
