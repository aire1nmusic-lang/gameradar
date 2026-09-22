/**
 * Real-content import acceptance.
 *
 *   npm run test:import            offline: D1 + importer + API
 *   npm run test:import -- --live  also runs monitoring passes against the
 *                                  real public endpoints in the dataset
 *
 * Proves, on a fresh local D1 with the development seed:
 *   · the importer runs twice without a duplicate and without rewriting rows;
 *   · a changed fact updates the card in place; an owner-claimed card is left alone;
 *   · DEMO cards are hidden from the catalogue but stay in the database;
 *   · every imported card is public, opens, and carries its provenance;
 *   · (--live) monitoring writes samples, and no status claims more than it may.
 */
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { createWriteStream, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { seedSql } from '../scripts/seed.mjs'
import { importSql, loadDataset } from '../scripts/import/dataset.mjs'

const live = process.argv.includes('--live')
const runDir = path.resolve('output/import-' + Date.now())
mkdirSync(runDir, { recursive: true })
const state = path.join(runDir, 'state')
const wrangler = path.resolve('node_modules/wrangler/bin/wrangler.js')
const base = 'http://127.0.0.1:8791/api/v1'
const vars = Object.fromEntries(
  readFileSync('.dev.vars', 'utf8')
    .split(/\r?\n/)
    .filter(line => line && !line.startsWith('#'))
    .map(line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]),
)
const results = []
const pass = label => {
  results.push(label)
  console.log('PASS ' + label)
}
const env = { ...process.env, WRANGLER_SEND_METRICS: 'false' }

function cli(args) {
  const run = spawnSync(process.execPath, [wrangler, ...args], { encoding: 'utf8', windowsHide: true, env })
  writeFileSync(path.join(runDir, 'database.log'), (run.stdout || '') + (run.stderr || ''), { flag: 'a' })
  assert.equal(run.status, 0, 'Wrangler local DB command failed; see ' + runDir)
}

function importer(...extra) {
  const run = spawnSync(process.execPath, ['scripts/import-servers.mjs', '--persist-to', state, ...extra], { encoding: 'utf8', windowsHide: true, env })
  writeFileSync(path.join(runDir, 'import.log'), (run.stdout || '') + (run.stderr || ''), { flag: 'a' })
  assert.equal(run.status, 0, 'Importer failed; see ' + path.join(runDir, 'import.log'))
  return run.stdout
}

function findDb(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      const found = findDb(file)
      if (found) return found
    } else if (file.endsWith('.sqlite')) {
      const db = new DatabaseSync(file, { readOnly: true })
      try {
        if (db.prepare("SELECT name FROM sqlite_master WHERE name='servers'").get()) return file
      } finally {
        db.close()
      }
    }
  }
}

function read(sql, ...params) {
  const db = new DatabaseSync(findDb(state), { readOnly: true })
  try {
    return db.prepare(sql).all(...params).map(row => ({ ...row }))
  } finally {
    db.close()
  }
}

const dataset = loadDataset().filter(record => record.confidence === 'confirmed')

cli(['d1', 'migrations', 'apply', 'gamescout', '--local', '--persist-to', state])
const seedFile = path.join(runDir, 'seed.sql')
writeFileSync(seedFile, seedSql())
cli(['d1', 'execute', 'gamescout', '--local', '--persist-to', state, '--file', seedFile])
pass('Fresh D1 with migrations 0001–0004 and the development seed')

importer('--hide-demo')
const first = read('SELECT id, slug, import_key, updated_at, imported_at, moderation, source_name, source_url, source_refs, last_source_check_at FROM servers WHERE import_key IS NOT NULL ORDER BY id')
assert.equal(first.length, dataset.length, 'every confirmed record becomes one card')
assert.ok(first.every(row => row.moderation === 'PUBLISHED'))
assert.ok(first.every(row => row.source_name && row.source_url && row.imported_at && row.last_source_check_at && JSON.parse(row.source_refs).length >= 2))
pass(`First import: ${first.length} cards, each with source_name/source_url/imported_at/last_source_check_at`)

