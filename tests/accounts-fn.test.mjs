import test from 'node:test'
import assert from 'node:assert/strict'
import { createAccountsApp } from '../accounts-fn/app.mjs'
import { gatewayClientIp } from '../accounts-fn/handler.mjs'
import { memoryStore } from '../accounts-fn/store-memory.mjs'
import { digest, hashPassword, verifyPassword } from '../private-api/crypto.mjs'
const passwords = { hash: hashPassword, verify: verifyPassword }

const origin = 'http://127.0.0.1:5173', password = 'correct horse battery staple'
const baseConfig = { origin, environment: 'development', mailEnabled: true, registrationOpen: true, rateKey: 'k'.repeat(40) }

function harness(overrides = {}) {
  let now = new Date('2026-10-28T12:00:00Z')
  const store = memoryStore(), mails = [], notices = []
  const app = createAccountsApp({ store, passwords, config: { ...baseConfig, ...overrides }, clock: () => now,
    sendLinkMail: async (to, purpose, link) => { mails.push({ to, purpose, link }) },
    sendNotice: async (to, kind, url) => { notices.push({ to, kind, url }) } })
  const jar = {}
  const request = async (path, body, { method = body === undefined ? 'GET' : 'POST', headers = {}, raw, ip = '203.0.113.7' } = {}) => {
    const cookie = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ')
    const init = { method, headers: { ...(cookie ? { Cookie: cookie } : {}), ...headers } }
    if (method !== 'GET') {
      init.headers.Origin ??= origin; init.headers['Content-Type'] ??= 'application/json'
      init.body = raw ?? JSON.stringify(body ?? {})
    }
    const response = await app.fetch(new Request(origin + '/api/v1' + path, init), { clientIp: ip })
    for (const line of response.headers.getSetCookie()) {
      const [pair] = line.split(';'); const [name, ...rest] = pair.split('='), value = rest.join('=')
      if (/Max-Age=0/.test(line)) delete jar[name]; else jar[name] = value
    }
    const text = await response.text()
    let parsed = null; try { parsed = JSON.parse(text) } catch { /* not JSON */ }
    return { status: response.status, body: parsed, response }
  }
  const tokenOf = (email, purpose) => {
    const mail = [...mails].reverse().find(m => m.to === email && m.purpose === purpose)
    return mail && new URLSearchParams(new URL(mail.link).hash.slice(1)).get('token')
  }
  return { store, mails, notices, request, jar, tokenOf, advance: ms => { now = new Date(now.getTime() + ms) } }
}

