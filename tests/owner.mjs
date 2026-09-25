/**
 * Owner & voting acceptance on a real local Worker + D1.
 *
 * Covers the production risks found in the readiness audit:
 *   · a card's submitter loses access once someone else proves ownership;
 *   · an expired proof token can no longer verify ownership;
 *   · obvious duplicates and private monitoring targets are refused on save;
 *   · Votifier (Minecraft only) delivers a signed vote, survives a failed
 *     delivery and retries it exactly once, and never leaks into the Pull API;
 *   · the public reward endpoint exposes no delivery endpoints;
 *   · the live sitemap lists published cards and no DEMO.
 */
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { createHmac } from 'node:crypto'
import { createServer } from 'node:http'
import net from 'node:net'
import { createWriteStream, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { seedSql } from '../scripts/seed.mjs'

const runDir = path.resolve('output/owner-' + Date.now())
mkdirSync(runDir, { recursive: true })
const state = path.join(runDir, 'state')
const wrangler = path.resolve('node_modules/wrangler/bin/wrangler.js')
const PORT = 8793
const base = `http://127.0.0.1:${PORT}/api/v1`
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

function cli(args) {
  const run = spawnSync(process.execPath, [wrangler, ...args], { encoding: 'utf8', windowsHide: true, env })
  writeFileSync(path.join(runDir, 'database.log'), (run.stdout || '') + (run.stderr || ''), { flag: 'a' })
  assert.equal(run.status, 0, 'Wrangler local DB command failed; see ' + runDir)
}
const sql = command => cli(['d1', 'execute', 'gamescout', '--local', '--persist-to', state, '--command', command])

cli(['d1', 'migrations', 'apply', 'gamescout', '--local', '--persist-to', state])
const seedFile = path.join(runDir, 'seed.sql')
writeFileSync(seedFile, seedSql())
cli(['d1', 'execute', 'gamescout', '--local', '--persist-to', state, '--file', seedFile])

/* ── fixtures: the project's website (claim file) and a NuVotifier v2 ──── */

let proof = 'none'
const site = createServer((req, res) => {
  if (req.url === '/.well-known/gamescout-verification.txt') {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end(proof)
  } else {
    res.writeHead(404)
    res.end()
  }
})
await new Promise(resolve => site.listen(8790, '127.0.0.1', resolve))

const VOTIFIER_TOKEN = 'votifier-test-token-123'
const VOTIFIER_PORT = 8794
let votifierUp = true
const received = []
const votifier = net.createServer(socket => {
  if (!votifierUp) return socket.destroy()
  socket.write('VOTIFIER 2 challenge-' + received.length + '\n')
  let buffer = Buffer.alloc(0)
  socket.on('data', chunk => {
    buffer = Buffer.concat([buffer, chunk])
    if (buffer.length < 4) return
    const length = buffer.readUInt16BE(2)
    if (buffer.length < 4 + length) return
    const { payload, signature } = JSON.parse(buffer.subarray(4, 4 + length).toString('utf8'))
    const ok = createHmac('sha256', VOTIFIER_TOKEN).update(payload).digest('base64') === signature
    received.push({ ok, vote: JSON.parse(payload) })
    socket.end(JSON.stringify({ status: ok ? 'ok' : 'error' }) + '\n')
  })
})
await new Promise(resolve => votifier.listen(VOTIFIER_PORT, '127.0.0.1', resolve))

// A stand-in for Discord's OAuth endpoints (the Worker may point there only in development).
const DISCORD_PORT = 8796
const discord = createServer((req, res) => {
  let body = ''
  req.on('data', chunk => (body += chunk))
  req.on('end', () => {
    if (req.method === 'POST' && req.url === '/oauth2/token') {
      const form = new URLSearchParams(body)
      const valid = form.get('client_id') === 'test-client' && form.get('client_secret') === 'test-secret' && form.get('code') === 'good-code' && form.get('redirect_uri')?.endsWith('/api/v1/auth/discord/callback')
      res.writeHead(valid ? 200 : 401, { 'Content-Type': 'application/json' })
      return res.end(JSON.stringify(valid ? { access_token: 'access-1', token_type: 'Bearer' } : { error: 'invalid_grant' }))
    }
    if (req.url === '/users/@me' && req.headers.authorization === 'Bearer access-1') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      return res.end(JSON.stringify({ id: '123456789012345678', username: 'discordtester', global_name: 'Discord Tester', avatar: 'abcdef1234' }))
    }
    res.writeHead(404)
    res.end()
  })
})
await new Promise(resolve => discord.listen(DISCORD_PORT, '127.0.0.1', resolve))