importer('--hide-demo')
const second = read('SELECT id, slug, import_key, updated_at, imported_at FROM servers WHERE import_key IS NOT NULL ORDER BY id')
assert.deepEqual(second, first.map(({ id, slug, import_key, updated_at, imported_at }) => ({ id, slug, import_key, updated_at, imported_at })))
assert.equal(read('SELECT COUNT(*) AS n FROM servers').at(0).n, dataset.length + 9)
assert.equal(read('SELECT COUNT(*) AS n FROM monitoring_targets').at(0).n, dataset.filter(record => record.endpoint).length)
assert.equal(read('SELECT COUNT(*) AS n FROM server_online').at(0).n, dataset.length + 9)
pass('Second import: no duplicates, no rewritten rows, same slugs and timestamps')

// A changed fact updates the existing card; a card with an owner is never overwritten.
const [changed, owned] = [dataset.find(r => r.game === 'lineage2') ?? dataset[0], dataset.find(r => r.game === 'minecraft') ?? dataset[1]]
const ownedId = first.find(row => row.import_key === owned.key).id
const claimSql = path.join(runDir, 'claim.sql')
writeFileSync(
  claimSql,
  `INSERT INTO users (id,display_name,created_at) VALUES ('usr_import_test','Import test owner','2026-01-01T00:00:00.000Z');\nUPDATE servers SET owner_id='usr_import_test' WHERE id='${ownedId}';\n`,
)
cli(['d1', 'execute', 'gamescout', '--local', '--persist-to', state, '--file', claimSql])
const mutated = dataset.map(record =>
  record.key === changed.key ? { ...record, rates: 'x999 test' } : record.key === owned.key ? { ...record, name: 'Overwritten by import' } : record,
)
const updateSql = path.join(runDir, 'update.sql')
writeFileSync(updateSql, importSql(mutated, { existing: read('SELECT id, slug FROM servers'), chronicles: read('SELECT id, game_id FROM chronicles') }).sql)
cli(['d1', 'execute', 'gamescout', '--local', '--persist-to', state, '--file', updateSql])
const changedRow = read('SELECT * FROM servers WHERE import_key=?', changed.key)
assert.equal(changedRow.length, 1)
assert.equal(changedRow[0].rates, 'x999 test')
assert.equal(changedRow[0].imported_at, first.find(row => row.import_key === changed.key).imported_at, 'imported_at keeps the first import')
assert.equal(read('SELECT name FROM servers WHERE id=?', ownedId)[0].name, owned.name)
assert.equal(read('SELECT COUNT(*) AS n FROM servers WHERE import_key IS NOT NULL').at(0).n, dataset.length)
pass('Changed fact updates the card in place; an owner-claimed card is untouched')
importer('--hide-demo')
assert.equal(read('SELECT rates FROM servers WHERE import_key=?', changed.key)[0].rates, changed.rates)
pass('Re-running the importer restores the dataset facts')

const demo = read('SELECT moderation FROM servers WHERE is_demo=1')
assert.equal(demo.length, 9)
assert.ok(demo.every(row => row.moderation === 'ARCHIVED'))
pass('DEMO cards hidden (ARCHIVED), still present in the database')

const log = createWriteStream(path.join(runDir, 'worker.log'), { flags: 'a' })
const worker = spawn(
  process.execPath,
  [wrangler, 'dev', '--local', '--ip', '127.0.0.1', '--port', '8791', '--local-upstream', '127.0.0.1:8791', '--inspector-port', '9241', '--persist-to', state, '--log-level', 'error'],
  { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env },
)
worker.stdout.pipe(log)
worker.stderr.pipe(log)

