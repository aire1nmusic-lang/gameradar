import { Hono } from 'hono'
import { isIP } from 'node:net'
import { digest, hashPassword, keyed, passwordValid, token, verifyPassword } from '../private-api/crypto.mjs'
import { emergencyBlocks, emergencyLimit } from '../private-api/security.mjs'

/**
 * Accounts-only GameScout API: registration by e-mail link, sign-in, session, logout, password recovery.
 *
 * It keeps the wire contract of `private-api/app.mjs` for exactly these routes (same paths, cookie, JSON error
 * codes, hashing, 20-minute single-use links, 7-day sessions) so the existing frontend works unchanged.
 * Storage is behind the small `store` interface below; `store-ydb.mjs` is the production implementation
 * (serverless YDB) and `store-memory.mjs` is the reference used by tests. Everything else the private core does
 * (Claims, votes, Coins, payments, OAuth) is deliberately NOT here: those routes answer 404 `route_unavailable`.
 *
 * store contract — every method is atomic (one serializable transaction in YDB):
 *   ping()
 *   rateHit({key,window,expiresAt}) -> number             increments and returns the counter
 *   userByEmail(email) / userById(id) -> User|null
 *   sessionUser({tokenHash,now}) -> {user,session}|null   live session of a non-banned user
 *   issueToken({email,purpose,tokenHash,payload,expiresAt,now,onlyIfNoUser}) -> boolean
 *   confirmRegistration({tokenHash,userId,sessionHash,replaceSessionHash,sessionExpiresAt,now}) -> User|null
 *   openSession({userId,expectedPasswordHash,sessionHash,replaceSessionHash,sessionExpiresAt,loginMethod,now}) -> boolean
 *   resetPassword({tokenHash,passwordHash,now}) -> boolean   consumes the token, revokes every session
 *   deleteSession(tokenHash)
 */
export class Failure extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code }
}
const fail = (status, code, message) => { throw new Failure(status, code, message) }
const emailOf = value => {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (email.length > 254 || !/^[^\s@]{1,64}@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, 'email_invalid', 'Введите корректный email')
  return email
}
const textOf = (value, min, max) => {
  if (typeof value !== 'string' || value.trim().length < min || value.length > max || /[\u0000-\u001f]/.test(value))
    fail(400, 'invalid_input', `Ожидается текст от ${min} до ${max} символов`)
  return value.trim()
}
const passwordOf = value => {
  if (!passwordValid(value)) fail(400, 'password_weak', 'Пароль — от 12 до 128 символов')
  return value
}
const cookieValue = (c, name) => (c.req.header('Cookie') ?? '').split(';').map(x => x.trim()).find(x => x.startsWith(name + '='))?.slice(name.length + 1) ?? ''

const LINK_TTL_MS = 20 * 60_000
const SESSION_TTL_MS = 7 * 86_400_000
const RATE_WINDOW_MS = 900_000

export function userDto(user) {
  return { id: user.id, email: user.email, displayName: user.displayName, provider: 'EMAIL', loginMethod: user.loginMethod ?? null,
    emailVerified: !!user.emailVerifiedAt, hasPassword: !!user.passwordHash, roles: user.roles ?? ['PLAYER'], permissions: [],
    createdAt: user.createdAt, identities: [] }
}

/**
 * config: {origin, environment, rateKey(≥32 chars), mailEnabled, registrationOpen, emergencyMode}
 * sendLinkMail(to, purpose, link) delivers the one-time link; it is awaited after the database commit.
 * sendNotice(to, kind, accountUrl) sends the link-less letter ('EXISTS' | 'NO_ACCOUNT') so that registration and recovery
 * take the same time and send one letter whether or not the address has an account (no probing by response time).
 */
