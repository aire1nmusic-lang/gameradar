import { digest, keyed, token } from './primitives.mjs'
import { assertPublicHost, fetchPublicText } from '../worker/adapters/network.ts'

/**
 * Community part of the free GameScout API on Cloudflare D1 (owner decision 29.10.2026): player votes and the
 * people's rating, owner Claims with proof codes, owner card edits, and admin moderation of all of them.
 * Coins, payments, copyright requests and nickname review are not here and stay unavailable.
 *
 * It keeps the wire contract of `private-api/app.mjs` for these routes (paths, bodies, DTO field names, error
 * codes, proof codes valid 30 minutes, reason 10–1000 characters, no self-review), so the frontend that already
 * talks to the private core works unchanged. Schema: migrations/0013_free_community.sql.
 *
 * D1 has no locks or interactive transactions. Every decision that must not race is one statement whose WHERE
 * repeats the condition (a vote is inserted only while the window and the IP/device/ASN limits still allow it),
 * or one atomic batch whose statements are all guarded by the same condition; D1 runs them one after another.
 */

// Permissions the free service can actually serve; tabs for anything else (Coins, payments, copyright) stay hidden.
const PERMISSIONS = {
  ADMIN: ['system.read', 'servers.read', 'servers.review', 'users.read', 'users.manage', 'roles.manage', 'claims.review',
    'votes.read', 'votes.manage', 'votes.configure'],
  MODERATOR: ['servers.read', 'servers.review', 'claims.review', 'votes.read', 'votes.manage'],
  SUPPORT: ['users.read', 'servers.read', 'claims.review', 'system.read'],
  COPYRIGHT: ['servers.read'],
  FINANCE: [],
}
const GRANTABLE = ['MODERATOR', 'FINANCE', 'COPYRIGHT', 'SUPPORT']
const PROOF_TTL_MS = 30 * 60_000
const DAY_MS = 86_400_000
const FACT_COLUMNS = { version: 'version', rates: 'rates', region: 'region', openedAt: 'opened_at', country: 'country',
  modes: 'modes', site: 'website', discord: 'discord', telegram: 'telegram' }
const RULE_RANGES = { windowHours: [1, 2160], maxPerWindow: [1, 20], ipDailyLimit: [1, 100], deviceDailyLimit: [1, 100], asnDailyLimit: [1, 100000] }

const rolesOf = user => (user.roles ?? ['PLAYER']).filter(role => role !== 'PLAYER')
export const permissionsOf = roles => [...new Set(roles.flatMap(role => PERMISSIONS[role] ?? []))].sort()
const rulesDto = row => ({ windowHours: row.window_hours, maxPerWindow: row.max_per_window, ipDailyLimit: row.ip_daily_limit,
  deviceDailyLimit: row.device_daily_limit, asnDailyLimit: row.asn_daily_limit })

/** Where the owner places the proof code; derived from the card's official site, never from owner input. */
export function proofTarget(website, method) {
  if (method === 'MANUAL') return 'PUBLIC_RESOURCE_ADMIN_REVIEW'
  const url = new URL(website)
  if (url.protocol !== 'https:' || url.username || url.password || url.port) throw new Error('official_https_site_required')
  const host = assertPublicHost(url.hostname)
  return method === 'DNS' ? `_gamescout.${host}` : new URL('/.well-known/gamescout-verification.txt', url.origin).href
}

/** SITE: the file holds only the code; DNS: a TXT record holds only the code (read over DNS-over-HTTPS). */
export async function checkProof(proof, { fetchText = url => fetchPublicText(url, { timeoutMs: 5000, maxBytes: 4096 }),
  // A fixed public DNS-over-HTTPS resolver written here, never owner input (Workers have no DNS API of their own).
  fetchJson = async url => JSON.parse(await fetchPublicText(url, { timeoutMs: 5000, maxBytes: 65536, trustedHost: true })) } = {}) {
  if (proof.method === 'SITE') return digest((await fetchText(proof.target)).trim()) === proof.token_hash
  if (proof.method === 'DNS') {
    const answer = await fetchJson(`https://dns.google/resolve?name=${encodeURIComponent(proof.target)}&type=TXT`)
    return (answer?.Answer ?? []).slice(0, 32).filter(row => row.type === 16)
      .some(row => digest(String(row.data).split('"').filter((_, i) => i % 2 === 1).join('') || String(row.data)) === proof.token_hash)
  }
  return false // A manual proof is checked only by an ADMIN and never grants access by itself.
}

function ownerFact(fail, textOf, field, input) {
  if (['site', 'discord', 'telegram'].includes(field)) {
    if (input === '') return '' // An explicit removal, reviewed like any other change.
    if (typeof input !== 'string' || input.length > 500) fail(400, 'invalid_link', 'Некорректная ссылка')
    let url
    try { url = new URL(input.trim()) } catch { fail(400, 'invalid_link', 'Некорректная ссылка') }
    const host = url.hostname.toLowerCase().replace(/\.$/, '')
    if (url.protocol !== 'https:' || url.username || url.password || url.hash || !host.includes('.')
      || host === 'localhost' || /\.(?:localhost|local|internal|lan|test)$/.test(host)
      || /^\d+\.\d+\.\d+\.\d+$/.test(host) || host.startsWith('['))
      fail(400, 'invalid_link', 'Нужен публичный HTTPS-адрес без учётных данных и фрагмента')
    return url.toString()
  }
  if (!['version', 'rates', 'region', 'openedAt', 'modes', 'country'].includes(field)) fail(400, 'invalid_field', 'Недопустимое поле карточки')
  const value = textOf(input, 1, 80)
  if (/[<>]|\b(?:https?:\/\/|www\.)/i.test(value)) fail(400, 'invalid_fact', 'Используйте только значение характеристики без ссылок и разметки')
  if (field === 'openedAt' && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(`${value}T00:00:00Z`))
    || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value)) fail(400, 'invalid_date', 'Укажите дату в формате ГГГГ-ММ-ДД')
  if (field === 'modes') {
    const modes = value.split(',').map(mode => mode.trim())
    if (modes.length > 5 || modes.some(mode => !mode || mode.length > 30) || new Set(modes.map(mode => mode.toLowerCase())).size !== modes.length)
      fail(400, 'invalid_modes', 'Укажите от одного до пяти разных режимов через запятую')
    return modes.join(', ')
  }
  return value
}

