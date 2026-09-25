/** Shared primitives for GameScout's Worker. */
export interface Env {
  DB: D1Database
  ENVIRONMENT?: string
  DEV_AUTH_ENABLED?: string
  DEV_AUTH_SECRET?: string
  ADMIN_TOKEN?: string
  IP_HASH_SECRET?: string
  ALLOWED_ORIGIN?: string
  DEV_ALLOWED_ORIGINS?: string
  /** Extra https origins allowed to write (a front mirror such as ru.gamescout.online), comma-separated */
  EXTRA_ORIGINS?: string
  /** Shared secret of GameScout's own front proxy; only it may pass the visitor's IP */
  PROXY_SECRET?: string
  /** "true" on an origin reachable only through the front proxy: everything else gets 403 */
  PROXY_ONLY?: string
  MONITOR_BATCH?: string
  /** Queue of monitoring ticks: the cron only enqueues, the consumer does the pass (free-plan cron CPU is 10 ms). */
  MONITOR_QUEUE?: { send(body: unknown): Promise<unknown> }
  /** subrequests one monitoring invocation may spend; 45 fits the free plan (50) */
  MONITOR_SUBREQUESTS?: string
  /** Steam Web API key; without it Steam-backed online sources are not read. */
  STEAM_API_KEY?: string
  /** Discord application (Sign in with Discord); both required to enable it */
  DISCORD_CLIENT_ID?: string
  DISCORD_CLIENT_SECRET?: string
  /** development/tests only: a local stand-in for https://discord.com/api */
  DISCORD_API_BASE?: string
  /** Sign in with Google / Yandex / VK ID (see lib/oauth.ts) */
  GOOGLE_CLIENT_ID?: string
  GOOGLE_CLIENT_SECRET?: string
  YANDEX_CLIENT_ID?: string
  YANDEX_CLIENT_SECRET?: string
  VK_CLIENT_ID?: string
  VK_CLIENT_SECRET?: string
  /** development/tests only: one local fixture for every OAuth provider */
  OAUTH_TEST_BASE?: string
  /** Server-side secret mixed into password and code hashes; never stored in D1 */
  PASSWORD_PEPPER?: string
  /** resend | unisender | log (development) — see lib/mailer.ts */
  MAIL_DRIVER?: string
  /** "GameScout <no-reply@gamescout.online>" */
  MAIL_FROM?: string
  RESEND_API_KEY?: string
  UNISENDER_API_KEY?: string
  /** Confirmed emails that get the ADMIN role on sign-in, comma-separated */
  ADMIN_EMAILS?: string
}
export const now = () => new Date().toISOString()
export const daysAgo = (days: number) => new Date(Date.now() - days * 86400000).toISOString()
/** An online number older than this is shown as stale, never as current. */
export const FRESH_MS = 30 * 60000
export const freshSince = () => new Date(Date.now() - FRESH_MS).toISOString()
export function token(bytes = 32): string {
  return [...crypto.getRandomValues(new Uint8Array(bytes))].map(b => b.toString(16).padStart(2, '0')).join('')
}
export const id = (prefix: string) => `${prefix}_${token(10)}`
export function slugify(input: string): string {
  const map: Record<string, string> = {а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'e',ж:'zh',з:'z',и:'i',й:'y',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'h',ц:'c',ч:'ch',ш:'sh',щ:'sch',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya'}
  return input.toLowerCase().replace(/[а-яё]/g, c => map[c] ?? '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0,60) || `server-${token(3)}`
}
export async function sha256(input: string): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input)))].map(b => b.toString(16).padStart(2,'0')).join('')
}
export function parseList(value: unknown): string[] {
  try { const v = JSON.parse(String(value)); return Array.isArray(v) ? v.filter(x => typeof x === 'string') : [] } catch { return [] }
}
export class ApiError extends Error {
  constructor(readonly status: number, message: string, readonly code = 'error') { super(message) }
}
export const badRequest = (m: string, c = 'bad_request') => new ApiError(400,m,c)
export const unauthorized = (m = 'Требуется авторизация') => new ApiError(401,m,'unauthorized')
export const forbidden = (m = 'Недостаточно прав') => new ApiError(403,m,'forbidden')
export const notFound = (m = 'Не найдено') => new ApiError(404,m,'not_found')
export const conflict = (m: string, c = 'conflict') => new ApiError(409,m,c)
export const tooMany = (m: string, c = 'rate_limited') => new ApiError(429,m,c)
export const isLocalRequest = (request: Request) => ['localhost','127.0.0.1','[::1]'].includes(new URL(request.url).hostname)
export const devEnabled = (env: Env, request: Request) => env.ENVIRONMENT === 'development' && env.DEV_AUTH_ENABLED === 'true' && isLocalRequest(request)
export const devOrigins = (env: Env) => env.ENVIRONMENT === 'development' ? (env.DEV_ALLOWED_ORIGINS ?? '').split(',').map(x => x.trim()).filter(Boolean) : []
export async function sameSecret(a: string, b?: string): Promise<boolean> {
  if (!b || b.length < 16) return false
  return await sha256(a) === await sha256(b)
}
