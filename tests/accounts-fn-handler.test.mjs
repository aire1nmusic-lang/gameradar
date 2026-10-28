import test from 'node:test'
import assert from 'node:assert/strict'
import { createHandler, configFromEnv, noticeMail, toRequest } from '../accounts-fn/handler.mjs'
import { memoryStore } from '../accounts-fn/store-memory.mjs'

const origin = 'https://gamescout.online', password = 'correct horse battery staple'
const config = { origin, environment: 'production', rateKey: 'k'.repeat(40), mailEnabled: true, registrationOpen: true }
const event = (httpMethod, path, { body, headers = {}, ip = '203.0.113.5' } = {}) => ({
  version: '1.0', httpMethod, path, headers: { Origin: origin, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
  queryStringParameters: {}, requestContext: { identity: { sourceIp: ip } }, body: body === undefined ? undefined : JSON.stringify(body), isBase64Encoded: false })

test('API Gateway v1.0 events map to requests and responses; every Set-Cookie travels in multiValueHeaders', async () => {
  const store = memoryStore(), mails = []
  const handle = createHandler({ config, store: async () => store, sendLinkMail: async (to, purpose, link) => { mails.push({ to, purpose, link }) } })
  const me = await handle(event('GET', '/api/v1/auth/me'))
  assert.equal(me.statusCode, 200)
  assert.equal(me.headers['content-type'], 'application/json')
  assert.equal(me.headers['cache-control'], 'no-store')
  assert.equal(JSON.parse(me.body).registrationOpen, true)
  assert.equal(me.multiValueHeaders, undefined)

  assert.equal((await handle(event('POST', '/api/v1/auth/register', { body: { email: 'gw@example.com', password, displayName: 'Gateway' } }))).statusCode, 202)
  const raw = new URLSearchParams(new URL(mails[0].link).hash.slice(1)).get('token')
  assert.match(mails[0].link, /^https:\/\/gamescout\.online\/account#/)
  const confirmed = await handle(event('POST', '/api/v1/auth/register/confirm', { body: { token: raw } }))
  assert.equal(confirmed.statusCode, 200)
  assert.equal(confirmed.multiValueHeaders['Set-Cookie'].length, 1)
  assert.match(confirmed.multiValueHeaders['Set-Cookie'][0], /^gs_private_session=[\w-]+; Path=\/; HttpOnly; SameSite=Lax; Max-Age=604800; Secure$/)
  assert.equal(confirmed.headers['set-cookie'], undefined)
  const cookie = confirmed.multiValueHeaders['Set-Cookie'][0].split(';')[0]
  const signedIn = JSON.parse((await handle(event('GET', '/api/v1/auth/me', { headers: { Cookie: cookie } }))).body)
  assert.equal(signedIn.user.email, 'gw@example.com')
})

test('base64 bodies, query strings and the gateway client IP are honoured; a store failure is a generic 500', async () => {
  const request = toRequest({ httpMethod: 'POST', path: '/api/v1/auth/login', headers: { 'Content-Type': 'application/json' },
    multiValueQueryStringParameters: { a: ['1', '2'] }, body: Buffer.from('{"x":1}').toString('base64'), isBase64Encoded: true }, origin)
  assert.equal(request.url, 'https://gamescout.online/api/v1/auth/login?a=1&a=2')
  assert.equal(await request.text(), '{"x":1}')

  const store = memoryStore(), seen = []
  const original = store.rateHit
  store.rateHit = async args => { seen.push(args.key); return original(args) }
  const handle = createHandler({ config, store: async () => store, sendLinkMail: async () => {} })
  await handle(event('POST', '/api/v1/auth/password/reset/request', { body: { email: 'a@example.com' }, ip: '198.51.100.1', headers: { 'X-Forwarded-For': '9.9.9.9' } }))
  await handle(event('POST', '/api/v1/auth/password/reset/request', { body: { email: 'b@example.com' }, ip: '198.51.100.1' }))
  assert.equal(seen.length, 4)
  assert.equal(seen[0], seen[2], 'the same gateway IP shares one counter regardless of a forged X-Forwarded-For')

  const broken = createHandler({ config, store: async () => ({ ...memoryStore(), ping: async () => { throw Object.assign(new Error('secret detail'), { code: 'X' }) } }), sendLinkMail: async () => {} })
  const failed = await broken(event('GET', '/api/v1/health'))
  assert.equal(failed.statusCode, 500)
  assert.deepEqual(JSON.parse(failed.body), { error: { code: 'internal_error', message: 'Внутренняя ошибка' } })
  assert.ok(!failed.body.includes('secret'))
})

test('configuration comes from the environment; registration stays closed unless explicitly opened; mail needs a full driver', () => {
  const minimal = configFromEnv({ PUBLIC_ORIGIN: origin, RATE_HASH_KEY: 'r'.repeat(40) })
  assert.equal(minimal.registrationOpen, false); assert.equal(minimal.mailEnabled, false); assert.equal(minimal.emergencyMode, false)
  const smtp = configFromEnv({ PUBLIC_ORIGIN: origin, RATE_HASH_KEY: 'r'.repeat(40), REGISTRATION_OPEN: 'true', MAIL_DRIVER: 'smtp',
    SMTP_HOST: 'smtp.yandex.ru', SMTP_USER: 'gamescout@yandex.ru', SMTP_PASSWORD: 'app-password', MAIL_FROM: 'GameScout <gamescout@yandex.ru>' })
  assert.equal(smtp.registrationOpen, true); assert.equal(smtp.mailEnabled, true)
  assert.equal(configFromEnv({ PUBLIC_ORIGIN: origin, RATE_HASH_KEY: 'r'.repeat(40), MAIL_DRIVER: 'smtp', SMTP_HOST: 'h' }).mailEnabled, false)
  assert.equal(configFromEnv({ PUBLIC_ORIGIN: origin, RATE_HASH_KEY: 'r'.repeat(40), REGISTRATION_OPEN: 'yes' }).registrationOpen, false)
})

test('the link-less notice carries no token and points only at the account page', () => {
  for (const kind of ['EXISTS', 'NO_ACCOUNT']) {
    const mail = noticeMail('who@example.com', kind, origin + '/account')
    assert.equal(mail.to, 'who@example.com')
    assert.match(mail.subject, /^GameScout: /)
    assert.ok(!/token=|#/.test(mail.text + mail.html), 'no one-time link inside a notice')
    assert.ok(mail.text.includes(origin + '/account') && mail.html.includes(origin + '/account'))
  }
  assert.notEqual(noticeMail('a@example.com', 'EXISTS', origin).subject, noticeMail('a@example.com', 'NO_ACCOUNT', origin).subject)
})
