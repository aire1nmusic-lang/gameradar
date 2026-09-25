/**
 * Accounts acceptance on a real local Worker + D1: registration with an emailed
 * code, password and code sign-in, reset, rate limits, Google / Yandex / VK
 * sign-in and linking, the cabinet, server logos with admin approval, and the
 * admin panel (roles, bans, moderation queues).
 *
 * Mail goes to the Worker's development outbox (MAIL_DRIVER=log); OAuth
 * providers are a local fixture (OAUTH_TEST_BASE).
 */
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { createServer } from 'node:http'
import { createWriteStream, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { seedSql } from '../scripts/seed.mjs'

const runDir = path.resolve('output/accounts-' + Date.now())
mkdirSync(runDir, { recursive: true })
const state = path.join(runDir, 'state')
const wrangler = path.resolve('node_modules/wrangler/bin/wrangler.js')
const PORT = 8811
const OAUTH_PORT = 8812
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
  return run.stdout
}
const sql = command => cli(['d1', 'execute', 'gamescout', '--local', '--persist-to', state, '--command', command])

cli(['d1', 'migrations', 'apply', 'gamescout', '--local', '--persist-to', state])
const seedFile = path.join(runDir, 'seed.sql')
writeFileSync(seedFile, seedSql())
cli(['d1', 'execute', 'gamescout', '--local', '--persist-to', state, '--file', seedFile])

/* ── OAuth fixture: Google, Yandex and VK ID in one local server ─────────── */

const PROFILES = {
  'g-alice': { provider: 'google', body: { sub: 'g-100', name: 'Alice Google', picture: 'https://example.com/a.png', email: 'alice@example.com', email_verified: true } },
  'y-new': { provider: 'yandex', body: { id: 'y-200', display_name: 'Yan New', default_email: 'yan@example.com' } },
  'y-link': { provider: 'yandex', body: { id: 'y-300', display_name: 'Alice Yandex', default_email: 'alice.other@example.com' } },
  'vk-1': { provider: 'vk', body: { user: { user_id: '555', first_name: 'Vasya', last_name: 'Pupkin', email: 'alice@example.com' } } },
}
const vkTokenForms = []
const oauth = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://fixture')
  const [, provider, step] = url.pathname.split('/')
  let body = ''
  for await (const chunk of req) body += chunk
  const form = new URLSearchParams(body)
  const json = (status, value) => {
    res.writeHead(status, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(value))
  }
  if (step === 'token') {
    if (provider === 'vk') vkTokenForms.push(Object.fromEntries(form))
    const code = form.get('code')
    const profile = PROFILES[code]
    const secretOk = provider === 'vk' ? form.get('client_id') === 'vk-client' : form.get('client_secret') === `${provider}-secret`
    if (!profile || profile.provider !== provider || !secretOk) return json(400, { error: 'invalid_grant' })
    return json(200, { access_token: 'tok-' + code, token_type: 'Bearer' })
  }
  if (step === 'profile') {
    const tokenValue = provider === 'vk' ? form.get('access_token') : (req.headers.authorization ?? '').split(' ')[1]
    const profile = PROFILES[String(tokenValue).replace(/^tok-/, '')]
    if (!profile || profile.provider !== provider) return json(401, { error: 'bad_token' })
    return json(200, profile.body)
  }
  json(404, {})
})
await new Promise(resolve => oauth.listen(OAUTH_PORT, '127.0.0.1', resolve))

const log = createWriteStream(path.join(runDir, 'worker.log'), { flags: 'a' })
const worker = spawn(
  process.execPath,
  [wrangler, 'dev', '--local', '--ip', '127.0.0.1', '--port', String(PORT), '--local-upstream', `127.0.0.1:${PORT}`, '--inspector-port', '9251', '--persist-to', state, '--log-level', 'error',
    '--var', 'MAIL_DRIVER:log', '--var', 'PASSWORD_PEPPER:test-pepper-0123456789', '--var', 'ADMIN_EMAILS:boss@example.com',
    '--var', `OAUTH_TEST_BASE:http://127.0.0.1:${OAUTH_PORT}`,
    '--var', 'GOOGLE_CLIENT_ID:google-client', '--var', 'GOOGLE_CLIENT_SECRET:google-secret',
    '--var', 'YANDEX_CLIENT_ID:yandex-client', '--var', 'YANDEX_CLIENT_SECRET:yandex-secret',
    '--var', 'VK_CLIENT_ID:vk-client'],
  { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env },
)
worker.stdout.pipe(log)
worker.stderr.pipe(log)

