import test from 'node:test'
import assert from 'node:assert/strict'
import { createAccountsApp } from '../accounts-fn/app.mjs'
import { d1Store } from '../accounts-fn/store-d1.mjs'
import { checkProof, proofTarget } from '../accounts-fn/community.mjs'
import { digest } from '../accounts-fn/primitives.mjs'
import { hashPassword, verifyPassword } from '../private-api/crypto.mjs'
import { allMigrations, sqliteD1 } from './helpers/d1-sqlite.mjs'

const origin = 'http://127.0.0.1:5173'
const oauth = { GOOGLE_CLIENT_ID: 'gid', GOOGLE_CLIENT_SECRET: 'gsecret', DISCORD_CLIENT_ID: 'did', DISCORD_CLIENT_SECRET: 'dsecret' }
const profiles = {
  boss: { id: 'g-boss', displayName: 'Boss', email: 'boss@example.com', emailVerified: true },
  ann: { id: 'g-ann', displayName: 'Ann', email: 'ann@gmail.com', emailVerified: true },
  bob: { id: 'g-bob', displayName: 'Bob', email: 'bob@gmail.com', emailVerified: true },
  eve: { id: 'd-eve', displayName: 'Eve', email: 'eve@mail.test', emailVerified: false },
  zed: { id: 'd-zed', displayName: 'Zed', email: null, emailVerified: false },
}

function harness({ turnstile = false } = {}) {
  const db = sqliteD1(allMigrations())
  db.sqlite.exec(`INSERT INTO games (id, slug, name, short_name, created_at) VALUES ('lineage2', 'lineage-2', 'Lineage 2', 'L2', '2026-01-01');
    INSERT INTO servers (id, slug, name, game_id, website, moderation, is_demo, modes, added_at, updated_at) VALUES
      ('s1', 'alpha', 'Alpha', 'lineage2', 'https://alpha.example.org', 'PUBLISHED', 0, '[]', '2026-01-01', '2026-01-01'),
      ('s2', 'beta', 'Beta', 'lineage2', NULL, 'PUBLISHED', 0, '[]', '2026-01-01', '2026-01-01'),
      ('s3', 'draft', 'Draft', 'lineage2', NULL, 'PENDING_MODERATION', 0, '[]', '2026-01-01', '2026-01-01')`)
  let proofAnswer = true, clock = Date.parse('2026-10-29T10:00:00Z')
  const mails = []
  const app = createAccountsApp({ store: d1Store(db), passwords: { hash: hashPassword, verify: verifyPassword }, sendLinkMail: async (to, purpose, link) => { mails.push({ to, purpose, link }) },
    clock: () => new Date(clock),
    config: { origin, environment: 'development', rateKey: 'k'.repeat(40), mailEnabled: true, registrationOpen: true, adminEmails: 'boss@example.com', oauth,
      ...(turnstile ? { turnstileSecret: 'ts', turnstileSiteKey: 'site' } : {}) },
    oauthExchange: async (env, provider, code) => profiles[code],
    community: { db, proofCheck: async () => proofAnswer, captchaVerify: async token => ({ success: token === 'ok', hostname: '127.0.0.1', action: 'vote' }) } })
  const call = async (method, path, { cookie, body, ip = '203.0.113.20', headers = {} } = {}) => {
    const init = { method, headers: { ...(cookie ? { Cookie: `gs_private_session=${cookie}` } : {}), ...headers } }
    if (method !== 'GET') { init.headers.Origin = origin; init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(body ?? {}) }
    const response = await app.fetch(new Request(origin + path, init), { clientIp: ip })
    return { status: response.status, body: response.headers.get('Content-Type')?.includes('json') ? await response.json() : null }
  }
  const signIn = async (who, provider = ['eve', 'zed'].includes(who) ? 'discord' : 'google') => {
    const start = await app.fetch(new Request(`${origin}/api/v1/auth/${provider}?next=/account`), { clientIp: '203.0.113.9' })
    const state = new URL(start.headers.get('Location')).searchParams.get('state')
    const browser = start.headers.getSetCookie().find(line => line.startsWith('gs_private_oauth=')).split(';')[0].split('=')[1]
    const done = await app.fetch(new Request(`${origin}/api/v1/auth/${provider}/callback?code=${who}&state=${state}`, { headers: { Cookie: `gs_private_oauth=${browser}` } }), { clientIp: '203.0.113.9' })
    return done.headers.getSetCookie().find(line => line.startsWith('gs_private_session=')).split(';')[0].split('=')[1]
  }
  let n = 0
  const vote = (cookie, serverId, extra = {}) => call('POST', '/api/v1/people-rating/votes', { cookie, ip: extra.ip,
    headers: { 'Idempotency-Key': extra.key ?? `vote-key-${++n}-padding` },
    body: { serverId, deviceSignal: extra.device === undefined ? `device-${cookie.slice(0, 12)}-0000` : extra.device, pageAgeMs: 5000, ...(extra.captcha ? { captcha: extra.captcha } : {}) } })
  return { db, call, signIn, vote, mails, setProof: value => { proofAnswer = value }, advance: ms => { clock += ms } }
}

