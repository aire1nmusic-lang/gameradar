/**
 * Accounts: registration by email with an emailed 6-digit code, sign-in with a
 * password or a code, Google / Yandex / VK ID / Discord, the personal cabinet,
 * server logos that an admin approves, and the admin panel's queues.
 * Contract: docs/accounts-api.md.
 *
 * Nothing here reveals a password or a code: passwords are PBKDF2 + pepper
 * (lib/password.ts), codes are stored as peppered hashes, every code is single
 * use with 5 tries, and codes and failed passwords are rate-limited per email
 * and per IP (IP only as a salted hash).
 */
import type { Context, Hono } from 'hono'
import { ApiError, badRequest, conflict, devEnabled, forbidden, id, notFound, now, sameSecret, sha256, token, tooMany, type Env } from '../lib/core.ts'
import { Accounts, normalizeEmail, ROLES, type Role } from '../lib/accounts.ts'
import { hashPassword, passwordProblem, verifyPassword } from '../lib/password.ts'
import { codeMail, devOutbox, mailEnabled, sendMail } from '../lib/mailer.ts'
import { authorizeUrl, enabledProviders, exchangeProfile, isProvider, PROVIDERS, providerEnabled, safeNext } from '../lib/oauth.ts'
import { clientIp, currentUser, isAdmin, readCookie, readJson, requireAdmin, requireUser, sessionCookie, SESSION_COOKIE, startSession, store, type AppEnv } from '../lib/http.ts'
import { serverDto, userDto } from '../lib/dto.ts'
import { imageInfo } from '../lib/image.ts'
import type { Row } from '../lib/store.ts'

type C = Context<AppEnv>

const CODE_MINUTES = 15
const CODE_TRIES = 5
const CODES_PER_EMAIL_HOUR = 5
const CODES_PER_IP_HOUR = 20
const FAILS_PER_EMAIL = 10
const FAILS_PER_IP = 30
const FAIL_WINDOW_MS = 15 * 60000
/** auth_codes rows that are real mailed codes (FAIL rows record wrong passwords). */
const MAILED = ['REGISTER', 'LOGIN', 'RESET', 'VERIFY']
const LOGO_TYPES = ['image/webp', 'image/png', 'image/jpeg']
const LOGO_MAX_BYTES = 150 * 1024
const OAUTH_COOKIE = 'gs_oauth'
const OAUTH_MAX_AGE = 600
/** Compared against when the email is unknown, so a wrong email costs the same time as a wrong password. */
const DUMMY_HASH = 'pbkdf2$15000$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='

const accounts = (c: C) => new Accounts(c.env.DB)
const pepper = (env: Env) => env.PASSWORD_PEPPER ?? env.IP_HASH_SECRET ?? ''
const since = (ms: number) => new Date(Date.now() - ms).toISOString()
const ipHashOf = async (c: C) => sha256((c.env.IP_HASH_SECRET ?? 'gamescout') + ':' + clientIp(c))
const codeHash = (env: Env, codeId: string, code: string) => sha256(`${pepper(env)}:${codeId}:${code}`)

function sixDigits(): string {
  const buf = new Uint32Array(1)
  // 4 294 000 000 is a multiple of 10^6: rejecting above it keeps every code equally likely
  for (;;) {
    crypto.getRandomValues(buf)
    if (buf[0] < 4_294_000_000) return String(buf[0] % 1_000_000).padStart(6, '0')
  }
}

function emailOf(value: unknown): string {
  const email = normalizeEmail(value)
  if (!email) throw badRequest('Введите корректную почту', 'email_invalid')
  return email
}

function codeOf(value: unknown): string {
  const code = typeof value === 'string' ? value.replace(/\s+/g, '') : ''
  if (!/^\d{6}$/.test(code)) throw badRequest('Код — 6 цифр из письма', 'code_invalid')
  return code
}

function nameOf(value: unknown): string {
  const name = typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim() : ''
  if (name.length < 2 || name.length > 40) throw badRequest('Имя — от 2 до 40 символов', 'name_invalid')
  return name
}

