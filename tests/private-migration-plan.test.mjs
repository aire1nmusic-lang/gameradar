import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { migrate, migrationPlan, migrations } from '../private-api/db.mjs'
import { requireApprovedPlan } from '../private-api/migrate-cli.mjs'

const store=pg=>({query:(sql,args=[])=>pg.query(sql,args),transaction:fn=>pg.transaction(fn)})

test('read-only plan fingerprints every pending migration and apply is explicit',async()=>{
  const pg=new PGlite(),db=store(pg)
  try {
    const before=await migrationPlan(db)
    assert.equal(before.applied.length,0)
    assert.equal(before.pending.length,migrations.length)
    assert.match(before.pendingHash,/^[a-f0-9]{64}$/)
    assert.equal((await pg.query("SELECT to_regclass('gs_migrations') AS name")).rows[0].name,null)
    assert.throws(()=>requireApprovedPlan(before,'bad','snapshot-2026-09-28'),/expected_migration_hash/)
    assert.throws(()=>requireApprovedPlan(before,before.pendingHash,''),/verified_backup/)
    requireApprovedPlan(before,before.pendingHash,'verified-snapshot-2026-09-28')
    await assert.rejects(migrate(db,{expectedPendingHash:'0'.repeat(64)}),/migration_plan_changed/)
    assert.equal((await pg.query("SELECT to_regclass('gs_migrations') AS name")).rows[0].name,null)
    await migrate(db,{expectedPendingHash:before.pendingHash})
    const after=await migrationPlan(db)
    assert.deepEqual(after.applied,migrations.map(([version])=>version))
    assert.equal(after.pending.length,0)
    await migrate(db)
    assert.deepEqual((await migrationPlan(db)).applied,after.applied)
  } finally { await pg.close() }
})

test('unknown or non-prefix migration history stops planning',async()=>{
  const pg=new PGlite(),db=store(pg)
  try {
    await pg.query('CREATE TABLE gs_migrations(version integer PRIMARY KEY)')
    await pg.query('INSERT INTO gs_migrations(version) VALUES (2)')
    await assert.rejects(migrationPlan(db),/migration_history_drift/)
    await assert.rejects(migrate(db),/migration_history_drift/)
  } finally { await pg.close() }
})

test('upgrade from 20 preserves existing Support, ledger, balance and public outbox',async()=>{
  const pg=new PGlite(),db=store(pg)
  try {
    await pg.exec('CREATE TABLE gs_migrations(version integer PRIMARY KEY)')
    for(const [version,name] of migrations.filter(([version])=>version<=20)) {
      await pg.exec(await readFile(new URL(`../private-api/migrations/${String(version).padStart(3,'0')}_${name}.sql`,import.meta.url),'utf8'))
      await pg.query('INSERT INTO gs_migrations(version) VALUES($1)',[version])
    }
    await pg.query("INSERT INTO gs_users(id,display_name) VALUES('migration-player','Player')")
    await pg.query("INSERT INTO gs_server_registry(server_id,game_id,name,slug) VALUES('migration-l2','lineage2','L2','migration-l2')")
    await pg.query("INSERT INTO gs_coin_accounts(user_id,balance) VALUES('migration-player',0)")
    await pg.query(`INSERT INTO gs_coin_ledger(id,user_id,kind,delta,related_id,idempotency_key)
      VALUES('migration-credit','migration-player','ADJUSTMENT',5,NULL,'migration-credit'),
      ('migration-debit','migration-player','SUPPORT',-5,'migration-support','migration-debit')`)
    await pg.query(`INSERT INTO gs_support(id,server_id,user_id,ledger_id,coins,anonymous,public_nick,nickname_decision,idempotency_key)
      VALUES('migration-support','migration-l2','migration-player','migration-debit',5,true,'Анонимно','ANONYMOUS','migration-support')`)
    await pg.query(`INSERT INTO gs_public_outbox(server_id,version,payload) VALUES('migration-l2',1,'{"supportCoins":5}')`)
    const plan=await migrationPlan(db)
    assert.deepEqual(plan.pending.map(row=>row.version),[21])
    await migrate(db,{expectedPendingHash:plan.pendingHash})
    assert.equal((await pg.query('SELECT sum(coins)::integer n FROM gs_active_support')).rows[0].n,5)
    assert.equal((await pg.query('SELECT count(*)::integer n FROM gs_coin_ledger')).rows[0].n,2)
    assert.equal((await pg.query('SELECT balance FROM gs_coin_accounts')).rows[0].balance,0)
    assert.equal((await pg.query('SELECT count(*)::integer n FROM gs_public_outbox')).rows[0].n,1)
    assert.equal((await pg.query("SELECT count(*)::integer n FROM gs_role_permissions WHERE permission='support.refund' AND role='ADMIN'")).rows[0].n,1)
  } finally {await pg.close()}
})