test('/auth/me: admin permissions from the role; provider-verified accounts count as verified; OWNER after a Claim', async () => {
  const h = harness()
  const boss = await h.signIn('boss'), ann = await h.signIn('ann'), eve = await h.signIn('eve')
  const me = async cookie => (await h.call('GET', '/api/v1/auth/me', { cookie })).body.user
  const admin = await me(boss)
  assert.deepEqual(admin.roles, ['PLAYER', 'ADMIN'])
  assert.ok(admin.permissions.includes('claims.review') && admin.permissions.includes('votes.configure'))
  assert.ok(!admin.permissions.some(p => /coins|payments|copyright|support|moderation/.test(p)), 'no tabs for services the free core does not run')
  assert.equal((await me(ann)).emailVerified, true, 'Google vouched for the e-mail')
  assert.deepEqual((await me(ann)).permissions, [])
  assert.equal((await me(eve)).emailVerified, false, 'Discord did not vouch: not verified')
  assert.equal((await h.call('GET', '/api/v1/admin/overview', { cookie: ann })).status, 403)
  assert.equal((await h.call('GET', '/api/v1/admin/overview', { cookie: boss })).body.servers, 2)
})

test('votes: one per window, idempotent replay, unverified refused, rating counts accepted votes only, admin can void', async () => {
  const h = harness()
  const boss = await h.signIn('boss'), ann = await h.signIn('ann'), eve = await h.signIn('eve')
  assert.equal((await h.vote(eve, 's1')).body.error.code, 'email_unverified')
  const first = await h.vote(ann, 's1', { key: 'same-key-0000000001' })
  assert.equal(first.status, 201)
  const replay = await h.vote(ann, 's1', { key: 'same-key-0000000001' })
  assert.deepEqual([replay.status, replay.body.replay, replay.body.id], [200, true, first.body.id])
  assert.equal((await h.vote(ann, 's2', { key: 'same-key-0000000001' })).body.error.code, 'idempotency_conflict')
  assert.equal((await h.vote(ann, 's1')).body.error.code, 'vote_window')
  assert.equal((await h.vote(ann, 's3')).body.error.code, 'not_found', 'unpublished cards cannot be voted for')
  assert.equal((await h.vote(ann, 's2', { device: null })).body.error.code, 'captcha_required', 'no device signal and no captcha configured')
  const eligibility = (await h.call('GET', '/api/v1/people-rating/eligibility?serverId=s1', { cookie: ann })).body
  assert.deepEqual(eligibility, { eligible: false, used: 1, limit: 1, windowHours: 24, captchaSiteKey: null })
  const rating = (await h.call('GET', '/api/v1/people-rating?limit=10')).body
  assert.deepEqual(rating.map(row => [row.server_id, row.votes]), [['s1', 1], ['s2', 0]])
  assert.equal((await h.call('POST', `/api/v1/admin/votes/${first.body.id}/review`, { cookie: ann, body: { action: 'VOID', reason: 'Проверка нарушений' } })).status, 403)
  const voided = await h.call('POST', `/api/v1/admin/votes/${first.body.id}/review`, { cookie: boss, body: { action: 'VOID', reason: 'Накрутка с одного устройства' } })
  assert.deepEqual(voided.body, { changed: true, status: 'VOIDED' })
  assert.equal((await h.call('GET', '/api/v1/people-rating?limit=10&offset=0')).body.find(row => row.server_id === 's1').votes, 0)
  h.advance(25 * 3_600_000)
  assert.equal((await h.vote(ann, 's1')).status, 201, 'a new window opens after 24 hours')
})

