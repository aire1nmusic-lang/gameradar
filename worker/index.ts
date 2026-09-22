/**
 * GameScout API.
 *
 * One Worker in front of D1. Everything the site and the game servers use
 * lives here; the browser never talks to storage directly.
 *
 * Rules enforced at this layer:
 *   · only PUBLISHED cards are public — a submission is private to its author;
 *   · credentials (sessions, server API keys) are stored as SHA-256 hashes and
 *     the plaintext is returned exactly once, at creation;
 *   · a vote is written once per cooldown window, even under concurrency, and
 *     is handed to a server exactly once.
 */
import { Hono } from 'hono'
import {
  ApiError,
  badRequest,
  conflict,
  devEnabled,
  devOrigins,
  forbidden,
  id,
  notFound,
  now,
  sameSecret,
  sha256,
  slugify,
  token,
  tooMany,
  unauthorized,
  type Env,
} from './lib/core.ts'
import { Store, type Row } from './lib/store.ts'
import { claimDto, gameDto, integrationDto, sampleDto, serverDto, targetDto, userDto, organicScore } from './lib/dto.ts'
import { filters, integer, object, serverInput, strings, text } from './lib/validation.ts'
import { safeFetchText } from './adapters/network.ts'
import { probe } from './adapters/games.ts'

type Vars = { store: Store; user?: Row }
const app = new Hono<{ Bindings: Env; Variables: Vars }>()

const SESSION_COOKIE = 'gs_session'
const SESSION_DAYS = 30
const CLAIM_FILE = '/.well-known/gamescout-verification.txt'

/* ── plumbing ─────────────────────────────────────────────────────────────── */

function allowedOrigins(env: Env): string[] {
  return [env.ALLOWED_ORIGIN ?? '', ...devOrigins(env), ...(env.ENVIRONMENT === 'development' ? ['http://localhost:5173', 'http://127.0.0.1:5173'] : [])].filter(Boolean)
}

app.use('*', async (c, next) => {
  c.set('store', new Store(c.env.DB))

  const origin = c.req.header('Origin')
  const allowed = origin && allowedOrigins(c.env).includes(origin)
  if (c.req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: allowed
        ? {
            'Access-Control-Allow-Origin': origin,
            'Access-Control-Allow-Credentials': 'true',
            'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type,Authorization',
            'Access-Control-Max-Age': '600',
          }
        : {},
    })
  }

  // A cross-site request may not carry the session cookie implicitly.
  if (origin && !allowed && c.req.method !== 'GET') throw forbidden('Источник запроса не разрешён')

  await next()

  if (allowed) {
    c.res.headers.set('Access-Control-Allow-Origin', origin)
    c.res.headers.set('Access-Control-Allow-Credentials', 'true')
    c.res.headers.set('Vary', 'Origin')
  }
})

app.onError((error, c) => {
  if (error instanceof ApiError) return c.json({ error: { code: error.code, message: error.message } }, error.status as 400)
  console.error('Unhandled API error', error)
  return c.json({ error: { code: 'internal_error', message: 'Внутренняя ошибка сервера' } }, 500)
})

app.notFound(c => c.json({ error: { code: 'not_found', message: 'Маршрут не найден' } }, 404))

const store = (c: { get: (k: 'store') => Store }) => c.get('store')

async function readJson(c: { req: { json: () => Promise<unknown> } }): Promise<Record<string, unknown>> {
  try {
    return object(await c.req.json())
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw badRequest('Ожидается JSON тело запроса')
  }
}

/* ── identity ─────────────────────────────────────────────────────────────── */

function readCookie(header: string | undefined, name: string): string | undefined {
  return header
    ?.split(';')
    .map(part => part.trim())
    .find(part => part.startsWith(name + '='))
    ?.slice(name.length + 1)
}

async function currentUser(c: { req: { header: (n: string) => string | undefined }; get: (k: 'store') => Store }): Promise<Row | undefined> {
  const raw = readCookie(c.req.header('Cookie'), SESSION_COOKIE)
  if (!raw) return undefined
  return (await store(c).session(await sha256(raw))) ?? undefined
}

/** Routes that need a signed-in user. */
async function requireUser(c: Parameters<typeof currentUser>[0]): Promise<Row> {
  const user = await currentUser(c)
  if (!user) throw unauthorized()
  return user
}

