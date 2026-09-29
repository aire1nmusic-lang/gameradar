/** Read-only release gate: compare the crawlable build against the published public catalog. */
import { pathToFileURL } from 'node:url'
import { readFileSync } from 'node:fs'
import { publicPages, publicRecords, ORIGIN, GAME_SLUG } from './public-pages.mjs'

const value = input => String(input ?? '').trim()
const date = input => value(input).slice(0, 10)
const list = input => Array.isArray(input) ? input.map(value) : []

export function comparePublicCatalog(snapshot, published) {
  const issues = []
  const expected = new Map()
  const actual = new Map()
  for (const record of snapshot) {
    if (expected.has(record.slug)) issues.push(`duplicate snapshot slug: ${record.slug}`)
    expected.set(record.slug, record)
  }
  for (const row of published) {
    if (!row || !value(row.slug)) { issues.push('published card without slug'); continue }
    if (row.demo || !GAME_SLUG[row.gameId]) continue
    if (actual.has(row.slug)) issues.push(`duplicate published slug: ${row.slug}`)
    actual.set(row.slug, row)
  }
  for (const [slug, record] of expected) {
    const row = actual.get(slug)
    if (!row) { issues.push(`missing published card: ${slug}`); continue }
    const fields = [
      ['name', record.name, row.name],
      ['game', record.game, row.gameId],
      ['chronicle', record.chronicle, row.chronicleId],
      ['version', record.version, row.version],
      ['rates', record.rates, row.rates],
      ['modes', list(record.modes).join('|'), list(row.modes).join('|')],
      ['opening date', date(record.openedAt), date(row.openedAt)],
      ['region', record.region, row.region],
      ['country', record.country, row.country],
    ]
    for (const [field, build, live] of fields) {
      if (value(build) !== value(live)) issues.push(`stale ${slug} ${field}: build=${JSON.stringify(value(build))} published=${JSON.stringify(value(live))}`)
    }
  }
  for (const slug of actual.keys()) if (!expected.has(slug)) issues.push(`published card missing crawlable page: ${slug}`)
  return { expected: expected.size, published: actual.size, issues }
}

export async function fetchPublishedCatalog(base, fetchImpl = fetch) {
  const origin = new URL(base)
  if (origin.username || origin.password || origin.search || origin.hash || origin.pathname !== '/') throw new Error('Pass only the API origin, without credentials, path or query')
  const local = ['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname)
  if (origin.protocol !== 'https:' && !(local && origin.protocol === 'http:')) throw new Error('Public API must use HTTPS (loopback HTTP is allowed for local checks)')
  const items = []
  let total
  for (let offset = 0; ; offset += 100) {
    if (offset > 100000) throw new Error('Catalog exceeds API pagination limit')
    const url = new URL(`/api/v1/servers?limit=100&offset=${offset}`, origin)
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(15000), headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' } })
    if (!response.ok) throw new Error(`Catalog API returned HTTP ${response.status} at offset ${offset}`)
    const page = await response.json()
    if (!Array.isArray(page.items) || !Number.isSafeInteger(page.total) || page.total < 0 || page.offset !== offset || page.limit !== 100) throw new Error(`Invalid catalog page at offset ${offset}`)
    if (total !== undefined && total !== page.total) throw new Error('Catalog count changed during reconciliation; retry')
    total = page.total
    items.push(...page.items)
    if (items.length >= total) break
    if (page.items.length !== 100) throw new Error(`Incomplete catalog page at offset ${offset}`)
  }
  if (items.length !== total) throw new Error('Catalog count mismatch; retry')
  return items
}

export function checkBuild(snapshot = publicRecords(), pages = publicPages(snapshot)) {
  const issues = []
  const xml = readFileSync('public/sitemap.xml', 'utf8')
  for (const page of pages) {
    const path = page.path === '/' ? 'dist/index.html' : `dist${page.path}/index.html`
    let html
    try { html = readFileSync(path, 'utf8') } catch { issues.push(`missing build page: ${path}`); continue }
    if (!html.includes(`<link rel="canonical" href="${ORIGIN + page.path}"`)) issues.push(`wrong canonical: ${page.path}`)
    if (!html.includes(`<title>${page.title.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</title>`)) issues.push(`stale title: ${page.path}`)
    if (!xml.includes(`<loc>${ORIGIN + page.path}</loc>`)) issues.push(`missing sitemap URL: ${page.path}`)
  }
  return issues
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const base = process.argv[2]
  if (!base) { console.error('Usage: npm run seo:reconcile -- https://PUBLIC_API_ORIGIN'); process.exitCode = 2 }
  else {
    try {
      const snapshot = publicRecords()
      const buildIssues = checkBuild(snapshot)
      const published = await fetchPublishedCatalog(base)
      const result = comparePublicCatalog(snapshot, published)
      const issues = [...buildIssues, ...result.issues]
      console.log(`SEO reconciliation: ${result.expected} build cards, ${result.published} published non-demo cards; ${issues.length} issue(s)`)
      for (const issue of issues.slice(0, 30)) console.error(`- ${issue}`)
      if (issues.length > 30) console.error(`- ... ${issues.length - 30} more`)
      if (issues.length) process.exitCode = 1
    } catch (error) { console.error(`SEO reconciliation failed: ${error.message}`); process.exitCode = 1 }
  }
}
