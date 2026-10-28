import test from 'node:test'
import assert from 'node:assert/strict'
import { createAccountsApp } from '../accounts-fn/app.mjs'
import { memoryStore } from '../accounts-fn/store-memory.mjs'
import { d1Store } from '../accounts-fn/store-d1.mjs'
import { hashPassword, verifyPassword } from '../private-api/crypto.mjs'
import { sqliteD1 } from './helpers/d1-sqlite.mjs'

const origin = 'http://127.0.0.1:5173'
const oauth = { VK_CLIENT_ID: 'vk', GOOGLE_CLIENT_ID: 'gid', GOOGLE_CLIENT_SECRET: 'gsecret', DISCORD_CLIENT_ID: 'did', DISCORD_CLIENT_SECRET: 'dsecret',
  YANDEX_CLIENT_ID: 'yid', YANDEX_CLIENT_SECRET: 'ysecret' }
const stores = [['memory', () => memoryStore()], ['d1-sqlite', () => d1Store(sqliteD1(['migrations/0012_free_accounts.sql']))]]

function harness(makeStore, { registrationOpen = true, profiles = {}, withOAuth = true } = {}) {
  const store = makeStore(), calls = []
  const app = createAccountsApp({ store, passwords: { hash: hashPassword, verify: verifyPassword }, sendLinkMail: async () => {},
    config: { origin, environment: 'development', rateKey: 'k'.repeat(40), mailEnabled: true, registrationOpen, ...(withOAuth ? { oauth } : {}) },
    oauthExchange: async (env, provider, code, query, verifier) => {
      calls.push({ provider, code, verifier })
      const profile = profiles[code]
      if (!profile) throw new Error('provider refused')
      return profile
    } })
  const request = async (path, cookies = {}) => {
    const cookie = Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ')
    const response = await app.fetch(new Request(origin + path, { headers: cookie ? { Cookie: cookie } : {} }), { clientIp: '203.0.113.20' })
    const set = Object.fromEntries(response.headers.getSetCookie().map(line => { const [pair] = line.split(';'); const i = pair.indexOf('='); return [pair.slice(0, i), { value: pair.slice(i + 1), line }] }))
    return { status: response.status, location: response.headers.get('Location'), set, body: response.headers.get('Content-Type')?.includes('json') ? await response.json() : null }
  }
  /** Starts a provider round trip and returns {state, browser} as the browser would hold them. */
  const start = async (provider, next = '/account') => {
    const answer = await request(`/api/v1/auth/${provider}?next=${encodeURIComponent(next)}`)
    assert.equal(answer.status, 302)
    return { state: new URL(answer.location).searchParams.get('state'), browser: answer.set.gs_private_oauth.value, answer }
  }
  return { store, calls, request, start }
}