test('votes: a shared IP limit set by the admin is enforced inside the insert; Turnstile lets a suspicious vote through', async () => {
  const h = harness({ turnstile: true })
  const boss = await h.signIn('boss'), ann = await h.signIn('ann'), bob = await h.signIn('bob')
  const rules = { windowHours: 24, maxPerWindow: 1, ipDailyLimit: 1, deviceDailyLimit: 5, asnDailyLimit: 200, reason: 'Ужесточение на запуске' }
  assert.equal((await h.call('POST', '/api/v1/admin/vote-rules', { cookie: boss, body: rules })).body.changed, true)
  assert.equal((await h.vote(ann, 's1')).status, 201)
  assert.equal((await h.vote(bob, 's1')).body.error.code, 'captcha_required', 'same IP already used its daily vote')
  assert.equal((await h.vote(bob, 's1', { captcha: 'wrong' })).body.error.code, 'captcha_invalid')
  assert.equal((await h.vote(bob, 's1', { captcha: 'ok' })).status, 201)
  assert.equal((await h.vote(bob, 's2', { ip: '198.51.100.7' })).status, 201, 'another IP is not affected')
  assert.equal((await h.call('GET', '/api/v1/people-rating/eligibility?serverId=s2', { cookie: ann })).body.captchaSiteKey, 'site')
})

test('Claims: SITE proof checked by the owner, ADMIN grants; the card gets an owner; nobody else can claim it', async () => {
  const h = harness()
  const boss = await h.signIn('boss'), ann = await h.signIn('ann'), bob = await h.signIn('bob')
  const evidence = 'Я администратор проекта Alpha, вот ссылка на наш сайт'
  const claim = (await h.call('POST', '/api/v1/claims', { cookie: ann, body: { serverId: 's1', evidence } })).body
  assert.equal(claim.status, 'PENDING')
  assert.equal((await h.call('POST', '/api/v1/claims', { cookie: ann, body: { serverId: 's1', evidence } })).body.id, claim.id, 'pending claim is reused')
  assert.equal((await h.call('POST', `/api/v1/claims/${claim.id}/proof`, { cookie: bob, body: { method: 'SITE' } })).status, 404, 'only the applicant')
  assert.equal((await h.call('POST', '/api/v1/claims', { cookie: bob, body: { serverId: 's2', evidence } })).status, 201)
  const bobClaim = (await h.call('GET', '/api/v1/owners/me/claims', { cookie: bob })).body[0]
  assert.equal((await h.call('POST', `/api/v1/claims/${bobClaim.id}/proof`, { cookie: bob, body: { method: 'DNS' } })).body.error.code, 'official_site_required')

  const proof = (await h.call('POST', `/api/v1/claims/${claim.id}/proof`, { cookie: ann, body: { method: 'SITE' } })).body
  assert.equal(proof.target, 'https://alpha.example.org/.well-known/gamescout-verification.txt')
  assert.equal((await h.call('POST', `/api/v1/admin/claims/${claim.id}/resolve`, { cookie: boss, body: { status: 'VERIFIED', reason: 'Код найден на сайте' } })).body.error.code, 'proof_required', 'not checked yet')
  h.setProof(false)
  assert.equal((await h.call('POST', `/api/v1/claims/${claim.id}/proof/check`, { cookie: ann })).body.error.code, 'proof_mismatch')
  h.setProof(true)
  assert.deepEqual((await h.call('POST', `/api/v1/claims/${claim.id}/proof/check`, { cookie: ann })).body, { checked: true, status: 'ADMIN_REVIEW' })
  assert.equal((await h.call('GET', '/api/v1/admin/claims', { cookie: boss })).body.find(row => row.id === claim.id).proof_method, 'SITE')
  const verified = await h.call('POST', `/api/v1/admin/claims/${claim.id}/resolve`, { cookie: boss, body: { status: 'VERIFIED', reason: 'Код найден на сайте' } })
  assert.equal(verified.body.status, 'VERIFIED')
  assert.deepEqual((await h.call('GET', '/api/v1/owners/me/servers', { cookie: ann })).body, [{ server_id: 's1', game_id: 'lineage2', name: 'Alpha', slug: 'alpha' }])
  assert.deepEqual((await h.call('GET', '/api/v1/auth/me', { cookie: ann })).body.user.roles, ['PLAYER', 'OWNER'])
  assert.equal((await h.call('GET', '/api/v1/owners/me/claims', { cookie: ann })).body[0].access_active, true)
  assert.equal((await h.call('POST', '/api/v1/claims', { cookie: bob, body: { serverId: 's1', evidence } })).body.error.code, 'already_claimed')
  assert.equal((await h.call('POST', `/api/v1/claims/${claim.id}/proof/check`, { cookie: ann })).body.error.code, 'proof_expired', 'the proof was consumed')
})