function requireAdmin(c: { req: { header: (n: string) => string | undefined }; env: Env }) {
  const header = c.req.header('Authorization') ?? ''
  const provided = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (!provided || !c.env.ADMIN_TOKEN || provided !== c.env.ADMIN_TOKEN) throw unauthorized('Требуется админ-токен')
}

/** The Bearer token a game server uses for the pull API. */
async function requireServerKey(c: { req: { header: (n: string) => string | undefined }; get: (k: 'store') => Store }): Promise<Row> {
  const header = c.req.header('Authorization') ?? ''
  if (!header.startsWith('Bearer ')) throw unauthorized('Требуется ключ сервера')
  const integration = await store(c).integrationByHash(await sha256(header.slice(7)))
  if (!integration) throw unauthorized('Ключ сервера недействителен')
  return integration
}

/** Owner or the account that submitted the card. */
function assertCanManage(server: Row, user: Row) {
  if (server.owner_id !== user.id && server.submitted_by !== user.id) throw forbidden('Сервер принадлежит другому владельцу')
}

async function loadManageable(c: { get: (k: 'store') => Store }, serverId: string, user: Row): Promise<Row> {
  const server = await store(c).server(serverId)
  if (!server) throw notFound('Сервер не найден')
  assertCanManage(server, user)
  return server
}

/* ── health ───────────────────────────────────────────────────────────────── */

app.get('/api/v1/health', async c => {
  await store(c).health()
  return c.json({ status: 'ok', environment: c.env.ENVIRONMENT ?? 'production', time: now() })
})

/* ── games ────────────────────────────────────────────────────────────────── */

app.get('/api/v1/games', async c => {
  const s = store(c)
  const [games, chronicles, versions] = await Promise.all([s.games(), s.chronicles(), s.chronicleVersions()])
  return c.json(games.map(game => gameDto(game, chronicles, versions)))
})

/* ── catalogue ────────────────────────────────────────────────────────────── */

app.get('/api/v1/servers', async c => {
  const page = await store(c).servers(filters(new URL(c.req.url).searchParams))
  return c.json({ items: page.items.map(serverDto), total: page.total, limit: page.limit, offset: page.offset })
})

app.get('/api/v1/rating', async c => {
  const params = new URL(c.req.url).searchParams
  const page = await store(c).servers({ ...filters(params), limit: 100, offset: 0, sort: 'recommended' })
  // Boost points are not sold yet; the organic and sponsored orders are identical
  // and the split stays visible so the UI never has to guess.
  const ranked = page.items.map((row, index) => ({
    server: serverDto(row),
    organic: organicScore(row),
    boosts: 0,
    total: organicScore(row),
    rank: index + 1,
    organicRank: index + 1,
    boosted: false,
  }))
  return c.json(ranked)
})

app.get('/api/v1/servers/:key', async c => {
  const server = await store(c).server(c.req.param('key'))
  if (!server) throw notFound('Сервер не найден')
  if (server.moderation !== 'PUBLISHED') {
    // A submission is private until moderation publishes it.
    const user = await currentUser(c)
    if (!user || (server.owner_id !== user.id && server.submitted_by !== user.id)) throw notFound('Сервер не найден')
  }
  return c.json(serverDto(server))
})

app.get('/api/v1/servers/:key/online-history', async c => {
  const server = await store(c).server(c.req.param('key'))
  if (!server || server.moderation !== 'PUBLISHED') throw notFound('Сервер не найден')
  const range = c.req.query('range') ?? '24h'
  const days = range === '30d' ? 30 : range === '7d' ? 7 : 1
  const since = new Date(Date.now() - days * 86400000).toISOString()
  const samples = await store(c).onlineHistory(server.id, since, 500)
  return c.json(samples.map(sampleDto))
})

/** Public reward description, shown next to the vote button. */
app.get('/api/v1/servers/:key/reward', async c => {
  const server = await store(c).server(c.req.param('key'))
  if (!server || server.moderation !== 'PUBLISHED') throw notFound('Сервер не найден')
  const integration = await store(c).ensureIntegration(server.id)
  return c.json(integrationDto(integration))
})

