import { readdirSync, readFileSync } from 'node:fs'
import assert from 'node:assert/strict'

/**
 * Guards what may ship to players.
 *
 * Two things must never reach the production bundle: development fixtures
 * (they would look like a real catalogue) and the old brand in anything a
 * person can read.
 *
 * One exception is allowed and checked exactly: the legacy localStorage key.
 * It exists so favourites saved before the rename are migrated instead of
 * lost, and it is never rendered.
 */
const LEGACY_STORAGE_KEY = 'gameradar:favorites'

const files = readdirSync('dist/assets').filter(f => f.endsWith('.js'))
const js = files.map(f => readFileSync('dist/assets/' + f, 'utf8')).join('\n')

for (const needle of ['GameRadar', 'mockRepositories', 'holysky', 'frostpeak', 'OWNER_PROJECTS', 'demo-server-']) {
  assert.ok(!js.includes(needle), 'Unexpected fixture/old-brand marker in bundle: ' + needle)
}

const lowercaseBrand = js.split('gameradar').length - 1
const legacyKeyUses = js.split(LEGACY_STORAGE_KEY).length - 1
assert.equal(
  lowercaseBrand,
  legacyKeyUses,
  'The only permitted "gameradar" occurrence is the legacy storage key ' + LEGACY_STORAGE_KEY,
)
assert.ok(legacyKeyUses <= 1, 'The legacy storage key must appear at most once')

assert.ok(js.includes('/api/v1'), 'Production path must use HTTP API')
console.log('Production bundle: HTTP API present; no fixtures, no readable old brand.')