test('register by e-mail link → verified session → logout → sign in → recovery revokes sessions; links are single-use', async () => {
  const h = harness()
  assert.deepEqual((await h.request('/auth/me')).body, { user: null, providers: [], emailLogin: true, registrationOpen: true, privateCore: true, devAuthEnabled: false })
  const reg = await h.request('/auth/register', { email: 'Player@Example.com', password, displayName: 'Player' })
  assert.equal(reg.status, 202)
  assert.equal(h.mails.length, 1)
  assert.equal(h.mails[0].to, 'player@example.com')
  assert.match(h.mails[0].link, /^http:\/\/127\.0\.0\.1:5173\/account#token=[\w-]+&purpose=register$/)
  const raw = h.tokenOf('player@example.com', 'REGISTER')
  assert.equal((await h.store.userByEmail('player@example.com')), null, 'no account before the link is opened')

  const confirmed = await h.request('/auth/register/confirm', { token: raw })
  assert.equal(confirmed.status, 200)
  assert.equal(confirmed.body.user.email, 'player@example.com')
  assert.equal(confirmed.body.user.emailVerified, true)
  assert.equal(confirmed.body.user.displayName, 'Player')
  assert.deepEqual(confirmed.body.user.roles, ['PLAYER'])
  assert.match(confirmed.response.headers.getSetCookie()[0], /^gs_private_session=[\w-]+; Path=\/; HttpOnly; SameSite=Lax; Max-Age=604800$/)
  assert.equal((await h.request('/auth/me')).body.user.email, 'player@example.com')
  assert.equal((await h.request('/auth/register/confirm', { token: raw })).status, 400, 'a link works once')

  // Nothing secret is stored in a recoverable form.
  const state = JSON.stringify([...h.store._state.users.values()]) + JSON.stringify([...h.store._state.sessions.keys()]) + JSON.stringify([...h.store._state.tokens.keys()])
  assert.ok(!state.includes(password) && !state.includes(raw) && !state.includes(h.jar.gs_private_session))
  assert.ok(h.store._state.sessions.has(digest(h.jar.gs_private_session)))

  assert.equal((await h.request('/auth/logout', {})).status, 200)
  assert.equal((await h.request('/auth/me')).body.user, null)
  const wrong = await h.request('/auth/login', { email: 'player@example.com', password: 'wrong password here' })
  const unknown = await h.request('/auth/login', { email: 'nobody@example.com', password: 'wrong password here' })
  assert.equal(wrong.status, 401); assert.equal(unknown.status, 401)
  assert.deepEqual(wrong.body, unknown.body, 'unknown address and wrong password look identical')
  assert.equal((await h.request('/auth/login', { email: 'player@example.com', password })).status, 200)
  const firstSession = h.jar.gs_private_session

  // Same answer, no letter, for an address that already has an account.
  const mailsBefore = h.mails.length
  const duplicate = await h.request('/auth/register', { email: 'player@example.com', password: 'a different long password', displayName: 'Attacker' })
  assert.equal(duplicate.status, 202); assert.equal(h.mails.length, mailsBefore, 'no link for an existing address')
  assert.deepEqual(h.notices, [{ to: 'player@example.com', kind: 'EXISTS', url: origin + '/account' }], 'a link-less notice keeps the timing and mail count equal')

  assert.equal((await h.request('/auth/password/reset/request', { email: 'absent@example.com' })).status, 202)
  assert.equal(h.mails.length, mailsBefore, 'recovery for an unknown address sends no link')
  assert.deepEqual(h.notices.at(-1), { to: 'absent@example.com', kind: 'NO_ACCOUNT', url: origin + '/account' })
  assert.equal((await h.request('/auth/password/reset/request', { email: 'player@example.com' })).status, 202)
  const reset = h.tokenOf('player@example.com', 'RESET')
  const done = await h.request('/auth/password/reset', { token: reset, password: 'new secure password!' })
  assert.equal(done.status, 200)
  assert.ok(!h.store._state.sessions.has(digest(firstSession)), 'every old session is revoked')
  assert.equal((await h.request('/auth/me')).body.user, null)
  assert.equal((await h.request('/auth/password/reset', { token: reset, password: 'another secure password' })).status, 400)
  assert.equal((await h.request('/auth/login', { email: 'player@example.com', password })).status, 401)
  assert.equal((await h.request('/auth/login', { email: 'player@example.com', password: 'new secure password!' })).status, 200)
  assert.deepEqual(h.store._state.audit.map(row => row.action), ['account.verified', 'password.reset'])
})

test('links expire after 20 minutes, sessions after 7 days; concurrent use of one link creates exactly one account', async () => {
  const h = harness()
  await h.request('/auth/register', { email: 'late@example.com', password, displayName: 'Late' })
  const late = h.tokenOf('late@example.com', 'REGISTER')
  h.advance(21 * 60_000)
  assert.equal((await h.request('/auth/register/confirm', { token: late })).status, 400)

  await h.request('/auth/register', { email: 'race@example.com', password, displayName: 'Race' })
  const race = h.tokenOf('race@example.com', 'REGISTER')
  const answers = await Promise.all([h.request('/auth/register/confirm', { token: race }), h.request('/auth/register/confirm', { token: race })])
  assert.deepEqual(answers.map(a => a.status).sort(), [200, 400])
  assert.equal([...h.store._state.users.values()].filter(u => u.email === 'race@example.com').length, 1)

  h.advance(6 * 86_400_000)
  assert.equal((await h.request('/auth/me')).body.user.email, 'race@example.com')
  h.advance(2 * 86_400_000)
  assert.equal((await h.request('/auth/me')).body.user, null)
})

test('a newer link replaces the older one for the same address and purpose', async () => {
  const h = harness()
  await h.request('/auth/register', { email: 'twice@example.com', password, displayName: 'Twice' })
  const first = h.tokenOf('twice@example.com', 'REGISTER')
  await h.request('/auth/register', { email: 'twice@example.com', password, displayName: 'Twice' })
  const second = h.tokenOf('twice@example.com', 'REGISTER')
  assert.notEqual(first, second)
  assert.equal((await h.request('/auth/register/confirm', { token: first })).status, 400)
  assert.equal((await h.request('/auth/register/confirm', { token: second })).status, 200)
})

test('closed registration, missing mail and emergency mode never create accounts; existing sign-in keeps working', async () => {
  const open = harness()
  await open.request('/auth/register', { email: 'old@example.com', password, displayName: 'Old' })
  await open.request('/auth/register/confirm', { token: open.tokenOf('old@example.com', 'REGISTER') })

  const closed = harness({ registrationOpen: false })
  closed.store._state.users.set('u1', { id: 'u1', email: 'old@example.com' })
  assert.equal((await closed.request('/auth/me')).body.registrationOpen, false)
  assert.equal((await closed.request('/auth/register', { email: 'x@example.com', password, displayName: 'Xx' })).body.error.code, 'registration_closed')
  assert.equal((await closed.request('/auth/register/confirm', { token: 'x'.repeat(40) })).status, 403)

  const omitted = harness({ registrationOpen: undefined })
  assert.equal((await omitted.request('/auth/me')).body.registrationOpen, false, 'an omitted policy is closed, not open')

  const noMail = harness({ mailEnabled: false })
  assert.equal((await noMail.request('/auth/register', { email: 'x@example.com', password, displayName: 'Xx' })).body.error.code, 'mail_disabled')
  assert.equal((await noMail.request('/auth/password/reset/request', { email: 'x@example.com' })).body.error.code, 'mail_disabled')
  assert.equal((await noMail.request('/auth/me')).body.emailLogin, false)
  assert.equal(noMail.mails.length, 0); assert.equal(noMail.notices.length, 0)

  const emergency = harness({ emergencyMode: true })
  assert.equal((await emergency.request('/auth/register', { email: 'x@example.com', password, displayName: 'Xx' })).status, 503)
  assert.equal((await emergency.request('/auth/me')).body.registrationOpen, false)
  assert.equal((await emergency.request('/auth/login', { email: 'x@example.com', password })).status, 401)
  assert.equal(emergency.store._state.users.size, 0)
})

test('input, origin, size and content-type guards; per-address and per-IP rate limits', async () => {
  const h = harness()
  assert.equal((await h.request('/auth/register', { email: 'bad', password, displayName: 'Player' })).body.error.code, 'email_invalid')
  assert.equal((await h.request('/auth/register', { email: 'a@example.com', password: 'short', displayName: 'Player' })).body.error.code, 'password_weak')
  assert.equal((await h.request('/auth/register', { email: 'a@example.com', password, displayName: 'P' })).body.error.code, 'invalid_input')
  assert.equal((await h.request('/auth/register', { email: 'a@example.com', password, displayName: 'Player' }, { headers: { Origin: 'https://evil.example' } })).status, 403)
  assert.equal((await h.request('/auth/register', { email: 'a@example.com', password, displayName: 'Player' }, { headers: { 'Content-Type': 'text/plain' } })).status, 415)
  assert.equal((await h.request('/auth/register', null, { raw: JSON.stringify({ pad: 'x'.repeat(17000) }) })).status, 413)
  assert.equal((await h.request('/auth/register', null, { raw: '[1,2]' })).body.error.code, 'invalid_json')
  assert.equal((await h.request('/auth/register', null, { raw: '{broken' })).body.error.code, 'invalid_json')
  assert.equal((await h.request('/auth/register/confirm', { token: 'x'.repeat(200) })).status, 400)
  assert.equal(h.mails.length, 0)

  for (let i = 0; i < 5; i++) assert.equal((await h.request('/auth/password/reset/request', { email: 'absent@example.com' })).status, 202)
  assert.equal((await h.request('/auth/password/reset/request', { email: 'absent@example.com' })).status, 429)
  // A fresh 15-minute window starts counting again.
  h.advance(15 * 60_000)
  assert.equal((await h.request('/auth/password/reset/request', { email: 'absent@example.com' })).status, 202)
  // One IP cannot spray many addresses: 4× the per-address bound.
  const ip = harness()
  let last = 0
  let accepted = 0
  for (let i = 0; i < 30 && last !== 429; i++) {
    last = (await ip.request('/auth/password/reset/request', { email: `u${i}@example.com` }, { ip: '198.51.100.9' })).status
    if (last === 202) accepted++
  }
  assert.equal(last, 429)
  assert.equal(accepted, 20)
})

test('only the accounts routes exist; any other private route is a JSON 404; health checks the store', async () => {
  const h = harness()
  for (const path of ['/claims', '/coins/me', '/payments/me', '/me/favorites', '/owners/me/claims', '/admin/overview']) {
    const answer = await h.request(path)
    assert.equal(answer.status, 404, path)
    assert.equal(answer.body.error.code, 'route_unavailable', path)
  }
  const google = await h.request('/auth/google')
  assert.equal(google.status, 404); assert.equal(google.body.error.code, 'provider_disabled', 'no provider secrets: Google is off')
  const health = await h.request('/health')
  assert.deepEqual(health.body, { status: 'ok', storage: 'ydb-serverless', scope: 'accounts' })
  assert.equal(health.response.headers.get('Cache-Control'), 'no-store')
})

test('production requires https origin and strong keys; gateway client IP comes from the gateway, not from a public header', () => {
  const store = memoryStore(), config = { ...baseConfig, environment: 'production', origin: 'http://gamescout.online' }
  assert.throws(() => createAccountsApp({ store, passwords, config, sendLinkMail: async () => {} }), /https_required/)
  assert.throws(() => createAccountsApp({ store, config: baseConfig, sendLinkMail: async () => {} }), /password_hashing_required/)
  assert.throws(() => createAccountsApp({ store, passwords, config: { ...baseConfig, rateKey: 'short' }, sendLinkMail: async () => {} }), /private_keys_required/)
  assert.equal(gatewayClientIp({ requestContext: { identity: { sourceIp: '203.0.113.5' } }, headers: { 'X-Forwarded-For': '1.1.1.1' } }), '203.0.113.5')
  assert.equal(gatewayClientIp({ headers: { 'X-Forwarded-For': '9.9.9.9, 203.0.113.6' } }), '203.0.113.6')
  assert.equal(gatewayClientIp({ headers: { 'X-Forwarded-For': 'not-an-ip' } }), 'unknown')
  assert.equal(gatewayClientIp({}), 'unknown')
})
