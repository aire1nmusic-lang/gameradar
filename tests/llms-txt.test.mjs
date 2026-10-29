import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { ORIGIN, publicPages } from '../scripts/public-pages.mjs'

const text = readFileSync('public/llms.txt', 'utf8').split('\r\n').join('\n')
// Indexable app routes that have no route-specific static HTML yet.
const SPA_ROUTES = ['/openings', '/rating', '/sitemap.xml']

test('llms.txt follows the llms.txt layout: one H1, a summary quote, link sections', () => {
  assert.equal((text.match(/^# /gm) ?? []).length, 1)
  assert.match(text, /^# GameScout\n\n> /)
  assert.ok((text.match(/^## /gm) ?? []).length >= 3)
})

test('every link in llms.txt points to a page the site really serves', () => {
  const known = new Set([...publicPages().map(page => page.path), ...SPA_ROUTES])
  const links = [...text.matchAll(/\]\((https:\/\/[^)]+)\)/g)].map(match => match[1])
  assert.ok(links.length >= 15)
  for (const link of links) {
    assert.ok(link.startsWith(ORIGIN + '/'), link)
    assert.ok(known.has(link.slice(ORIGIN.length)), `${link} is not a served page`)
  }
})

test('the methodology page is prerendered and states the trust rule llms.txt repeats', () => {
  const about = publicPages().find(page => page.path === '/about')
  assert.ok(about)
  assert.match(about.body, /Проверено GameScout/)
  assert.match(text, /VERIFIED\) означает только собственное измерение GameScout/)
})
