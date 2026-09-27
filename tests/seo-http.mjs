import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { publicPages, ORIGIN } from '../scripts/public-pages.mjs'

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

const base = process.env.SEO_BASE_URL
if (base) {
  const sample = ['/', '/catalog?game=gtarp', '/lineage-2', '/minecraft', '/gta-rp', '/server/new-day-rp', '/copyright', '/rating', '/admin']
  for (const path of sample) {
    const response = await fetch(new URL(path, base), { redirect: 'follow' })
    assert.equal(response.status, 200, `${path}: HTTP`)
    const source = await response.text()
    const logicalPath = path.split('?')[0]
    assert.equal(extract(source, /<meta name="robots" content="([^"]+)"/), ['/rating', '/admin'].includes(logicalPath) ? 'noindex, nofollow' : 'index, follow', `${path}: robots`)
    if (!['/rating', '/admin'].includes(logicalPath)) assert.equal(extract(source, /<link rel="canonical" href="([^"]+)"/), ORIGIN + logicalPath, `${path}: canonical`)
    assert.match(source, /<h1>/, `${path}: content`)
  }
}
console.log(`SEO snapshot: ${pages.length} public routes; ${base ? 'HTTP passed' : 'set SEO_BASE_URL for HTTP verification'}`)
