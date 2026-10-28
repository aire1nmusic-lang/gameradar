/**
 * Free-plan accounts on Cloudflare (Worker + D1): registration by e-mail link, sign-in, session, recovery.
 *
 * Owner decision 28.10.2026: accounts must cost nothing, so they run on the Cloudflare free plan, which refuses
 * requests past its quotas instead of billing them. The app (accounts-fn/app.mjs) keeps the private API's wire
 * contract, so the frontend is unchanged. Off unless ACCOUNTS_FREE=true; sign-up stays closed unless
 * ACCOUNTS_REGISTRATION_OPEN=true. A daily cap keeps the D1/Workers quotas shared with the catalog safe.
 */
import { createAccountsApp } from '../accounts-fn/app.mjs'
import { d1Store } from '../accounts-fn/store-d1.mjs'
import { noticeMail } from '../accounts-fn/mail.mjs'
import type { Env } from './lib/core.ts'
import { linkMail, mailEnabled, sendMail } from './lib/mailer.ts'
import { hashPassword, verifyPassword } from './lib/password.ts'

const DEFAULT_DAILY_LIMIT = 1500
const json = (status: number, code: string, message: string) => new Response(JSON.stringify({ error: { code, message } }),
  { status, headers: { 'Content-Type': 'application/json; charset=UTF-8', 'Cache-Control': 'no-store' } })

export function freeAccountsEnabled(env: Env): boolean {
  return env.ACCOUNTS_FREE === 'true'
}

export function dailyLimit(env: Env): number {
  const value = Number(env.ACCOUNTS_DAILY_LIMIT ?? DEFAULT_DAILY_LIMIT)
  return Number.isInteger(value) && value >= 1 && value <= 50_000 ? value : DEFAULT_DAILY_LIMIT
}

let cached: { key: string; app: ReturnType<typeof createAccountsApp> } | undefined

/** Answers /api/v1/auth/* when free accounts are on; returns null for every other request. */
export async function freeAccounts(request: Request, env: Env): Promise<Response | null> {
  const path = new URL(request.url).pathname
  if (!freeAccountsEnabled(env) || !path.startsWith('/api/v1/auth/')) return null
  const pepper = env.PASSWORD_PEPPER ?? '', rateKey = env.ACCOUNTS_RATE_KEY ?? ''
  // Without its own secrets the service stays closed rather than running with weak hashing or shared keys.
  if (pepper.length < 32 || rateKey.length < 32 || !env.ALLOWED_ORIGIN) return json(503, 'accounts_unavailable', 'Вход и регистрация временно недоступны.')
  // Only same-site writes count, so a forged cross-site request cannot use up the day's budget.
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method) && request.headers.get('Origin') === env.ALLOWED_ORIGIN) {
    const calls = await d1Store(env.DB).dailyHit(new Date().toISOString().slice(0, 10))
    if (calls > dailyLimit(env)) return json(503, 'accounts_daily_limit', 'Вход и регистрация на сегодня исчерпали бесплатный лимит. Попробуйте завтра.')
  }
  const config = { origin: env.ALLOWED_ORIGIN, environment: env.ENVIRONMENT === 'development' ? 'development' : 'production', rateKey,
    mailEnabled: mailEnabled(env), registrationOpen: env.ACCOUNTS_REGISTRATION_OPEN === 'true', emergencyMode: env.EMERGENCY_MODE === 'true' }
  // In-memory only: a changed secret or setting rebuilds the app.
  const key = JSON.stringify([config, pepper])
  if (cached?.key !== key) cached = { key, app: createAccountsApp({ store: d1Store(env.DB), config,
    passwords: { hash: password => hashPassword(password, pepper), verify: (password, stored) => verifyPassword(password, stored, pepper) },
    sendLinkMail: (to, purpose, link) => sendMail(env, linkMail(to, purpose, link)),
    sendNotice: (to, kind, url) => sendMail(env, noticeMail(to, kind, url)) }) }
  // Cloudflare sets CF-Connecting-IP itself; a client cannot choose it.
  return cached.app.fetch(request, { clientIp: request.headers.get('CF-Connecting-IP') ?? 'unknown' })
}

/** Hourly cleanup of expired links, sessions and counters (called from the cron). */
export async function freeAccountsCleanup(env: Env, now = new Date()): Promise<void> {
  if (freeAccountsEnabled(env) && now.getUTCMinutes() < 2) await d1Store(env.DB).cleanup(now)
}
