// Explicit local-only import of public cards; no claims, user ids or credentials.
import { PGlite } from '@electric-sql/pglite'
import { migrate } from './db.mjs'
const pg=new PGlite('output/private-core/db')
const db={query:(sql,args=[])=>pg.query(sql,args),transaction:fn=>pg.transaction(fn)}
await migrate(db)
const base=process.env.CATALOG_URL??'http://127.0.0.1:8787'
let offset=0, imported=0
try {
  for (;;) {
    const r=await fetch(`${base}/api/v1/servers?limit=100&offset=${offset}`,{signal:AbortSignal.timeout(15000)})
    if (!r.ok) throw new Error(`catalog_${r.status}`)
    const page=await r.json()
    for(const s of page.items) {
      if (!['lineage2','minecraft','gtarp'].includes(s.gameId)) continue
      await db.query(`INSERT INTO gs_server_registry(server_id,game_id,name,slug,website) VALUES($1,$2,$3,$4,$5)
        ON CONFLICT(server_id) DO UPDATE SET name=excluded.name,slug=excluded.slug,website=excluded.website`,[s.id,s.gameId,s.name,s.slug,s.links?.site??null])
      imported++
    }
    offset+=page.items.length
    if (!page.items.length || offset>=page.total) break
  }
  console.log(`Imported ${imported} public cards into LOCAL registry`)
} finally { await pg.close() }
