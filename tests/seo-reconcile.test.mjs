import assert from 'node:assert/strict'
import { test } from 'node:test'
import { comparePublicCatalog, fetchPublishedCatalog } from '../scripts/reconcile-public-html.mjs'

const record = { slug: 'test-l2', name: 'Test L2', game: 'lineage2', chronicle: 'interlude', version: null, rates: 'x10', modes: ['PvP'], openedAt: '2026-09-27T00:00:00Z', region: 'EU', country: 'DE' }
const row = { slug: 'test-l2', name: 'Test L2', gameId: 'lineage2', chronicleId: 'interlude', version: null, rates: 'x10', modes: ['PvP'], openedAt: '2026-09-27T00:00:00Z', region: 'EU', country: 'DE', demo: false }

test('matching published card passes; demo cards are excluded', () => {
  assert.deepEqual(comparePublicCatalog([record], [row, { slug: 'demo', demo: true }]).issues, [])
})

test('removed, added and modified public cards fail the release gate', () => {
  assert.match(comparePublicCatalog([record], []).issues[0], /missing published card/)
  assert.match(comparePublicCatalog([], [row]).issues[0], /missing crawlable page/)
  const issues = comparePublicCatalog([record], [{ ...row, name: 'Changed', rates: 'x50' }]).issues
  assert.equal(issues.length, 2)
  assert.match(issues.join(' '), /stale test-l2 name/)
  assert.match(issues.join(' '), /stale test-l2 rates/)
})

test('catalog fetch paginates and rejects a changing total', async () => {
  const fetchImpl = async url => {
    const offset = Number(url.searchParams.get('offset'))
    return { ok: true, json: async () => ({ items: offset ? [row] : Array.from({ length: 100 }, (_, i) => ({ ...row, slug: `card-${i}` })), total: 101, limit: 100, offset }) }
  }
  assert.equal((await fetchPublishedCatalog('http://127.0.0.1:8787/', fetchImpl)).length, 101)
  await assert.rejects(fetchPublishedCatalog('https://gamescout.online/', async url => ({ ok: true, json: async () => ({ items: [row], total: url.searchParams.get('offset') === '0' ? 2 : 3, limit: 100, offset: Number(url.searchParams.get('offset')) }) })), /Incomplete catalog page/)
  await assert.rejects(fetchPublishedCatalog('http://example.com/', fetchImpl), /HTTPS/)
})
