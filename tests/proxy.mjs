/**
 * Front-mirror acceptance: the built SPA + ru-proxy relay in front of a real
 * local Worker + D1 (development seed + the 96 real cards).
 *
 * Proves:
 *   · the Worker in PROXY_ONLY mode answers nobody but the proxy (no second public entry);
 *   · pages, images and large API answers (> 16 KB) come through intact, with query strings;
 *   · method/body/cookies pass both ways: sign-in, claim, vote;
 *   · votes are limited per visitor IP, not per proxy: six visitors vote, a sixth vote from one IP is refused;
 *   · a client cannot pick its IP (X-GS-Client-IP / X-Forwarded-For from outside are ignored);
 *   · foreign origins cannot write; only /api/* reaches the fixed upstream (no open proxy);
 *   · upstream failures do not reveal the upstream address.
 */
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { seedSql } from '../scripts/seed.mjs'

const runDir = path.resolve('output/proxy-' + Date.now())
mkdirSync(runDir, { recursive: true })
const state = path.join(runDir, 'state')
const wrangler = path.resolve('node_modules/wrangler/bin/wrangler.js')
const WORKER_PORT = 8797
const MIRROR_PORT = 8798
const worker = `http://127.0.0.1:${WORKER_PORT}`
const mirror = `http://127.0.0.1:${MIRROR_PORT}`
const SECRET = randomBytes(32).toString('hex')
const vars = Object.fromEntries(
  readFileSync('.dev.vars', 'utf8')
    .split(/\r?\n/)
    .filter(line => line && !line.startsWith('#'))
    .map(line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]),
)
const env = { ...process.env, WRANGLER_SEND_METRICS: 'false' }
const results = []
const pass = label => {
  results.push(label)
  console.log('PASS ' + label)
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
assert.ok(existsSync('dist/index.html'), 'run npm run build first')

function run(args, label) {
  const done = spawnSync(process.execPath, args, { encoding: 'utf8', windowsHide: true, env })
  writeFileSync(path.join(runDir, label + '.log'), (done.stdout || '') + (done.stderr || ''), { flag: 'a' })
  assert.equal(done.status, 0, label + ' failed; see ' + runDir)
}
run([wrangler, 'd1', 'migrations', 'apply', 'gamescout', '--local', '--persist-to', state], 'database')
const seedFile = path.join(runDir, 'seed.sql')
writeFileSync(seedFile, seedSql())
run([wrangler, 'd1', 'execute', 'gamescout', '--local', '--persist-to', state, '--file', seedFile], 'database')
run(['scripts/import-servers.mjs', '--persist-to', state, '--hide-demo'], 'import')

const log = createWriteStream(path.join(runDir, 'processes.log'), { flags: 'a' })
const workerProcess = spawn(
  process.execPath,
  [wrangler, 'dev', '--local', '--ip', '127.0.0.1', '--port', String(WORKER_PORT), '--local-upstream', `127.0.0.1:${WORKER_PORT}`, '--inspector-port', '9245', '--persist-to', state, '--log-level', 'error',
    '--var', `PROXY_SECRET:${SECRET}`, '--var', 'PROXY_ONLY:true', '--var', 'EXTRA_ORIGINS:https://mirror.example',
    '--var', `DEV_ALLOWED_ORIGINS:${[vars.DEV_ALLOWED_ORIGINS, mirror].filter(Boolean).join(',')}`],
  { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env },
)
workerProcess.stdout.pipe(log)
workerProcess.stderr.pipe(log)
const mirrorProcess = spawn(process.execPath, ['ru-proxy/serve.mjs', '--dist', 'dist', '--port', String(MIRROR_PORT)], {
  windowsHide: true,
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...env, GS_UPSTREAM: worker, GS_ALLOW_HTTP_UPSTREAM: 'true', GS_PROXY_SECRET: SECRET, GS_PUBLIC_ORIGINS: mirror, GS_TEST_CLIENT_IP_HEADER: 'x-test-ip' },
})
mirrorProcess.stdout.pipe(log)
mirrorProcess.stderr.pipe(log)