test('Claims: MANUAL proof needs the code the ADMIN saw; self-review and rejection', async () => {
  const h = harness()
  const boss = await h.signIn('boss'), bob = await h.signIn('bob')
  const evidence = 'Код размещён в нашем официальном Discord, канал анонсов'
  const claim = (await h.call('POST', '/api/v1/claims', { cookie: bob, body: { serverId: 's2', evidence } })).body
  const proof = (await h.call('POST', `/api/v1/claims/${claim.id}/proof`, { cookie: bob, body: { method: 'MANUAL' } })).body
  assert.equal(proof.target, 'PUBLIC_RESOURCE_ADMIN_REVIEW')
  assert.equal((await h.call('POST', `/api/v1/claims/${claim.id}/proof/check`, { cookie: bob })).body.error.code, 'admin_review_required')
  const resolve = body => h.call('POST', `/api/v1/admin/claims/${claim.id}/resolve`, { cookie: boss, body })
  assert.equal((await resolve({ status: 'VERIFIED', reason: 'Видел код в Discord', observedToken: 'wrong' })).body.error.code, 'proof_required')
  h.advance(4 * 86_400_000 + 60_000)
  assert.equal((await resolve({ status: 'VERIFIED', reason: 'Видел код в Discord', observedToken: proof.code })).body.error.code, 'proof_required', 'expired after 4 days')
  const fresh = (await h.call('POST', `/api/v1/claims/${claim.id}/proof`, { cookie: bob, body: { method: 'MANUAL' } })).body
  assert.equal((await resolve({ status: 'VERIFIED', reason: 'Видел код в Discord', observedToken: ` ${fresh.code} ` })).body.status, 'VERIFIED')
  assert.equal((await resolve({ status: 'REJECTED', reason: 'Передумал после решения' })).body.error.code, 'claim_closed')
  const bossClaim = (await h.call('POST', '/api/v1/claims', { cookie: boss, body: { serverId: 's1', evidence } })).body
  assert.equal((await h.call('POST', `/api/v1/admin/claims/${bossClaim.id}/resolve`, { cookie: boss, body: { status: 'REJECTED', reason: 'Своя собственная заявка' } })).body.error.code, 'self_review')
})

test('owner edits: summary and facts go to the public card only after an admin approves; one pending edit per field', async () => {
  const h = harness()
  const boss = await h.signIn('boss'), ann = await h.signIn('ann'), bob = await h.signIn('bob')
  const evidence = 'Я администратор проекта Alpha, вот ссылка на наш сайт'
  const claim = (await h.call('POST', '/api/v1/claims', { cookie: ann, body: { serverId: 's1', evidence } })).body
  const proof = (await h.call('POST', `/api/v1/claims/${claim.id}/proof`, { cookie: ann, body: { method: 'MANUAL' } })).body
  await h.call('POST', `/api/v1/admin/claims/${claim.id}/resolve`, { cookie: boss, body: { status: 'VERIFIED', reason: 'Видел код на сайте', observedToken: proof.code } })
  const base = '/api/v1/owners/me/servers/s1'
  assert.equal((await h.call('POST', `${base}/summary-edits`, { cookie: bob, body: { summary: 'Чужое описание сервера без прав' } })).status, 403)
  assert.equal((await h.call('POST', `${base}/summary-edits`, { cookie: ann, body: { summary: 'Смотри https://spam.example' } })).body.error.code, 'invalid_summary')
  const summary = await h.call('POST', `${base}/summary-edits`, { cookie: ann, body: { summary: 'Классический Interlude x10 с честной экономикой' } })
  assert.equal(summary.status, 201)
  assert.equal((await h.call('POST', `${base}/summary-edits`, { cookie: ann, body: { summary: 'Ещё одно описание, пока первое ждёт' } })).body.error.code, 'pending_edit')
  const modes = await h.call('POST', `${base}/fact-edits`, { cookie: ann, body: { field: 'modes', value: 'PvP, Олимпиада', evidence: 'Режимы описаны на официальном сайте проекта' } })
  assert.equal(modes.status, 201)
  assert.equal((await h.call('GET', '/api/v1/admin/server-edits', { cookie: boss })).body.length, 1)
  const approve = (kind, id) => h.call('POST', `/api/v1/admin/${kind}/${id}/resolve`, { cookie: boss, body: { status: 'APPROVED', reason: 'Сверено с сайтом проекта' } })
  assert.equal((await approve('server-edits', summary.body.id)).body.status, 'APPROVED')
  assert.equal((await approve('server-fact-edits', modes.body.id)).body.status, 'APPROVED')
  const card = h.db.sqlite.prepare("SELECT summary, modes FROM servers WHERE id = 's1'").get()
  assert.deepEqual([card.summary, JSON.parse(card.modes)], ['Классический Interlude x10 с честной экономикой', ['PvP', 'Олимпиада']])
  assert.equal((await approve('server-edits', summary.body.id)).body.replay, true)
  assert.equal((await h.call('GET', `${base}/monitoring`, { cookie: ann })).body.configured, false)
})

