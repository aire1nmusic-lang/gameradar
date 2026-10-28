import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'

/**
 * Minimal Cloudflare D1 stand-in on node:sqlite (same SQLite engine family) for local contract tests:
 * prepare().bind().first()/all()/run() and an atomic batch(). Not a substitute for a real D1 check.
 */
export function sqliteD1(migrations = []) {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec('PRAGMA foreign_keys = ON')
  for (const file of migrations) sqlite.exec(readFileSync(file, 'utf8'))
  const statement = (sql, args = []) => ({
    sql, args,
    bind: (...values) => statement(sql, values),
    first: async () => sqlite.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: sqlite.prepare(sql).all(...args) }),
    run: async () => { const info = sqlite.prepare(sql).run(...args); return { meta: { changes: Number(info.changes) } } },
  })
  return {
    sqlite,
    prepare: sql => statement(sql),
    async batch(list) {
      sqlite.exec('BEGIN')
      try {
        const out = list.map(s => ({ meta: { changes: Number(sqlite.prepare(s.sql).run(...s.args).changes) } }))
        sqlite.exec('COMMIT')
        return out
      } catch (error) { sqlite.exec('ROLLBACK'); throw error }
    },
  }
}
