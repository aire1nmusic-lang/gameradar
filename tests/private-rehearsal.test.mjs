import test from 'node:test'
import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {PGlite} from '@electric-sql/pglite'
import {migrate} from '../private-api/db.mjs'
import {rehearseCoreScenarios} from '../private-api/rehearsal-scenarios.mjs'
import {rehearseVoteRisk} from '../private-api/vote-risk-rehearsal.mjs'

test('PostgreSQL rehearsal refuses to load credentials or connect without explicit opt-in',()=>{
  const env={...process.env,PRIVATE_REHEARSAL:'0',DATABASE_URL:'deliberately-not-a-database-url'}
  const result=spawnSync(process.execPath,['private-api/rehearse-core.mjs'],{cwd:new URL('..',import.meta.url),env,encoding:'utf8',timeout:10000})
  assert.equal(result.status,1)
  assert.match(result.stderr,/explicit_private_rehearsal_required/)
  assert.doesNotMatch(result.stderr,/PostgreSQL_URL|DATABASE_URL_and|ECONN/)
})

test('same isolated acceptance journey exercises proof, recovery, test payments, moderation and financial invariants',async t=>{
  const pg=new PGlite(),db={query:(sql,args=[])=>pg.query(sql,args),transaction:fn=>pg.transaction(fn)}
  t.after(()=>pg.close())
  await migrate(db)
  // Every provider interaction must remain absent, including any accidental new fetch path.
  const fetchSpy=t.mock.method(globalThis,'fetch',async()=>assert.fail('External fetch forbidden in isolated rehearsal'))
  const result=await rehearseCoreScenarios(db)
  assert.deepEqual(result,{games:3,claims:3,manualProofs:3,missingProofRejected:3,ownerSummaries:3,ownerFacts:3,
    passwordReset:true,sessionRevocation:true,copyrightRestricted:3,copyrightRestored:3,
    votes:3,support:4,refunds:4,syntheticTestPurchases:1,concurrentPaymentCallbacks:2,
    concurrentSpend:'one accepted',concurrentRefund:'one accepted',catalogFixtureReads:3,
    externalMail:false,externalPayments:false,externalCatalog:false,externalAI:false,externalTelegram:false,
    productionDataChanged:false})
  assert.equal(fetchSpy.mock.callCount(),0)
  assert.equal(Number((await db.query('SELECT count(*) n FROM gs_claim_proofs WHERE consumed_at IS NOT NULL')).rows[0].n),3)
  assert.equal(Number((await db.query("SELECT count(*) n FROM gs_audit WHERE action='copyright.restore'")).rows[0].n),3)
  await assert.rejects(()=>rehearseCoreScenarios(db),/empty disposable database/)
})

test('concurrent shared IP, device and ASN signals require recheck before accepting another vote',async t=>{
  const pg=new PGlite(),db={query:(sql,args=[])=>pg.query(sql,args),transaction:fn=>pg.transaction(fn)}
  t.after(()=>pg.close());await migrate(db)
  const result=await rehearseVoteRisk(db)
  assert.deepEqual(result.map(row=>row.kind),['ip','device','asn'])
  assert.ok(result.every(row=>row.concurrentUncheckedAccepted===1&&row.challenged===1&&row.verifiedChallengeAccepted===1&&row.replay))
  assert.deepEqual(result[0].idempotencyConflict,[201,409]);assert.equal(result[0].unknownIngressChallenged,true)
})
