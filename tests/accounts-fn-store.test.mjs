import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { memoryStore } from '../accounts-fn/store-memory.mjs'
import { d1Store } from '../accounts-fn/store-d1.mjs'
import { sqliteD1 } from './helpers/d1-sqlite.mjs'

/**
 * Store contract. Always runs against the in-memory reference; runs against a real YDB too when
 * YDB_TEST_ENDPOINT/YDB_TEST_DATABASE point at a DISPOSABLE database whose tables were created with
 * `node accounts-fn/migrate.mjs --apply` (for example a local `ydbplatform/local-ydb` container):
 *   YDB_TEST_ENDPOINT=grpc://localhost:2136 YDB_TEST_DATABASE=/local YDB_ANONYMOUS_CREDENTIALS=1 node --test tests/accounts-fn-store.test.mjs
 * Each case uses random addresses and keys, so no cleanup is needed.
 */
const factories = [['memory', async () => memoryStore()], ['d1-sqlite', async () => d1Store(sqliteD1(['migrations/0012_free_accounts.sql']))]]
if (process.env.YDB_TEST_ENDPOINT && process.env.YDB_TEST_DATABASE) {
  factories.push(['ydb', async () => {
    const { createYdbStore } = await import('../accounts-fn/store-ydb.mjs')
    process.env.YDB_ENDPOINT = process.env.YDB_TEST_ENDPOINT; process.env.YDB_DATABASE = process.env.YDB_TEST_DATABASE
    return createYdbStore()
  }])
}
const id = () => randomBytes(9).toString('hex')
const minutes = (from, n) => new Date(from.getTime() + n * 60_000)
const now = new Date('2026-10-28T12:00:00.000Z')

