import { transitionSystemAlert } from './system-alert.mjs'

// One SQL statement sees one committed snapshot: concurrent valid writes cannot
// manufacture a mismatch between the wallet and its immutable ledger.
export async function coinIntegrity(db) {
  const result=(await db.query(`WITH balances AS (
    SELECT user_id,sum(delta) total FROM gs_coin_ledger GROUP BY user_id
  ), issues AS (
    SELECT 'balance' category,COALESCE(a.user_id,b.user_id) ref
    FROM gs_coin_accounts a FULL JOIN balances b USING(user_id)
    WHERE a.user_id IS NULL OR a.balance<>COALESCE(b.total,0)
    UNION ALL SELECT 'support',s.id FROM gs_support s LEFT JOIN gs_coin_ledger l ON l.id=s.ledger_id
    WHERE l.id IS NULL OR l.kind<>'SUPPORT' OR l.delta<>-s.coins OR l.user_id<>s.user_id OR l.related_id IS DISTINCT FROM s.id
    UNION ALL SELECT 'orphan_support',l.id FROM gs_coin_ledger l
    WHERE l.kind='SUPPORT' AND NOT EXISTS(SELECT 1 FROM gs_support s WHERE s.ledger_id=l.id)
    UNION ALL SELECT 'refund',r.support_id FROM gs_support_refunds r JOIN gs_support s ON s.id=r.support_id
    LEFT JOIN gs_coin_ledger l ON l.id=r.ledger_id
    WHERE l.id IS NULL OR l.kind<>'REFUND' OR l.delta<>s.coins OR l.user_id<>s.user_id OR l.related_id IS DISTINCT FROM s.id
    UNION ALL SELECT 'orphan_refund',l.id FROM gs_coin_ledger l
    WHERE l.kind='REFUND' AND l.details->>'source'='support-correction'
    AND NOT EXISTS(SELECT 1 FROM gs_support_refunds r WHERE r.ledger_id=l.id)
    UNION ALL SELECT 'payment',p.id::text FROM gs_test_payments p LEFT JOIN gs_coin_ledger l ON l.id=p.ledger_id
    WHERE p.status='TEST_PAID' AND (l.id IS NULL OR l.kind<>'PURCHASE' OR l.delta<>p.coins
      OR l.user_id<>p.user_id OR l.related_id IS DISTINCT FROM p.id::text OR p.amount_kopecks<>p.coins*5000)
    UNION ALL SELECT 'orphan_purchase',l.id FROM gs_coin_ledger l WHERE l.kind='PURCHASE'
    AND NOT EXISTS(SELECT 1 FROM gs_test_payments p WHERE p.ledger_id=l.id AND p.status='TEST_PAID')
    UNION ALL SELECT 'grant_audit',l.id FROM gs_coin_ledger l WHERE l.details->>'source'='admin-promo'
    AND NOT EXISTS(SELECT 1 FROM gs_audit a WHERE a.action='coins.granted' AND a.target=l.user_id
      AND a.actor_id::text=l.details->>'actorId' AND a.details->>'ledgerId'=l.id
      AND a.details->>'coins'=l.delta::text)
  ) SELECT (SELECT count(*)::int FROM issues) total,
    COALESCE((SELECT jsonb_object_agg(category,n) FROM (SELECT category,count(*)::int n FROM issues GROUP BY category) x),'{}'::jsonb) counts,
    COALESCE((SELECT jsonb_agg(x) FROM (SELECT category,ref FROM issues ORDER BY category,ref LIMIT 100) x),'[]'::jsonb) samples,
    now() checked_at`)).rows[0]
  return {status:result.total?'REVIEW':'OK',total:result.total,counts:result.counts,samples:result.samples,checkedAt:result.checked_at}
}

export async function checkCoins(db) {
  await db.query(`INSERT INTO gs_maintenance_schedule(key,next_at) VALUES('coins_integrity',now()) ON CONFLICT DO NOTHING`)
  const due=(await db.query(`UPDATE gs_maintenance_schedule SET next_at=now()+interval '5 minutes'
    WHERE key='coins_integrity' AND next_at<=now() RETURNING key`)).rows.length
  if(!due)return false
  const report=await coinIntegrity(db)
  // IDs and investigation samples stay private. Only bounded category counts
  // can be supplied to a future event-driven AI; no model call here.
  const snapshot={status:report.status,total:report.total,counts:report.counts,checkedAt:report.checkedAt}
  await transitionSystemAlert(db,{key:'coins_integrity',active:report.total>0,snapshot,
    openedEvent:'coins.integrity_failed',closedEvent:'coins.integrity_recovered',
    openedMessage:'Coins требуют сверки',closedMessage:'Сверка Coins восстановлена'})
  await db.query(`UPDATE gs_system_alerts SET last_snapshot=$1 WHERE key='coins_integrity'`,[JSON.stringify(snapshot)])
  return true
}
