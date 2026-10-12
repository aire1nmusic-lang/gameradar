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
// Retained previous-generation chunks must not be mistaken for duplicate code in the current graph.
const entry=readFileSync('dist/index.html','utf8').match(/\/assets\/(index-[A-Za-z0-9_-]+\.js)/)?.[1]
assert.ok(entry,'Current HTML must identify its entry')
const pending=[entry],active=new Set()
while(pending.length){
  const file=pending.shift()
  if(active.has(file))continue
  assert.ok(files.includes(file),'Active dependency must exist: '+file)
  active.add(file)
  const source=readFileSync('dist/assets/'+file,'utf8')
  for(const match of source.matchAll(/["'](?:\.\/|\/?assets\/)([A-Za-z0-9_.-]+\.js)["']/g))pending.push(match[1])
}
const activeJs=[...active].map(file=>readFileSync('dist/assets/'+file,'utf8')).join('\n')
assert.ok(activeJs.split(LEGACY_STORAGE_KEY).length-1<=1,'The active graph must contain at most one legacy storage key')

assert.ok(activeJs.includes('/api/v1'), 'Current production graph must use HTTP API')
console.log('Production bundle: HTTP API present; no fixtures, no readable old brand.')