const log = createWriteStream(path.join(runDir, 'worker.log'), { flags: 'a' })
const worker = spawn(
  process.execPath,
  [wrangler, 'dev', '--local', '--ip', '127.0.0.1', '--port', String(PORT), '--local-upstream', `127.0.0.1:${PORT}`, '--inspector-port', '9243', '--persist-to', state, '--log-level', 'error',
    '--var', 'DISCORD_CLIENT_ID:test-client', '--var', 'DISCORD_CLIENT_SECRET:test-secret', '--var', `DISCORD_API_BASE:http://127.0.0.1:${DISCORD_PORT}`],
  { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env },
)
worker.stdout.pipe(log)
worker.stderr.pipe(log)

async function api(route, { method = 'GET', body, cookie, key, status = 200, raw = false } = {}) {
  const response = await fetch(base + route, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      ...(key ? { Authorization: 'Bearer ' + key } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await response.text()
  const json = raw ? text : text ? JSON.parse(text) : null
  assert.equal(response.status, status, `${method} ${route} expected ${status} got ${response.status} ${text.slice(0, 300)}`)
  return { json, cookie: response.headers.get('set-cookie')?.split(';')[0] }
}
const login = async name => (await api('/auth/dev', { method: 'POST', body: { displayName: name, secret: vars.DEV_AUTH_SECRET } })).cookie
const publish = serverId => api('/admin/servers/' + serverId + '/publish', { method: 'POST', body: {}, key: vars.ADMIN_TOKEN })
async function claimAs(cookie, serverId) {
  const claim = (await api('/claims', { method: 'POST', cookie, body: { serverId, method: 'SITE_FILE' }, status: 201 })).json
  proof = claim.proofToken
  return claim
}
async function ownerVotes(cookie, serverId) {
  return (await api('/servers/' + serverId + '/votes', { cookie })).json
}

try {
  for (let attempt = 0; attempt < 240; attempt++) {
    if (worker.exitCode !== null) throw new Error('Worker exited; see ' + runDir)
    try {
      if ((await fetch(base + '/health')).ok) break
    } catch {}
    await sleep(250)
  }

  /* ── Sign in with Discord ─────────────────────────────────────────────── */
  assert.deepEqual((await api('/auth/me')).json.providers, ['discord'])
  const start = await fetch(base + '/auth/discord?next=' + encodeURIComponent('/server/some-card'), { redirect: 'manual' })
  assert.equal(start.status, 302)
  const authorize = new URL(start.headers.get('location'))
  assert.equal(authorize.searchParams.get('scope'), 'identify email', 'the identity and the address (to join an account registered with it), nothing more')
  const oauthState = authorize.searchParams.get('state')
  const oauthCookie = start.headers.getSetCookie().find(cookie => cookie.startsWith('gs_oauth='))
  assert.ok(oauthCookie.includes('HttpOnly'))
  const cookieValue = oauthCookie.split(';')[0]
  const callback = (query, cookie) => fetch(base + '/auth/discord/callback?' + query, { redirect: 'manual', headers: cookie ? { Cookie: cookie } : {} })

  const forged = await callback(`code=good-code&state=${'0'.repeat(32)}`, cookieValue)
  assert.equal(forged.status, 302)
  assert.match(forged.headers.get('location'), /auth_error=discord/)
  assert.ok(!forged.headers.getSetCookie().some(cookie => cookie.startsWith('gs_session=') && !cookie.startsWith('gs_session=;')), 'a forged state never creates a session')
  const noCookie = await callback(`code=good-code&state=${oauthState}`)
  assert.match(noCookie.headers.get('location'), /auth_error=discord/)
  const badCode = await callback(`code=bad-code&state=${oauthState}`, cookieValue)
  assert.match(badCode.headers.get('location'), /auth_error=discord/)

  const good = await callback(`code=good-code&state=${oauthState}`, cookieValue)
  assert.equal(good.status, 302)
  assert.equal(good.headers.get('location'), '/server/some-card', 'back to where the player started')
  const discordSession = good.headers.getSetCookie().find(cookie => cookie.startsWith('gs_session='))
  assert.ok(discordSession.includes('HttpOnly'))
  const discordCookie = discordSession.split(';')[0]
  const me = (await api('/auth/me', { cookie: discordCookie })).json.user
  assert.equal(me.displayName, 'Discord Tester')
  assert.equal(me.provider, 'DISCORD')

  const second = await fetch(base + '/auth/discord?next=' + encodeURIComponent('//evil.example'), { redirect: 'manual' })
  const secondState = new URL(second.headers.get('location')).searchParams.get('state')
  const secondCookie = second.headers.getSetCookie().find(cookie => cookie.startsWith('gs_oauth=')).split(';')[0]
  const secondCallback = await callback(`code=good-code&state=${secondState}`, secondCookie)
  assert.equal(secondCallback.headers.get('location'), '/account', 'an off-site next is replaced, never followed')
  const meAgain = (await api('/auth/me', { cookie: secondCallback.headers.getSetCookie().find(cookie => cookie.startsWith('gs_session=')).split(';')[0] })).json.user
  assert.equal(meAgain.id, me.id, 'signing in again reuses the account')
  pass('Sign in with Discord: forged/missing state and bad codes create no session; success returns to the page; one account per Discord id')

  const alice = await login('Owner Alice')
  const bob = await login('Submitter Bob')

  /* ── submissions: duplicates and private targets ─────────────────────── */
  const mc = (
    await api('/servers', {
      method: 'POST',
      cookie: alice,
      status: 201,
      body: { name: 'Owner Test Craft', gameId: 'minecraft', chronicleId: 'survival', website: 'http://127.0.0.1:8790', description: 'Owner acceptance Minecraft server.', language: 'English', country: 'DE' },
    })
  ).json
  await publish(mc.id)
  const duplicate = await api('/servers', {
    method: 'POST',
    cookie: bob,
    status: 409,
    body: { name: 'owner test craft', gameId: 'minecraft', website: 'http://127.0.0.1:8790', description: 'Same server again, different case.', language: 'English', country: 'DE' },
  })
  assert.equal(duplicate.json.error.code, 'duplicate_server')
  pass('An obvious duplicate (same game, same name) is refused with a pointer to the existing card')

  for (const target of [
    { method: 'GAME_PROTOCOL', host: '10.0.0.5', port: 25565 },
    { method: 'GAME_PROTOCOL', host: 'localhost.internal' },
    { method: 'SERVER_API', apiUrl: 'http://192.168.1.10:30120' },
    { method: 'GAME_PROTOCOL', host: 'play.example-network.net', port: 25 },
  ]) {
    const refused = await api('/servers/' + mc.id + '/monitoring', { method: 'PATCH', cookie: alice, body: target, status: 400 })
    assert.equal(refused.json.error.code, 'invalid_target', JSON.stringify(target))
  }
  pass('Private, internal and forbidden-port monitoring targets are refused when saved (SSRF)')

  /* ── ownership: a submitter loses access once the owner is verified ──── */
  const l2 = (
    await api('/servers', {
      method: 'POST',
      cookie: bob,
      status: 201,
      body: { name: 'Owner Test Interlude', gameId: 'lineage2', chronicleId: 'interlude', website: 'http://127.0.0.1:8790', description: 'Filed by Bob, owned by Alice.', language: 'Русский', country: 'RU' },
    })
  ).json
  await publish(l2.id)
  await api('/servers/' + l2.id + '/stats', { cookie: bob })
  pass('Before any ownership proof the submitter manages the card')

  const aliceClaim = await claimAs(alice, l2.id)
  await api('/claims/' + aliceClaim.id + '/verify', { method: 'POST', cookie: alice, body: {} })
  for (const [method, route, body] of [
    ['GET', '/stats', undefined],
    ['GET', '/votes', undefined],
    ['GET', '/vote-integration', undefined],
    ['POST', '/api-key', {}],
    ['PATCH', '/vote-integration', { rewardTitle: 'stolen' }],
    ['PATCH', '/monitoring', { method: 'LOGIN_SERVER', host: 'play.example-network.net' }],
  ]) {
    await api('/servers/' + l2.id + route, { method, cookie: bob, body, status: 403 })
  }
  assert.ok(!(await api('/owners/me/servers', { cookie: bob })).json.items.some(item => item.id === l2.id))
  await api('/servers/' + l2.id + '/stats', { cookie: alice })
  pass("Once Alice proves ownership, Bob (the submitter) can no longer read stats, rotate keys or change settings")

  const again = await api('/claims', { method: 'POST', cookie: bob, body: { serverId: l2.id, method: 'SITE_FILE' }, status: 409 })
  assert.equal(again.json.error.code, 'already_claimed')
  pass('A second claim on an owned server is refused')

  /* ── proof tokens expire ─────────────────────────────────────────────── */
  const expiring = await claimAs(alice, mc.id)
  sql(`UPDATE server_claims SET created_at='2020-01-01T00:00:00.000Z' WHERE id='${expiring.id}'`)
  const expired = await api('/claims/' + expiring.id + '/verify', { method: 'POST', cookie: alice, body: {}, status: 410 })
  assert.equal(expired.json.error.code, 'proof_expired')
  const fresh = await claimAs(alice, mc.id)
  assert.notEqual(fresh.id, expiring.id, 'an expired claim is not resumed')
  await api('/claims/' + fresh.id + '/verify', { method: 'POST', cookie: alice, body: {} })
  pass('An expired proof cannot verify ownership; a new claim with a new token does')

  /* ── Votifier (Minecraft only) ───────────────────────────────────────── */
  const incomplete = await api('/servers/' + mc.id + '/vote-integration', { method: 'PATCH', cookie: alice, body: { delivery: 'VOTIFIER' }, status: 400 })
  assert.equal(incomplete.json.error.code, 'votifier_incomplete')
  const webhook = await api('/servers/' + mc.id + '/vote-integration', { method: 'PATCH', cookie: alice, body: { delivery: 'WEBHOOK' }, status: 400 })
  assert.equal(webhook.json.error.code, 'unsupported_delivery')
  const notMinecraft = await api('/servers/' + l2.id + '/vote-integration', { method: 'PATCH', cookie: alice, body: { delivery: 'VOTIFIER', votifierHost: '127.0.0.1', votifierPort: VOTIFIER_PORT, votifierToken: VOTIFIER_TOKEN }, status: 400 })
  assert.equal(notMinecraft.json.error.code, 'votifier_minecraft_only')
  pass('Votifier is Minecraft-only, needs host/port/token; webhook delivery is honestly refused')

  const settings = (
    await api('/servers/' + mc.id + '/vote-integration', {
      method: 'PATCH',
      cookie: alice,
      body: { rewardTitle: 'Test diamond', delivery: 'VOTIFIER', votifierHost: '127.0.0.1', votifierPort: VOTIFIER_PORT, votifierToken: VOTIFIER_TOKEN },
    })
  ).json
  assert.equal(settings.delivery, 'VOTIFIER')
  assert.equal(settings.hasVotifierToken, true)
  assert.ok(!JSON.stringify(settings).includes(VOTIFIER_TOKEN), 'the token is never sent back')
  const publicReward = (await api('/servers/' + mc.slug + '/reward')).json
  assert.deepEqual(Object.keys(publicReward).sort(), ['cooldownHours', 'rewardDescription', 'rewardTitle', 'serverId'])
  pass('Owner stores NuVotifier settings; the token is write-only and the public reward shows no endpoints')

  await api('/votes', { method: 'POST', body: { serverId: mc.id, nickname: 'Steve' }, status: 201 })
  for (let i = 0; i < 40 && !received.length; i++) await sleep(250)
  assert.equal(received.length, 1, 'NuVotifier must receive the vote')
  assert.equal(received[0].ok, true, 'the HMAC signature must verify with the owner token')
  assert.equal(received[0].vote.username, 'Steve')
  assert.equal(received[0].vote.address, '0.0.0.0', "the voter's address is never shared")
  for (let i = 0; i < 20; i++) {
    if ((await ownerVotes(alice, mc.id)).find(vote => vote.nickname === 'Steve')?.status === 'CLAIMED') break
    await sleep(250)
  }
  assert.equal((await ownerVotes(alice, mc.id)).find(vote => vote.nickname === 'Steve').status, 'CLAIMED')
  pass('A vote is delivered to NuVotifier with a valid signature and marked delivered')

  votifierUp = false
  await api('/votes', { method: 'POST', body: { serverId: mc.id, nickname: 'Alex' }, status: 201 })
  await sleep(2500)
  assert.equal((await ownerVotes(alice, mc.id)).find(vote => vote.nickname === 'Alex').status, 'PENDING', 'a failed delivery stays pending')
  votifierUp = true
  // the failed send released its lease; the retry may run once it is past the lease window
  sql(`UPDATE votes SET delivering_at=NULL WHERE nickname='Alex'`)
  const retry = (await api('/admin/votes/deliver', { method: 'POST', body: {}, key: vars.ADMIN_TOKEN })).json
  assert.equal(retry.delivered, 1)
  assert.equal((await ownerVotes(alice, mc.id)).find(vote => vote.nickname === 'Alex').status, 'CLAIMED')
  const again2 = (await api('/admin/votes/deliver', { method: 'POST', body: {}, key: vars.ADMIN_TOKEN })).json
  assert.equal(again2.delivered, 0, 'a delivered vote is never sent twice by the retry')
  assert.equal(received.filter(item => item.vote.username === 'Alex').length, 1)
  pass('A failed delivery stays PENDING, is retried once the server is back, and is not re-sent afterwards')

  const key = (await api('/servers/' + mc.id + '/api-key', { method: 'POST', cookie: alice, body: {} })).json.apiKey
  const pull = (await api('/votes/pending', { key })).json
  assert.equal(pull.items.length, 0, 'Votifier votes never appear in the Pull API')
  pass('Pull API and Votifier are separate queues: no vote can be rewarded twice')

  /* ── live sitemap ────────────────────────────────────────────────────── */
  const sitemap = (await api('/sitemap.xml', { raw: true })).json
  assert.ok(sitemap.includes('/server/' + mc.slug))
  assert.ok(!sitemap.includes('/server/demo-'), 'DEMO cards never reach the sitemap')
  pass('Live sitemap lists published cards (including owner-added) and no DEMO')

  writeFileSync(path.join(runDir, 'result.json'), JSON.stringify({ passed: true, checks: results }, null, 2))
  console.log('Owner acceptance passed. Report: ' + path.join(runDir, 'result.json'))
} catch (error) {
  writeFileSync(path.join(runDir, 'result.json'), JSON.stringify({ passed: false, checks: results, error: String(error) }, null, 2))
  throw error
} finally {
  if (process.platform === 'win32') spawnSync('taskkill.exe', ['/PID', String(worker.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
  else worker.kill('SIGTERM')
  await sleep(800)
  log.end()
  await new Promise(resolve => site.close(resolve))
  await new Promise(resolve => votifier.close(resolve))
  await new Promise(resolve => discord.close(resolve))
}
