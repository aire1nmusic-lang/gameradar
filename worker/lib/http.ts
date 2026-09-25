/**
 * Request plumbing shared by the route files: JSON bodies, cookies, the
 * signed-in user, admin checks and the visitor's IP.
 */
import { ApiError, badRequest, forbidden, now, parseList, sha256, token, unauthorized, type Env } from './core.ts'
import { object } from './validation.ts'
import type { Row, Store } from './store.ts'

export type Vars = { store: Store; user?: Row; proxyIp?: string }
export type AppEnv = { Bindings: Env; Variables: Vars }

export const SESSION_COOKIE = 'gs_session'
export const SESSION_DAYS = 30

type StoreCtx = { get: (k: 'store') => Store }
type HeaderCtx = { req: { header: (n: string) => string | undefined } }
type CookieCtx = { env: Env; header: (name: string, value: string, options?: { append?: boolean }) => void }

export const store = (c: StoreCtx) => c.get('store')

export async function readJson(c: { req: { json: () => Promise<unknown> } }): Promise<Record<string, unknown>> {
  try {
    return object(await c.req.json())
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw badRequest('Ожидается JSON тело запроса')
  }
}

export function readCookie(header: string | undefined, name: string): string | undefined {
  return header
    ?.split(';')
    .map(part => part.trim())
    .find(part => part.startsWith(name + '='))
    ?.slice(name.length + 1)
}

export function sessionCookie(value: string, env: Env, maxAge: number): string {
  const parts = [`${SESSION_COOKIE}=${value}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAge}`]
  if (env.ENVIRONMENT !== 'development') parts.push('Secure')
  return parts.join('; ')
}

/** The signed-in user, or undefined. A banned account has no session. */
export async function currentUser(c: HeaderCtx & StoreCtx): Promise<Row | undefined> {
  const raw = readCookie(c.req.header('Cookie'), SESSION_COOKIE)
  if (!raw) return undefined
  const user = await store(c).session(await sha256(raw))
  return user && !user.banned_at ? user : undefined
}

/** Routes that need a signed-in user. */
export async function requireUser(c: HeaderCtx & StoreCtx): Promise<Row> {
  const user = await currentUser(c)
  if (!user) throw unauthorized()
  return user
}

export const isAdmin = (user: Row | undefined) => !!user && parseList(user.roles).includes('ADMIN')

/**
 * Admin routes: a signed-in account with the ADMIN role, or the ADMIN_TOKEN
 * bearer used by scripts. Returns the admin account (undefined for the token).
 */
export async function requireAdmin(c: HeaderCtx & StoreCtx & { env: Env }): Promise<Row | undefined> {
  const header = c.req.header('Authorization') ?? ''
  if (header.startsWith('Bearer ')) {
    if (!c.env.ADMIN_TOKEN || header.slice(7) !== c.env.ADMIN_TOKEN) throw unauthorized('Требуется админ-токен')
    return undefined
  }
  const user = await currentUser(c)
  if (!user) throw unauthorized()
  if (!isAdmin(user)) throw forbidden('Только для администратора')
  return user
}

export function clientIp(c: HeaderCtx & { get: (k: 'proxyIp') => string | undefined }): string {
  return c.get('proxyIp') ?? c.req.header('CF-Connecting-IP') ?? c.req.header('X-Forwarded-For')?.split(',')[0]?.trim() ?? '127.0.0.1'
}

/** Accounts whose confirmed email is listed here become admins when they sign in. */
export const adminEmails = (env: Env) =>
  (env.ADMIN_EMAILS ?? '').split(/[,;\s]+/).map(e => e.trim().toLowerCase()).filter(Boolean)

/**
 * Opens a session for `user`: a fresh random token, stored only as a hash,
 * sent as an HttpOnly cookie. Returns the user row as it is after sign-in.
 */
export async function startSession(c: CookieCtx & StoreCtx, user: Row): Promise<Row> {
  const s = store(c)
  await s.deleteExpiredSessions()
  const at = now()
  const promote = user.email && user.email_verified_at && adminEmails(c.env).includes(String(user.email).toLowerCase()) && !isAdmin(user)
  const roles = promote ? JSON.stringify([...parseList(user.roles), 'ADMIN']) : undefined
  await s.db.prepare('UPDATE users SET last_login_at=?, roles=COALESCE(?, roles) WHERE id=?').bind(at, roles ?? null, user.id).run()
  const raw = token(32)
  await s.createSession(await sha256(raw), user.id, new Date(Date.now() + SESSION_DAYS * 86400000).toISOString())
  c.header('Set-Cookie', sessionCookie(raw, c.env, SESSION_DAYS * 86400), { append: true })
  return (await s.user(user.id))!
}