function newPassword(value: unknown): string {
  const problem = passwordProblem(value)
  if (problem) throw badRequest(problem, 'password_weak')
  return value as string
}

function requireMail(env: Env) {
  if (!mailEnabled(env)) throw new ApiError(503, 'Вход по почте пока не подключён. Войдите через Google, Яндекс, VK или Discord.', 'mail_disabled')
}

const banned = () => forbidden('Аккаунт заблокирован администратором')

async function userBody(c: C, user: Row) {
  return { user: userDto(user, await accounts(c).identities(user.id)) }
}

/** Mails a fresh code (older ones for the same purpose stop working). `send: false` records the request without mailing, so the answer never reveals whether an account exists. */
async function issueCode(c: C, email: string, purpose: string, options: { payload?: string; send: boolean }) {
  const a = accounts(c)
  const ipHash = await ipHashOf(c)
  const hourAgo = since(3600000)
  if ((await a.countForEmail(email, MAILED, hourAgo)) >= CODES_PER_EMAIL_HOUR) throw tooMany('Слишком много писем на эту почту. Попробуйте через час.')
  if ((await a.countForIp(ipHash, MAILED, hourAgo)) >= CODES_PER_IP_HOUR) throw tooMany('Слишком много запросов. Попробуйте позже.')
  if (Math.random() < 0.05) await a.deleteOldCodes(since(2 * 86400000))
  const code = sixDigits()
  const codeId = id('code')
  await a.insertCode({
    id: codeId, email, purpose, codeHash: await codeHash(c.env, codeId, code), payload: options.payload,
    expiresAt: new Date(Date.now() + CODE_MINUTES * 60000).toISOString(), ipHash,
  })
  if (!options.send) return
  try {
    await sendMail(c.env, codeMail(email, purpose, code, CODE_MINUTES))
  } catch {
    throw new ApiError(502, 'Не удалось отправить письмо. Попробуйте ещё раз через минуту.', 'mail_failed')
  }
}

/** Checks and spends the newest code for `email` + `purpose`; returns its row. */
async function useCode(c: C, email: string, purpose: string, code: string): Promise<Row> {
  const a = accounts(c)
  const row = await a.latestCode(email, [purpose])
  if (!row) throw badRequest('Код не подошёл. Запросите новый.', 'code_invalid')
  if (Date.parse(row.expires_at) < Date.now()) throw badRequest('Срок действия кода истёк. Запросите новый.', 'code_expired')
  if (!(await a.takeAttempt(row.id, CODE_TRIES))) throw tooMany('Слишком много попыток. Запросите новый код.', 'too_many_attempts')
  if (row.code_hash !== (await codeHash(c.env, row.id, code))) {
    const left = Math.max(0, CODE_TRIES - Number(row.attempts) - 1)
    throw badRequest(left ? `Неверный код. Осталось попыток: ${left}` : 'Неверный код. Запросите новый.', 'code_invalid')
  }
  if (!(await a.consumeCode(row.id))) throw badRequest('Код уже использован. Запросите новый.', 'code_invalid')
  return row
}

function payloadOf(row: Row): Record<string, string> {
  try {
    const value = JSON.parse(String(row.payload ?? '{}'))
    return value && typeof value === 'object' ? value : {}
  } catch {
    return {}
  }
}

