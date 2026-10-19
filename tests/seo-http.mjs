import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { publicPages, publicRecords, ORIGIN, escapeHtml } from '../scripts/public-pages.mjs'

const pages = publicPages()
const xml = readFileSync('public/sitemap.xml', 'utf8')
const html = value => readFileSync(value === '/' ? 'dist/index.html' : `dist${value}/index.html`, 'utf8')
const extract = (source, pattern) => source.match(pattern)?.[1] ?? ''
const noindexPaths = ['/rating', '/openings', '/account', '/admin', '/dashboard', '/add-server', '/favorites', '/boost', '/states', '/design']
function checkStructuredData(source, page) {
  const blocks = [...source.matchAll(/<script\b[^>]*\btype=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
  assert.ok(blocks.length, `${page.path}: JSON-LD is present in initial HTTP HTML`)
  const objects = blocks.flatMap(([, text]) => {
    let parsed
    try { parsed = JSON.parse(text) } catch { assert.fail(`${page.path}: invalid JSON-LD`) }
    return Array.isArray(parsed) ? parsed : [parsed]
  })
  const webpage = objects.find(value => value?.['@type'] === 'WebPage')
  assert.ok(webpage, `${page.path}: WebPage JSON-LD`)
  assert.equal(webpage['@context'], 'https://schema.org', `${page.path}: JSON-LD context`)
  assert.equal(webpage.url, ORIGIN + page.path, `${page.path}: JSON-LD canonical URL`)
  assert.equal(webpage.name, page.title, `${page.path}: JSON-LD title`)
  assert.equal(webpage.inLanguage, 'ru', `${page.path}: JSON-LD language`)
}
function checkPublicHtml(source, page) {
  assert.equal(extract(source, /<title>([^<]+)<\/title>/), escapeHtml(page.title), `${page.path}: title`)
  assert.equal(extract(source, /<meta name="description" content="([^"]+)"/), escapeHtml(page.description), `${page.path}: description`)
  assert.equal(extract(source, /<link rel="canonical" href="([^"]+)"/), ORIGIN + page.path, `${page.path}: canonical`)
  assert.equal(extract(source, /<meta name="robots" content="([^"]+)"/), 'index, follow', `${page.path}: robots`)
  assert.equal((source.match(/<link\b[^>]*rel=["']canonical["']/g) ?? []).length, 1, `${page.path}: single canonical`)
  assert.match(source, /<h1>/, `${page.path}: visible initial content`)
  checkStructuredData(source, page)
}
function checkNoindexHtml(source, path) {
  assert.equal(extract(source, /<meta name="robots" content="([^"]+)"/), 'noindex, nofollow', `${path}: robots`)
  assert.ok(!/rel=["']canonical["']/.test(source), `${path}: no indexable canonical`)
  assert.match(source, /<h1>/, `${path}: visible initial content`)
}
assert.equal(new Set(pages.map(page => page.path)).size, pages.length, 'public paths must be unique')
for (const page of pages) {
  const body = html(page.path)
  checkPublicHtml(body, page)
  assert.ok(xml.includes(`<loc>${ORIGIN + page.path}</loc>`), page.path)
}
for (const path of noindexPaths) {
  const body = html(path)
  checkNoindexHtml(body, path)
  assert.ok(!xml.includes(`<loc>${ORIGIN + path}</loc>`), path)
}
assert.match(html('/catalog'), /Онлайн не указан/)
assert.ok(!html('/catalog').includes('https://example.com'))
const missing = readFileSync('dist/404.html', 'utf8')
checkNoindexHtml(missing, '/404.html')
assert.match(missing, /Страница не найдена/)

const base = process.env.SEO_BASE_URL
if (base) {
  const profiles = ['lineage2','minecraft','gtarp'].map(game => {
    const record = publicRecords().find(row => row.game === game)
    assert.ok(record, `${game}: server snapshot required`)
    return `/server/${record.slug}`
  })
  const sample = ['/', '/catalog?game=gtarp', '/lineage-2', '/minecraft', '/gta-rp', ...profiles, '/copyright', ...noindexPaths]
  for (const path of sample) {
    const response = await fetch(new URL(path, base), { redirect: 'follow', signal: AbortSignal.timeout(15000) })
    assert.equal(response.status, 200, `${path}: HTTP`)
    const source = await response.text()
    const logicalPath = path.split('?')[0]
    if (noindexPaths.includes(logicalPath)) {
      checkNoindexHtml(source, path)
      assert.equal(extract(source, /<title>([^<]+)<\/title>/), extract(html(logicalPath), /<title>([^<]+)<\/title>/), `${path}: specific title`)
    } else {
      const expected = pages.find(page => page.path === logicalPath)
      assert.ok(expected, `${path}: public snapshot exists`)
      checkPublicHtml(source, expected)
    }
    assert.match(source, /<h1>/, `${path}: content`)
  }
  for (const path of ['/robots.txt','/sitemap.xml']) {
    const response = await fetch(new URL(path, base), { signal: AbortSignal.timeout(15000) })
    assert.equal(response.status,200,`${path}: HTTP`)
    const source = await response.text()
    assert.ok(!source.includes('<!doctype html>'),`${path}: no SPA fallback`)
    assert.ok(source.includes(ORIGIN),`${path}: production origin`)
    if(path === '/sitemap.xml') assert.ok(!source.includes(`${ORIGIN}/account`), 'sitemap excludes account')
  }
  const unknown = await fetch(new URL('/nonexistent-seo-route-7249', base), { redirect: 'follow', signal: AbortSignal.timeout(15000) })
  assert.equal(unknown.status, 404, 'unknown route must return HTTP 404')
  const unknownBody = await unknown.text()
  // An empty HTTP 404 has no indexable content. HTML error pages must explicitly be noindex.
  if (unknownBody.trim()) checkNoindexHtml(unknownBody, '/nonexistent-seo-route-7249')
  for (const path of ['/assets/nonexistent-seo-asset-7249.js', '/media/nonexistent-seo-image-7249.webp']) {
    const response = await fetch(new URL(path, base), { redirect: 'follow', signal: AbortSignal.timeout(15000) })
    assert.equal(response.status, 404, `${path}: missing asset must return HTTP 404`)
    const source = await response.text()
    if (/<!doctype html>/i.test(source)) checkNoindexHtml(source, path)
  }
}
console.log(`SEO snapshot: ${pages.length} public routes; ${base ? 'HTTP passed' : 'set SEO_BASE_URL for HTTP verification'}`)
