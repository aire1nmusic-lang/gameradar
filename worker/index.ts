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
import { publicPeopleRanking } from './lib/people-ranking.ts'
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
import { claimDto, gameDto, integrationDto, rewardDto, sampleDto, serverDto, targetDto, userDto, organicScore } from './lib/dto.ts'
import { filters, integer, object, serverInput, strings, text } from './lib/validation.ts'
import { safeFetchText } from './adapters/network.ts'
import { resolveOnline } from './lib/monitor.ts'
import { PROVIDERS, sourceAvailable } from './adapters/sources.ts'
import { assertPort, assertPublicHost, assertPublicUrl } from './adapters/network.ts'
import { SubrequestBudget } from './lib/budget.ts'
import { budgetedNetwork, subrequestBudget } from './lib/network.ts'
import { sitemapXml } from './lib/sitemap.ts'
import { clientIp, currentUser, isAdmin, readJson, requireAdmin, requireUser, startSession, store, type AppEnv } from './lib/http.ts'
import { accountRoutes } from './routes/accounts.ts'
import { freeAccounts, freeAccountsCleanup } from './accounts-free.ts'
import { deliverVotifierVotes } from './lib/votes.ts'
import { applyPublicSnapshot, parsePublicSnapshot } from './lib/public-projection.ts'
import { deliverRelayNotice, relayNotice } from './lib/telegram-relay.ts'

const app = new Hono<AppEnv>()

/**
 * Public lists are the same for every visitor and are asked for on every page:
 * keep each answer in this isolate for a few seconds instead of reading D1 again.
 * Free-plan D1 has a daily row-read limit; a warm isolate now serves repeats
 * from memory. Keyed by path + sorted query, so filters never mix.
 */
const listCache = new Map<string, { at: number; body: string }>()
async function cachedList(c: { req: { url: string }; body: (data: string, status: 200, headers: Record<string, string>) => Response }, ttlMs: number, produce: () => Promise<unknown>) {
  const url = new URL(c.req.url)
  const params = [...url.searchParams.entries()].sort(([a], [b]) => a.localeCompare(b))
  const key = url.pathname + '?' + new URLSearchParams(params).toString()
  const hit = listCache.get(key)
  let body = hit && Date.now() - hit.at < ttlMs ? hit.body : undefined
  if (!body) {
    body = JSON.stringify(await produce())
    listCache.delete(key)
    listCache.set(key, { at: Date.now(), body })
    if (listCache.size > 300) listCache.delete(listCache.keys().next().value!)
  }
  return c.body(body, 200, { 'Content-Type': 'application/json; charset=UTF-8' })
}

const CLAIM_FILE = '/.well-known/gamescout-verification.txt'
/** How long a claim's proof token is accepted. */
const CLAIM_TTL_MS = 86400000

/* ── plumbing ─────────────────────────────────────────────────────────────── */

/** Front mirrors (e.g. the Russian entry) that serve the same site from another host. */
function extraOrigins(env: Env): string[] {
  return (env.EXTRA_ORIGINS ?? '').split(',').map(o => o.trim()).filter(o => /^https:\/\/[a-z0-9.-]+$/.test(o))
}

/*
 * GameScout's own front proxy relays the visitor's IP in X-GS-Client-IP and
 * proves itself with X-GS-Proxy-Auth. Without the secret the header is
 * ignored, so a client cannot choose the IP its votes and limits count by.
 */
const PROXY_AUTH_HEADER = 'X-GS-Proxy-Auth'
const PROXY_IP_HEADER = 'X-GS-Client-IP'
const IP_PATTERN = /^(?:\d{1,3}(?:\.\d{1,3}){3}|[0-9a-f:]{2,39})$/i

function allowedOrigins(env: Env): string[] {
  return [env.ALLOWED_ORIGIN ?? '', ...extraOrigins(env), ...devOrigins(env), ...(env.ENVIRONMENT === 'development' ? ['http://localhost:5173', 'http://127.0.0.1:5173'] : [])].filter(Boolean)
}