test('admin: users, bans end sessions, roles grant permissions, ownership revoke; unavailable services say so', async () => {
  const h = harness()
  const boss = await h.signIn('boss'), ann = await h.signIn('ann'), bob = await h.signIn('bob')
  const users = (await h.call('GET', '/api/v1/admin/users', { cookie: boss })).body
  const annRow = users.find(row => row.display_name === 'Ann'), bossRow = users.find(row => row.display_name === 'Boss')
  assert.deepEqual(bossRow.roles, ['ADMIN'])
  assert.equal((await h.call('POST', `/api/v1/admin/users/${bossRow.id}/moderation`, { cookie: boss, body: { action: 'BAN', reason: 'Проверка защиты' } })).body.error.code, 'self_moderation')
  const role = await h.call('POST', `/api/v1/admin/users/${annRow.id}/roles`, { cookie: boss, body: { role: 'MODERATOR', action: 'GRANT' } })
  assert.equal(role.status, 200)
  assert.ok((await h.call('GET', '/api/v1/auth/me', { cookie: ann })).body.user.permissions.includes('votes.manage'))
  assert.equal((await h.call('POST', `/api/v1/admin/users/${annRow.id}/roles`, { cookie: boss, body: { role: 'ADMIN', action: 'GRANT' } })).body.error.code, 'invalid_role_change')
  const bobRow = users.find(row => row.display_name === 'Bob')
  assert.equal((await h.call('POST', `/api/v1/admin/users/${bobRow.id}/moderation`, { cookie: ann, body: { action: 'BAN', reason: 'Модератор не банит' } })).status, 403)
  assert.equal((await h.call('POST', `/api/v1/admin/users/${bobRow.id}/moderation`, { cookie: boss, body: { action: 'BAN', reason: 'Накрутка голосов' } })).body.banned, true)
  assert.equal((await h.call('GET', '/api/v1/auth/me', { cookie: bob })).body.user, null, 'the banned session is gone')
  assert.equal((await h.call('POST', `/api/v1/admin/users/${bossRow.id}/moderation`, { cookie: boss, body: { action: 'BAN', reason: 'ADMIN защищён' } })).body.error.code, 'self_moderation')

  const evidence = 'Я администратор проекта Alpha, вот ссылка на наш сайт'
  const claim = (await h.call('POST', '/api/v1/claims', { cookie: ann, body: { serverId: 's1', evidence } })).body
  const proof = (await h.call('POST', `/api/v1/claims/${claim.id}/proof`, { cookie: ann, body: { method: 'MANUAL' } })).body
  assert.equal((await h.call('POST', `/api/v1/admin/claims/${claim.id}/resolve`, { cookie: ann, body: { status: 'VERIFIED', reason: 'Модератор не выдаёт владение', observedToken: proof.code } })).body.error.code, 'admin_required', 'only an ADMIN grants ownership')
  await h.call('POST', `/api/v1/admin/claims/${claim.id}/resolve`, { cookie: boss, body: { status: 'VERIFIED', reason: 'Видел код на сайте', observedToken: proof.code } })
  assert.equal((await h.call('GET', `/api/v1/admin/users/${annRow.id}/ownership`, { cookie: boss })).body.status, 'OWNER')
  assert.equal((await h.call('POST', `/api/v1/admin/users/${annRow.id}/ownership`, { cookie: boss, body: { action: 'REVOKE', serverId: 's1', reason: 'Проект сменил владельца' } })).body.replay, false)
  assert.deepEqual((await h.call('GET', '/api/v1/owners/me/servers', { cookie: ann })).body, [])
  const events = (await h.call('GET', '/api/v1/admin/system', { cookie: boss })).body.events.map(row => row.action)
  assert.ok(events.includes('ownership.revoked') && events.includes('claim.verified') && events.includes('user.ban'))

  assert.deepEqual((await h.call('GET', '/api/v1/copyright/restrictions/s1')).body, { restrictedLinks: [], restrictedMaterials: [] })
  assert.equal((await h.call('POST', '/api/v1/copyright/claims', { body: {} })).body.error.code, 'copyright_unavailable')
  assert.equal((await h.call('GET', '/api/v1/admin/support', { cookie: boss })).body.error.code, 'route_unavailable')
})