async function api(route, { method = 'GET', body, cookie, key, status = 200, headers = {}, raw } = {}) {
  const response = await fetch(base + route, {
    method,
    headers: {
      ...(body !== undefined && !raw ? { 'Content-Type': 'application/json' } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      ...(key ? { Authorization: 'Bearer ' + key } : {}),
      ...headers,
    },
    body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
  })
  const text = await response.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {}
  assert.equal(response.status, status, `${method} ${route} expected ${status} got ${response.status} ${text.slice(0, 300)}`)
  const session = response.headers.getSetCookie().find(c => c.startsWith('gs_session=') && !c.startsWith('gs_session=;'))
  return { json, cookie: session?.split(';')[0], headers: response.headers }
}
const mailCode = async to => (await api('/dev/mail?to=' + encodeURIComponent(to))).json.code
const me = async cookie => (await api('/auth/me', { cookie })).json.user

async function register(email, password, displayName) {
  await api('/auth/register', { method: 'POST', body: { email, password, displayName }, status: 202 })
  return api('/auth/register/confirm', { method: 'POST', body: { email, code: await mailCode(email) } })
}

async function signInWith(provider, code, { cookie, link } = {}) {
  const start = await fetch(`${base}/auth/${provider}?next=${encodeURIComponent('/account')}${link ? '&link=1' : ''}`, { redirect: 'manual', headers: cookie ? { Cookie: cookie } : {} })
  assert.equal(start.status, 302, `${provider} start`)
  const authorize = new URL(start.headers.get('location'))
  const oauthCookie = start.headers.getSetCookie().find(c => c.startsWith('gs_oauth=')).split(';')[0]
  const query = `code=${code}&state=${authorize.searchParams.get('state')}${provider === 'vk' ? '&device_id=device-1' : ''}`
  const callback = await fetch(`${base}/auth/${provider}/callback?${query}`, { redirect: 'manual', headers: { Cookie: [oauthCookie, cookie].filter(Boolean).join('; ') } })
  assert.equal(callback.status, 302, `${provider} callback`)
  const session = callback.headers.getSetCookie().find(c => c.startsWith('gs_session=') && !c.startsWith('gs_session=;'))
  return { location: callback.headers.get('location'), cookie: session?.split(';')[0], authorize }
}

const png = (w, h) => sharp({ create: { width: w, height: h, channels: 4, background: { r: 30, g: 200, b: 240, alpha: 1 } } }).png().toBuffer()

try {
  for (let attempt = 0; attempt < 240; attempt++) {
    if (worker.exitCode !== null) throw new Error('Worker exited; see ' + runDir)
    try {
      if ((await fetch(base + '/health')).ok) break
    } catch {}
    await sleep(250)
  }

  const session = (await api('/auth/me')).json
  assert.deepEqual(session.providers, ['google', 'yandex', 'vk'])
  assert.equal(session.emailLogin, true)
  pass('/auth/me lists only configured providers and says email sign-in is on')

  /* ── registration ───────────────────────────────────────────────────── */
  await api('/auth/register', { method: 'POST', body: { email: 'not-an-email', password: 'long-enough-1', displayName: 'Al' }, status: 400 })
  assert.equal((await api('/auth/register', { method: 'POST', body: { email: 'alice@example.com', password: '12345678', displayName: 'Alice' }, status: 400 })).json.error.code, 'password_weak')
  assert.equal((await api('/auth/register', { method: 'POST', body: { email: 'alice@example.com', password: 'short', displayName: 'Alice' }, status: 400 })).json.error.code, 'password_weak')
  const sent = await api('/auth/register', { method: 'POST', body: { email: ' Alice@Example.com ', password: 'correct horse 1', displayName: 'Alice' }, status: 202 })
  assert.equal(sent.json.email, 'alice@example.com', 'the address is normalised')
  assert.equal((await api('/auth/me')).json.user, null, 'no account before the code comes back')
  const code = await mailCode('alice@example.com')
  assert.match(code, /^\d{6}$/)
  const wrong = code === '000000' ? '111111' : '000000'
  const bad = await api('/auth/register/confirm', { method: 'POST', body: { email: 'alice@example.com', code: wrong }, status: 400 })
  assert.equal(bad.json.error.code, 'code_invalid')
  assert.match(bad.json.error.message, /Осталось попыток: 4/)
  const confirmed = await api('/auth/register/confirm', { method: 'POST', body: { email: 'alice@example.com', code } })
  let alice = confirmed.cookie
  assert.ok(alice)
  const aliceUser = confirmed.json.user
  assert.equal(aliceUser.email, 'alice@example.com')
  assert.equal(aliceUser.emailVerified, true)
  assert.equal(aliceUser.hasPassword, true)
  assert.deepEqual(aliceUser.roles, ['PLAYER', 'OWNER'])
  assert.ok(!('password_hash' in aliceUser) && !JSON.stringify(aliceUser).includes('pbkdf2'), 'no password hash in answers')
  await api('/auth/register/confirm', { method: 'POST', body: { email: 'alice@example.com', code }, status: 400 })
  assert.equal((await api('/auth/register', { method: 'POST', body: { email: 'alice@example.com', password: 'another pass 2', displayName: 'Alice 2' }, status: 409 })).json.error.code, 'email_taken')
  pass('Registration: the account appears only after the emailed code; a code works once; weak passwords and taken emails are refused')

  /* ── password and code sign-in ──────────────────────────────────────── */
  await api('/auth/logout', { method: 'POST', cookie: alice })
  assert.equal(await me(alice), null, 'logout ends the session')
  assert.equal((await api('/auth/login', { method: 'POST', body: { email: 'alice@example.com', password: 'wrong password' }, status: 401 })).json.error.code, 'invalid_credentials')
  assert.equal((await api('/auth/login', { method: 'POST', body: { email: 'nobody@example.com', password: 'whatever 123' }, status: 401 })).json.error.code, 'invalid_credentials', 'an unknown email looks the same as a wrong password')
  alice = (await api('/auth/login', { method: 'POST', body: { email: 'ALICE@example.com', password: 'correct horse 1' } })).cookie
  assert.equal((await me(alice)).email, 'alice@example.com')

  await api('/auth/code', { method: 'POST', body: { email: 'alice@example.com', purpose: 'login' }, status: 202 })
  const byCode = await api('/auth/code/verify', { method: 'POST', body: { email: 'alice@example.com', code: await mailCode('alice@example.com') } })
  assert.ok(byCode.cookie)
  await api('/auth/code', { method: 'POST', body: { email: 'ghost@example.com', purpose: 'login' }, status: 202 })
  await api('/dev/mail?to=ghost@example.com', { status: 404 })
  pass('Sign-in by password and by emailed code; unknown emails get the same answer and no letter')

  await api('/auth/code', { method: 'POST', body: { email: 'alice@example.com', purpose: 'login' }, status: 202 })
  const fresh = await mailCode('alice@example.com')
  const guess = fresh === '999999' ? '999998' : '999999'
  for (let i = 0; i < 5; i++) await api('/auth/code/verify', { method: 'POST', body: { email: 'alice@example.com', code: guess }, status: 400 })
  assert.equal((await api('/auth/code/verify', { method: 'POST', body: { email: 'alice@example.com', code: fresh }, status: 429 })).json.error.code, 'too_many_attempts')
  pass('A code allows 5 tries; after that even the right code is refused')

  for (let i = 0; i < 4; i++) await api('/auth/code', { method: 'POST', body: { email: 'ghost@example.com', purpose: 'login' }, status: 202 })
  await api('/auth/code', { method: 'POST', body: { email: 'ghost@example.com', purpose: 'login' }, status: 429 })
  for (let i = 0; i < 9; i++) await api('/auth/login', { method: 'POST', body: { email: 'nobody@example.com', password: 'whatever 123' }, status: 401 })
  await api('/auth/login', { method: 'POST', body: { email: 'nobody@example.com', password: 'whatever 123' }, status: 429 })
  pass('Rate limits: 5 codes per email per hour, 10 wrong passwords per email per 15 minutes')

  /* ── password reset ─────────────────────────────────────────────────── */
  const oldDevice = alice
  await api('/auth/code', { method: 'POST', body: { email: 'alice@example.com', purpose: 'reset' }, status: 202 })
  const reset = await api('/auth/password/reset', { method: 'POST', body: { email: 'alice@example.com', code: await mailCode('alice@example.com'), password: 'new secret pass 3' } })
  alice = reset.cookie
  assert.equal(await me(oldDevice), null, 'a reset signs out other devices')
  await api('/auth/login', { method: 'POST', body: { email: 'alice@example.com', password: 'correct horse 1' }, status: 401 })
  alice = (await api('/auth/login', { method: 'POST', body: { email: 'alice@example.com', password: 'new secret pass 3' } })).cookie
  pass('Password reset by emailed code; old password and other sessions stop working')

  /* ── Google / Yandex / VK ───────────────────────────────────────────── */
  const google = await signInWith('google', 'g-alice')
  assert.equal(google.location, '/account')
  const viaGoogle = await me(google.cookie)
  assert.equal(viaGoogle.id, aliceUser.id, 'Google vouches for alice@example.com: same account')
  assert.deepEqual(viaGoogle.identities.map(i => i.provider), ['google'])

  const yandex = await signInWith('yandex', 'y-new')
  const yan = await me(yandex.cookie)
  assert.notEqual(yan.id, aliceUser.id)
  assert.equal(yan.email, 'yan@example.com')
  assert.equal(yan.emailVerified, true)
  assert.equal(yan.provider, 'YANDEX')

  const vk = await signInWith('vk', 'vk-1')
  const vkForm = vkTokenForms.at(-1)
  const challenge = createHash('sha256').update(vkForm.code_verifier).digest('base64url')
  assert.equal(vk.authorize.searchParams.get('code_challenge'), challenge, 'VK ID gets the PKCE verifier that matches the challenge')
  assert.equal(vkForm.device_id, 'device-1')
  const vkUser = await me(vk.cookie)
  assert.notEqual(vkUser.id, aliceUser.id, 'VK does not confirm addresses: never joined by email')
  assert.equal(vkUser.email, undefined)

  const again = await signInWith('google', 'g-alice')
  assert.equal((await me(again.cookie)).id, aliceUser.id, 'the second Google sign-in reuses the account')

  const linked = await signInWith('yandex', 'y-link', { cookie: alice, link: true })
  assert.equal(linked.location, '/account')
  assert.deepEqual((await me(alice)).identities.map(i => i.provider).sort(), ['google', 'yandex'])
  const stolen = await signInWith('yandex', 'y-new', { cookie: alice, link: true })
  assert.match(stolen.location, /auth_error=linked_elsewhere/, 'an identity of another account cannot be linked')

  const forged = await fetch(`${base}/auth/google/callback?code=g-alice&state=${'0'.repeat(32)}`, { redirect: 'manual' })
  assert.match(forged.headers.get('location'), /auth_error=google/)
  assert.ok(!forged.headers.getSetCookie().some(c => c.startsWith('gs_session=') && !c.startsWith('gs_session=;')))
  await api('/auth/discord', { status: 404 })
  pass('Google / Yandex / VK sign-in: verified emails join accounts, VK never does, PKCE for VK, linking, forged state refused')

  /* ── cabinet ────────────────────────────────────────────────────────── */
  assert.equal((await api('/me', { method: 'PATCH', cookie: alice, body: { displayName: '  Алиса   Смит ' } })).json.user.displayName, 'Алиса Смит')
  await api('/me', { method: 'PATCH', cookie: alice, body: { displayName: 'A' }, status: 400 })
  assert.equal((await api('/me/password', { method: 'POST', cookie: alice, body: { currentPassword: 'nope nope 1', newPassword: 'newer secret 4' }, status: 400 })).json.error.code, 'wrong_password')
  alice = (await api('/me/password', { method: 'POST', cookie: alice, body: { currentPassword: 'new secret pass 3', newPassword: 'newer secret 4' } })).cookie
  await api('/me/identities/google', { method: 'DELETE', cookie: alice })
  assert.deepEqual((await me(alice)).identities.map(i => i.provider), ['yandex'])
  assert.equal((await api('/me/identities/vk', { method: 'DELETE', cookie: vk.cookie, status: 409 })).json.error.code, 'last_login_method')

  await api('/me/email', { method: 'POST', cookie: vk.cookie, body: { email: 'alice@example.com' }, status: 409 })
  await api('/me/email', { method: 'POST', cookie: vk.cookie, body: { email: 'vasya@example.com' }, status: 202 })
  const withEmail = await api('/me/email/confirm', { method: 'POST', cookie: vk.cookie, body: { email: 'vasya@example.com', code: await mailCode('vasya@example.com') } })
  assert.equal(withEmail.json.user.email, 'vasya@example.com')
  const vasya = withEmail.cookie
  await api('/me/identities/vk', { method: 'DELETE', cookie: vasya })
  pass('Cabinet: name, password change (needs the current one), add a confirmed email, unlink — never the last way in')

  /* ── admin ──────────────────────────────────────────────────────────── */
  const boss = (await register('boss@example.com', 'boss password 5', 'Boss')).cookie
  assert.ok((await me(boss)).roles.includes('ADMIN'), 'ADMIN_EMAILS grants the role on a confirmed sign-in')
  await api('/admin/overview', { cookie: alice, status: 403 })
  await api('/admin/overview', { status: 401 })
  await api('/admin/overview', { key: vars.ADMIN_TOKEN })
  const overview = (await api('/admin/overview', { cookie: boss })).json
  assert.ok(overview.users >= 4)
  pass('Admin panel: only ADMIN accounts (or the admin token)')

  /* ── logos ──────────────────────────────────────────────────────────── */
  const servers = (await api('/servers?limit=2')).json.items
  const card = servers[0]
  sql(`UPDATE servers SET owner_id='${aliceUser.id}' WHERE id='${card.id}'`)
  const square = await png(128, 128)
  await api(`/servers/${card.id}/logo`, { method: 'POST', cookie: yandex.cookie, raw: square, headers: { 'Content-Type': 'image/png' }, status: 403 })
  assert.equal((await api(`/servers/${card.id}/logo`, { method: 'POST', cookie: alice, raw: await png(128, 64), headers: { 'Content-Type': 'image/png' }, status: 400 })).json.error.code, 'logo_not_square')
  assert.equal((await api(`/servers/${card.id}/logo`, { method: 'POST', cookie: alice, raw: await png(32, 32), headers: { 'Content-Type': 'image/png' }, status: 400 })).json.error.code, 'logo_small')
  assert.equal((await api(`/servers/${card.id}/logo`, { method: 'POST', cookie: alice, raw: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'.padEnd(200)), headers: { 'Content-Type': 'image/png' }, status: 400 })).json.error.code, 'logo_invalid')
  assert.equal((await api(`/servers/${card.id}/logo`, { method: 'POST', cookie: alice, raw: square, headers: { 'Content-Type': 'image/svg+xml' }, status: 400 })).json.error.code, 'logo_type')
  const big = await sharp(randomBytes(512 * 512 * 3), { raw: { width: 512, height: 512, channels: 3 } }).png().toBuffer()
  await api(`/servers/${card.id}/logo`, { method: 'POST', cookie: alice, raw: big, headers: { 'Content-Type': 'image/png' }, status: 413 })

  const webp = await sharp(square).webp().toBuffer()
  const first = (await api(`/servers/${card.id}/logo`, { method: 'POST', cookie: alice, raw: webp, headers: { 'Content-Type': 'image/webp' }, status: 201 })).json.logo
  assert.equal(first.status, 'PENDING')
  assert.equal((await api(`/servers/${card.id}/logo`, { cookie: alice })).json.pending.id, first.id)
  await api(`/logos/${first.id}`, { status: 404 })
  await api(`/logos/${first.id}`, { cookie: alice })
  assert.equal((await api(`/servers/${card.slug}`)).json.logoUrl ?? undefined, card.logoUrl ?? undefined, 'nothing public changes before approval')

  const queue = (await api('/admin/logos?status=PENDING', { cookie: boss })).json
  assert.equal(queue.length, 1)
  assert.equal(queue[0].server.id, card.id)
  assert.equal(queue[0].uploadedBy.email, 'alice@example.com')
  await api(`/admin/logos/${first.id}/image`, { cookie: boss })
  await api(`/admin/logos/${first.id}/approve`, { method: 'POST', cookie: boss, body: {} })
  await api(`/admin/logos/${first.id}/approve`, { method: 'POST', cookie: boss, body: {}, status: 409 })
  const served = await fetch(`${base}/logos/${first.id}`)
  assert.equal(served.status, 200)
  assert.equal(served.headers.get('content-type'), 'image/webp')
  assert.match(served.headers.get('cache-control'), /immutable/)
  assert.equal(served.headers.get('x-content-type-options'), 'nosniff')
  assert.deepEqual(Buffer.from(await served.arrayBuffer()), webp, 'the approved bytes come back unchanged')
  const detail = (await api(`/servers/${card.slug}`)).json
  assert.equal(detail.logoUrl, `/api/v1/logos/${first.id}`)

  const second = (await api(`/servers/${card.id}/logo`, { method: 'POST', cookie: alice, raw: square, headers: { 'Content-Type': 'image/png' }, status: 201 })).json.logo
  await api(`/admin/logos/${second.id}/reject`, { method: 'POST', cookie: boss, body: { reason: 'x' }, status: 400 })
  await api(`/admin/logos/${second.id}/reject`, { method: 'POST', cookie: boss, body: { reason: 'Запрещённая символика' } })
  const status = (await api(`/servers/${card.id}/logo`, { cookie: alice })).json
  assert.equal(status.current.id, first.id, 'the approved logo stays after a rejection')
  assert.equal(status.rejected.reason, 'Запрещённая символика')
  await api(`/admin/logos/${second.id}/image`, { cookie: boss, status: 404 })
  pass('Logos: owner-only, real square PNG/JPEG/WebP ≤150 KB, invisible until an admin approves; rejected pictures are not kept')

  /* ── moderation, roles, bans ────────────────────────────────────────── */
  sql(`UPDATE servers SET moderation='PENDING_MODERATION', submitted_by='${yan.id}' WHERE id='${servers[1].id}'`)
  const pendingCards = (await api('/admin/servers?status=PENDING', { cookie: boss })).json
  assert.ok(pendingCards.some(r => r.server.id === servers[1].id && r.submittedBy.email === 'yan@example.com'))
  await api(`/admin/servers/${servers[1].id}/reject`, { method: 'POST', cookie: boss, body: { reason: 'Сервер не отвечает' } })
  assert.ok((await api('/admin/servers?status=REJECTED', { cookie: boss })).json.some(r => r.server.id === servers[1].id && r.note === 'Сервер не отвечает'))
  await api(`/admin/servers/${servers[1].id}/publish`, { method: 'POST', cookie: boss, body: {} })

  const found = (await api('/admin/users?query=alice', { cookie: boss })).json
  assert.ok(found.some(u => u.id === aliceUser.id && u.identities.some(i => i.provider === 'yandex')))
  await api(`/admin/users/${yan.id}/roles`, { method: 'POST', cookie: boss, body: { roles: ['OWNER', 'ADMIN'] } })
  assert.deepEqual((await me(yandex.cookie)).roles.sort(), ['ADMIN', 'OWNER', 'PLAYER'])
  await api(`/admin/users/${yan.id}/roles`, { method: 'POST', cookie: boss, body: { roles: ['ROOT'] }, status: 400 })
  const bossId = (await me(boss)).id
  await api(`/admin/users/${bossId}/roles`, { method: 'POST', cookie: boss, body: { roles: ['PLAYER'] }, status: 409 })
  await api(`/admin/users/${bossId}/ban`, { method: 'POST', cookie: boss, body: { banned: true }, status: 409 })

  await api(`/admin/users/${yan.id}/ban`, { method: 'POST', cookie: boss, body: { banned: true } })
  assert.equal(await me(yandex.cookie), null, 'a ban ends the sessions')
  const blocked = await signInWith('yandex', 'y-new')
  assert.match(blocked.location, /auth_error=banned/)
  assert.equal(blocked.cookie, undefined)
  await api('/auth/code', { method: 'POST', body: { email: 'yan@example.com', purpose: 'login' }, status: 202 })
  await api('/dev/mail?to=yan@example.com', { status: 404 })
  await api(`/admin/users/${yan.id}/ban`, { method: 'POST', cookie: boss, body: { banned: false } })
  assert.ok((await signInWith('yandex', 'y-new')).cookie, 'unbanned: signs in again')
  pass('Moderation queue with submitter, reject with a note, roles (never removing your own admin), bans end sessions and sign-in')

  writeFileSync(path.join(runDir, 'result.json'), JSON.stringify({ passed: true, checks: results }, null, 2))
  console.log('Accounts acceptance passed. Report: ' + path.join(runDir, 'result.json'))
} catch (error) {
  writeFileSync(path.join(runDir, 'result.json'), JSON.stringify({ passed: false, checks: results, error: String(error) }, null, 2))
  throw error
} finally {
  if (process.platform === 'win32') spawnSync('taskkill.exe', ['/PID', String(worker.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
  else worker.kill('SIGTERM')
  await sleep(800)
  log.end()
  await new Promise(resolve => oauth.close(resolve))
}
