// Records a read-only snapshot of the public API for a static preview build (VITE_SNAPSHOT=1, see src/preview/snapshotFetch.ts).
// usage: node scripts/preview-snapshot.mjs <outDir> [origin=https://gamescout.online]
import { mkdirSync, writeFileSync } from 'node:fs'

const [out, origin = 'https://gamescout.online'] = process.argv.slice(2)
if (!out) throw new Error('usage: node scripts/preview-snapshot.mjs <outDir> [origin]')
mkdirSync(out, { recursive: true })
const key = (pathname, search) => (pathname.replace(/^\/api\/v1\//, '') + (search ? `__${search.slice(1)}` : '')).replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 180)
const get = async path => {
  const response = await fetch(origin + path, { headers: { accept: 'application/json' } })
  if (!response.ok) throw new Error(`${path}: ${response.status}`)
  return response.json()
}
const save = (path, body) => { const u = new URL(path, origin); writeFileSync(`${out}/${key(u.pathname, u.search)}.json`, JSON.stringify(body)) }

const all = []
for (let offset = 0; ; offset += 100) {
  const page = await get(`/api/v1/servers?limit=100&offset=${offset}`)
  all.push(...page.items)
  if (!page.items.length || all.length >= page.total) break
}
writeFileSync(`${out}/_all-servers.json`, JSON.stringify(all))
for (const path of ['/api/v1/games', '/api/v1/auth/me', '/api/v1/people-rating?limit=100&offset=0', '/api/v1/people-rating?limit=100&offset=100',
  '/api/v1/support/ranking?limit=100&offset=0', '/api/v1/support/ranking?limit=100&offset=100']) save(path, await get(path))
// One detail card per server of the live worlds (detail carries openedAt and the full description).
const live = all.filter(s => ['lineage2', 'minecraft', 'gtarp'].includes(s.gameId))
for (const s of live) save(`/api/v1/servers/${encodeURIComponent(s.slug)}`, await get(`/api/v1/servers/${encodeURIComponent(s.slug)}`))
writeFileSync(`${out}/_snapshot.json`, JSON.stringify({ at: new Date().toISOString(), origin, servers: all.length, details: live.length }))
console.log(`snapshot: ${all.length} servers, ${live.length} detail cards → ${out}`)