function oauthCookie(value: string, env: Env, maxAge: number): string {
  const parts = [`${OAUTH_COOKIE}=${value}`, 'Path=/api/v1/auth', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAge}`]
  if (env.ENVIRONMENT !== 'development') parts.push('Secure')
  return parts.join('; ')
}

/** Who may change a card's logo: the same people who may edit the card, or an admin. */
function canManage(server: Row, user: Row) {
  if (isAdmin(user)) return true
  return server.owner_id ? server.owner_id === user.id : server.submitted_by === user.id
}

function logoResponse(row: Row, publicCache: boolean) {
  const raw = row.bytes as ArrayBuffer | number[] | Uint8Array | null
  // D1 hands a BLOB back as an array of numbers (or an ArrayBuffer, depending on the runtime)
  const bytes: Uint8Array<ArrayBuffer> = raw instanceof ArrayBuffer ? new Uint8Array(raw) : new Uint8Array(raw ?? [])
  if (!bytes.byteLength) throw notFound('Логотип не найден')
  return new Response(bytes, {
    headers: {
      'Content-Type': String(row.mime),
      'Cache-Control': publicCache ? 'public, max-age=31536000, immutable' : 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'",
    },
  })
}

const MODERATION: Record<string, string> = { PENDING: 'PENDING_MODERATION', PUBLISHED: 'PUBLISHED', REJECTED: 'REJECTED' }

/** Everything this file adds, except /auth/me and /auth/logout (which are harmless without accounts). */
const ACCOUNT_PATHS = /^\/api\/v1\/(?:auth\/(?:register|login|code|password|google|yandex|vk|discord)(?:\/|$)|me(?:\/|$)|servers\/[^/]+\/logo$|logos\/|admin\/(?:overview|logos|users|claims)(?:\/|$)|admin\/servers(?:\/[^/]+\/reject)?$|dev\/)/

export function accountRoutes(app: Hono<AppEnv>) {
  // Off unless ACCOUNTS_IN_D1=true: personal data of Russian users lives in the private API in Russia, not in D1.
  app.use('*', async (c, next) => {
    if (c.env.ACCOUNTS_IN_D1 !== 'true' && ACCOUNT_PATHS.test(c.req.path)) {
      throw new ApiError(503, 'Аккаунты подключаются. Попробуйте позже.', 'accounts_unavailable')
    }
    await next()
  })

  /* ── session ───────────────────────────────────────────────────────── */

  app.get('/api/v1/auth/me', async c => {
    const user = await currentUser(c)
    c.header('Cache-Control', 'no-store')
    return c.json({
      user: user ? (await userBody(c, user)).user : null,
      providers: c.env.ACCOUNTS_IN_D1 === 'true' ? enabledProviders(c.env) : [],
      emailLogin: c.env.ACCOUNTS_IN_D1 === 'true' && mailEnabled(c.env),
      devAuthEnabled: devEnabled(c.env, c.req.raw),
    })
  })

  app.post('/api/v1/auth/logout', async c => {
    const raw = readCookie(c.req.header('Cookie'), SESSION_COOKIE)
    if (raw) await store(c).deleteSession(await sha256(raw))
    c.header('Set-Cookie', sessionCookie('', c.env, 0))
    return c.json({ ok: true })
  })

  /* ── email + password ──────────────────────────────────────────────── */

  app.post('/api/v1/auth/register', async c => {
    requireMail(c.env)
    const body = await readJson(c)
    const email = emailOf(body.email)
    const password = newPassword(body.password)
    const displayName = nameOf(body.displayName)
    if (await accounts(c).userByEmail(email)) throw conflict('Эта почта уже зарегистрирована. Войдите или восстановите пароль.', 'email_taken')
    // The account is created only when the code comes back; until then the name and password hash wait with the code.
    const payload = JSON.stringify({ displayName, passwordHash: await hashPassword(password, pepper(c.env)) })
    await issueCode(c, email, 'REGISTER', { payload, send: true })
    return c.json({ sent: true, email, expiresInSec: CODE_MINUTES * 60 }, 202)
  })

  app.post('/api/v1/auth/register/confirm', async c => {
    const body = await readJson(c)
    const email = emailOf(body.email)
    const row = await useCode(c, email, 'REGISTER', codeOf(body.code))
    const pending = payloadOf(row)
    const a = accounts(c)
    let user = await a.userByEmail(email)
    if (user) {
      // Someone signed up with the same address through Google meanwhile: the code proves it is theirs.
      if (!user.password_hash && pending.passwordHash) await a.setPassword(user.id, pending.passwordHash)
      await a.markVerified(user.id)
    } else {
      user = await a.createUser({ id: id('usr'), email, displayName: pending.displayName || email.split('@')[0].slice(0, 40), passwordHash: pending.passwordHash, verified: true })
    }
    if (user.banned_at) throw banned()
    return c.json(await userBody(c, await startSession(c, user)))
  })

  app.post('/api/v1/auth/login', async c => {
    const body = await readJson(c)
    const email = emailOf(body.email)
    const password = typeof body.password === 'string' ? body.password : ''
    const a = accounts(c)
    const ipHash = await ipHashOf(c)
    const window = since(FAIL_WINDOW_MS)
    if ((await a.countForEmail(email, ['FAIL'], window)) >= FAILS_PER_EMAIL || (await a.countForIp(ipHash, ['FAIL'], window)) >= FAILS_PER_IP) {
      throw tooMany('Слишком много неудачных попыток. Подождите 15 минут или войдите по коду из письма.')
    }
    const user = await a.userByEmail(email)
    const matches = password.length > 0 && password.length <= 128 && (await verifyPassword(password, user?.password_hash ?? DUMMY_HASH, pepper(c.env)))
    if (!user || !user.password_hash || !matches) {
      await a.insertCode({ id: id('fail'), email, purpose: 'FAIL', codeHash: '-', expiresAt: now(), ipHash })
      throw new ApiError(401, 'Неверная почта или пароль', 'invalid_credentials')
    }
    if (user.banned_at) throw banned()
    return c.json(await userBody(c, await startSession(c, user)))
  })

  app.post('/api/v1/auth/code', async c => {
    requireMail(c.env)
    const body = await readJson(c)
    const email = emailOf(body.email)
    const purpose = body.purpose === 'reset' ? 'RESET' : body.purpose === 'login' ? 'LOGIN' : undefined
    if (!purpose) throw badRequest('Неизвестная цель кода')
    const user = await accounts(c).userByEmail(email)
    await issueCode(c, email, purpose, { send: !!user && !user.banned_at })
    return c.json({ sent: true, email, expiresInSec: CODE_MINUTES * 60 }, 202)
  })

  app.post('/api/v1/auth/code/verify', async c => {
    const body = await readJson(c)
    const email = emailOf(body.email)
    await useCode(c, email, 'LOGIN', codeOf(body.code))
    const user = await accounts(c).userByEmail(email)
    if (!user) throw badRequest('Код не подошёл. Запросите новый.', 'code_invalid')
    if (user.banned_at) throw banned()
    return c.json(await userBody(c, await startSession(c, user)))
  })

  app.post('/api/v1/auth/password/reset', async c => {
    const body = await readJson(c)
    const email = emailOf(body.email)
    const password = newPassword(body.password)
    await useCode(c, email, 'RESET', codeOf(body.code))
    const a = accounts(c)
    const user = await a.userByEmail(email)
    if (!user) throw badRequest('Код не подошёл. Запросите новый.', 'code_invalid')
    if (user.banned_at) throw banned()
    await a.setPassword(user.id, await hashPassword(password, pepper(c.env)))
    // a new password signs out every other device
    await a.dropSessions(user.id)
    return c.json(await userBody(c, await startSession(c, user)))
  })

  /* ── Google, Yandex, VK ID, Discord ────────────────────────────────── */

  // One pair of routes per provider: explicit paths, no pattern that could swallow /callback.
  for (const provider of PROVIDERS) {
    app.get(`/api/v1/auth/${provider}`, async c => {
      if (!providerEnabled(c.env, provider)) throw notFound('Этот способ входа не подключён')
      // state, the PKCE verifier, the mode and the return path travel in one short-lived HttpOnly cookie
      const state = token(16)
      const verifier = token(32)
      const mode = c.req.query('link') === '1' ? 'l' : 's'
      const next = encodeURIComponent(safeNext(c.req.query('next')))
      c.header('Set-Cookie', oauthCookie(`${state}.${verifier}.${mode}.${next}`, c.env, OAUTH_MAX_AGE))
      c.header('Cache-Control', 'no-store')
      return c.redirect(await authorizeUrl(c.env, provider, state, verifier), 302)
    })

    app.get(`/api/v1/auth/${provider}/callback`, async c => {
      if (!providerEnabled(c.env, provider)) throw notFound('Этот способ входа не подключён')
      const [expected, verifier, mode, encodedNext] = (readCookie(c.req.header('Cookie'), OAUTH_COOKIE) ?? '').split('.')
      let next = safeNext(undefined)
      try {
        next = safeNext(decodeURIComponent(encodedNext ?? ''))
      } catch {}
      c.header('Cache-Control', 'no-store')
      // The cookie is single-use whatever happens next.
      c.header('Set-Cookie', oauthCookie('', c.env, 0), { append: true })
      const failed = (reason: string = provider) => c.redirect(`${next}${next.includes('?') ? '&' : '?'}auth_error=${reason}`, 302)

      const state = c.req.query('state') ?? ''
      const code = c.req.query('code') ?? ''
      if (!expected || !verifier || !state || !(await sameSecret(state, expected))) return failed()
      if (!code || code.length > 512) return failed()

      let profile
      try {
        profile = await exchangeProfile(c.env, provider, code, new URL(c.req.url).searchParams, verifier)
      } catch (error) {
        // The reason stays in the Worker log; the person sees a generic error.
        console.error('oauth_login_failed', provider, String(error))
        return failed()
      }

      const a = accounts(c)
      const trustedEmail = profile.email && profile.emailVerified ? profile.email : undefined
      const linked = await a.identity(provider, profile.id)

      if (mode === 'l') {
        // Linking another way to sign in to the account that is signed in now.
        const me = await currentUser(c)
        if (!me) return failed()
        if (linked && linked.user_id !== me.id) return failed('linked_elsewhere')
        if (!linked) await a.linkIdentity(provider, profile.id, me.id, profile.email)
        await a.setAvatarIfEmpty(me.id, profile.avatarUrl)
        if (!me.email && trustedEmail && !(await a.userByEmail(trustedEmail))) await a.setEmail(me.id, trustedEmail, true)
        return c.redirect(next, 302)
      }

      let user = linked ? await a.user(linked.user_id) : await a.legacyUser(provider, profile.id)
      // An email match never grants access to an existing account. Linking requires
      // an authenticated explicit link flow; new OAuth accounts confirm email separately.
      if (!user) {
        user = await a.createUser({
          id: id('usr'), displayName: profile.displayName, verified: false,
          avatarUrl: profile.avatarUrl, provider: provider.toUpperCase(), providerId: profile.id,
        })
      }
      if (user.banned_at) return failed('banned')
      if (!linked) await a.linkIdentity(provider, profile.id, user.id, profile.email)
      await a.setAvatarIfEmpty(user.id, profile.avatarUrl)
      await startSession(c, user)
      return c.redirect(next, 302)
    })
  }

  /* ── cabinet ───────────────────────────────────────────────────────── */

  app.patch('/api/v1/me', async c => {
    const user = await requireUser(c)
    const body = await readJson(c)
    await accounts(c).setDisplayName(user.id, nameOf(body.displayName))
    return c.json(await userBody(c, (await accounts(c).user(user.id))!))
  })

  app.post('/api/v1/me/password', async c => {
    const user = await requireUser(c)
    if (!user.email) throw badRequest('Сначала добавьте почту: пароль нужен для входа по почте.', 'email_required')
    const body = await readJson(c)
    const password = newPassword(body.newPassword)
    if (user.password_hash && !(await verifyPassword(String(body.currentPassword ?? ''), user.password_hash, pepper(c.env)))) {
      throw badRequest('Текущий пароль указан неверно', 'wrong_password')
    }
    const a = accounts(c)
    await a.setPassword(user.id, await hashPassword(password, pepper(c.env)))
    await a.dropSessions(user.id)
    return c.json(await userBody(c, await startSession(c, user)))
  })

  /** Adds or changes the account's email: a code goes to the new address. */
  app.post('/api/v1/me/email', async c => {
    requireMail(c.env)
    const user = await requireUser(c)
    const email = emailOf((await readJson(c)).email)
    const holder = await accounts(c).userByEmail(email)
    if (holder && holder.id !== user.id) throw conflict('Эта почта уже привязана к другому аккаунту', 'email_taken')
    await issueCode(c, email, 'VERIFY', { payload: JSON.stringify({ userId: user.id }), send: true })
    return c.json({ sent: true, email, expiresInSec: CODE_MINUTES * 60 }, 202)
  })

  app.post('/api/v1/me/email/confirm', async c => {
    const user = await requireUser(c)
    const body = await readJson(c)
    const email = emailOf(body.email)
    const row = await useCode(c, email, 'VERIFY', codeOf(body.code))
    if (payloadOf(row).userId !== user.id) throw badRequest('Код не подошёл. Запросите новый.', 'code_invalid')
    const a = accounts(c)
    const holder = await a.userByEmail(email)
    if (holder && holder.id !== user.id) throw conflict('Эта почта уже привязана к другому аккаунту', 'email_taken')
    await a.setEmail(user.id, email, true)
    return c.json(await userBody(c, await startSession(c, (await a.user(user.id))!)))
  })

  app.delete('/api/v1/me/identities/:provider', async c => {
    const user = await requireUser(c)
    const provider = c.req.param('provider').toLowerCase()
    if (!isProvider(provider)) throw notFound('Неизвестный способ входа')
    const a = accounts(c)
    const identities = await a.identities(user.id)
    if (!identities.some(i => i.provider === provider)) throw notFound('Этот способ входа не привязан')
    // A confirmed email always works (by code), so it counts as a way in.
    if (identities.length + (user.email ? 1 : 0) <= 1) throw conflict('Это единственный способ входа. Сначала добавьте почту или другой способ.', 'last_login_method')
    await a.unlinkIdentity(user.id, provider)
    return c.json(await userBody(c, (await a.user(user.id))!))
  })

  /* ── server logos ──────────────────────────────────────────────────── */

  app.post('/api/v1/servers/:id/logo', async c => {
    const user = await requireUser(c)
    const server = await store(c).server(c.req.param('id'))
    if (!server) throw notFound('Сервер не найден')
    if (!canManage(server, user)) throw forbidden('Логотип меняет только владелец сервера')
    const type = (c.req.header('Content-Type') ?? '').split(';')[0].trim().toLowerCase()
    if (!LOGO_TYPES.includes(type)) throw badRequest('Логотип — картинка PNG, JPEG или WebP', 'logo_type')
    if (Number(c.req.header('Content-Length') ?? 0) > LOGO_MAX_BYTES) throw new ApiError(413, 'Файл больше 150 КБ', 'logo_too_large')
    const bytes = await c.req.arrayBuffer()
    if (bytes.byteLength > LOGO_MAX_BYTES) throw new ApiError(413, 'Файл больше 150 КБ', 'logo_too_large')
    const info = imageInfo(new Uint8Array(bytes))
    if (!info || info.mime !== type) throw badRequest('Файл не похож на картинку PNG, JPEG или WebP', 'logo_invalid')
    if (info.animated) throw badRequest('Анимированные логотипы не принимаются', 'logo_animated')
    if (info.width < 64 || info.height < 64) throw badRequest('Логотип — не меньше 64×64 пикселей', 'logo_small')
    if (Math.abs(info.width - info.height) > Math.max(info.width, info.height) * 0.05) throw badRequest('Логотип должен быть квадратным', 'logo_not_square')

    const a = accounts(c)
    await a.dropPendingLogos(server.id)
    const logoId = id('logo')
    await a.insertLogo({ id: logoId, serverId: server.id, userId: user.id, mime: type, bytes })
    return c.json({ logo: { id: logoId, status: 'PENDING', createdAt: now() } }, 201)
  })

  app.get('/api/v1/servers/:id/logo', async c => {
    const user = await requireUser(c)
    const server = await store(c).server(c.req.param('id'))
    if (!server) throw notFound('Сервер не найден')
    if (!canManage(server, user)) throw forbidden('Сервер принадлежит другому владельцу')
    const rows = await accounts(c).serverLogos(server.id)
    const current = rows.find(r => r.status === 'APPROVED')
    const pending = rows.find(r => r.status === 'PENDING')
    const rejected = rows.find(r => r.status === 'REJECTED')
    c.header('Cache-Control', 'no-store')
    return c.json({
      current: current ? { id: current.id, url: `/api/v1/logos/${current.id}` } : undefined,
      pending: pending ? { id: pending.id, createdAt: pending.created_at } : undefined,
      // only the newest decision matters to the owner
      rejected: rejected && !pending && (!current || rejected.created_at > current.created_at) ? { id: rejected.id, reason: rejected.reason ?? '', reviewedAt: rejected.reviewed_at } : undefined,
    })
  })

  /** An approved logo is public and cached for a year (its id changes with every new logo). A waiting one is shown only to its uploader and admins. */
  app.get('/api/v1/logos/:id', async c => {
    const row = await accounts(c).logoBytes(c.req.param('id'))
    if (!row) throw notFound('Логотип не найден')
    if (row.status === 'APPROVED') return logoResponse(row, true)
    const user = await currentUser(c)
    if (!user || (!isAdmin(user) && row.uploaded_by !== user.id)) throw notFound('Логотип не найден')
    return logoResponse(row, false)
  })

  /* ── admin ─────────────────────────────────────────────────────────── */

  app.get('/api/v1/admin/overview', async c => {
    await requireAdmin(c)
    c.header('Cache-Control', 'no-store')
    return c.json(await accounts(c).overview())
  })

  app.get('/api/v1/admin/logos', async c => {
    await requireAdmin(c)
    const status = (c.req.query('status') ?? 'PENDING').toUpperCase()
    if (!['PENDING', 'APPROVED', 'REJECTED'].includes(status)) throw badRequest('Неизвестный статус')
    const rows = await accounts(c).logosByStatus(status)
    c.header('Cache-Control', 'no-store')
    return c.json(rows.map(r => ({
      id: r.id, status: r.status, createdAt: r.created_at, size: r.size, mime: r.mime, reason: r.reason ?? undefined,
      server: { id: r.server_id, slug: r.server_slug, name: r.server_name, gameId: r.server_game },
      uploadedBy: r.user_id ? { id: r.user_id, displayName: r.user_name, email: r.user_email ?? undefined } : undefined,
    })))
  })

  app.get('/api/v1/admin/logos/:id/image', async c => {
    await requireAdmin(c)
    const row = await accounts(c).logoBytes(c.req.param('id'))
    if (!row) throw notFound('Логотип не найден')
    return logoResponse(row, false)
  })

  app.post('/api/v1/admin/logos/:id/approve', async c => {
    const admin = await requireAdmin(c)
    const a = accounts(c)
    const logo = await a.logoMeta(c.req.param('id'))
    if (!logo) throw notFound('Логотип не найден')
    if (logo.status !== 'PENDING') throw conflict('Этот логотип уже рассмотрен')
    await a.approveLogo(logo.id, admin?.id)
    return c.json({ ok: true })
  })

  app.post('/api/v1/admin/logos/:id/reject', async c => {
    const admin = await requireAdmin(c)
    const reason = reasonOf((await readJson(c)).reason)
    const a = accounts(c)
    const logo = await a.logoMeta(c.req.param('id'))
    if (!logo) throw notFound('Логотип не найден')
    if (logo.status !== 'PENDING') throw conflict('Этот логотип уже рассмотрен')
    await a.rejectLogo(logo.id, admin?.id, reason)
    return c.json({ ok: true })
  })

  app.get('/api/v1/admin/servers', async c => {
    await requireAdmin(c)
    const moderation = MODERATION[(c.req.query('status') ?? 'PENDING').toUpperCase()]
    if (!moderation) throw badRequest('Неизвестный статус')
    const rows = await accounts(c).serversByModeration(moderation)
    c.header('Cache-Control', 'no-store')
    return c.json(rows.map(r => ({
      server: serverDto(r), moderation: r.moderation, note: r.moderation_note ?? undefined, createdAt: r.added_at,
      submittedBy: r.submitted_by ? { id: r.submitted_by, displayName: r.submitter_name ?? '', email: r.submitter_email ?? undefined } : undefined,
    })))
  })

  app.post('/api/v1/admin/servers/:id/reject', async c => {
    await requireAdmin(c)
    const reason = reasonOf((await readJson(c)).reason)
    const server = await store(c).server(c.req.param('id'))
    if (!server) throw notFound('Сервер не найден')
    await accounts(c).rejectServer(server.id, reason)
    return c.json({ ok: true })
  })

  app.get('/api/v1/admin/claims', async c => {
    await requireAdmin(c)
    const status = (c.req.query('status') ?? 'PENDING').toUpperCase()
    if (!['PENDING', 'VERIFIED', 'REJECTED', 'EXPIRED'].includes(status)) throw badRequest('Неизвестный статус')
    const rows = await accounts(c).claimsByStatus(status)
    c.header('Cache-Control', 'no-store')
    return c.json(rows.map(r => ({
      id: r.id, status: r.status, method: r.method, createdAt: r.created_at,
      server: { id: r.server_id, slug: r.server_slug, name: r.server_name },
      user: { id: r.user_id, displayName: r.user_name, email: r.user_email ?? undefined },
    })))
  })

  app.get('/api/v1/admin/users', async c => {
    await requireAdmin(c)
    const query = (c.req.query('query') ?? '').slice(0, 100)
    const a = accounts(c)
    const rows = await a.users(query)
    const identities = await a.identitiesOf(rows.map(r => r.id))
    c.header('Cache-Control', 'no-store')
    return c.json(rows.map(r => ({
      id: r.id, displayName: r.display_name, email: r.email ?? undefined, emailVerified: !!r.email_verified_at,
      roles: JSON.parse(String(r.roles ?? '[]')), createdAt: r.created_at, lastLoginAt: r.last_login_at ?? undefined, bannedAt: r.banned_at ?? undefined,
      identities: identities.filter(i => i.user_id === r.id).map(i => ({ provider: String(i.provider).toLowerCase(), linkedAt: i.created_at })),
    })))
  })

  app.post('/api/v1/admin/users/:id/roles', async c => {
    const admin = await requireAdmin(c)
    const body = await readJson(c)
    if (!Array.isArray(body.roles) || body.roles.some(r => !ROLES.includes(r as Role))) throw badRequest('Роли: PLAYER, OWNER, ADMIN')
    const roles = [...new Set<Role>(['PLAYER', ...(body.roles as Role[])])]
    const a = accounts(c)
    const target = await a.user(c.req.param('id'))
    if (!target) throw notFound('Пользователь не найден')
    if (admin?.id === target.id && !roles.includes('ADMIN')) throw conflict('Нельзя снять роль администратора с самого себя')
    await a.setRoles(target.id, roles)
    return c.json({ ok: true })
  })

  app.post('/api/v1/admin/users/:id/ban', async c => {
    const admin = await requireAdmin(c)
    const body = await readJson(c)
    if (typeof body.banned !== 'boolean') throw badRequest('banned: true или false')
    const a = accounts(c)
    const target = await a.user(c.req.param('id'))
    if (!target) throw notFound('Пользователь не найден')
    if (admin?.id === target.id) throw conflict('Нельзя заблокировать самого себя')
    await a.setBanned(target.id, body.banned)
    return c.json({ ok: true })
  })

  /* ── development ───────────────────────────────────────────────────── */

  /** The last code mailed to an address by the log driver: local development and tests only. */
  app.get('/api/v1/dev/mail', c => {
    if (!devEnabled(c.env, c.req.raw) || c.env.MAIL_DRIVER !== 'log') throw notFound('Маршрут недоступен')
    const to = normalizeEmail(c.req.query('to'))
    const mail = devOutbox.find(m => m.to === to)
    if (!mail) throw notFound('Писем нет')
    return c.json({ to: mail.to, subject: mail.subject, code: mail.text.match(/\b\d{6}\b/)?.[0], at: mail.at })
  })
}

function reasonOf(value: unknown): string {
  const reason = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
  if (reason.length < 3 || reason.length > 300) throw badRequest('Причина — от 3 до 300 символов', 'reason_invalid')
  return reason
}