/** A request as a browser on the mirror makes it; x-test-ip plays the platform's client-IP header. */
async function viaMirror(route, { method = 'GET', body, cookie, ip = '198.51.100.1', origin, headers = {}, status } = {}) {
  const response = await fetch(mirror + route, {
    method,
    redirect: 'manual',
    headers: {
      'x-test-ip': ip,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      ...(origin ?? (method !== 'GET' ? mirror : undefined) ? { Origin: origin ?? mirror } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await response.text()
  if (status !== undefined) assert.equal(response.status, status, `${method} ${route} expected ${status} got ${response.status} ${text.slice(0, 300)}`)
  return { response, text, json: text && response.headers.get('content-type')?.includes('json') ? JSON.parse(text) : null }
}

try {
  for (let attempt = 0; attempt < 240; attempt++) {
    if (workerProcess.exitCode !== null || mirrorProcess.exitCode !== null) throw new Error('A process exited; see ' + runDir)
    try {
      if ((await fetch(mirror + '/api/v1/health')).ok) break
    } catch {}
    await sleep(250)
  }

  /* ── the Worker is not a second public entry ─────────────────────────── */
  assert.equal((await fetch(worker + '/api/v1/health')).status, 403)
  assert.equal((await fetch(worker + '/api/v1/servers', { headers: { 'X-GS-Proxy-Auth': 'guess-guess-guess-guess-guess-guess' } })).status, 403)
  assert.equal((await fetch(worker + '/api/v1/health', { headers: { 'X-GS-Proxy-Auth': SECRET } })).status, 200)
  pass('PROXY_ONLY Worker refuses every request without the proxy secret')

  /* ── pages, images, large answers ────────────────────────────────────── */
  const indexHtml = readFileSync('dist/index.html', 'utf8')
  for (const page of ['/', '/lineage-2', '/minecraft', '/gta-rp', '/catalog', '/server/anything']) {
    const { response, text } = await viaMirror(page, { status: 200 })
    assert.equal(text, indexHtml, page + ' serves the SPA')
    assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow')
  }
  const script = indexHtml.match(/src="(\/assets\/[^"]+\.js)"/)[1]
  assert.equal((await viaMirror(script, { status: 200 })).response.headers.get('content-type'), 'text/javascript')
  const poster = 'media/worlds/lineage-2/classic-poster-1600.webp'
  const image = await fetch(mirror + '/' + poster)
  assert.equal(image.status, 200)
  assert.equal(image.headers.get('content-type'), 'image/webp')
  assert.equal(Buffer.from(await image.arrayBuffer()).length, readFileSync('dist/' + poster).length)
  pass('Home, /lineage-2, /minecraft, /gta-rp, catalog and profile routes serve the SPA; scripts and posters arrive byte-for-byte')

  const catalog = await viaMirror('/api/v1/servers?limit=100', { status: 200 })
  assert.ok(Buffer.byteLength(catalog.text) > 16 * 1024, `catalog answer is ${Buffer.byteLength(catalog.text)} bytes`)
  const servers = catalog.json.items
  assert.equal(catalog.json.total, 96, 'all 96 real cards, no DEMO')
  assert.equal(servers.length, 96)
  for (const header of ['cf-ray', 'server', 'content-encoding']) assert.equal(catalog.response.headers.get(header), null, header + ' is not passed')
  assert.equal(catalog.response.headers.get('x-gs-via'), 'proxy')
  const minecraft = (await viaMirror('/api/v1/servers?gameId=minecraft&limit=100', { status: 200 })).json.items
  assert.ok(minecraft.length > 0 && minecraft.length < servers.length && minecraft.every(s => s.gameId === 'minecraft'), 'the query string reaches the API')
  const card = servers.find(s => s.links.site && s.gameId === 'minecraft') ?? servers[0]
  const profile = await viaMirror('/api/v1/servers/' + card.slug, { status: 200 })
  assert.equal(profile.json.id, card.id)
  pass(`Catalogue answer of ${Buffer.byteLength(catalog.text)} bytes (> 16 KB) with 96 cards, filtered query and profile come through intact; Cloudflare headers are dropped`)

  /* ── cookies, method and body both ways ──────────────────────────────── */
  const login = await viaMirror('/api/v1/auth/dev', { method: 'POST', body: { displayName: 'Mirror Owner', secret: vars.DEV_AUTH_SECRET }, status: 200 })
  const setCookie = login.response.headers.getSetCookie().find(c => c.startsWith('gs_session='))
  assert.ok(setCookie && /HttpOnly/i.test(setCookie) && !/Domain=/i.test(setCookie), 'session cookie arrives host-only and HttpOnly')
  assert.match(login.response.headers.get('cache-control'), /no-store/)
  const cookie = setCookie.split(';')[0]
  assert.equal((await viaMirror('/api/v1/auth/me', { cookie, status: 200 })).json.user.displayName, 'Mirror Owner')

  const claim = await viaMirror('/api/v1/claims', { method: 'POST', cookie, body: { serverId: card.id, method: 'SITE_FILE' }, status: 201 })
  assert.match(claim.json.proofToken, /^gamescout-verify-/)
  const verify = await viaMirror(`/api/v1/claims/${claim.json.id}/verify`, { method: 'POST', cookie, body: {} })
  assert.ok([400, 429].includes(verify.response.status) && verify.json.error, 'verification answers with a real API error (the card site has no proof file)')
  pass('Sign-in cookie, claim creation and claim verification pass through with method, body and cookies')

  /* ── votes count real visitors, not the proxy ────────────────────────── */
  const vote = (ip, nickname, extra = {}) => viaMirror('/api/v1/votes', { method: 'POST', ip, body: { serverId: card.id, nickname }, ...extra })
  for (let i = 0; i < 6; i++) assert.equal((await vote(`203.0.113.${10 + i}`, `Visitor ${i}`)).response.status, 201, `visitor ${i} votes`)
  for (let i = 0; i < 5; i++) assert.equal((await vote('203.0.113.50', `Same ip ${i}`)).response.status, 201)
  const sixth = await vote('203.0.113.50', 'Same ip 5')
  assert.equal(sixth.response.status, 429, 'the per-IP limit still applies to one visitor')
  const spoofed = await vote('203.0.113.50', 'Same ip 6', { headers: { 'X-GS-Client-IP': '192.0.2.77', 'X-Forwarded-For': '192.0.2.78', 'X-GS-Proxy-Auth': 'forged-forged-forged-forged-forged' } })
  assert.equal(spoofed.response.status, 429, 'a client-chosen IP header does not reset the limit')
  const repeat = await vote('203.0.113.99', 'Visitor 0')
  assert.equal(repeat.response.status, 429, 'the nickname cooldown works through the mirror')
  pass('Six visitors behind one proxy vote independently; one visitor still hits the 5/h limit; forged IP headers are ignored')

  /* ── origins and open-proxy attempts ─────────────────────────────────── */
  assert.equal((await vote('203.0.113.60', 'Foreign', { origin: 'https://evil.example' })).response.status, 403)
  assert.equal((await fetch(worker + '/api/v1/votes', { method: 'POST', headers: { 'X-GS-Proxy-Auth': SECRET, 'X-GS-Client-IP': '203.0.113.61', Origin: 'https://mirror.example', 'Content-Type': 'application/json' }, body: JSON.stringify({ serverId: card.id, nickname: 'Extra origin' }) })).status, 201, 'EXTRA_ORIGINS lets the mirror host write')
  assert.equal((await fetch(worker + '/api/v1/votes', { method: 'POST', headers: { 'X-GS-Proxy-Auth': SECRET, Origin: 'https://evil.example', 'Content-Type': 'application/json' }, body: JSON.stringify({ serverId: card.id, nickname: 'Evil origin' }) })).status, 403)

  const absolute = await new Promise((resolve, reject) => {
    const socket = net.connect(MIRROR_PORT, '127.0.0.1', () => socket.write('GET http://example.com/api/v1/health HTTP/1.1\r\nHost: example.com\r\nx-test-ip: 198.51.100.9\r\nConnection: close\r\n\r\n'))
    let data = ''
    socket.on('data', chunk => (data += chunk))
    socket.on('end', () => resolve(data))
    socket.on('error', reject)
  })
  assert.match(absolute, /^HTTP\/1\.1 200/)
  assert.match(absolute, /x-gs-via: proxy/i, 'an absolute-form target still reaches only the fixed upstream')
  const big = await viaMirror('/api/v1/votes', { method: 'POST', body: { serverId: card.id, nickname: 'x'.repeat(1_100_000) } })
  assert.equal(big.response.status, 413)
  pass('Foreign origins cannot write (proxy and Worker); EXTRA_ORIGINS works; absolute-form targets and oversized bodies do not escape')

  /* ── health and upstream failure ─────────────────────────────────────── */
  assert.equal((await viaMirror('/__gs/health', { ip: '198.51.100.23', status: 200 })).json.ip, '198.51.100.23')
  workerProcess.kill()
  await sleep(1000)
  const down = await viaMirror('/api/v1/servers', { status: 502 })
  assert.equal(down.json.error.code, 'upstream_unavailable')
  assert.ok(!down.text.includes(String(WORKER_PORT)) && !down.text.includes('127.0.0.1'), 'the upstream address is not revealed')
  pass('Health shows the IP the API counts; a dead upstream gives a generic 502 without its address')

  writeFileSync(path.join(runDir, 'result.json'), JSON.stringify({ passed: results }, null, 2))
  console.log('Proxy acceptance passed. Report: ' + path.join(runDir, 'result.json'))
} finally {
  workerProcess.kill()
  mirrorProcess.kill()
}