app.post('/api/v1/servers', async c => {
  const user = await requireUser(c)
  const s = store(c)
  const input = serverInput(await readJson(c), c.env)

  const game = await s.game(String(input.game_id))
  if (!game) throw badRequest('Неизвестная игра', 'unknown_game')
  input.game_id = game.id

  if (input.chronicle_id) {
    const chronicle = await s.chronicle(String(input.chronicle_id))
    if (!chronicle || chronicle.game_id !== game.id) throw badRequest('Хроника не принадлежит этой игре', 'unknown_chronicle')
    if (!input.version) input.version = chronicle.label
  }

  const base = slugify(String(input.name))
  const row: Row = {
    id: id('srv'),
    slug: (await s.server(base)) ? `${base}-${token(3)}` : base,
    version: '',
    moderation: 'PENDING_MODERATION',
    submitted_by: user.id,
    added_at: now(),
    updated_at: now(),
    ...input,
  }

  const created = await s.insertServer(row)
  await s.ensureIntegration(created.id)
  return c.json(serverDto(created), 201)
})

app.patch('/api/v1/servers/:id', async c => {
  const user = await requireUser(c)
  const server = await loadManageable(c, c.req.param('id'), user)
  const input = serverInput(await readJson(c), c.env, true)
  if (!Object.keys(input).length) throw badRequest('Нет полей для обновления')

  if (input.game_id) {
    const game = await store(c).game(String(input.game_id))
    if (!game) throw badRequest('Неизвестная игра', 'unknown_game')
    input.game_id = game.id
  }

  await store(c).db
    .prepare(`UPDATE servers SET ${Object.keys(input).map(k => `${k}=?`).join(',')},updated_at=? WHERE id=?`)
    .bind(...Object.keys(input).map(k => input[k]), now(), server.id)
    .run()

  return c.json(serverDto((await store(c).server(server.id))!))
})

/* ── moderation ───────────────────────────────────────────────────────────── */

app.post('/api/v1/admin/servers/:id/publish', async c => {
  requireAdmin(c)
  const server = await store(c).server(c.req.param('id'))
  if (!server) throw notFound('Сервер не найден')
  await store(c).publish(server.id)
  return c.json(serverDto((await store(c).server(server.id))!))
})

/* ── auth ─────────────────────────────────────────────────────────────────── */

function sessionCookie(value: string, env: Env, maxAge: number): string {
  const parts = [`${SESSION_COOKIE}=${value}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAge}`]
  if (env.ENVIRONMENT !== 'development') parts.push('Secure')
  return parts.join('; ')
}

app.get('/api/v1/auth/me', async c => {
  const user = await currentUser(c)
  return c.json({ user: user ? userDto(user) : null, devAuthEnabled: devEnabled(c.env, c.req.raw) })
})

/**
 * Local development sign-in.
 *
 * Deliberately not an account system: it exists so the owner flows can be
 * exercised before Discord OAuth lands, and it refuses to run outside a local
 * development Worker.
 */
app.post('/api/v1/auth/dev', async c => {
  if (!devEnabled(c.env, c.req.raw)) throw notFound('Маршрут недоступен')
  const body = await readJson(c)
  const displayName = text(body.displayName, 'displayName', 2, 60)
  // Any wrong secret is an authentication failure, never a validation hint:
  // the response must not tell an attacker what shape the secret has.
  if (!(await sameSecret(text(body.secret, 'secret', 1, 200), c.env.DEV_AUTH_SECRET))) throw unauthorized('Неверный секрет разработчика')

  const s = store(c)
  await s.deleteExpiredSessions()
  const providerId = 'dev:' + (await sha256(displayName.toLowerCase())).slice(0, 32)
  const user = (await s.userByProvider(providerId)) ?? (await s.createDevUser({ id: id('usr'), displayName, providerId, createdAt: now() }))

  const raw = token(32)
  await s.createSession(await sha256(raw), user.id, new Date(Date.now() + SESSION_DAYS * 86400000).toISOString())
  c.header('Set-Cookie', sessionCookie(raw, c.env, SESSION_DAYS * 86400))
  return c.json({ user: userDto(user) })
})

app.post('/api/v1/auth/logout', async c => {
  const raw = readCookie(c.req.header('Cookie'), SESSION_COOKIE)
  if (raw) await store(c).deleteSession(await sha256(raw))
  c.header('Set-Cookie', sessionCookie('', c.env, 0))
  return c.json({ ok: true })
})

/* ── owner ────────────────────────────────────────────────────────────────── */

app.get('/api/v1/owners/me/servers', async c => {
  const user = await requireUser(c)
  const rows = await store(c).ownerServers(user.id)
  return c.json({ items: rows.map(serverDto), total: rows.length, limit: rows.length, offset: 0 })
})

app.get('/api/v1/owners/me/claims', async c => {
  const user = await requireUser(c)
  return c.json((await store(c).userClaims(user.id)).map(row => claimDto(row)))
})