app.use('*', async (c, next) => {
  c.set('store', new Store(c.env.DB, c.env.ENVIRONMENT === 'development'))

  if(c.req.path==='/api/internal/telegram-relay'&&c.req.method==='POST') {
    if(!(await sameSecret(c.req.header('Authorization')?.replace(/^Bearer /,'')??'',c.env.PUBLIC_PROJECTION_SECRET)))throw forbidden()
    if(Number(c.req.header('Content-Length')??0)>256)throw badRequest('Payload too large')
    const text=await c.req.text()
    if(text.length>256)throw badRequest('Payload too large')
    let dto
    try {dto=relayNotice(JSON.parse(text))}catch {throw badRequest('Invalid technical incident')}
    try {return c.json(await deliverRelayNotice({botToken:c.env.TELEGRAM_RELAY_BOT_TOKEN,chatId:c.env.TELEGRAM_RELAY_CHAT_ID},dto))}
    catch(error) {
      const code=error instanceof Error&&/^(relay_unconfigured|relay_transport_failed|relay_delivery_failed|relay_telegram_http_\d{3})$/.test(error.message)?error.message:'relay_delivery_failed'
      throw new ApiError(502,'Техническое уведомление не доставлено',code)
    }
  }

  if (c.req.path === '/api/internal/public-projection' && c.req.method === 'POST') {
    if (!(await sameSecret(c.req.header('Authorization')?.replace(/^Bearer /,'') ?? '', c.env.PUBLIC_PROJECTION_SECRET))) throw forbidden()
    if (Number(c.req.header('Content-Length') ?? 0)>2048) throw badRequest('Payload too large')
    const payloadText=await c.req.text()
    if (payloadText.length>2048) throw badRequest('Payload too large')
    let snapshot
    try { snapshot=parsePublicSnapshot(JSON.parse(payloadText)) } catch { throw badRequest('Invalid public projection') }
    await applyPublicSnapshot(c.env.DB,snapshot)
    return c.json({ok:true})
  }

  if (c.env.PUBLIC_ONLY === 'true' && !(c.req.method === 'GET' && (
    /^\/api\/v1\/(health|games|rating|people-rating|support\/ranking|servers(?:\/[^/]+(?:\/online-history)?)?|sitemap\.xml)$/.test(c.req.path) || c.req.path==='/sitemap.xml'
  ))) {
    // Shown to people as is: votes, owner claims and new cards are off until the private core is back.
    throw new ApiError(503,'Эта функция временно недоступна: голосование, заявки владельцев и добавление серверов откроются после запуска.','private_api_required')
  }

  const proxyAuth = c.req.header(PROXY_AUTH_HEADER)
  if (proxyAuth && (await sameSecret(proxyAuth, c.env.PROXY_SECRET))) {
    const ip = c.req.header(PROXY_IP_HEADER)?.trim()
    if (ip && IP_PATTERN.test(ip)) c.set('proxyIp', ip)
  } else if (c.env.PROXY_ONLY === 'true') {
    // This origin is only an upstream of the front proxy, never a public entry.
    throw forbidden('Доступ только через сайт GameScout')
  }

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

/* ── identity ─────────────────────────────────────────────────────────────── */

/** The Bearer token a game server uses for the pull API. */
async function requireServerKey(c: { req: { header: (n: string) => string | undefined }; get: (k: 'store') => Store }): Promise<Row> {
  const header = c.req.header('Authorization') ?? ''
  if (!header.startsWith('Bearer ')) throw unauthorized('Требуется ключ сервера')
  const integration = await store(c).integrationByHash(await sha256(header.slice(7)))
  if (!integration) throw unauthorized('Ключ сервера недействителен')
  return integration
}

/**
 * Who may manage a card: its verified owner — or, while nobody has proven
 * ownership yet, the account that submitted it. Once an owner is verified the
 * submitter loses access, so a card filed by someone else can never be used to
 * read the owner's statistics or rotate the owner's server key.
 */
function assertCanManage(server: Row, user: Row) {
  const allowed = server.owner_id ? server.owner_id === user.id : server.submitted_by === user.id
  if (!allowed) throw forbidden('Сервер принадлежит другому владельцу')
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

/* ── sitemap ──────────────────────────────────────────────────────────────── */

async function sitemap(c: { get: (k: 'store') => Store; body: (data: string, status: number, headers: Record<string, string>) => Response }) {
  const s = store(c)
  const [games, chronicles, servers] = await Promise.all([s.games(), s.chronicles(), s.sitemapServers()])
  return c.body(sitemapXml(games, chronicles, servers), 200, {
    'Content-Type': 'application/xml; charset=utf-8',
    'Cache-Control': 'public, max-age=3600',
  })
}
app.get('/api/v1/sitemap.xml', c => sitemap(c))
// Answers only once the zone routes /sitemap.xml to this Worker; until then Pages serves the static file.
app.get('/sitemap.xml', c => sitemap(c))

/* ── games ────────────────────────────────────────────────────────────────── */

app.get('/api/v1/games', c => cachedList(c, 60_000, async () => {
  const s = store(c)
  const [games, chronicles, versions] = await Promise.all([s.games(), s.chronicles(), s.chronicleVersions()])
  return games.map(game => gameDto(game, chronicles, versions))
}))

/* ── catalogue ────────────────────────────────────────────────────────────── */

app.get('/api/v1/people-rating', c => {
  c.header('X-GS-Public-Votes', '1')
  return cachedList(c, 15_000, () => publicPeopleRanking(new URL(c.req.url).searchParams))
})

app.get('/api/v1/support/ranking', c => {
  const limit=Number(c.req.query('limit')??100),offset=Number(c.req.query('offset')??0)
  if(!Number.isSafeInteger(limit)||limit<1||limit>100||!Number.isSafeInteger(offset)||offset<0||offset>1000000)
    throw badRequest('Некорректная страница Поддержки')
  return cachedList(c,30_000,()=>store(c).supportRanking(limit,offset))
})

app.get('/api/v1/servers', c => {
  const query = filters(new URL(c.req.url).searchParams) // validate before the cache: bad input never gets a cached 200
  return cachedList(c, 30_000, async () => {
    const page = await store(c).servers(query)
    return { items: page.items.map(serverDto), total: page.total, limit: page.limit, offset: page.offset }
  })
})

app.get('/api/v1/rating', c => {
  const query = filters(new URL(c.req.url).searchParams)
  return cachedList(c, 30_000, async () => {
  const page = await store(c).servers({ ...query, limit: 100, offset: 0, sort: 'recommended' })
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
  return ranked
  })
})

app.get('/api/v1/servers/:key', async c => {
  const server = await store(c).server(c.req.param('key'))
  if (!server) throw notFound('Сервер не найден')
  if (server.moderation !== 'PUBLISHED') {
    // A submission is private until moderation publishes it.
    const user = await currentUser(c)
    if (!user || (server.owner_id !== user.id && server.submitted_by !== user.id && !isAdmin(user))) throw notFound('Сервер не найден')
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
  return c.json(rewardDto(integration))
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

  // An obvious duplicate — same game and the same name, or the same site and
  // version — points the author at the existing card instead of cloning it.
  const duplicate = await s.findDuplicate(game.id, String(input.name), String(input.website ?? ''), String(input.version ?? ''))
  if (duplicate) throw conflict(`Такой сервер уже есть в каталоге: /server/${duplicate.slug}`, 'duplicate_server')

  const base = slugify(String(input.name))
  const row: Row = {
    id: id('srv'),
    // Hidden and pending cards count too: the slug column is unique.
    slug: (await s.slugTaken(base)) ? `${base}-${token(3)}` : base,
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
  await requireAdmin(c)
  const server = await store(c).server(c.req.param('id'))
  if (!server) throw notFound('Сервер не найден')
  await store(c).publish(server.id)
  return c.json(serverDto((await store(c).server(server.id))!))
})

/* ── auth ─────────────────────────────────────────────────────────────────── */

/**
 * Local development sign-in.
 *
 * Deliberately not an account system: it lets tests and local development
 * sign in without mail or OAuth, and it refuses to run outside a local
 * development Worker. Real sign-in lives in routes/accounts.ts.
 */
app.post('/api/v1/auth/dev', async c => {
  if (!devEnabled(c.env, c.req.raw)) throw notFound('Маршрут недоступен')
  const body = await readJson(c)
  const displayName = text(body.displayName, 'displayName', 2, 60)
  // Any wrong secret is an authentication failure, never a validation hint:
  // the response must not tell an attacker what shape the secret has.
  if (!(await sameSecret(text(body.secret, 'secret', 1, 200), c.env.DEV_AUTH_SECRET))) throw unauthorized('Неверный секрет разработчика')

  const s = store(c)
  const providerId = 'dev:' + (await sha256(displayName.toLowerCase())).slice(0, 32)
  const user = (await s.userByProvider(providerId)) ?? (await s.createDevUser({ id: id('usr'), displayName, providerId, createdAt: now() }))
  return c.json({ user: userDto(await startSession(c, user)) })
})

accountRoutes(app)

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
  if (claim.status !== 'PENDING') throw conflict('Заявка закрыта — создайте новую', 'claim_closed')
  // A proof token lives 24 hours; after that a new claim issues a new token.
  if (Date.parse(claim.created_at) + CLAIM_TTL_MS <= Date.now()) throw new ApiError(410, 'Срок действия кода истёк — создайте новую заявку', 'proof_expired')
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
  const minecraft = server.game_id === 'minecraft'
  const votifierFields = ['votifierHost', 'votifierPort', 'votifierToken'].filter(key => body[key] !== undefined)
  // Votifier is Minecraft's protocol; other games take votes through the Pull API.
  if (votifierFields.length && !minecraft) throw badRequest('Votifier доступен только для серверов Minecraft', 'votifier_minecraft_only')
  if (body.votifierHost !== undefined) {
    const host = text(body.votifierHost, 'votifierHost', 1, 253)
    const loopback = devOrigins(c.env).map(origin => new URL(origin).hostname)
    try {
      if (!loopback.includes(host)) assertPublicHost(host)
    } catch {
      throw badRequest('Адрес Votifier должен быть публичным', 'invalid_target')
    }
    fields.votifier_host = host
  }
  if (body.votifierPort !== undefined) {
    const port = integer(body.votifierPort, 'votifierPort', 1, 65535)
    try {
      assertPort(port)
    } catch {
      throw badRequest('Недопустимый порт Votifier', 'invalid_target')
    }
    fields.votifier_port = port
  }
  if (body.votifierToken !== undefined) fields.votifier_token = text(body.votifierToken, 'votifierToken', 8, 200)
  if (body.delivery !== undefined) {
    const delivery = text(body.delivery, 'delivery', 1, 20)
    if (delivery === 'WEBHOOK') throw badRequest('Доставка через webhook пока не поддерживается — используйте Pull API', 'unsupported_delivery')
    if (!['PULL_API', 'VOTIFIER'].includes(delivery)) throw badRequest('Неизвестный способ доставки')
    if (delivery === 'VOTIFIER') {
      if (!minecraft) throw badRequest('Votifier доступен только для серверов Minecraft', 'votifier_minecraft_only')
      const current = await store(c).ensureIntegration(server.id)
      const host = fields.votifier_host ?? current.votifier_host
      const port = fields.votifier_port ?? current.votifier_port
      const secret = fields.votifier_token ?? current.votifier_token
      if (!host || !port || !secret) throw badRequest('Укажите адрес, порт и токен NuVotifier', 'votifier_incomplete')
    }
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
  if (method === 'SERVER_API' && !target.apiUrl) throw badRequest('Для FiveM нужен адрес http(s)://host:port', 'missing_api_url')
  if (method !== 'SERVER_API' && method !== 'AGENT' && !target.host) throw badRequest('Нужен адрес сервера', 'missing_host')

  // The monitor refuses private networks at probe time; refusing them here too
  // tells the owner immediately instead of producing a silent OFFLINE later.
  const loopback = devOrigins(c.env)
  try {
    if (target.apiUrl) {
      const url = new URL(String(target.apiUrl))
      if (!loopback.includes(url.origin)) assertPublicUrl(String(target.apiUrl))
    }
    if (target.host && !loopback.some(origin => new URL(origin).hostname === target.host)) assertPublicHost(String(target.host))
    if (target.port !== undefined) assertPort(Number(target.port))
  } catch (error) {
    throw badRequest(error instanceof Error ? `Адрес не подходит для мониторинга: ${error.message}` : 'Адрес не подходит для мониторинга', 'invalid_target')
  }

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
/** Worst-case subrequests one card may need (direct probe + retry + two monitors). */
const CARD_RESERVE = 10
/** Stop starting new cards after this long; the rest wait for the next tick. */
const PASS_DEADLINE_MS = 60_000

async function runMonitoringPass(
  env: Env,
  limit: number,
  budget = new SubrequestBudget(subrequestBudget(env)),
): Promise<{ checked: number; skipped: number; sourceless: number; results: Row[] }> {
  const s = new Store(env.DB)
  const secrets = { steamKey: env.STEAM_API_KEY }
  const providers = Object.keys(PROVIDERS).filter(provider => sourceAvailable(provider, secrets))

  // Cards with nothing to read online from stop being PENDING forever.
  const sourceless = (await s.markSourceless(providers, 'Источник онлайна для этого сервера не подключён')).meta.changes ?? 0

  // Oldest attempt first, so small batches rotate through every card.
  const queue = [...(await s.monitorQueue(limit, providers))]
  const sources = await s.onlineSources(queue.map(entry => entry.server_id))

  // One budget and one DNS/SRV cache for the whole invocation.
  const shared = budgetedNetwork(budget)

  const results: Row[] = []
  let skipped = 0
  const startedAt = Date.now()
  // Loopback targets are reachable only in local development, and only for
  // the origins the developer explicitly allowed.
  const local = devOrigins(env)
  // A few cards at a time: a pass must finish well inside one invocation, and
  // one slow server must not hold up the rest.
  const lanes = Array.from({ length: Math.min(4, queue.length) }, async () => {
    for (let entry = queue.shift(); entry; entry = queue.shift()) {
      // Out of time or budget: leave the card unleased so the next tick takes it first.
      if (Date.now() - startedAt > PASS_DEADLINE_MS || !budget.reserve(CARD_RESERVE)) {
        skipped++
        continue
      }
      try {
        await s.lease(entry.server_id)
        const allowLoopback = local.some(origin => String(entry.api_url ?? '').startsWith(origin) || origin.includes(String(entry.host ?? '\u0000')))
        const target = entry.target_id
          ? { gameSlug: entry.game_slug, method: entry.method, host: entry.host, port: entry.port, apiUrl: entry.api_url, expectName: entry.expect_name }
          : null
        const own = sources
          .filter(row => row.server_id === entry.server_id)
          .map(row => ({ tier: row.tier, provider: row.provider, name: row.name, url: row.url, config: parseConfig(row.config) }))
        const result = await resolveOnline(target, own, { ...shared, allowLoopback }, secrets)
        if (result.skipped) {
          // Nothing was learned: storing it would invent an UNKNOWN/OFFLINE.
          skipped++
          continue
        }
        await s.saveSample(entry.server_id, result)
        results.push({ serverId: entry.server_id, status: result.status, tier: result.tier, source: result.source, online: result.online, latencyMs: result.latencyMs, note: result.note })
      } catch (error) {
        // One broken card must not abort the pass for everyone else.
        console.error('monitor_card_failed', entry.server_id, String(error))
        skipped++
      } finally {
        budget.release(CARD_RESERVE)
      }
    }
  })
  await Promise.all(lanes)
  return { checked: results.length, skipped, sourceless, results }
}

function parseConfig(raw: unknown): Record<string, unknown> {
  try {
    const value = JSON.parse(String(raw ?? '{}'))
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  } catch {
    return {}
  }
}


/** Probes per cron tick. Each probe costs a few subrequests (DNS + connect). */
function monitorBatch(env: Env): number {
  const size = Number(env.MONITOR_BATCH ?? 8)
  return Number.isInteger(size) && size > 0 && size <= 50 ? size : 8
}

app.post('/api/v1/admin/votes/deliver', async c => {
  await requireAdmin(c)
  return c.json(
    await deliverVotifierVotes(new Store(c.env.DB), new SubrequestBudget(subrequestBudget(c.env)), {
      limit: 20,
      loopbackHosts: devOrigins(c.env).map(origin => new URL(origin).hostname),
    }),
  )
})

app.post('/api/v1/admin/monitor/run', async c => {
  await requireAdmin(c)
  const body = await readJson(c).catch(() => ({}))
  return c.json(await runMonitoringPass(c.env, integer((body as Row).limit ?? 25, 'limit', 1, 200)))
})

/* ── card analytics ─────────────────────────────────────────────────────── */

/**
 * What players do with a card. Only facts a browser reports: the card was
 * opened, a link out was followed, the vote form was used, a claim began.
 * One event per visitor, card and kind per 30 minutes — refreshes and bots
 * hammering a button do not inflate an owner's numbers.
 */
const EVENT_KINDS = ['VIEW', 'WEBSITE_CLICK', 'PLAY_CLICK', 'VOTE_CLICK', 'CLAIM_START'] as const

app.post('/api/v1/events', async c => {
  const body = await readJson(c)
  const kind = text(body.kind, 'kind', 3, 20)
  if (!(EVENT_KINDS as readonly string[]).includes(kind)) throw badRequest('Неизвестный тип события')
  const server = await store(c).server(text(body.serverId, 'serverId', 1, 100))
  if (!server || server.moderation !== 'PUBLISHED') throw notFound('Сервер не найден')
  const source = body.source === undefined ? null : text(body.source, 'source', 0, 40)
  const visitor = await sha256((c.env.IP_HASH_SECRET ?? 'gamescout') + ':event:' + clientIp(c) + ':' + (c.req.header('User-Agent') ?? ''))
  const recorded = await store(c).recordEvent(server.id, kind, source, visitor, new Date(Date.now() - 30 * 60000).toISOString())
  return c.json({ recorded }, 202)
})

/** Owner view of a card's real numbers: events, votes and delivery state. */
app.get('/api/v1/servers/:id/stats', async c => {
  const user = await requireUser(c)
  const server = await loadManageable(c, c.req.param('id'), user)
  const days = c.req.query('range') === '7d' ? 7 : 30
  return c.json(await store(c).serverStats(server.id, new Date(Date.now() - days * 86400000).toISOString(), days))
})

app.get('/api/v1/servers/:id/votes', async c => {
  const user = await requireUser(c)
  const server = await loadManageable(c, c.req.param('id'), user)
  const rows = await store(c).recentVotes(server.id, 50)
  return c.json(rows.map(row => ({ id: row.id, nickname: row.nickname, status: row.status, delivery: row.delivery, createdAt: row.created_at, claimedAt: row.claimed_at ?? undefined })))
})

/* ── votes ────────────────────────────────────────────────────────────────── */

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
  // A vote travels the way its server chose: Votifier (Minecraft, configured) or the Pull API.
  const votifier =
    integration.delivery === 'VOTIFIER' && server.game_id === 'minecraft' && !!integration.votifier_host && !!integration.votifier_port && !!integration.votifier_token
  const inserted = await s.insertVote(
    { id: voteId, serverId: server.id, nickname, userId: user?.id, voterKey, ipHash, createdAt: now(), delivery: votifier ? 'VOTIFIER' : 'PULL_API' },
    cooldownSince,
    rateSince,
  )
  if (!inserted) {
    const last = await s.lastVote(server.id, voterKey)
    const nextAllowedAt = last ? new Date(Date.parse(last.created_at) + integration.cooldown_hours * 3600000).toISOString() : undefined
    throw tooMany(nextAllowedAt ? 'Повторный голос будет доступен позже' : 'Слишком много голосов с этого адреса', 'cooldown')
  }

  const vote = (await s.vote(voteId))!
  if (votifier) {
    // Deliver right away; a failure stays PENDING and the cron retries it.
    const delivery = deliverVotifierVotes(new Store(c.env.DB), new SubrequestBudget(subrequestBudget(c.env)), {
      limit: 1,
      voteId,
      loopbackHosts: devOrigins(c.env).map(origin => new URL(origin).hostname),
    }).catch(error => console.error('votifier_delivery_failed', String(error)))
    try {
      c.executionCtx.waitUntil(delivery)
    } catch {
      await delivery
    }
  }
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

/** One tick of background work: retry pending Votifier votes, then one monitoring pass. */
async function runTick(env: Env): Promise<void> {
  const budget = new SubrequestBudget(subrequestBudget(env))
  await deliverVotifierVotes(new Store(env.DB), budget, { limit: 3 }).catch(error => console.error('votifier_retry_failed', String(error)))
  const pass = await runMonitoringPass(env, monitorBatch(env), budget)
  console.log('monitor_tick', JSON.stringify({ checked: pass.checked, skipped: pass.skipped, sourceless: pass.sourceless, subrequests: budget.used }))
}

export default {
  async fetch(request: Request, env: Env, ctx: Parameters<typeof app.fetch>[2]) {
    return (await freeAccounts(request, env)) ?? app.fetch(request, env, ctx)
  },
  /**
   * Cron entry point: keeps VERIFIED/LIVE/OFFLINE current without a request.
   * On the free plan a cron invocation gets 10 ms of CPU, less than one pass
   * needs, so with a queue bound the cron only enqueues a tick and the queue
   * consumer does the work. Without a queue (local tests) the tick runs here.
   */
  async scheduled(event: { scheduledTime?: number }, env: Env, ctx: { waitUntil(promise: Promise<unknown>): void }) {
    ctx.waitUntil(freeAccountsCleanup(env, new Date(event.scheduledTime ?? Date.now())).catch(() => console.error('accounts_cleanup_failed')))
    if (env.MONITOR_QUEUE) {
      await env.MONITOR_QUEUE.send({ tick: event.scheduledTime ?? Date.now() })
      return
    }
    ctx.waitUntil(runTick(env).catch(error => console.error('monitor_tick_failed', String(error))))
  },
  /** Queue consumer: one tick per delivered batch, however many ticks piled up. */
  async queue(batch: { messages: readonly unknown[]; ackAll(): void }, env: Env): Promise<void> {
    try {
      await runTick(env)
    } catch (error) {
      // The lease already moved the queue on; the next tick retries, not this message.
      console.error('monitor_tick_failed', String(error))
    }
    batch.ackAll()
  },
}