async function api(route, { method = 'GET', body, key, status = 200 } = {}) {
  const response = await fetch(base + route, {
    method,
    headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(key ? { Authorization: 'Bearer ' + key } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const json = await response.json()
  assert.equal(response.status, status, method + ' ' + route + ' expected ' + status + ' got ' + response.status + ' ' + JSON.stringify(json).slice(0, 300))
  return json
}

try {
  for (let attempt = 0; attempt < 180; attempt++) {
    if (worker.exitCode !== null) throw new Error('Worker exited; see ' + runDir)
    try {
      if ((await fetch(base + '/health')).ok) break
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 250))
  }

  const catalogue = await api('/servers?limit=100')
  assert.equal(catalogue.total, dataset.length)
  assert.ok(catalogue.items.every(server => !server.demo && server.provenance?.refs.length >= 2))
  for (const game of ['lineage2', 'minecraft', 'gtarp']) {
    const expected = dataset.filter(record => record.game === game).length
    assert.equal((await api('/servers?limit=100&gameId=' + game)).total, expected, game)
  }
  pass(`Catalogue shows ${catalogue.total} real cards and no DEMO`)

  for (const server of catalogue.items) {
    const profile = await api('/servers/' + server.slug)
    assert.equal(profile.id, server.id)
    await api('/servers/' + server.slug + '/online-history?range=24h')
  }
  await api('/servers/demo-minecraft-survival', { status: 404 })
  pass('Every imported profile opens; hidden DEMO profile is 404')

  const l2 = catalogue.items.filter(server => server.gameId === 'lineage2')
  assert.ok(l2.every(server => server.online.status !== 'VERIFIED' && !server.online.playersKnown))
  pass('Lineage 2 cards publish no VERIFIED status and no player count')

  if (live) {
    const report = []
    for (let pass = 0; pass < 2; pass++) report.push(await api('/admin/monitor/run', { method: 'POST', body: { limit: 50 }, key: vars.ADMIN_TOKEN }))
    const statuses = report.at(-1).results
    writeFileSync(path.join(runDir, 'monitoring.json'), JSON.stringify(report, null, 2))

    const samples = read("SELECT s.server_id, s.status, s.players, s.players_known, s.source_tier, sv.game_id FROM online_samples s JOIN servers sv ON sv.id=s.server_id")
    // Queued: a direct target or a source this Worker can read without secrets (no STEAM_API_KEY in tests).
    const targets = dataset.filter(record => record.endpoint || record.onlineSources.some(source => source.provider !== 'steam')).length
    assert.equal(samples.length, targets * 2, 'every pass writes one sample per target')
    for (const sample of samples) {
      if (sample.game_id === 'minecraft') assert.notEqual(sample.status, 'VERIFIED', 'Minecraft SLP is never VERIFIED')
      // Lineage 2: a number only from the project's own site, labelled as such — never VERIFIED.
      if (sample.game_id === 'lineage2') {
        assert.notEqual(sample.status, 'VERIFIED')
        if (sample.players_known) assert.ok(sample.status === 'OWNER_REPORTED' && sample.source_tier === 'OFFICIAL', 'an L2 count must come from the official site')
      }
      if (sample.source_tier === 'EXTERNAL' || sample.source_tier === 'OFFICIAL') assert.notEqual(sample.status, 'VERIFIED', 'external online is never VERIFIED')
      if (sample.status === 'OFFLINE' || sample.status === 'ANOMALY') assert.ok(!sample.players_known)
    }
    const mcLive = statuses.filter(r => samples.find(s => s.server_id === r.serverId)?.game_id === 'minecraft' && r.status === 'LIVE')
    assert.ok(mcLive.length >= 1, 'at least one real Minecraft server answers Server List Ping')
    pass(`Live monitoring: ${samples.length} samples in D1; ${mcLive.length} Minecraft LIVE; statuses ${JSON.stringify(statuses.reduce((acc, r) => ({ ...acc, [r.status]: (acc[r.status] ?? 0) + 1 }), {}))}`)

    const shown = await api('/servers?limit=100')
    for (const server of shown.items.filter(item => item.online.status === 'VERIFIED')) {
      assert.equal(server.gameId, 'gtarp', 'only a direct FiveM count may be VERIFIED')
      assert.ok(server.online.playersKnown)
    }
    pass('Public API: VERIFIED appears only on directly counted FiveM endpoints')
  }

  writeFileSync(path.join(runDir, 'result.json'), JSON.stringify({ passed: true, live, checks: results }, null, 2))
  console.log('Import acceptance passed. Report: ' + path.join(runDir, 'result.json'))
} catch (error) {
  writeFileSync(path.join(runDir, 'result.json'), JSON.stringify({ passed: false, checks: results, error: String(error) }, null, 2))
  throw error
} finally {
  if (process.platform === 'win32') spawnSync('taskkill.exe', ['/PID', String(worker.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
  else worker.kill('SIGTERM')
  await new Promise(resolve => setTimeout(resolve, 800))
  log.end()
}
