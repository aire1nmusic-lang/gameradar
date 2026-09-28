import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import pg from 'pg'

export const migrations = [[1,'identity'],[2,'votes'],[3,'vote_risk'],[4,'coins'],[5,'test_payments'],[6,'admin_roles'],
  [7,'nickname_review'],[8,'copyright'],[9,'projection_alerts'],[10,'owner_summary'],[11,'owner_facts'],
  [12,'owner_modes_country'],[13,'user_moderation'],[14,'maintenance_schedule']]

export async function migrationPlan(db) {
  let applied=[]
  try { applied=(await db.query('SELECT version FROM gs_migrations ORDER BY version')).rows.map(row=>Number(row.version)) }
  catch(error) { if(error.code!=='42P01') throw error }
  if(applied.some((version,index)=>version!==migrations[index]?.[0])) throw new Error('migration_history_drift')
  const files=await Promise.all(migrations.map(async([version,name])=>{
    const file=`${String(version).padStart(3,'0')}_${name}.sql`
    const source=await readFile(new URL(`./migrations/${file}`,import.meta.url))
    return {version,name,file,sha256:createHash('sha256').update(source).digest('hex')}
  }))
  const pending=files.slice(applied.length)
  const pendingHash=createHash('sha256').update(pending.map(row=>`${row.version}:${row.sha256}`).join('\n')).digest('hex')
  return {applied,pending,pendingHash}
}

export function postgresStore(connectionString, ca) {
  const pool = new pg.Pool({ connectionString, max: 5, connectionTimeoutMillis: 5000,
    ssl: ca ? { ca, rejectUnauthorized: true } : undefined })
  return {
    query: (sql, params = []) => pool.query(sql, params),
    async transaction(fn) {
      const client = await pool.connect()
      try { await client.query('BEGIN'); const result = await fn(client); await client.query('COMMIT'); return result }
      catch (error) { await client.query('ROLLBACK'); throw error }
      finally { client.release() }
    },
    close: () => pool.end(),
  }
}

export async function migrate(db,{expectedPendingHash}={}) {
  await db.transaction(async tx => {
    // Serialize startup migrations across replicas without runtime schema edits elsewhere.
    await tx.query('SELECT pg_advisory_xact_lock(19770927)')
    await tx.query('CREATE TABLE IF NOT EXISTS gs_migrations(version integer PRIMARY KEY, applied_at timestamptz DEFAULT now())')
    const plan=await migrationPlan(tx)
    if(expectedPendingHash && plan.pendingHash!==expectedPendingHash) throw new Error('migration_plan_changed')
    for (const {version,file} of plan.pending) {
      const schema=await readFile(new URL(`./migrations/${file}`, import.meta.url), 'utf8')
      if (tx.exec) await tx.exec(schema)
      else await tx.query(schema)
      await tx.query('INSERT INTO gs_migrations(version) VALUES($1)',[version])
    }
  })
}
