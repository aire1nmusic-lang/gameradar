import assert from 'node:assert/strict'
import test from 'node:test'
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