for (const [name, makeStore] of stores) {
  test(`[${name}] Yandex, Google and Discord are offered, and only when configured`, async () => {
    const h = harness(makeStore)
    assert.deepEqual((await h.request('/api/v1/auth/me')).body.providers, ['google', 'yandex', 'discord'])
    assert.deepEqual((await harness(makeStore, { withOAuth: false }).request('/api/v1/auth/me')).body.providers, [])
    assert.equal((await h.request('/api/v1/auth/vk')).status, 404, 'VK is not offered by this service')
    assert.equal((await h.request('/api/v1/auth/github')).status, 404)
    assert.equal((await h.request('/api/v1/auth/google?link=1')).status, 400)
  })

  test(`[${name}] Google round trip: provider redirect, browser-bound one-use state, session, same account next time`, async () => {
    const h = harness(makeStore, { profiles: { c1: { id: 'g-123', displayName: 'Gamer\u0007 Name', email: 'gamer@gmail.com', emailVerified: true },
      c2: { id: 'g-123', displayName: 'Renamed', email: 'gamer@gmail.com', emailVerified: true } } })
    const { state, browser, answer } = await h.start('google')
    const target = new URL(answer.location)
    assert.equal(target.origin + target.pathname, 'https://accounts.google.com/o/oauth2/v2/auth')
    assert.equal(target.searchParams.get('redirect_uri'), origin + '/api/v1/auth/google/callback')
    assert.match(answer.set.gs_private_oauth.line, /Path=\/api\/v1\/auth; HttpOnly; SameSite=Lax; Max-Age=600/)

    // Another browser (no / wrong cookie) cannot finish this round trip.
    assert.match((await h.request(`/api/v1/auth/google/callback?code=c1&state=${state}`)).location, /auth_error=google&reason=expired/)
    assert.match((await h.request(`/api/v1/auth/google/callback?code=c1&state=${state}`, { gs_private_oauth: 'other' })).location, /reason=expired/)

    const done = await h.request(`/api/v1/auth/google/callback?code=c1&state=${state}`, { gs_private_oauth: browser })
    assert.equal(done.status, 302); assert.equal(done.location, '/account')
    assert.match(done.set.gs_private_session.line, /HttpOnly; SameSite=Lax; Max-Age=604800/)
    assert.equal(done.set.gs_private_oauth.value, '')
    const me = (await h.request('/api/v1/auth/me', { gs_private_session: done.set.gs_private_session.value })).body.user
    assert.equal(me.displayName, 'Gamer Name'); assert.equal(me.loginMethod, 'google')
    assert.equal(me.email, null, 'the provider e-mail is not copied into the account'); assert.equal(me.hasPassword, false)
    assert.deepEqual(me.identities.map(x => x.provider), ['google'])

    // The state is single use.
    assert.match((await h.request(`/api/v1/auth/google/callback?code=c1&state=${state}`, { gs_private_oauth: browser })).location, /reason=expired/)
    // Signing in again with the same Google account lands in the same GameScout account.
    const again = await h.start('google')
    const second = await h.request(`/api/v1/auth/google/callback?code=c2&state=${again.state}`, { gs_private_oauth: again.browser })
    const me2 = (await h.request('/api/v1/auth/me', { gs_private_session: second.set.gs_private_session.value })).body.user
    assert.equal(me2.id, me.id)
  })

  test(`[${name}] Discord: closed registration refuses new people but lets existing ones in; provider failure and unsafe next`, async () => {
    const open = harness(makeStore, { profiles: { d1: { id: '123456789012345678', displayName: 'Raider', emailVerified: false } } })
    const first = await open.start('discord', '//evil.example/steal')
    const done = await open.request(`/api/v1/auth/discord/callback?code=d1&state=${first.state}`, { gs_private_oauth: first.browser })
    assert.equal(done.location, '/account', 'an unsafe next path falls back to the account page')

    const closed = harness(() => open.store, { registrationOpen: false, profiles: { d1: { id: '123456789012345678', displayName: 'Raider' },
      d2: { id: '999999999999999999', displayName: 'Newcomer' } } })
    const existing = await closed.start('discord')
    const ok = await closed.request(`/api/v1/auth/discord/callback?code=d1&state=${existing.state}`, { gs_private_oauth: existing.browser })
    assert.ok(ok.set.gs_private_session, 'existing Discord account signs in while sign-up is closed')
    const newcomer = await closed.start('discord')
    const refused = await closed.request(`/api/v1/auth/discord/callback?code=d2&state=${newcomer.state}`, { gs_private_oauth: newcomer.browser })
    assert.match(refused.location, /auth_error=discord&reason=closed/); assert.equal(refused.set.gs_private_session, undefined)

    const failing = await closed.start('discord')
    assert.match((await closed.request(`/api/v1/auth/discord/callback?code=nope&state=${failing.state}`, { gs_private_oauth: failing.browser })).location, /reason=provider/)
    assert.match((await closed.request('/api/v1/auth/discord/callback?state=x', { gs_private_oauth: 'y' })).location, /reason=invalid/)
  })
}
