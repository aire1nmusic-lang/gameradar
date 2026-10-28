import test from 'node:test'
import assert from 'node:assert/strict'
import { freeAccounts, freeAccountsCleanup, dailyLimit } from '../worker/accounts-free.ts'
import { devOutbox } from '../worker/lib/mailer.ts'
import { sqliteD1 } from './helpers/d1-sqlite.mjs'

const origin = 'http://127.0.0.1:5173', password = 'correct horse battery staple'
const env = (extra = {}) => ({ DB: sqliteD1(['migrations/0012_free_accounts.sql']), ENVIRONMENT: 'development', ALLOWED_ORIGIN: origin,
  ACCOUNTS_FREE: 'true', ACCOUNTS_REGISTRATION_OPEN: 'true', MAIL_DRIVER: 'log', PASSWORD_PEPPER: 'p'.repeat(40), ACCOUNTS_RATE_KEY: 'r'.repeat(40), ...extra })
const post = (path, body, headers = {}) => new Request(origin + '/api/v1' + path, { method: 'POST',
  headers: { Origin: origin, 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.9', ...headers }, body: JSON.stringify(body) })

test('off by default and for non-auth paths; refuses to run without its own secrets', async () => {
  assert.equal(await freeAccounts(new Request(origin + '/api/v1/auth/me'), env({ ACCOUNTS_FREE: undefined })), null)
  assert.equal(await freeAccounts(new Request(origin + '/api/v1/games'), env()), null)
  assert.equal(await freeAccounts(new Request(origin + '/api/v1/claims'), env()), null)
  assert.equal(await freeAccounts(new Request(origin + '/api/v1/auth/dev'), env()), null, 'local dev sign-in stays in the main Worker')
  assert.equal(await freeAccounts(new Request(origin + '/api/v1/auth/me'), env({ ACCOUNTS_IN_D1: 'true' })), null, 'explicit legacy D1 accounts win')
  assert.equal(await freeAccounts(new Request(origin + '/api/v1/auth/me'), env({ PASSWORD_PEPPER: undefined })), null, 'development without secrets falls back')
  for (const missing of [{ PASSWORD_PEPPER: 'short' }, { ACCOUNTS_RATE_KEY: undefined }, { ALLOWED_ORIGIN: undefined }]) {
    const answer = await freeAccounts(new Request(origin + '/api/v1/auth/me'), env({ ...missing, ENVIRONMENT: 'production' }))
    assert.equal(answer.status, 503); assert.equal((await answer.json()).error.code, 'accounts_unavailable')
  }
})

test('full journey on the D1 store with PBKDF2+pepper; the stored hash is not scrypt and contains no password', async () => {
  const e = env()
  devOutbox.length = 0
  assert.equal((await freeAccounts(post('/auth/register', { email: 'w@example.com', password, displayName: 'Worker' }), e)).status, 202)
  const link = devOutbox.find(m => m.to === 'w@example.com').text.match(/token=([\w-]+)/)[1]
  const confirmed = await freeAccounts(post('/auth/register/confirm', { token: link }), e)
  assert.equal(confirmed.status, 200)
  const cookie = confirmed.headers.getSetCookie()[0].split(';')[0]
  const me = await (await freeAccounts(new Request(origin + '/api/v1/auth/me', { headers: { Cookie: cookie } }), e)).json()
  assert.equal(me.user.email, 'w@example.com'); assert.equal(me.privateCore, true)
  const row = e.DB.sqlite.prepare('SELECT password_hash FROM acc_users').get()
  assert.match(row.password_hash, /^pbkdf2\$15000\$/); assert.ok(!row.password_hash.includes(password))
  assert.equal((await freeAccounts(post('/auth/login', { email: 'w@example.com', password }), e)).status, 200)
  // A different pepper cannot verify the stored hash.
  const other = env({ PASSWORD_PEPPER: 'q'.repeat(40) }); other.DB = e.DB
  assert.equal((await freeAccounts(post('/auth/login', { email: 'w@example.com', password }, { 'CF-Connecting-IP': '203.0.113.10' }), other)).status, 401)
})

test('daily cap answers 503 without touching accounts; forged origins and reads are not counted; cleanup is hourly', async () => {
  const e = env({ ACCOUNTS_DAILY_LIMIT: '3' })
  for (let i = 0; i < 5; i++) assert.equal((await freeAccounts(post('/auth/register', {}, { Origin: 'https://evil.example' }), e)).status, 403)
  for (let i = 0; i < 5; i++) assert.equal((await freeAccounts(new Request(origin + '/api/v1/auth/me'), e)).status, 200)
  for (let i = 0; i < 3; i++) assert.equal((await freeAccounts(post('/auth/password/reset/request', { email: `n${i}@example.com` }), e)).status, 202)
  const capped = await freeAccounts(post('/auth/password/reset/request', { email: 'n9@example.com' }), e)
  assert.equal(capped.status, 503); assert.equal((await capped.json()).error.code, 'accounts_daily_limit')
  assert.equal(dailyLimit({}), 1500); assert.equal(dailyLimit({ ACCOUNTS_DAILY_LIMIT: 'nonsense' }), 1500); assert.equal(dailyLimit({ ACCOUNTS_DAILY_LIMIT: '200' }), 200)
  e.DB.sqlite.prepare("INSERT INTO acc_daily(day,calls) VALUES('2000-01-01',1)").run()
  await freeAccountsCleanup(e, new Date('2026-10-29T10:30:00Z'))
  assert.equal(e.DB.sqlite.prepare("SELECT count(*) n FROM acc_daily WHERE day='2000-01-01'").get().n, 1, 'not on the hour: no cleanup')
  await freeAccountsCleanup(e, new Date('2026-10-29T11:00:30Z'))
  assert.equal(e.DB.sqlite.prepare("SELECT count(*) n FROM acc_daily WHERE day='2000-01-01'").get().n, 0)
})
