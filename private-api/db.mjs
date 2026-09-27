import { readFile } from 'node:fs/promises'
import pg from 'pg'

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

export async function migrate(db) {
  await db.transaction(async tx => {
    // Serialize startup migrations across replicas without runtime schema edits elsewhere.
    await tx.query('SELECT pg_advisory_xact_lock(19770927)')
    await tx.query('CREATE TABLE IF NOT EXISTS gs_migrations(version integer PRIMARY KEY, applied_at timestamptz DEFAULT now())')
    for (const [version,name] of [[1,'identity'],[2,'votes'],[3,'vote_risk'],[4,'coins'],[5,'test_payments'],[6,'admin_roles'],[7,'nickname_review']]) {
      if ((await tx.query('SELECT version FROM gs_migrations WHERE version=$1',[version])).rows.length) continue
      const schema=await readFile(new URL(`./migrations/${String(version).padStart(3,'0')}_${name}.sql`, import.meta.url), 'utf8')
      if (tx.exec) await tx.exec(schema)
      else await tx.query(schema)
      await tx.query('INSERT INTO gs_migrations(version) VALUES($1)',[version])
    }
  })
}
