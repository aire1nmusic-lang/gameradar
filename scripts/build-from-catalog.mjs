/** Explicit build from the public D1 catalog, followed by a second live reconciliation. */
import { mkdirSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { fetchPublishedCatalog } from './reconcile-public-html.mjs'
import { GAME_SLUG } from './public-pages.mjs'

export function captureRecords(rows) {
  const seen = new Set()
  const records = []
  for (const row of rows) {
    if (row.demo) continue
    const safeSlug = slug => typeof slug === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)
    if (row.moderation !== 'PUBLISHED' || !GAME_SLUG[row.gameId] || !safeSlug(row.slug) || (row.chronicleId && !safeSlug(row.chronicleId)) || !String(row.name ?? '').trim() || !Array.isArray(row.modes) || seen.has(row.slug)) throw new Error(`Invalid published catalog card: ${String(row.slug ?? '(no slug)').slice(0, 80)}`)
    seen.add(row.slug)
    // Deliberate allowlist: no owner, links, votes, Coins, online, or private fields.
    records.push({ slug: row.slug, game: row.gameId, name: row.name, chronicle: row.chronicleId || null, version: row.version || null, modes: row.modes, rates: row.rates || null, openedAt: row.openedAt || null, region: row.region || null, country: row.country || null, checkedAt: row.updatedAt || null })
  }
  if (!records.length) throw new Error('No published non-demo cards; refusing an empty indexable build')
  return records
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const origin = process.argv[2]
  if (!origin) { console.error('Usage: npm run build:catalog -- https://PUBLIC_API_ORIGIN/'); process.exit(2) }
  try {
    const records = captureRecords(await fetchPublishedCatalog(origin))
    mkdirSync('output', { recursive: true })
    const file = 'output/seo-public-snapshot.json'
    writeFileSync(file, JSON.stringify({ capturedAt: new Date().toISOString(), records }, null, 2))
    const env = { ...process.env, GS_SEO_SNAPSHOT_FILE: file }
    const npmCli = process.env.npm_execpath
    if (!npmCli) throw new Error('Run through npm run build:catalog')
    for (const args of [['run', 'build'], ['run', 'test:seo'], ['run', 'seo:reconcile', '--', origin]]) {
      const run = spawnSync(process.execPath, [npmCli, ...args], { env, stdio: 'inherit' })
      if (run.error) throw run.error
      if (run.status !== 0) process.exit(run.status ?? 1)
    }
    console.log(`Public catalog build verified: ${records.length} cards`)
  } catch (error) { console.error(`Public catalog build blocked: ${error.message}`); process.exitCode = 1 }
}
