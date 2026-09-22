/**
 * Monitoring acceptance.
 *
 * Proves the online pipeline end to end against a real HTTP game endpoint:
 * owner sets a target → a monitoring pass probes it → the measurement is
 * stored → the public card reports VERIFIED with the measured count.
 *
 * Also proves the promise we make to players: an unreachable server becomes
 * OFFLINE rather than keeping a stale number.
 */
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdirSync, readFileSync, writeFileSync, createWriteStream } from 'node:fs'
import path from 'node:path'
import { seedSql } from '../scripts/seed.mjs'

const runDir = path.resolve('output/monitoring-' + Date.now())
mkdirSync(runDir, { recursive: true })
const state = path.join(runDir, 'state')
const wrangler = path.resolve('node_modules/wrangler/bin/wrangler.js')
const base = 'http://127.0.0.1:8789/api/v1'
const vars = Object.fromEntries(
  readFileSync('.dev.vars', 'utf8')
    .split(/\r?\n/)
    .filter(line => line && !line.startsWith('#'))
    .map(line => {
      const index = line.indexOf('=')
      return [line.slice(0, index), line.slice(index + 1)]
    }),
)
const results = []
const pass = label => {
  results.push(label)
  console.log('PASS ' + label)
}

function cli(args) {
  const run = spawnSync(process.execPath, [wrangler, ...args], { encoding: 'utf8', windowsHide: true, env: { ...process.env, WRANGLER_SEND_METRICS: 'false' } })
  writeFileSync(path.join(runDir, 'database.log'), (run.stdout || '') + (run.stderr || ''), { flag: 'a' })
  assert.equal(run.status, 0, 'Wrangler local DB command failed; see ' + runDir)
}

cli(['d1', 'migrations', 'apply', 'gamescout', '--local', '--persist-to', state])
const seedFile = path.join(runDir, 'seed.sql')
writeFileSync(seedFile, seedSql())
cli(['d1', 'execute', 'gamescout', '--local', '--persist-to', state, '--file', seedFile])

let online = 3
let serving = true
const fixture = createServer((req, res) => {
  if (!serving) {
    res.socket?.destroy()
    return
  }
  if (req.url === '/players.json') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(Array.from({ length: online }, (_, index) => ({ id: index + 1, name: 'DEMO player ' + (index + 1) }))))
  } else if (req.url === '/info.json') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ vars: { sv_maxClients: '64' } }))
  } else {
    res.writeHead(404)
    res.end()
  }
})
await new Promise((resolve, reject) => {
  fixture.once('error', reject)
  fixture.listen(8790, '127.0.0.1', resolve)
})

const log = createWriteStream(path.join(runDir, 'worker.log'), { flags: 'a' })
const worker = spawn(
  process.execPath,
  [wrangler, 'dev', '--local', '--ip', '127.0.0.1', '--port', '8789', '--local-upstream', '127.0.0.1:8789', '--inspector-port', '9240', '--persist-to', state, '--log-level', 'error'],
  { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, WRANGLER_SEND_METRICS: 'false' } },
)
worker.stdout.pipe(log)
worker.stderr.pipe(log)

