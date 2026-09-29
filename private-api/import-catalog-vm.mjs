// One-off, explicit import of the PUBLIC catalog cards (id, game, name, slug, site) into the private
// PostgreSQL registry, so Claims, owner tools and votes have servers to attach to.
// No users, credentials or private rows are read. Run inside the api container:
//   node private-api/import-catalog-vm.mjs           (dry run: counts only)
//   node private-api/import-catalog-vm.mjs --apply   (writes)
import { readFile } from 'node:fs/promises'
import { postgresStore } from './db.mjs'

const GAMES=['lineage2','minecraft','gtarp']
const { DATABASE_URL, PG_CA_FILE }=process.env
const base=process.env.CATALOG_URL??'https://gamescout.online'
if(!DATABASE_URL||!PG_CA_FILE)throw new Error('DATABASE_URL and PG_CA_FILE are required')
if(!/^https:\/\/[a-z0-9.-]+$/.test(base))throw new Error('CATALOG_URL must be an https origin')
const apply=process.argv.includes('--apply')

const cards=[]
for(let offset=0;;) {
  const response=await fetch(`${base}/api/v1/servers?limit=100&offset=${offset}`,{signal:AbortSignal.timeout(20000)})
  if(!response.ok)throw new Error(`catalog_${response.status}`)
  const page=await response.json()
  for(const card of page.items)if(GAMES.includes(card.gameId)&&card.id&&card.name&&card.slug)cards.push(card)
  offset+=page.items.length
  if(!page.items.length||offset>=page.total)break
}
const perGame=Object.fromEntries(GAMES.map(game=>[game,cards.filter(card=>card.gameId===game).length]))
console.log(JSON.stringify({mode:apply?'apply':'dry-run',source:base,cards:cards.length,perGame}))
if(!apply)console.log('Nothing written. Add --apply to import.')
else {
const db=postgresStore(DATABASE_URL,await readFile(PG_CA_FILE,'utf8'))
try {
  const before=Number((await db.query('SELECT count(*) AS n FROM gs_server_registry')).rows[0].n)
  await db.transaction(async tx=>{
    for(const card of cards) {
      // A card that an owner already claimed keeps its owner; only public name, slug and site are refreshed.
      await tx.query(`INSERT INTO gs_server_registry(server_id,game_id,name,slug,website) VALUES($1,$2,$3,$4,$5)
        ON CONFLICT(server_id) DO UPDATE SET name=excluded.name,slug=excluded.slug,website=excluded.website`,
        [card.id,card.gameId,card.name,card.slug,card.links?.site||null])
    }
  })
  const after=Number((await db.query('SELECT count(*) AS n FROM gs_server_registry')).rows[0].n)
  console.log(JSON.stringify({ok:true,before,after,imported:cards.length}))
} finally { await db.close() }
}