/**
 * Adds the community routes to the accounts app and returns `describe(user, identities)` for /auth/me.
 * ctx: {db, config, clock, fail, textOf, json, limit, currentUser, identitiesOf, captchaVerify?, proofCheck?, origin}
 */
export function mountCommunity(app, ctx) {
  const { db, config, clock, fail, textOf, json, limit, currentUser, identitiesOf, origin } = ctx
  const proofCheck = ctx.proofCheck ?? checkProof
  if (!!config.turnstileSecret !== !!config.turnstileSiteKey) throw new Error('turnstile_key_pair_required')
  const q = (sql, ...args) => db.prepare(sql).bind(...args)
  const one = (sql, ...args) => q(sql, ...args).first()
  const all = async (sql, ...args) => (await q(sql, ...args).all()).results
  const changed = result => Number(result?.meta?.changes ?? 0)
  const now = () => clock().toISOString()
  const audit = (actor, action, target, details = {}) =>
    q('INSERT INTO acc_audit (actor_id, action, target, created_at, details) VALUES (?, ?, ?, ?, ?)', actor, action, target, now(), JSON.stringify(details))
  const reasonOf = body => textOf(body.reason, 10, 1000)
  const ownerOf = async serverId => (await one('SELECT user_id FROM fc_owners WHERE server_id = ?', serverId))?.user_id ?? null

  // A verified account: its own e-mail is confirmed, or Google/Discord vouched for an e-mail at the last sign-in.
  const isVerified = (user, identities) => !!user.emailVerifiedAt || identities.some(identity => identity.emailVerified)
  async function requireUser(c, verified = false) {
    const user = await currentUser(c)
    if (!user) fail(401, 'unauthorized', 'Войдите в аккаунт')
    if (verified && !isVerified(user, await identitiesOf(user.id))) fail(403, 'email_unverified', 'Подтвердите email')
    return user
  }
  async function permission(c, name) {
    const user = await requireUser(c, true)
    if (!permissionsOf(rolesOf(user)).includes(name)) fail(403, 'forbidden', 'Недостаточно прав')
    return user
  }
  async function ownershipAdmin(c) {
    const user = await permission(c, 'claims.review')
    if (!rolesOf(user).includes('ADMIN')) fail(403, 'admin_required', 'Подтверждать владение может только администратор')
    return user
  }
  async function ownedServer(c, serverId) {
    const user = await requireUser(c, true)
    if (await ownerOf(serverId) !== user.id) fail(403, 'forbidden', 'Нет подтверждённых прав на сервер')
    return user
  }
  async function describe(user, identities) {
    const owns = !!await one('SELECT 1 AS ok FROM fc_owners WHERE user_id = ? LIMIT 1', user.id)
    const assigned = rolesOf(user)
    return { emailVerified: isVerified(user, identities), roles: ['PLAYER', ...(owns ? ['OWNER'] : []), ...assigned],
      permissions: permissionsOf(assigned) }
  }
  const voteRules = async () => one('SELECT * FROM fc_vote_rules WHERE id = 1')

  /* ── people's rating and votes ─────────────────────────────────────────── */

  // Only accepted votes inside the current window count; paid support never enters this query.
  let ratingCache = new Map()
  app.get('/api/v1/people-rating', async c => {
    const limitValue = Number(c.req.query('limit') ?? 100), offset = Number(c.req.query('offset') ?? 0)
    if (!Number.isSafeInteger(limitValue) || limitValue < 1 || limitValue > 100 || !Number.isSafeInteger(offset) || offset < 0 || offset > 1_000_000)
      fail(400, 'invalid_page', 'Некорректная страница рейтинга')
    const key = `${limitValue}:${offset}`, hit = ratingCache.get(key)
    // A short per-isolate cache keeps this public read within the free D1 read quota.
    if (hit && hit.until > Date.now()) return c.json(hit.rows)
    const rules = await voteRules()
    const since = new Date(clock().getTime() - rules.window_hours * 3_600_000).toISOString()
    const rows = (await all(`SELECT s.id AS server_id, s.slug, s.name, s.game_id, COUNT(v.id) AS votes FROM servers s
      LEFT JOIN fc_votes v ON v.server_id = s.id AND v.review_status = 'ACCEPTED' AND v.created_at > ?
      WHERE s.moderation = 'PUBLISHED' AND s.is_demo = 0 GROUP BY s.id ORDER BY votes DESC, s.id LIMIT ? OFFSET ?`, since, limitValue, offset))
      .map(row => ({ ...row, votes: Number(row.votes) }))
    if (ratingCache.size > 50) ratingCache = new Map()
    ratingCache.set(key, { rows, until: Date.now() + 15_000 })
    return c.json(rows)
  })
  app.get('/api/v1/people-rating/eligibility', async c => {
    const user = await requireUser(c, true), serverId = c.req.query('serverId') ?? ''
    const rules = await voteRules()
    const since = new Date(clock().getTime() - rules.window_hours * 3_600_000).toISOString()
    const used = Number((await one('SELECT COUNT(*) AS n FROM fc_votes WHERE user_id = ? AND server_id = ? AND created_at > ?', user.id, serverId, since)).n)
    return c.json({ eligible: used < rules.max_per_window, used, limit: rules.max_per_window, windowHours: rules.window_hours,
      captchaSiteKey: config.turnstileSecret ? config.turnstileSiteKey ?? null : null })
  })
  app.post('/api/v1/people-rating/votes', async c => {
    const user = await requireUser(c, true), body = await json(c)
    const serverId = textOf(body.serverId, 1, 100), idem = textOf(c.req.header('Idempotency-Key'), 16, 128)
    const device = typeof body.deviceSignal === 'string' && /^[a-zA-Z0-9_-]{16,128}$/.test(body.deviceSignal) ? body.deviceSignal : null
    const ip = c.env?.clientIp ?? 'unknown', ipHash = keyed(config.rateKey, 'ip:' + ip), deviceHash = device ? keyed(config.rateKey, 'device:' + device) : null
    const asn = typeof c.env?.clientAsn === 'string' && /^\d{1,10}$/.test(c.env.clientAsn) ? c.env.clientAsn : null
    const pageAgeMs = Number.isSafeInteger(body.pageAgeMs) && body.pageAgeMs >= 0 && body.pageAgeMs <= 86_400_000 ? body.pageAgeMs : null
    await limit(c, 'vote', user.id, 20)
    const replayOf = async () => {
      const row = await one('SELECT id, server_id, review_status FROM fc_votes WHERE user_id = ? AND idempotency_key = ?', user.id, idem)
      if (row && row.server_id !== serverId) fail(409, 'idempotency_conflict', 'Ключ уже использован для другого сервера')
      return row
    }
    const existing = await replayOf()
    if (existing) return c.json({ id: existing.id, accepted: existing.review_status === 'ACCEPTED', replay: true })
    const rules = await voteRules(), at = clock(), dayAgo = new Date(at.getTime() - DAY_MS).toISOString()
    const windowStart = new Date(at.getTime() - rules.window_hours * 3_600_000).toISOString()
    // The same daily limits are re-checked inside the INSERT below; this read only decides whether to ask for a captcha.
    const totals = await one(`SELECT
      (SELECT COUNT(*) FROM fc_votes WHERE ip_hash = ? AND created_at > ?) AS ip_count,
      (SELECT COUNT(*) FROM fc_votes WHERE device_hash = ? AND created_at > ?) AS device_count,
      (SELECT COUNT(*) FROM fc_votes WHERE asn = ? AND created_at > ?) AS asn_count`, ipHash, dayAgo, deviceHash, dayAgo, asn, dayAgo)
    // Browser signals raise scrutiny; they never establish a unique person.
    const suspicious = ip === 'unknown' || !deviceHash || pageAgeMs === null || pageAgeMs < 2000 || Number(totals.ip_count) >= rules.ip_daily_limit
      || Number(totals.device_count) >= rules.device_daily_limit || (!!asn && Number(totals.asn_count) >= rules.asn_daily_limit)
    let captchaVerified = false
    if (suspicious) {
      if (!config.turnstileSecret || typeof body.captcha !== 'string' || body.captcha.length > 2048) fail(403, 'captcha_required', 'Требуется дополнительная проверка')
      let valid = false
      try {
        const result = ctx.captchaVerify ? await ctx.captchaVerify(body.captcha, ip) : await (await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(5000),
          body: JSON.stringify({ secret: config.turnstileSecret, response: body.captcha, remoteip: ip }) })).json()
        valid = result.success === true && result.hostname === new URL(origin).hostname && result.action === 'vote'
      } catch { /* a failed check is the same as a wrong answer */ }
      if (!valid) fail(403, 'captcha_invalid', 'Дополнительная проверка не пройдена')
      captchaVerified = true
    }
    const id = token()
    // One statement: the window and the shared daily limits are counted and the vote written atomically.
    const result = await q(`INSERT INTO fc_votes (id, server_id, user_id, idempotency_key, device_hash, ip_hash, asn, created_at)
      SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM servers WHERE id = ? AND moderation = 'PUBLISHED' AND is_demo = 0)
        AND (SELECT COUNT(*) FROM fc_votes WHERE user_id = ? AND server_id = ? AND created_at > ?) < ?
        AND (? = 1 OR ((SELECT COUNT(*) FROM fc_votes WHERE ip_hash = ? AND created_at > ?) < ?
          AND (? IS NULL OR (SELECT COUNT(*) FROM fc_votes WHERE device_hash = ? AND created_at > ?) < ?)
          AND (? IS NULL OR (SELECT COUNT(*) FROM fc_votes WHERE asn = ? AND created_at > ?) < ?)))
      ON CONFLICT (user_id, idempotency_key) DO NOTHING`,
    id, serverId, user.id, idem, deviceHash, ipHash, asn, at.toISOString(), serverId,
    user.id, serverId, windowStart, rules.max_per_window,
    captchaVerified ? 1 : 0, ipHash, dayAgo, rules.ip_daily_limit,
    deviceHash, deviceHash, dayAgo, rules.device_daily_limit,
    asn, asn, dayAgo, rules.asn_daily_limit).run()
    if (!changed(result)) {
      const replay = await replayOf()
      if (replay) return c.json({ id: replay.id, accepted: replay.review_status === 'ACCEPTED', replay: true })
      if (!await one("SELECT 1 AS ok FROM servers WHERE id = ? AND moderation = 'PUBLISHED' AND is_demo = 0", serverId)) fail(404, 'not_found', 'Сервер не найден')
      const used = Number((await one('SELECT COUNT(*) AS n FROM fc_votes WHERE user_id = ? AND server_id = ? AND created_at > ?', user.id, serverId, windowStart)).n)
      if (used >= rules.max_per_window) fail(409, 'vote_window', 'Вы уже голосовали в этом окне')
      // Another account used up a shared IP/device/ASN limit since the check above.
      fail(403, 'captcha_required', 'Требуется дополнительная проверка')
    }
    await audit(user.id, 'vote.accepted', id, { serverId }).run()
    ratingCache = new Map()
    return c.json({ id, accepted: true, replay: false }, 201)
  })

  /* ── Claims and the owner's cabinet ────────────────────────────────────── */

  app.post('/api/v1/claims', async c => {
    const user = await requireUser(c, true), body = await json(c), serverId = textOf(body.serverId, 1, 100), evidence = textOf(body.evidence, 20, 3000)
    await limit(c, 'claims', user.id, 10)
    if (!await one("SELECT 1 AS ok FROM servers WHERE id = ? AND moderation = 'PUBLISHED' AND is_demo = 0", serverId)) fail(404, 'not_found', 'Сервер не найден в каталоге')
    const owner = await ownerOf(serverId)
    if (owner === user.id) fail(409, 'already_owned', 'Этот сервер уже доступен в вашем кабинете')
    if (owner) fail(409, 'already_claimed', 'Владелец уже подтверждён')
    const pending = () => one("SELECT * FROM fc_claims WHERE server_id = ? AND user_id = ? AND status = 'PENDING'", serverId, user.id)
    const existing = await pending()
    if (existing) return c.json(existing, 201)
    const id = token()
    const created = await q(`INSERT INTO fc_claims (id, server_id, user_id, evidence, created_at) SELECT ?, ?, ?, ?, ?
      WHERE NOT EXISTS (SELECT 1 FROM fc_owners WHERE server_id = ?) ON CONFLICT DO NOTHING`, id, serverId, user.id, evidence, now(), serverId).run()
    if (!changed(created)) {
      const raced = await pending()
      if (raced) return c.json(raced, 201)
      fail(409, 'already_claimed', 'Владелец уже подтверждён')
    }
    await audit(user.id, 'claim.created', id).run()
    return c.json(await one('SELECT * FROM fc_claims WHERE id = ?', id), 201)
  })
  app.post('/api/v1/claims/:id/proof', async c => {
    const user = await requireUser(c, true), body = await json(c)
    await limit(c, 'claim_proof', user.id, 10)
    if (!['SITE', 'DNS', 'MANUAL'].includes(body.method)) fail(400, 'invalid_method', 'Выберите способ проверки')
    const claim = await one('SELECT c.*, s.website FROM fc_claims c JOIN servers s ON s.id = c.server_id WHERE c.id = ? AND c.user_id = ?', c.req.param('id'), user.id)
    if (!claim) fail(404, 'not_found', 'Заявка не найдена')
    if (claim.status !== 'PENDING') fail(409, 'claim_closed', 'Заявка уже рассмотрена')
    let target
    try { target = proofTarget(claim.website, body.method) } catch { fail(400, 'official_site_required', 'Для этого способа нужен официальный HTTPS-сайт в карточке; выберите ручную проверку') }
    const code = token(), expiresAt = new Date(clock().getTime() + PROOF_TTL_MS).toISOString()
    const [issued] = await db.batch([
      q(`INSERT INTO fc_claim_proofs (claim_id, token_hash, method, target, expires_at, created_at) SELECT ?, ?, ?, ?, ?, ?
        WHERE EXISTS (SELECT 1 FROM fc_claims WHERE id = ? AND status = 'PENDING')
        ON CONFLICT (claim_id) DO UPDATE SET token_hash = excluded.token_hash, method = excluded.method, target = excluded.target,
        expires_at = excluded.expires_at, checked_at = NULL, consumed_at = NULL, created_at = excluded.created_at`,
      claim.id, digest(code), body.method, target, expiresAt, now(), claim.id),
      audit(user.id, 'claim.proof_issued', claim.id, { method: body.method }),
    ])
    if (!changed(issued)) fail(409, 'claim_closed', 'Заявка уже рассмотрена')
    return c.json({ claimId: claim.id, code, method: body.method, target, expiresAt }, 201)
  })
  app.post('/api/v1/claims/:id/proof/check', async c => {
    const user = await requireUser(c, true)
    await limit(c, 'claim_proof_check', user.id, 10)
    const proof = await one(`SELECT p.* FROM fc_claim_proofs p JOIN fc_claims c ON c.id = p.claim_id
      WHERE c.id = ? AND c.user_id = ? AND c.status = 'PENDING' AND p.expires_at > ? AND p.consumed_at IS NULL`, c.req.param('id'), user.id, now())
    if (!proof) fail(409, 'proof_expired', 'Получите новый проверочный код')
    if (proof.method === 'MANUAL') fail(409, 'admin_review_required', 'Код на публичном ресурсе проверяет администратор')
    let matched = false
    try { matched = await proofCheck(proof) } catch { fail(422, 'proof_unreachable', 'Ресурс недоступен; проверьте размещение кода или выберите ручную проверку') }
    if (!matched) fail(422, 'proof_mismatch', 'Код на официальном ресурсе не найден')
    const [checked] = await db.batch([
      q('UPDATE fc_claim_proofs SET checked_at = ? WHERE claim_id = ? AND token_hash = ? AND expires_at > ? AND consumed_at IS NULL',
        now(), proof.claim_id, proof.token_hash, now()),
      audit(user.id, 'claim.proof_checked', proof.claim_id, { method: proof.method }),
    ])
    if (!changed(checked)) fail(409, 'proof_changed', 'Код изменён или истёк; повторите проверку')
    return c.json({ checked: true, status: 'ADMIN_REVIEW' })
  })
  app.get('/api/v1/owners/me/claims', async c => {
    const user = await requireUser(c)
    return c.json((await all(`SELECT c.id, c.server_id, c.status, c.evidence, c.reason, c.created_at,
      p.method AS proof_method, p.checked_at AS proof_checked_at, p.expires_at AS proof_expires_at,
      (c.status = 'VERIFIED' AND COALESCE(o.user_id = c.user_id, 0)) AS access_active
      FROM fc_claims c LEFT JOIN fc_owners o ON o.server_id = c.server_id LEFT JOIN fc_claim_proofs p ON p.claim_id = c.id
      WHERE c.user_id = ? ORDER BY c.created_at DESC LIMIT 100`, user.id)).map(row => ({ ...row, access_active: !!row.access_active })))
  })
  app.get('/api/v1/owners/me/servers', async c => {
    const user = await requireUser(c)
    return c.json(await all(`SELECT s.id AS server_id, s.game_id, s.name, s.slug FROM fc_owners o JOIN servers s ON s.id = o.server_id
      WHERE o.user_id = ? ORDER BY s.game_id, s.name`, user.id))
  })
  app.get('/api/v1/servers/:id/manage-access', async c => { await ownedServer(c, c.req.param('id')); return c.json({ canManage: true }) })

  /* ── owner card edits ──────────────────────────────────────────────────── */

  app.get('/api/v1/owners/me/servers/:id/summary-edits', async c => {
    const serverId = c.req.param('id'), user = await ownedServer(c, serverId)
    return c.json(await all(`SELECT id, summary, status, reason, created_at, resolved_at FROM fc_summary_edits
      WHERE server_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 20`, serverId, user.id))
  })
  app.post('/api/v1/owners/me/servers/:id/summary-edits', async c => {
    const serverId = c.req.param('id'), body = await json(c)
    const summary = textOf(body.summary, 20, 280)
    if (/<|>|\b(?:https?:\/\/|www\.)|\[[^\]]+\]\(/i.test(summary)) fail(400, 'invalid_summary', 'Описание должно содержать только нейтральный текст без ссылок и разметки')
    const user = await ownedServer(c, serverId)
    await limit(c, 'owner_summary', user.id, 10)
    const id = token()
    const [created] = await db.batch([
      q(`INSERT INTO fc_summary_edits (id, server_id, user_id, summary, created_at) SELECT ?, ?, ?, ?, ?
        WHERE EXISTS (SELECT 1 FROM fc_owners WHERE server_id = ? AND user_id = ?) ON CONFLICT DO NOTHING`, id, serverId, user.id, summary, now(), serverId, user.id),
      q(`INSERT INTO acc_audit (actor_id, action, target, created_at, details) SELECT ?, 'server.summary_submitted', ?, ?, ?
        WHERE EXISTS (SELECT 1 FROM fc_summary_edits WHERE id = ?)`, user.id, id, now(), JSON.stringify({ serverId }), id),
    ])
    if (!changed(created)) {
      if (await ownerOf(serverId) !== user.id) fail(403, 'forbidden', 'Нет подтверждённых прав на сервер')
      fail(409, 'pending_edit', 'Изменение уже ждёт проверки')
    }
    return c.json({ id, status: 'PENDING' }, 201)
  })
  app.get('/api/v1/owners/me/servers/:id/fact-edits', async c => {
    const serverId = c.req.param('id'), user = await ownedServer(c, serverId)
    return c.json(await all(`SELECT id, field, value, evidence, status, reason, created_at, resolved_at FROM fc_fact_edits
      WHERE server_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 30`, serverId, user.id))
  })
  app.post('/api/v1/owners/me/servers/:id/fact-edits', async c => {
    const serverId = c.req.param('id'), body = await json(c)
    const field = body.field, value = ownerFact(fail, textOf, field, body.value), evidence = textOf(body.evidence, 20, 1000)
    const user = await ownedServer(c, serverId)
    await limit(c, 'owner_fact', user.id, 12)
    const id = token()
    const [created] = await db.batch([
      q(`INSERT INTO fc_fact_edits (id, server_id, user_id, field, value, evidence, created_at) SELECT ?, ?, ?, ?, ?, ?, ?
        WHERE EXISTS (SELECT 1 FROM fc_owners WHERE server_id = ? AND user_id = ?) ON CONFLICT DO NOTHING`,
      id, serverId, user.id, field, value, evidence, now(), serverId, user.id),
      q(`INSERT INTO acc_audit (actor_id, action, target, created_at, details) SELECT ?, 'server.fact_submitted', ?, ?, ?
        WHERE EXISTS (SELECT 1 FROM fc_fact_edits WHERE id = ?)`, user.id, id, now(), JSON.stringify({ serverId, field }), id),
    ])
    if (!changed(created)) {
      if (await ownerOf(serverId) !== user.id) fail(403, 'forbidden', 'Нет подтверждённых прав на сервер')
      fail(409, 'pending_edit', 'Правка этого поля уже ждёт проверки')
    }
    return c.json({ id, status: 'PENDING' }, 201)
  })
  // Owner-run monitoring targets are not part of the free service yet.
  app.get('/api/v1/owners/me/servers/:id/monitoring', async c => { await ownedServer(c, c.req.param('id')); return c.json({ configured: false, held: false }) })
  app.post('/api/v1/owners/me/servers/:id/monitoring', async c => {
    await ownedServer(c, c.req.param('id'))
    fail(503, 'monitoring_unavailable', 'Подключение собственного адреса мониторинга появится позже')
  })

  /* ── admin ─────────────────────────────────────────────────────────────── */

  app.get('/api/v1/admin/overview', async c => {
    await permission(c, 'system.read')
    const row = await one(`SELECT (SELECT COUNT(*) FROM acc_users) AS users, (SELECT COUNT(*) FROM servers WHERE moderation = 'PUBLISHED' AND is_demo = 0) AS servers,
      (SELECT COUNT(*) FROM fc_claims WHERE status = 'PENDING') AS pending_claims, (SELECT COUNT(*) FROM fc_votes) AS votes`)
    // Support and payments are not run by this service; nothing of them exists here.
    return c.json({ users: Number(row.users), servers: Number(row.servers), pending_claims: Number(row.pending_claims), votes: Number(row.votes),
      support_events: 0, pending_test_payments: 0 })
  })
  app.get('/api/v1/admin/system', async c => {
    await permission(c, 'system.read')
    return c.json({ projection: { storage: 'cloudflare-d1', note: 'Голоса, заявки и правки пишутся сразу в публичную базу; отдельной проекции нет' },
      operations: { service: 'accounts+community', coins: 'unavailable', payments: 'unavailable' }, alerts: [], queues: {},
      events: await all('SELECT id, action, target, created_at FROM acc_audit ORDER BY id DESC LIMIT 50') })
  })
  app.get('/api/v1/admin/users', async c => {
    await permission(c, 'users.read')
    const rows = await all(`SELECT u.id, u.email, u.display_name, u.email_verified_at, u.banned_at, u.created_at, u.roles,
      (SELECT COUNT(*) FROM fc_owners o WHERE o.user_id = u.id) AS owned_server_count,
      (SELECT COUNT(*) FROM fc_claims cl WHERE cl.user_id = u.id AND cl.status = 'PENDING') AS pending_claim_count
      FROM acc_users u ORDER BY u.created_at DESC LIMIT 100`)
    return c.json(rows.map(row => ({ ...row, roles: rolesOf({ roles: JSON.parse(row.roles || '[]') }).sort(),
      owned_server_count: Number(row.owned_server_count), pending_claim_count: Number(row.pending_claim_count) })))
  })
  app.post('/api/v1/admin/users/:id/moderation', async c => {
    const admin = await permission(c, 'users.manage'), body = await json(c)
    const action = body.action, reason = reasonOf(body), userId = c.req.param('id')
    if (!['BAN', 'UNBAN'].includes(action)) fail(400, 'invalid_action', 'Укажите действие')
    if (userId === admin.id) fail(403, 'self_moderation', 'Нельзя блокировать собственный аккаунт')
    const target = await one('SELECT id, banned_at, roles FROM acc_users WHERE id = ?', userId)
    if (!target) fail(404, 'not_found', 'Пользователь не найден')
    if (JSON.parse(target.roles || '[]').includes('ADMIN')) fail(403, 'admin_protected', 'Блокировка ADMIN через этот API запрещена')
    const banned = !!target.banned_at
    if ((action === 'BAN') === banned) return c.json({ ok: true, replay: true, banned })
    const notAdmin = `NOT EXISTS (SELECT 1 FROM acc_users WHERE id = ? AND roles LIKE '%"ADMIN"%')`
    await db.batch([
      q(`UPDATE acc_users SET banned_at = ? WHERE id = ? AND ${notAdmin}`, action === 'BAN' ? now() : null, userId, userId),
      ...(action === 'BAN' ? [q(`DELETE FROM acc_sessions WHERE user_id = ? AND ${notAdmin}`, userId, userId)] : []),
      audit(admin.id, `user.${action.toLowerCase()}`, userId, { reason }),
    ])
    return c.json({ ok: true, replay: false, banned: action === 'BAN' })
  })
  app.post('/api/v1/admin/users/:id/roles', async c => {
    const admin = await permission(c, 'roles.manage'), body = await json(c), userId = c.req.param('id')
    if (!GRANTABLE.includes(body.role) || !['GRANT', 'REVOKE'].includes(body.action)) fail(400, 'invalid_role_change', 'Недопустимое изменение роли')
    if (admin.id === userId) fail(403, 'self_role_change', 'Нельзя менять собственные роли')
    const target = await one('SELECT roles FROM acc_users WHERE id = ?', userId)
    if (!target) fail(404, 'not_found', 'Пользователь не найден')
    const roles = new Set(JSON.parse(target.roles || '["PLAYER"]'))
    if (body.action === 'GRANT') roles.add(body.role); else roles.delete(body.role)
    const next = JSON.stringify(['PLAYER', ...[...roles].filter(role => role !== 'PLAYER').sort()])
    // Compare-and-set on the previous value, so two simultaneous changes cannot silently overwrite each other.
    const [updated] = await db.batch([
      q('UPDATE acc_users SET roles = ? WHERE id = ? AND roles = ?', next, userId, target.roles),
      q(`INSERT INTO acc_audit (actor_id, action, target, created_at, details) SELECT ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM acc_users WHERE id = ? AND roles = ?)`,
        admin.id, `role.${body.action.toLowerCase()}`, userId, now(), JSON.stringify({ role: body.role }), userId, next),
    ])
    if (!changed(updated) && target.roles !== next) fail(409, 'conflict', 'Роли изменились одновременно; повторите')
    return c.json({ ok: true })
  })
  app.get('/api/v1/admin/users/:id/ownership', async c => {
    await ownershipAdmin(c)
    const userId = c.req.param('id')
    const user = await one('SELECT id, email_verified_at, banned_at FROM acc_users WHERE id = ?', userId)
    if (!user) fail(404, 'not_found', 'Пользователь не найден')
    const owned = await all(`SELECT s.id AS server_id, s.game_id, s.name, s.slug FROM fc_owners o JOIN servers s ON s.id = o.server_id
      WHERE o.user_id = ? ORDER BY s.game_id, s.name`, userId)
    const pending = await all(`SELECT c.id, c.server_id, c.evidence, c.created_at, s.name, s.game_id FROM fc_claims c JOIN servers s ON s.id = c.server_id
      WHERE c.user_id = ? AND c.status = 'PENDING' ORDER BY c.created_at`, userId)
    return c.json({ userId, status: owned.length ? 'OWNER' : 'PLAYER', owned, pending,
      emailVerified: isVerified({ emailVerifiedAt: user.email_verified_at }, await identitiesOf(userId)), banned: !!user.banned_at })
  })
  app.post('/api/v1/admin/users/:id/ownership', async c => {
    const admin = await ownershipAdmin(c), body = await json(c)
    if (body.action !== 'REVOKE') fail(400, 'invalid_action', 'Подтверждение владельца выполняется только через Claim')
    const serverId = textOf(body.serverId, 1, 100), reason = reasonOf(body), userId = c.req.param('id')
    if (admin.id === userId) fail(403, 'self_review', 'Нельзя менять собственное владение')
    if (!await one('SELECT 1 AS ok FROM acc_users WHERE id = ?', userId)) fail(404, 'not_found', 'Пользователь не найден')
    if (!await one('SELECT 1 AS ok FROM servers WHERE id = ?', serverId)) fail(404, 'not_found', 'Сервер не найден')
    const owner = await ownerOf(serverId)
    if (!owner) return c.json({ ok: true, replay: true, status: 'PLAYER' })
    if (owner !== userId) fail(409, 'owner_changed', 'Владелец сервера уже изменился')
    const [revoked] = await db.batch([
      q('DELETE FROM fc_owners WHERE server_id = ? AND user_id = ?', serverId, userId),
      audit(admin.id, 'ownership.revoked', userId, { serverId, reason }),
    ])
    if (!changed(revoked)) fail(409, 'owner_changed', 'Владелец сервера уже изменился')
    return c.json({ ok: true, replay: false, status: 'PLAYER' })
  })
  app.get('/api/v1/admin/servers', async c => {
    await permission(c, 'servers.read')
    return c.json((await all(`SELECT s.id AS server_id, s.game_id, s.name, s.slug, o.user_id AS owner_id,
      (SELECT COUNT(*) FROM fc_claims c WHERE c.server_id = s.id AND c.status = 'PENDING') AS pending_claims
      FROM servers s LEFT JOIN fc_owners o ON o.server_id = s.id WHERE s.moderation = 'PUBLISHED' AND s.is_demo = 0 ORDER BY s.game_id, s.name LIMIT 200`))
      .map(row => ({ ...row, monitoring_enabled: null, monitoring_method: null, monitoring_held: false, pending_claims: Number(row.pending_claims) })))
  })
  app.post('/api/v1/admin/servers/:id/monitoring-hold', async c => {
    await permission(c, 'servers.review')
    fail(503, 'monitoring_unavailable', 'Мониторинг по адресу владельца пока не подключён, приостанавливать нечего')
  })
  app.get('/api/v1/admin/server-edits', async c => {
    await permission(c, 'servers.review')
    return c.json(await all(`SELECT e.id, e.server_id, e.user_id, e.summary, e.status, e.created_at, s.name, s.game_id
      FROM fc_summary_edits e JOIN servers s ON s.id = e.server_id WHERE e.status = 'PENDING' ORDER BY e.created_at LIMIT 100`))
  })
  app.get('/api/v1/admin/server-fact-edits', async c => {
    await permission(c, 'servers.review')
    return c.json(await all(`SELECT e.id, e.server_id, e.user_id, e.field, e.value, e.evidence, e.status, e.created_at, s.name, s.game_id
      FROM fc_fact_edits e JOIN servers s ON s.id = e.server_id WHERE e.status = 'PENDING' ORDER BY e.created_at LIMIT 100`))
  })
  // Approving writes the change straight into the public card, in the same batch that closes the edit.
  async function resolveEdit(c, table, kind) {
    const reviewer = await permission(c, 'servers.review'), body = await json(c)
    const status = body.status, reason = reasonOf(body)
    if (!['APPROVED', 'REJECTED'].includes(status)) fail(400, 'invalid_status', 'Укажите решение')
    const edit = await one(`SELECT * FROM ${table} WHERE id = ?`, c.req.param('id'))
    if (!edit) fail(404, 'not_found', kind === 'summary' ? 'Изменение не найдено' : 'Правка не найдена')
    if (edit.user_id === reviewer.id) fail(403, 'self_review', kind === 'summary' ? 'Нельзя утверждать своё изменение' : 'Нельзя утверждать свою правку')
    if (edit.status !== 'PENDING') {
      if (edit.status === status) return c.json({ id: edit.id, status, replay: true })
      fail(409, 'edit_closed', kind === 'summary' ? 'Изменение уже рассмотрено' : 'Правка уже рассмотрена')
    }
    const stillOwner = `EXISTS (SELECT 1 FROM fc_owners WHERE server_id = ? AND user_id = ?)`
    const closed = `EXISTS (SELECT 1 FROM ${table} WHERE id = ? AND status = ? AND reviewer_id = ?)`
    const writes = [q(`UPDATE ${table} SET status = ?, reviewer_id = ?, reason = ?, resolved_at = ? WHERE id = ? AND status = 'PENDING' AND ${stillOwner}`,
      status, reviewer.id, reason, now(), edit.id, edit.server_id, edit.user_id)]
    if (status === 'APPROVED') {
      const column = kind === 'summary' ? 'summary' : FACT_COLUMNS[edit.field]
      const value = kind === 'summary' ? edit.summary : edit.field === 'modes' ? JSON.stringify(edit.value.split(',').map(mode => mode.trim()))
        : edit.value || (['site', 'discord', 'telegram'].includes(edit.field) ? null : edit.value)
      writes.push(q(`UPDATE servers SET ${column} = ?, updated_at = ? WHERE id = ? AND ${closed}`, value, now(), edit.server_id, edit.id, status, reviewer.id))
    }
    writes.push(q(`INSERT INTO acc_audit (actor_id, action, target, created_at, details) SELECT ?, ?, ?, ?, ? WHERE ${closed}`,
      reviewer.id, `server.${kind}_${status.toLowerCase()}`, edit.id, now(),
      JSON.stringify({ serverId: edit.server_id, ...(kind === 'fact' ? { field: edit.field } : {}), reason }), edit.id, status, reviewer.id))
    const [updated] = await db.batch(writes)
    if (!changed(updated)) {
      const current = await one(`SELECT status FROM ${table} WHERE id = ?`, edit.id)
      if (current?.status === status) return c.json({ id: edit.id, status, replay: true })
      if (current?.status !== 'PENDING') fail(409, 'edit_closed', kind === 'summary' ? 'Изменение уже рассмотрено' : 'Правка уже рассмотрена')
      fail(409, 'owner_changed', 'Права владельца изменились')
    }
    return c.json({ id: edit.id, status, replay: false })
  }
  app.post('/api/v1/admin/server-edits/:id/resolve', c => resolveEdit(c, 'fc_summary_edits', 'summary'))
  app.post('/api/v1/admin/server-fact-edits/:id/resolve', c => resolveEdit(c, 'fc_fact_edits', 'fact'))
  app.get('/api/v1/admin/claims', async c => {
    await permission(c, 'claims.review')
    return c.json(await all(`SELECT c.*, s.name, s.game_id, s.website, p.method AS proof_method, p.target AS proof_target,
      p.expires_at AS proof_expires_at, p.checked_at AS proof_checked_at
      FROM fc_claims c JOIN servers s ON s.id = c.server_id LEFT JOIN fc_claim_proofs p ON p.claim_id = c.id
      WHERE c.status = 'PENDING' ORDER BY c.created_at LIMIT 100`))
  })
  app.post('/api/v1/admin/claims/:id/resolve', async c => {
    const admin = await ownershipAdmin(c), body = await json(c), reason = reasonOf(body)
    if (!['VERIFIED', 'REJECTED'].includes(body.status)) fail(400, 'invalid_status', 'Укажите решение')
    const claim = await one('SELECT c.*, s.website FROM fc_claims c JOIN servers s ON s.id = c.server_id WHERE c.id = ?', c.req.param('id'))
    if (!claim) fail(404, 'not_found', 'Заявка не найдена')
    if (claim.user_id === admin.id) fail(403, 'self_review', 'Нельзя подтверждать собственную заявку')
    const row = () => one('SELECT id, server_id, user_id, evidence, status, reason, reviewer_id, created_at, resolved_at FROM fc_claims WHERE id = ?', claim.id)
    if (claim.status !== 'PENDING') {
      if (claim.status === body.status) return c.json(await row())
      fail(409, 'claim_closed', 'Заявка уже рассмотрена')
    }
    const at = now()
    const audited = q(`INSERT INTO acc_audit (actor_id, action, target, created_at, details) SELECT ?, ?, ?, ?, ?
      WHERE EXISTS (SELECT 1 FROM fc_claims WHERE id = ? AND status = ? AND reviewer_id = ?)`,
    admin.id, 'claim.' + body.status.toLowerCase(), claim.id, at, JSON.stringify({ serverId: claim.server_id }), claim.id, body.status, admin.id)
    if (body.status === 'REJECTED') {
      const [closed] = await db.batch([q(`UPDATE fc_claims SET status = 'REJECTED', reviewer_id = ?, reason = ?, resolved_at = ? WHERE id = ? AND status = 'PENDING'`,
        admin.id, reason, at, claim.id), audited])
      if (!changed(closed)) fail(409, 'claim_closed', 'Заявка уже рассмотрена')
      return c.json(await row())
    }
    const proof = await one('SELECT * FROM fc_claim_proofs WHERE claim_id = ?', claim.id)
    if (!proof || proof.consumed_at || proof.expires_at <= at) fail(409, 'proof_required', 'Нужен действующий проверочный код владельца')
    if (proof.method !== 'MANUAL') {
      let target = null
      try { target = proofTarget(claim.website, proof.method) } catch { /* the site was removed or is no longer HTTPS */ }
      if (proof.target !== target) fail(409, 'proof_changed', 'Официальный сайт изменён; получите новый код')
      if (!proof.checked_at) fail(409, 'proof_required', 'Владелец должен сначала проверить код на сайте или в DNS')
    } else if (typeof body.observedToken !== 'string' || digest(body.observedToken.trim()) !== proof.token_hash)
      fail(409, 'proof_required', 'Введите код, который вы лично увидели на официальном публичном ресурсе проекта')
    const applicant = await one('SELECT id, email_verified_at, banned_at FROM acc_users WHERE id = ?', claim.user_id)
    if (!applicant || applicant.banned_at || !isVerified({ emailVerifiedAt: applicant.email_verified_at }, await identitiesOf(claim.user_id)))
      fail(403, 'applicant_ineligible', 'Заявитель должен иметь активный подтверждённый аккаунт')
    if (await ownerOf(claim.server_id) && await ownerOf(claim.server_id) !== claim.user_id) fail(409, 'already_claimed', 'Владелец уже подтверждён')
    // Granted only while the claim is still pending, the same proof is live and unused, and nobody else owns the card.
    const live = `EXISTS (SELECT 1 FROM fc_claims WHERE id = ? AND status = 'PENDING') AND EXISTS (SELECT 1 FROM fc_claim_proofs
      WHERE claim_id = ? AND token_hash = ? AND consumed_at IS NULL AND expires_at > ?) AND EXISTS (SELECT 1 FROM acc_users WHERE id = ? AND banned_at IS NULL)`
    const granted = `EXISTS (SELECT 1 FROM fc_owners WHERE server_id = ? AND user_id = ? AND claim_id = ?)`
    const [owner] = await db.batch([
      q(`INSERT INTO fc_owners (server_id, user_id, claim_id, granted_at) SELECT ?, ?, ?, ? WHERE ${live}
        ON CONFLICT (server_id) DO NOTHING`, claim.server_id, claim.user_id, claim.id, at, claim.id, claim.id, proof.token_hash, at, claim.user_id),
      q(`UPDATE fc_claims SET status = 'VERIFIED', reviewer_id = ?, reason = ?, resolved_at = ? WHERE id = ? AND status = 'PENDING' AND ${granted}`,
        admin.id, reason, at, claim.id, claim.server_id, claim.user_id, claim.id),
      q(`UPDATE fc_claim_proofs SET consumed_at = ? WHERE claim_id = ? AND ${granted}`, at, claim.id, claim.server_id, claim.user_id, claim.id),
      audited,
    ])
    if (!changed(owner)) {
      const current = await row()
      if (current.status === 'VERIFIED') return c.json(current)
      if (current.status !== 'PENDING') fail(409, 'claim_closed', 'Заявка уже рассмотрена')
      if (await ownerOf(claim.server_id)) fail(409, 'already_claimed', 'Владелец уже подтверждён')
      fail(409, 'proof_changed', 'Код изменён или истёк; попросите владельца получить новый')
    }
    return c.json(await row())
  })
  app.get('/api/v1/admin/votes', async c => {
    await permission(c, 'votes.read')
    return c.json(await all(`SELECT id, server_id, user_id, asn, created_at, review_status, review_reason, reviewed_at FROM fc_votes
      ORDER BY created_at DESC, id DESC LIMIT 100`))
  })
  app.post('/api/v1/admin/votes/:id/review', async c => {
    const reviewer = await permission(c, 'votes.manage'), body = await json(c)
    const action = body.action, reason = reasonOf(body)
    if (!['VOID', 'RESTORE'].includes(action)) fail(400, 'invalid_action', 'Укажите действие')
    const vote = await one('SELECT id, user_id, server_id, review_status FROM fc_votes WHERE id = ?', c.req.param('id'))
    if (!vote) fail(404, 'not_found', 'Голос не найден')
    if (vote.user_id === reviewer.id) fail(403, 'self_review', 'Нельзя проверять собственный голос')
    const status = action === 'VOID' ? 'VOIDED' : 'ACCEPTED'
    if (vote.review_status === status) return c.json({ changed: false, status })
    const [updated] = await db.batch([
      q('UPDATE fc_votes SET review_status = ?, reviewed_by = ?, review_reason = ?, reviewed_at = ? WHERE id = ? AND review_status <> ?',
        status, reviewer.id, reason, now(), vote.id, status),
      audit(reviewer.id, `vote.${action.toLowerCase()}`, vote.id, { serverId: vote.server_id, reason }),
    ])
    ratingCache = new Map()
    return c.json({ changed: changed(updated) > 0, status })
  })
  app.get('/api/v1/admin/vote-rules', async c => { await permission(c, 'votes.read'); return c.json(rulesDto(await voteRules())) })
  app.post('/api/v1/admin/vote-rules', async c => {
    const admin = await permission(c, 'votes.configure'), body = await json(c)
    for (const [name, [min, max]] of Object.entries(RULE_RANGES))
      if (!Number.isInteger(body[name]) || body[name] < min || body[name] > max) fail(400, 'invalid_vote_rule', `${name}: ${min}–${max}`)
    const reason = reasonOf(body)
    const next = Object.fromEntries(Object.keys(RULE_RANGES).map(name => [name, body[name]]))
    const previous = rulesDto(await voteRules())
    if (Object.keys(RULE_RANGES).every(name => previous[name] === next[name])) return c.json({ rules: previous, changed: false })
    await db.batch([
      q(`UPDATE fc_vote_rules SET window_hours = ?, max_per_window = ?, ip_daily_limit = ?, device_daily_limit = ?, asn_daily_limit = ? WHERE id = 1`,
        next.windowHours, next.maxPerWindow, next.ipDailyLimit, next.deviceDailyLimit, next.asnDailyLimit),
      audit(admin.id, 'vote.rules_changed', 'fc_vote_rules:1', { previous, next, reason }),
    ])
    ratingCache = new Map()
    return c.json({ rules: next, changed: true })
  })

  /* ── public reads the server page makes ────────────────────────────────── */

  app.get('/api/v1/copyright/restrictions/:id', async c => {
    const row = await one('SELECT restricted_links, restricted_materials FROM public_server_projection WHERE server_id = ?', c.req.param('id'))
    const list = value => { try { const parsed = JSON.parse(value ?? '[]'); return Array.isArray(parsed) ? parsed : [] } catch { return [] } }
    return c.json({ restrictedLinks: list(row?.restricted_links), restrictedMaterials: list(row?.restricted_materials) })
  })
  app.post('/api/v1/copyright/claims', () => fail(503, 'copyright_unavailable',
    `Форма обращений временно не принимает заявки. Напишите на ${config.contactEmail ?? 'почту проекта'} со ссылкой на спорный материал.`))

  return { describe }
}