test('proof targets come from the card site; SITE and DNS checks compare only the code hash', async () => {
  assert.equal(proofTarget('https://play.alpha.org/forum', 'DNS'), '_gamescout.play.alpha.org')
  assert.throws(() => proofTarget('http://alpha.org', 'SITE'))
  assert.throws(() => proofTarget('https://10.0.0.1', 'SITE'))
  const code = 'abc123'
  assert.equal(await checkProof({ method: 'SITE', target: 'x', token_hash: digest(code) }, { fetchText: async () => `${code}\n` }), true)
  assert.equal(await checkProof({ method: 'SITE', target: 'x', token_hash: digest(code) }, { fetchText: async () => 'other' }), false)
  const dns = { Answer: [{ type: 16, data: '"v=spf1"' }, { type: 16, data: `"${code}"` }] }
  assert.equal(await checkProof({ method: 'DNS', target: '_gamescout.alpha.org', token_hash: digest(code) }, { fetchJson: async () => dns }), true)
  assert.equal(await checkProof({ method: 'MANUAL', target: 'x', token_hash: digest(code) }), false)
})

test('e-mail linking: a Discord account without a vouched address confirms one by link and can then vote', async () => {
  const h = harness()
  const eve = await h.signIn('eve'), ann = await h.signIn('ann')
  assert.equal((await h.vote(eve, 's1')).body.error.code, 'email_unverified')
  assert.equal((await h.call('POST', '/api/v1/me/email', { cookie: eve, body: { email: 'Eve@Example.org' } })).status, 202)
  const mail = h.mails.find(m => m.to === 'eve@example.org' && m.purpose === 'EMAIL')
  const token = new URLSearchParams(new URL(mail.link).hash.slice(1)).get('token')
  assert.match(mail.link, /purpose=email/)
  assert.equal((await h.call('POST', '/api/v1/me/email/confirm', { cookie: ann, body: { token } })).body.error.code, 'forbidden', 'a link works only for its own account')
  assert.deepEqual((await h.call('POST', '/api/v1/me/email/confirm', { cookie: eve, body: { token } })).body, { ok: true })
  const me = (await h.call('GET', '/api/v1/auth/me', { cookie: eve })).body.user
  assert.deepEqual([me.email, me.emailVerified], ['eve@example.org', true])
  assert.equal((await h.call('POST', '/api/v1/me/email/confirm', { cookie: eve, body: { token } })).body.error.code, 'token_invalid', 'one use')
  assert.equal((await h.call('POST', '/api/v1/me/email', { cookie: eve, body: { email: 'other@example.org' } })).body.error.code, 'email_exists')
  assert.equal((await h.vote(eve, 's1')).status, 201)
  // Google already vouched for Ann's address at sign-in, so her account has one.
  assert.equal((await h.call('POST', '/api/v1/me/email', { cookie: ann, body: { email: 'new@example.org' } })).body.error.code, 'email_exists')
  // A taken address gets the same answer but no link, so the form cannot probe accounts.
  const zed = await h.signIn('zed'), count = h.mails.length
  assert.equal((await h.call('POST', '/api/v1/me/email', { cookie: zed, body: { email: 'eve@example.org' } })).status, 202)
  assert.equal(h.mails.length, count)
})