/* ── claims ───────────────────────────────────────────────────────────────── */

app.post('/api/v1/claims', async c => {
  const user = await requireUser(c)
  const body = await readJson(c)
  const serverId = text(body.serverId, 'serverId', 1, 100)
  const method = text(body.method ?? 'SITE_FILE', 'method', 1, 40)
  // Only the website file proof is implemented; the column keeps the others open.
  if (method !== 'SITE_FILE') throw badRequest('Пока поддерживается только подтверждение файлом на сайте', 'unsupported_method')

  const s = store(c)
  const server = await s.server(serverId)
  if (!server) throw notFound('Сервер не найден')
  if (server.owner_id && server.owner_id !== user.id) throw conflict('У сервера уже есть подтверждённый владелец', 'already_claimed')
  if (!server.website) throw badRequest('У сервера не указан сайт — подтверждение файлом невозможно')

  const existing = await s.activeClaim(server.id, user.id)
  const claim = existing ?? (await s.createClaim({ id: id('clm'), serverId: server.id, userId: user.id, proofToken: 'gamescout-verify-' + token(16), createdAt: now() }))
  return c.json(claimDto(claim, server.website), existing ? 200 : 201)
})

app.get('/api/v1/claims/:id', async c => {
  const user = await requireUser(c)
  const claim = await store(c).claim(c.req.param('id'))
  // Another account must not learn that a claim exists at all.
  if (!claim || claim.user_id !== user.id) throw notFound('Заявка не найдена')
  const server = await store(c).server(claim.server_id)
  return c.json(claimDto(claim, server?.website))
})

app.post('/api/v1/claims/:id/verify', async c => {
  const user = await requireUser(c)
  const s = store(c)
  const claim = await s.claim(c.req.param('id'))
  if (!claim || claim.user_id !== user.id) throw notFound('Заявка не найдена')
  if (claim.status === 'VERIFIED') return c.json(claimDto(claim))
  if (!(await s.claimAttempt(claim.id))) throw tooMany('Слишком много попыток подтверждения', 'too_many_attempts')

  const server = await s.server(claim.server_id)
  if (!server?.website) throw badRequest('У сервера не указан сайт')

  let body: string
  try {
    body = await safeFetchText(new URL(CLAIM_FILE, server.website).toString(), {
      maxBytes: 4096,
      timeoutMs: 5000,
      allowedOrigins: devOrigins(c.env),
    })
  } catch (error) {
    // The owner sees a generic message; the cause stays in the Worker log.
    console.error('claim_proof_fetch_failed', server.website, String(error))
    throw badRequest(`Файл ${CLAIM_FILE} недоступен на сайте сервера`, 'proof_unreachable')
  }

  if (body.trim() !== claim.proof_token) throw badRequest('Файл найден, но токен не совпадает', 'proof_mismatch')

  const verified = await s.verifyClaim(claim.id, claim.server_id, user.id)
  if (verified.status !== 'VERIFIED') throw conflict('Не удалось закрепить владение', 'claim_conflict')
  await s.ensureIntegration(claim.server_id)
  return c.json(claimDto(verified))
})

/* ── vote integration (owner side) ────────────────────────────────────────── */

app.get('/api/v1/servers/:id/vote-integration', async c => {
  const user = await requireUser(c)
  const server = await loadManageable(c, c.req.param('id'), user)
  return c.json(integrationDto(await store(c).ensureIntegration(server.id)))
})

app.patch('/api/v1/servers/:id/vote-integration', async c => {
  const user = await requireUser(c)
  const server = await loadManageable(c, c.req.param('id'), user)
  const body = await readJson(c)

  const fields: Row = {}
  if (body.rewardTitle !== undefined) fields.reward_title = text(body.rewardTitle, 'rewardTitle', 0, 80)
  if (body.rewardDescription !== undefined) fields.reward_text = text(body.rewardDescription, 'rewardDescription', 0, 500)
  if (body.cooldownHours !== undefined) fields.cooldown_hours = integer(body.cooldownHours, 'cooldownHours', 1, 24)
  if (body.delivery !== undefined) {
    const delivery = text(body.delivery, 'delivery', 1, 20)
    if (!['PULL_API', 'VOTIFIER', 'WEBHOOK'].includes(delivery)) throw badRequest('Неизвестный способ доставки')
    fields.delivery = delivery
  }
  if (!Object.keys(fields).length) throw badRequest('Нет полей для обновления')

  await store(c).ensureIntegration(server.id)
  return c.json(integrationDto(await store(c).updateIntegration(server.id, fields)))
})