export function createAccountsApp({ store, config, sendLinkMail, sendNotice = async () => {}, clock = () => new Date() }) {
  if ((config.rateKey ?? '').length < 32) throw new Error('private_keys_required')
  const origin = new URL(config.origin).origin
  const local = config.environment === 'development' && ['127.0.0.1', 'localhost'].includes(new URL(origin).hostname)
  if (!local && !origin.startsWith('https://')) throw new Error('https_required')
  const app = new Hono()
  const cookie = (value, seconds) => `gs_private_session=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${seconds}${local ? '' : '; Secure'}`
  const sessionHash = c => digest(cookieValue(c, 'gs_private_session'))
  const registrationOpen = () => config.registrationOpen === true && config.emergencyMode !== true
  const closedRegistration = () => fail(403, 'registration_closed', 'Регистрация пока закрыта. Вход доступен только существующим аккаунтам.')
  const mailRequired = () => { if (!config.mailEnabled) fail(503, 'mail_disabled', 'Почта ещё не подключена') }
  // Same-cost failure path when the email is unknown; computed on first use, not at cold start.
  let dummy
  const dummyHash = () => (dummy ??= hashPassword(token()))

  async function json(c) {
    let body
    try { body = JSON.parse(await c.req.text()) } catch { fail(400, 'invalid_json', 'Ожидается JSON') }
    if (!body || typeof body !== 'object' || Array.isArray(body)) fail(400, 'invalid_json', 'Ожидается объект')
    return body
  }
  async function limit(c, bucket, subject, max = 10) {
    max = emergencyLimit(max, config.emergencyMode === true)
    // The client IP is set by our function adapter from the API Gateway event, never from a public header.
    const ip = c.env?.clientIp ?? 'unknown'
    const window = Math.floor(clock().getTime() / RATE_WINDOW_MS)
    for (const [value, bound] of [[`ip:${ip}`, max * 4], [`subject:${subject}`, max]]) {
      const count = await store.rateHit({ key: keyed(config.rateKey, `${bucket}:${value}`), window,
        expiresAt: new Date((window + 2) * RATE_WINDOW_MS) })
      if (count > bound) fail(429, 'rate_limited', 'Слишком много запросов. Повторите через 15 минут.')
    }
  }
  const currentUser = async c => (await store.sessionUser({ tokenHash: sessionHash(c), now: clock() }))?.user ?? null
  async function issue(email, purpose, payload, onlyIfNoUser = false) {
    const raw = token(), now = clock()
    const issued = await store.issueToken({ email, purpose, tokenHash: digest(raw), payload, now, onlyIfNoUser,
      expiresAt: new Date(now.getTime() + LINK_TTL_MS) })
    if (!issued) return false
    const link = `${origin}/account#${new URLSearchParams({ token: raw, purpose: purpose.toLowerCase() })}`
    // At most once: a failed delivery is only logged (no address, no token); the person can request a new link.
    try { await sendLinkMail(email, purpose, link) } catch (error) { console.error('mail_dispatch_failed', error?.message?.slice(0, 40) ?? 'error') }
    return true
  }
  const notify = async (email, kind) => {
    try { await sendNotice(email, kind, `${origin}/account`) } catch (error) { console.error('mail_dispatch_failed', error?.message?.slice(0, 40) ?? 'error') }
  }

  app.use('*', async (c, next) => {
    c.header('Cache-Control', 'no-store'); c.header('X-Content-Type-Options', 'nosniff'); c.header('Referrer-Policy', 'no-referrer')
    if (emergencyBlocks(c.req.method, new URL(c.req.url).pathname, config.emergencyMode === true)) {
      c.header('Retry-After', '300')
      fail(503, 'emergency_read_only', 'Временно включена усиленная защита. Просмотр доступен; изменения попробуйте позже.')
    }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) {
      if (c.req.header('Origin') !== origin) fail(403, 'origin_forbidden', 'Источник запроса не разрешён')
      const bytes = await c.req.raw.arrayBuffer()
      if (bytes.byteLength > 16384) fail(413, 'body_too_large', 'Запрос слишком большой')
      c.req.raw = new Request(c.req.url, { method: c.req.method, headers: c.req.raw.headers, body: bytes })
      if (!(c.req.header('Content-Type') ?? '').startsWith('application/json')) fail(415, 'content_type', 'Ожидается application/json')
    }
    await next()
  })
  app.onError((error, c) => {
    if (error instanceof Failure) return c.json({ error: { code: error.code, message: error.message } }, error.status)
    // Never log request bodies, email, query parameters, tokens or database answers.
    console.error('accounts_fn_error', error?.code ?? error?.name ?? 'error')
    return c.json({ error: { code: 'internal_error', message: 'Внутренняя ошибка' } }, 500)
  })

  app.get('/api/v1/health', async c => { await store.ping(); return c.json({ status: 'ok', storage: 'ydb-serverless', scope: 'accounts' }) })
  app.get('/api/v1/auth/me', async c => {
    const user = await currentUser(c)
    return c.json({ user: user ? userDto(user) : null, providers: [], emailLogin: !!config.mailEnabled,
      registrationOpen: registrationOpen(), privateCore: true, devAuthEnabled: false })
  })
  app.post('/api/v1/auth/register', async c => {
    if (!registrationOpen()) closedRegistration()
    mailRequired()
    const body = await json(c), email = emailOf(body.email), password = passwordOf(body.password), name = textOf(body.displayName, 2, 40)
    await limit(c, 'mail', email, 5)
    const hash = await hashPassword(password)
    // An existing address gets the same answer and a link-less notice, so the form cannot be used to probe accounts.
    if (!await issue(email, 'REGISTER', { hash, name }, true)) await notify(email, 'EXISTS')
    return c.json({ sent: true, message: 'Если адрес доступен для регистрации, письмо отправлено.' }, 202)
  })
  app.post('/api/v1/auth/register/confirm', async c => {
    if (!registrationOpen()) closedRegistration()
    const body = await json(c)
    if (typeof body.token !== 'string' || body.token.length > 128) fail(400, 'token_invalid', 'Ссылка недействительна или устарела')
    const raw = token(), now = clock()
    const user = await store.confirmRegistration({ tokenHash: digest(body.token), userId: token(), sessionHash: digest(raw),
      replaceSessionHash: sessionHash(c), sessionExpiresAt: new Date(now.getTime() + SESSION_TTL_MS), now })
    if (!user) fail(400, 'token_invalid', 'Ссылка недействительна или устарела')
    c.header('Set-Cookie', cookie(raw, 604800))
    return c.json({ user: userDto({ ...user, loginMethod: 'email' }) })
  })
  app.post('/api/v1/auth/login', async c => {
    const body = await json(c), email = emailOf(body.email), password = passwordOf(body.password)
    await limit(c, 'login', email)
    const user = await store.userByEmail(email)
    const valid = await verifyPassword(password, user?.passwordHash ?? await dummyHash())
    if (!user || !valid || user.bannedAt) fail(401, 'invalid_credentials', 'Неверный email или пароль')
    const raw = token(), now = clock()
    const opened = await store.openSession({ userId: user.id, expectedPasswordHash: user.passwordHash, sessionHash: digest(raw),
      replaceSessionHash: sessionHash(c), sessionExpiresAt: new Date(now.getTime() + SESSION_TTL_MS), loginMethod: 'email', now })
    if (!opened) fail(401, 'invalid_credentials', 'Повторите вход')
    c.header('Set-Cookie', cookie(raw, 604800))
    return c.json({ user: userDto({ ...user, loginMethod: 'email' }) })
  })
  app.post('/api/v1/auth/password/reset/request', async c => {
    mailRequired()
    const email = emailOf((await json(c)).email)
    await limit(c, 'mail', email, 5)
    const user = await store.userByEmail(email)
    if (user && user.emailVerifiedAt && !user.bannedAt) await issue(email, 'RESET', { userId: user.id })
    else await notify(email, 'NO_ACCOUNT')
    return c.json({ sent: true }, 202)
  })
  app.post('/api/v1/auth/password/reset', async c => {
    const body = await json(c)
    await limit(c, 'reset', digest(String(body.token ?? '')))
    const newPassword = passwordOf(body.password)
    if (typeof body.token !== 'string' || body.token.length > 128) fail(400, 'token_invalid', 'Ссылка недействительна или устарела')
    const hash = await hashPassword(newPassword)
    if (!await store.resetPassword({ tokenHash: digest(body.token), passwordHash: hash, now: clock() }))
      fail(400, 'token_invalid', 'Ссылка недействительна или устарела')
    c.header('Set-Cookie', cookie('', 0))
    return c.json({ ok: true })
  })
  app.post('/api/v1/auth/logout', async c => {
    await store.deleteSession(sessionHash(c))
    c.header('Set-Cookie', cookie('', 0))
    return c.json({ ok: true })
  })
  // Everything else of the private core is not part of this service.
  app.all('/api/*', c => c.json({ error: { code: 'route_unavailable', message: 'API route unavailable' } }, 404))
  return app
}

/** The API Gateway appends/sets the caller address; prefer its own field, else the LAST X-Forwarded-For entry. */
export function gatewayClientIp(event) {
  const own = event?.requestContext?.identity?.sourceIp
  if (typeof own === 'string' && isIP(own)) return own
  const forwarded = event?.headers?.['X-Forwarded-For'] ?? event?.headers?.['x-forwarded-for']
  const last = typeof forwarded === 'string' ? forwarded.split(',').at(-1)?.trim() : ''
  return last && isIP(last) ? last : 'unknown'
}
