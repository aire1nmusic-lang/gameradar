import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { publicPages, publicRecords, ORIGIN } from '../scripts/public-pages.mjs'

const pages = publicPages()
const xml = readFileSync('public/sitemap.xml', 'utf8')
const html = value => readFileSync(value === '/' ? 'dist/index.html' : `dist${value}/index.html`, 'utf8')
const extract = (source, pattern) => source.match(pattern)?.[1] ?? ''
assert.equal(new Set(pages.map(page => page.path)).size, pages.length, 'public paths must be unique')
for (const page of pages) {
  const body = html(page.path)
  assert.equal(extract(body, /<link rel="canonical" href="([^"]+)"/), ORIGIN + page.path, page.path)
  assert.equal(extract(body, /<meta name="robots" content="([^"]+)"/), 'index, follow', page.path)
  assert.match(body, /<h1>/, page.path)
  assert.ok(xml.includes(`<loc>${ORIGIN + page.path}</loc>`), page.path)
}
for (const path of ['/rating', '/openings', '/account', '/admin', '/dashboard']) {
  const body = html(path)
  assert.equal(extract(body, /<meta name="robots" content="([^"]+)"/), 'noindex, nofollow', path)
  assert.ok(!body.includes('rel="canonical"'), path)
  assert.ok(!xml.includes(`<loc>${ORIGIN + path}</loc>`), path)
}
assert.match(html('/catalog'), /Онлайн не указан/)
assert.ok(!html('/catalog').includes('https://example.com'))
const missing = readFileSync('dist/404.html', 'utf8')
assert.match(missing, /<meta name="robots" content="noindex, nofollow"/)
assert.match(missing, /Страница не найдена/)

const base = process.env.SEO_BASE_URL
if (base) {
  const profiles = ['lineage2','minecraft','gtarp'].map(game => {
    const record = publicRecords().find(row => row.game === game)
    assert.ok(record, `${game}: server snapshot required`)
    return `/server/${record.slug}`
  })
  const sample = ['/', '/catalog?game=gtarp', '/lineage-2', '/minecraft', '/gta-rp', ...profiles, '/copyright', '/rating', '/admin', '/account']
  for (const path of sample) {
    const response = await fetch(new URL(path, base), { redirect: 'follow', signal: AbortSignal.timeout(15000) })
    assert.equal(response.status, 200, `${path}: HTTP`)
    const source = await response.text()
    const logicalPath = path.split('?')[0]
    const privatePage = ['/rating', '/admin', '/account'].includes(logicalPath)
    assert.equal(extract(source, /<meta name="robots" content="([^"]+)"/), privatePage ? 'noindex, nofollow' : 'index, follow', `${path}: robots`)
    if (!privatePage) {
      assert.equal(extract(source, /<link rel="canonical" href="([^"]+)"/), ORIGIN + logicalPath, `${path}: canonical`)
      const expected = pages.find(page => page.path === logicalPath)
      assert.ok(expected, `${path}: public snapshot exists`)
      assert.equal(extract(source, /<title>([^<]+)<\/title>/), extract(html(logicalPath), /<title>([^<]+)<\/title>/), `${path}: specific title`)
      assert.ok(extract(source, /<meta name="description" content="([^"]+)"/).length > 20, `${path}: description`)
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
  assert.match(await unknown.text(), /<meta name="robots" content="noindex, nofollow"/)
}
console.log(`SEO snapshot: ${pages.length} public routes; ${base ? 'HTTP passed' : 'set SEO_BASE_URL for HTTP verification'}`)