/**
 * Issues a new server API key.
 *
 * The plaintext is returned once and never stored: only its SHA-256 lands in
 * the database, so a database leak cannot be replayed against the pull API.
 */
app.post('/api/v1/servers/:id/api-key', async c => {
  const user = await requireUser(c)
  const server = await loadManageable(c, c.req.param('id'), user)
  const apiKey = 'gsk_' + token(24)
  await store(c).ensureIntegration(server.id)
  await store(c).updateIntegration(server.id, { api_key_hash: await sha256(apiKey), has_api_key: 1 })
  return c.json({ apiKey, serverId: server.id })
})

/* ── monitoring ───────────────────────────────────────────────────────────── */

/** Owner-supplied connection details for the monitor. Never public. */
app.patch('/api/v1/servers/:id/monitoring', async c => {
  const user = await requireUser(c)
  const server = await loadManageable(c, c.req.param('id'), user)
  const body = await readJson(c)

  const method = text(body.method ?? 'GAME_PROTOCOL', 'method', 1, 30)
  if (!['GAME_PROTOCOL', 'SERVER_API', 'LOGIN_SERVER', 'AGENT'].includes(method)) throw badRequest('Неизвестный способ проверки')

  const target: Row = { method, enabled: body.enabled === false ? false : true }
  if (body.host !== undefined) target.host = text(body.host, 'host', 1, 253)
  if (body.port !== undefined) target.port = integer(body.port, 'port', 1, 65535)
  if (body.apiUrl !== undefined) target.apiUrl = text(body.apiUrl, 'apiUrl', 8, 500)

  return c.json(targetDto((await store(c).setTarget(server.id, target))!))
})

app.get('/api/v1/servers/:id/monitoring', async c => {
  const user = await requireUser(c)
  const server = await loadManageable(c, c.req.param('id'), user)
  const target = await store(c).target(server.id)
  return c.json(target ? targetDto(target) : { serverId: server.id, method: 'OWNER_SUBMITTED', enabled: false })
})

/**
 * Runs one monitoring pass.
 *
 * Exposed to admins so a pass can be triggered and observed on demand; the
 * scheduled handler below calls the same code on a cron.
 */
async function runMonitoringPass(env: Env, limit: number): Promise<{ checked: number; results: Row[] }> {
  const s = new Store(env.DB)
  const targets = await s.targets(limit)
  const results: Row[] = []
  // Loopback targets are reachable only in local development, and only for
  // the origins the developer explicitly allowed.
  const local = devOrigins(env)
  for (const target of targets) {
    const allowLoopback = local.some(origin => String(target.api_url ?? '').startsWith(origin) || origin.includes(String(target.host ?? ' ')))
    const result = await probe(
      {
        gameSlug: target.game_slug,
        method: target.method,
        host: target.host,
        port: target.port,
        apiUrl: target.api_url,
      },
      { allowLoopback },
    )
    await s.saveSample(target.server_id, result)
    results.push({ serverId: target.server_id, status: result.status, online: result.online, latencyMs: result.latencyMs })
  }
  return { checked: results.length, results }
}

app.post('/api/v1/admin/monitor/run', async c => {
  requireAdmin(c)
  const body = await readJson(c).catch(() => ({}))
  return c.json(await runMonitoringPass(c.env, integer((body as Row).limit ?? 25, 'limit', 1, 200)))
})

/* ── votes ────────────────────────────────────────────────────────────────── */

function clientIp(c: { req: { header: (n: string) => string | undefined } }): string {
  return c.req.header('CF-Connecting-IP') ?? c.req.header('X-Forwarded-For')?.split(',')[0]?.trim() ?? '127.0.0.1'
}

app.get('/api/v1/votes/eligibility', async c => {
  const s = store(c)
  const serverId = text(c.req.query('serverId'), 'serverId', 1, 100)
  const nickname = text(c.req.query('nickname') ?? '', 'nickname', 0, 40)
  const server = await s.server(serverId)
  if (!server || server.moderation !== 'PUBLISHED') throw notFound('Сервер не найден')

  const integration = await s.ensureIntegration(server.id)
  const user = await currentUser(c)
  if (!nickname && !user) return c.json({ allowed: true })

  const voterKey = user ? 'user:' + user.id : 'nick:' + (await sha256(server.id + ':' + nickname.toLowerCase()))
  const last = await s.lastVote(server.id, voterKey)
  if (!last) return c.json({ allowed: true })
  const next = Date.parse(last.created_at) + integration.cooldown_hours * 3600000
  return c.json(next <= Date.now() ? { allowed: true } : { allowed: false, nextAllowedAt: new Date(next).toISOString() })
})