test('review fixes: a revoked owner’s pending edit closes and never blocks the next owner; concurrent approvals act once; legacy owners stay', async () => {
  const h = harness()
  const boss = await h.signIn('boss'), ann = await h.signIn('ann'), bob = await h.signIn('bob')
  const grant = async (cookie, serverId) => {
    const claim = (await h.call('POST', '/api/v1/claims', { cookie, body: { serverId, evidence: 'Я администратор этого проекта, код на сайте' } })).body
    const proof = (await h.call('POST', `/api/v1/claims/${claim.id}/proof`, { cookie, body: { method: 'MANUAL' } })).body
    return h.call('POST', `/api/v1/admin/claims/${claim.id}/resolve`, { cookie: boss, body: { status: 'VERIFIED', reason: 'Видел код на ресурсе', observedToken: proof.code } })
  }
  assert.equal((await grant(ann, 's1')).body.status, 'VERIFIED')
  const edit = (await h.call('POST', '/api/v1/owners/me/servers/s1/summary-edits', { cookie: ann, body: { summary: 'Описание от прежнего владельца карточки' } })).body
  const annId = (await h.call('GET', '/api/v1/auth/me', { cookie: ann })).body.user.id
  await h.call('POST', `/api/v1/admin/users/${annId}/ownership`, { cookie: boss, body: { action: 'REVOKE', serverId: 's1', reason: 'Проект сменил владельца' } })
  assert.equal(h.db.sqlite.prepare('SELECT status FROM fc_summary_edits WHERE id = ?').get(edit.id).status, 'REJECTED', 'closed with the revocation')
  assert.equal((await grant(bob, 's1')).body.status, 'VERIFIED')
  const next = await h.call('POST', '/api/v1/owners/me/servers/s1/summary-edits', { cookie: bob, body: { summary: 'Описание от нового владельца карточки' } })
  assert.equal(next.status, 201)

  // Two approvals sent at the same time: one closes the edit, the other only sees it closed.
  const approve = () => h.call('POST', `/api/v1/admin/server-edits/${next.body.id}/resolve`, { cookie: boss, body: { status: 'APPROVED', reason: 'Сверено с сайтом проекта' } })
  const answers = await Promise.all([approve(), approve()])
  assert.deepEqual(answers.map(a => a.status), [200, 200])
  assert.equal(h.db.sqlite.prepare("SELECT COUNT(*) AS n FROM acc_audit WHERE action = 'server.summary_approved'").get().n, 1)

  // A card owned through the legacy accounts cannot be claimed here.
  h.db.sqlite.exec(`INSERT INTO users (id, display_name, provider, roles, created_at) VALUES ('legacy', 'Old', 'EMAIL', '["OWNER"]', '2026-01-01');
    UPDATE servers SET owner_id = 'legacy' WHERE id = 's2'`)
  assert.equal((await h.call('POST', '/api/v1/claims', { cookie: ann, body: { serverId: 's2', evidence: 'Попытка забрать чужую карточку проекта' } })).body.error.code, 'already_claimed')
})

test('claim form contract of 30.10: options without documents, DOCUMENT method refused, claim list names the server', async () => {
  const h = harness()
  const ann = await h.signIn('ann')
  assert.deepEqual((await h.call('GET', '/api/v1/claims/options', { cookie: ann })).body, { available: true, attachments: false, maxFiles: 0, maxFileBytes: 0, reviewDays: 3 })
  const claim = (await h.call('POST', '/api/v1/claims', { cookie: ann, body: { serverId: 's1', evidence: 'Способ: файл на сайте. Официальный ресурс: alpha' } })).body
  assert.equal((await h.call('POST', `/api/v1/claims/${claim.id}/proof`, { cookie: ann, body: { method: 'DOCUMENT' } })).body.error.code, 'documents_unavailable')
  assert.equal((await h.call('POST', `/api/v1/claims/${claim.id}/attachments`, { cookie: ann, body: { name: 'a.png', mime: 'image/png', data: 'AA==' } })).body.error.code, 'attachments_unavailable')
  assert.equal((await h.call('GET', '/api/v1/owners/me/claims', { cookie: ann })).body[0].name, 'Alpha')
})