for (const [name, make] of factories) {
  test(`[${name}] rate counters increment per key and window and expire`, async () => {
    const store = await make(), key = 'k' + id()
    assert.equal(await store.rateHit({ key, window: 1900000, expiresAt: minutes(now, 30) }), 1)
    assert.equal(await store.rateHit({ key, window: 1900000, expiresAt: minutes(now, 30) }), 2)
    assert.equal(await store.rateHit({ key, window: 1900001, expiresAt: minutes(now, 30) }), 1)
    assert.equal(await store.rateHit({ key: key + 'x', window: 1900000, expiresAt: minutes(now, 30) }), 1)
  })

  test(`[${name}] link → account → session; links are single-use, newer replaces older, expiry is honoured`, async () => {
    const store = await make(), email = `${id()}@example.com`, user = id(), first = id(), second = id(), session = id()
    const payload = { name: 'Player', hash: 'scrypt$stub' }
    assert.equal(await store.issueToken({ email, purpose: 'REGISTER', tokenHash: first, payload, now, expiresAt: minutes(now, 20), onlyIfNoUser: true }), true)
    assert.equal(await store.issueToken({ email, purpose: 'REGISTER', tokenHash: second, payload, now, expiresAt: minutes(now, 20), onlyIfNoUser: true }), true)
    assert.equal(await store.confirmRegistration({ tokenHash: first, userId: id(), sessionHash: id(), replaceSessionHash: id(), sessionExpiresAt: minutes(now, 99), now }), null, 'replaced')
    assert.equal(await store.confirmRegistration({ tokenHash: second, userId: id(), sessionHash: id(), replaceSessionHash: id(), sessionExpiresAt: minutes(now, 99), now: minutes(now, 21) }), null, 'expired')
    const created = await store.confirmRegistration({ tokenHash: second, userId: user, sessionHash: session, replaceSessionHash: id(), sessionExpiresAt: minutes(now, 99), now: minutes(now, 5) })
    assert.equal(created.id, user); assert.equal(created.email, email); assert.equal(created.displayName, 'Player'); assert.deepEqual(created.roles, ['PLAYER'])
    assert.equal(await store.confirmRegistration({ tokenHash: second, userId: id(), sessionHash: id(), replaceSessionHash: id(), sessionExpiresAt: minutes(now, 99), now }), null, 'single use')
    const found = await store.userByEmail(email)
    assert.equal(found.id, user); assert.equal(found.passwordHash, 'scrypt$stub'); assert.ok(found.emailVerifiedAt instanceof Date); assert.equal(found.bannedAt, null)
    assert.equal((await store.userById(user)).email, email)
    assert.equal(await store.userByEmail(`${id()}@example.com`), null)
    const live = await store.sessionUser({ tokenHash: session, now: minutes(now, 10) })
    assert.equal(live.user.id, user); assert.equal(live.user.loginMethod, 'email')
    assert.equal(await store.sessionUser({ tokenHash: session, now: minutes(now, 100) }), null, 'session expiry')
    assert.equal(await store.sessionUser({ tokenHash: id(), now }), null)
    // An account now exists: a new REGISTER link must not be issued for the same address.
    assert.equal(await store.issueToken({ email, purpose: 'REGISTER', tokenHash: id(), payload, now, expiresAt: minutes(now, 20), onlyIfNoUser: true }), false)
  })

  test(`[${name}] sign-in replaces the incoming session, refuses a changed password, logout deletes`, async () => {
    const store = await make(), email = `${id()}@example.com`, user = id(), link = id(), s0 = id(), s1 = id(), s2 = id()
    await store.issueToken({ email, purpose: 'REGISTER', tokenHash: link, payload: { name: 'Player', hash: 'h1' }, now, expiresAt: minutes(now, 20), onlyIfNoUser: true })
    await store.confirmRegistration({ tokenHash: link, userId: user, sessionHash: s0, replaceSessionHash: id(), sessionExpiresAt: minutes(now, 99), now })
    assert.equal(await store.openSession({ userId: user, expectedPasswordHash: 'stale', sessionHash: s1, replaceSessionHash: s0, sessionExpiresAt: minutes(now, 99), loginMethod: 'email', now }), false)
    assert.ok(await store.sessionUser({ tokenHash: s0, now }), 'a refused sign-in keeps the old session')
    assert.equal(await store.openSession({ userId: user, expectedPasswordHash: 'h1', sessionHash: s1, replaceSessionHash: s0, sessionExpiresAt: minutes(now, 99), loginMethod: 'email', now }), true)
    assert.equal(await store.sessionUser({ tokenHash: s0, now }), null, 'rotated')
    assert.ok(await store.sessionUser({ tokenHash: s1, now }))
    assert.equal(await store.openSession({ userId: id(), expectedPasswordHash: 'h1', sessionHash: s2, replaceSessionHash: id(), sessionExpiresAt: minutes(now, 99), loginMethod: 'email', now }), false)
    await store.deleteSession(s1)
    assert.equal(await store.sessionUser({ tokenHash: s1, now }), null)
    await store.deleteSession(id())
  })

  test(`[${name}] password reset consumes its link, changes the hash and revokes every session; a foreign link is refused`, async () => {
    const store = await make(), email = `${id()}@example.com`, user = id(), link = id(), reset = id(), sessions = [id(), id(), id()]
    await store.issueToken({ email, purpose: 'REGISTER', tokenHash: link, payload: { name: 'Player', hash: 'old' }, now, expiresAt: minutes(now, 20), onlyIfNoUser: true })
    await store.confirmRegistration({ tokenHash: link, userId: user, sessionHash: sessions[0], replaceSessionHash: id(), sessionExpiresAt: minutes(now, 99), now })
    for (const [i, hash] of sessions.slice(1).entries())
      await store.openSession({ userId: user, expectedPasswordHash: 'old', sessionHash: hash, replaceSessionHash: id(), sessionExpiresAt: minutes(now, 99 + i), loginMethod: 'email', now })
    assert.equal(await store.resetPassword({ tokenHash: id(), passwordHash: 'x', now }), false)
    await store.issueToken({ email, purpose: 'EMAIL', tokenHash: id(), payload: {}, now, expiresAt: minutes(now, 20), onlyIfNoUser: false })
    await store.issueToken({ email, purpose: 'RESET', tokenHash: reset, payload: { userId: user }, now, expiresAt: minutes(now, 20), onlyIfNoUser: false })
    assert.equal(await store.resetPassword({ tokenHash: reset, passwordHash: 'new', now: minutes(now, 21) }), false, 'expired')
    assert.equal(await store.resetPassword({ tokenHash: reset, passwordHash: 'new', now: minutes(now, 5) }), true)
    assert.equal(await store.resetPassword({ tokenHash: reset, passwordHash: 'newer', now: minutes(now, 5) }), false, 'single use')
    assert.equal((await store.userByEmail(email)).passwordHash, 'new')
    for (const hash of sessions) assert.equal(await store.sessionUser({ tokenHash: hash, now }), null)
    const foreign = id()
    await store.issueToken({ email: `${id()}@example.com`, purpose: 'RESET', tokenHash: foreign, payload: { userId: user }, now, expiresAt: minutes(now, 20), onlyIfNoUser: false })
    assert.equal(await store.resetPassword({ tokenHash: foreign, passwordHash: 'hijack', now }), false, 'a link for another address cannot reset this account')
    assert.equal((await store.userByEmail(email)).passwordHash, 'new')
  })

  test(`[${name}] two simultaneous confirmations of one link create exactly one account`, async () => {
    const store = await make(), email = `${id()}@example.com`, link = id()
    await store.issueToken({ email, purpose: 'REGISTER', tokenHash: link, payload: { name: 'Race', hash: 'h' }, now, expiresAt: minutes(now, 20), onlyIfNoUser: true })
    const attempt = () => store.confirmRegistration({ tokenHash: link, userId: id(), sessionHash: id(), replaceSessionHash: id(), sessionExpiresAt: minutes(now, 99), now })
    const results = await Promise.all([attempt(), attempt()])
    assert.equal(results.filter(Boolean).length, 1)
  })
}