app.post('/api/v1/votes', async c => {
  const s = store(c)
  const body = await readJson(c)
  const serverId = text(body.serverId, 'serverId', 1, 100)
  const nickname = text(body.nickname, 'nickname', 2, 40)
  if (!/^[\p{L}\p{N}_. -]+$/u.test(nickname)) throw badRequest('Ник содержит недопустимые символы')

  const server = await s.server(serverId)
  if (!server || server.moderation !== 'PUBLISHED') throw notFound('Сервер не найден')

  const integration = await s.ensureIntegration(server.id)
  const user = await currentUser(c)
  // Cooldown identity: the account when signed in, otherwise the nickname.
  // Lower-cased so "Player" and "player" are one voter.
  const voterKey = user ? 'user:' + user.id : 'nick:' + (await sha256(server.id + ':' + nickname.toLowerCase()))
  const ipHash = await sha256((c.env.IP_HASH_SECRET ?? 'gamescout') + ':' + clientIp(c))

  const cooldownSince = new Date(Date.now() - integration.cooldown_hours * 3600000).toISOString()
  const rateSince = new Date(Date.now() - 3600000).toISOString()
  const voteId = id('vote')

  // The insert itself carries the cooldown and rate limits, so two racing
  // requests can never both win.
  const inserted = await s.insertVote(
    { id: voteId, serverId: server.id, nickname, userId: user?.id, voterKey, ipHash, createdAt: now() },
    cooldownSince,
    rateSince,
  )
  if (!inserted) {
    const last = await s.lastVote(server.id, voterKey)
    const nextAllowedAt = last ? new Date(Date.parse(last.created_at) + integration.cooldown_hours * 3600000).toISOString() : undefined
    throw tooMany(nextAllowedAt ? 'Повторный голос будет доступен позже' : 'Слишком много голосов с этого адреса', 'cooldown')
  }

  const vote = (await s.vote(voteId))!
  return c.json(
    {
      id: vote.id,
      serverId: vote.server_id,
      nickname: vote.nickname,
      status: vote.status,
      delivery: vote.delivery,
      createdAt: vote.created_at,
      reward: { title: integration.reward_title ?? '', description: integration.reward_text ?? '' },
    },
    201,
  )
})

/**
 * Pull API — the universal delivery path.
 *
 * A game server polls this with its own key; the response is always scoped to
 * that server, so a leaked key can never read another project's votes.
 */
app.get('/api/v1/votes/pending', async c => {
  const integration = await requireServerKey(c)
  const params = new URL(c.req.url).searchParams
  const page = await store(c).pendingVotes(
    integration.server_id,
    integer(params.get('limit') ?? 100, 'limit', 1, 500),
    integer(params.get('offset') ?? 0, 'offset', 0, 100000),
  )
  return c.json({
    items: page.items.map(row => ({ id: row.id, serverId: row.server_id, nickname: row.nickname, createdAt: row.created_at })),
    total: page.total,
    limit: page.limit,
    offset: page.offset,
  })
})

/**
 * Marks votes as delivered.
 *
 * Idempotent by construction: the update only matches PENDING rows, so a retry
 * (or a second worker racing the first) returns an empty list instead of
 * rewarding a player twice.
 */
app.post('/api/v1/votes/claim', async c => {
  const integration = await requireServerKey(c)
  const body = await readJson(c)
  const ids = strings(body.ids, 'ids', 500)
  if (!ids.length) return c.json({ items: [], claimed: [] })

  const claimed = await store(c).claimVotes(integration.server_id, ids)
  const items = claimed.map(row => ({ id: row.id, nickname: row.nickname, createdAt: row.created_at, claimedAt: row.claimed_at }))
  return c.json({ items, claimed: items.map(item => item.id) })
})

export default {
  fetch: app.fetch,
  /** Cron entry point: keeps VERIFIED/LIVE/OFFLINE current without a request. */
  async scheduled(_event: unknown, env: Env, ctx: { waitUntil(promise: Promise<unknown>): void }) {
    ctx.waitUntil(runMonitoringPass(env, 50))
  },
}