async function api(route, { method = 'GET', body, cookie, key, status = 200 } = {}) {
  const response = await fetch(base + route, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      ...(key ? { Authorization: 'Bearer ' + key } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const json = await response.json()
  assert.equal(response.status, status, method + ' ' + route + ' expected ' + status + ' got ' + response.status + ' ' + JSON.stringify(json))
  return { json, cookie: response.headers.get('set-cookie')?.split(';')[0] }
}

async function stop() {
  if (process.platform === 'win32') spawnSync('taskkill.exe', ['/PID', String(worker.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
  else worker.kill('SIGTERM')
  await new Promise(resolve => setTimeout(resolve, 800))
  log.end()
}

try {
  for (let attempt = 0; attempt < 180; attempt++) {
    if (worker.exitCode !== null) throw new Error('Worker exited; see ' + runDir)
    try {
      if ((await fetch(base + '/health')).ok) break
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 250))
  }

  const owner = await api('/auth/dev', { method: 'POST', body: { displayName: 'Monitoring owner', secret: vars.DEV_AUTH_SECRET } })
  const cookie = owner.cookie

  const server = (
    await api('/servers', {
      method: 'POST',
      cookie,
      status: 201,
      body: {
        name: 'DEMO Monitoring City',
        gameId: 'gtarp',
        chronicleId: 'fivem',
        website: 'http://127.0.0.1:8790',
        description: 'DEMO server used by the monitoring acceptance test.',
        language: 'Русский',
        country: 'RU',
      },
    })
  ).json
  await api('/admin/servers/' + server.id + '/publish', { method: 'POST', body: {}, key: vars.ADMIN_TOKEN })
  pass('Server created and published for monitoring')

  await api('/servers/' + server.id + '/monitoring', { method: 'PATCH', cookie, body: { method: 'SERVER_API', apiUrl: 'http://127.0.0.1:8790' } })
  const target = (await api('/servers/' + server.id + '/monitoring', { cookie })).json
  assert.equal(target.method, 'SERVER_API')
  pass('Owner stores a monitoring target')

  const first = (await api('/admin/monitor/run', { method: 'POST', body: { limit: 50 }, key: vars.ADMIN_TOKEN })).json
  assert.ok(first.checked >= 1, 'A monitoring pass must probe at least the configured target')
  const measured = (await api('/servers/' + server.slug)).json
  assert.equal(measured.online.status, 'VERIFIED', 'A measured FiveM endpoint must reach VERIFIED')
  assert.equal(measured.online.current, 3, 'The stored count must equal the players the endpoint listed')
  assert.equal(measured.online.max, 64)
  assert.equal(measured.online.method, 'SERVER_API')
  pass('Probe measures a real endpoint and publishes VERIFIED with the measured count')

  online = 7
  await api('/admin/monitor/run', { method: 'POST', body: {}, key: vars.ADMIN_TOKEN })
  assert.equal((await api('/servers/' + server.slug)).json.online.current, 7)
  const history = (await api('/servers/' + server.slug + '/online-history?range=24h')).json
  assert.ok(history.length >= 2, 'Every pass must append a sample')
  assert.deepEqual(
    history.slice(-2).map(sample => sample.players),
    [3, 7],
  )
  pass('Repeated passes append history in order')

  serving = false
  await api('/admin/monitor/run', { method: 'POST', body: {}, key: vars.ADMIN_TOKEN })
  const offline = (await api('/servers/' + server.slug)).json
  assert.equal(offline.online.status, 'OFFLINE', 'An unreachable server must not keep a stale status')
  assert.equal(offline.online.playersKnown, false, 'An unreachable server must not report a player count')
  pass('Unreachable endpoint becomes OFFLINE without keeping a stale number')

  // A Lineage 2 target can only ever reach LIVE: the login server does not
  // expose a population, so VERIFIED would be a claim we cannot support.
  const l2 = (
    await api('/servers', {
      method: 'POST',
      cookie,
      status: 201,
      body: {
        name: 'DEMO Monitoring Chronicle',
        gameId: 'lineage2',
        chronicleId: 'interlude',
        website: 'http://127.0.0.1:8790',
        description: 'DEMO Lineage 2 server used by the monitoring acceptance test.',
        language: 'Русский',
        country: 'RU',
      },
    })
  ).json
  await api('/admin/servers/' + l2.id + '/publish', { method: 'POST', body: {}, key: vars.ADMIN_TOKEN })
  await api('/servers/' + l2.id + '/monitoring', { method: 'PATCH', cookie, body: { method: 'LOGIN_SERVER', host: '127.0.0.1', port: 8790 } })
  serving = true
  await api('/admin/monitor/run', { method: 'POST', body: {}, key: vars.ADMIN_TOKEN })
  const chronicle = (await api('/servers/' + l2.slug)).json
  assert.ok(['LIVE', 'OFFLINE'].includes(chronicle.online.status), 'Lineage 2 may only be LIVE or OFFLINE')
  assert.notEqual(chronicle.online.status, 'VERIFIED', 'Lineage 2 must never be VERIFIED from the login server alone')
  assert.equal(chronicle.online.playersKnown, false, 'Lineage 2 must never publish a player count from the login server')
  pass('Lineage 2 never reaches VERIFIED or publishes a count from the login server')

  writeFileSync(path.join(runDir, 'result.json'), JSON.stringify({ passed: true, checks: results }, null, 2))
  console.log('Monitoring acceptance passed. Report: ' + path.join(runDir, 'result.json'))
} catch (error) {
  writeFileSync(path.join(runDir, 'result.json'), JSON.stringify({ passed: false, checks: results, error: String(error) }, null, 2))
  throw error
} finally {
  await stop()
  await new Promise(resolve => fixture.close(resolve))
}
