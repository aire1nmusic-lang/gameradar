/**
 * Free-plan accounts on Cloudflare (Worker + D1): registration by e-mail link, sign-in, session, recovery.
 *
 * Owner decision 28.10.2026: accounts must cost nothing, so they run on the Cloudflare free plan, which refuses
 * requests past its quotas instead of billing them. The app (accounts-fn/app.mjs) keeps the private API's wire
 * contract, so the frontend is unchanged. Off unless ACCOUNTS_FREE=true; sign-up stays closed unless
 * ACCOUNTS_REGISTRATION_OPEN=true. A daily cap keeps the D1/Workers quotas shared with the catalog safe.
 * Owner decision 29.10.2026: with ACCOUNTS_COMMUNITY=true the same app also serves votes, owner Claims, owner card
 * edits and admin moderation from D1 (accounts-fn/community.mjs, migrations/0013_free_community.sql).
 */
import { createAccountsApp } from '../accounts-fn/app.mjs'
import { d1Store } from '../accounts-fn/store-d1.mjs'
import { noticeMail } from '../accounts-fn/mail.mjs'
import type { Env } from './lib/core.ts'
import { linkMail, mailEnabled, sendMail } from './lib/mailer.ts'
import { hashPassword, verifyPassword } from './lib/password.ts'
import { sendSmtpSocket } from './lib/smtp-socket.ts'

const DEFAULT_DAILY_LIMIT = 5000
const json = (status: number, code: string, message: string) => new Response(JSON.stringify({ error: { code, message } }),
  { status, headers: { 'Content-Type': 'application/json; charset=UTF-8', 'Cache-Control': 'no-store' } })

/** The legacy D1 accounts (ACCOUNTS_IN_D1) win when explicitly enabled, e.g. in their own acceptance tests. */
export function freeAccountsEnabled(env: Env): boolean {
  return env.ACCOUNTS_FREE === 'true' && env.ACCOUNTS_IN_D1 !== 'true'
}

export function dailyLimit(env: Env): number {
  const value = Number(env.ACCOUNTS_DAILY_LIMIT ?? DEFAULT_DAILY_LIMIT)
  return Number.isInteger(value) && value >= 1 && value <= 50_000 ? value : DEFAULT_DAILY_LIMIT
}

let cached: { key: string; app: ReturnType<typeof createAccountsApp> } | undefined

// Routes of accounts-fn/community.mjs; the rest of the private core (Coins, payments, copyright review) stays unavailable.
const COMMUNITY = new RegExp('^/api/v1/(?:people-rating(?:/eligibility|/votes)?|claims(?:/[^/]+/proof(?:/check)?)?'
  + '|owners/me/servers/[^/]+/(?:summary-edits|fact-edits|monitoring)|servers/[^/]+/manage-access|copyright/(?:restrictions/[^/]+|claims)'
  + '|admin/(?:overview|system|vote-rules|users(?:/[^/]+/(?:moderation|roles|ownership))?|servers(?:/[^/]+/monitoring-hold)?'
  + '|server-edits(?:/[^/]+/resolve)?|server-fact-edits(?:/[^/]+/resolve)?|claims(?:/[^/]+/resolve)?|votes(?:/[^/]+/review)?))$')
export const communityEnabled = (env: Env) => freeAccountsEnabled(env) && env.ACCOUNTS_COMMUNITY === 'true'

/** Answers /api/v1/auth/* when free accounts are on; returns null for every other request. */
export async function freeAccounts(request: Request, env: Env): Promise<Response | null> {
  const path = new URL(request.url).pathname
  // /auth/dev is the local-development sign-in of the main Worker and stays there.
  const cabinet = ['/api/v1/owners/me/claims', '/api/v1/owners/me/servers', '/api/v1/coins/me', '/api/v1/me/email', '/api/v1/me/email/confirm'].includes(path)
  const community = communityEnabled(env) && COMMUNITY.test(path)
  if (!freeAccountsEnabled(env) || !(path.startsWith('/api/v1/auth/') || cabinet || community) || path === '/api/v1/auth/dev') return null
  const pepper = env.PASSWORD_PEPPER ?? '', rateKey = env.ACCOUNTS_RATE_KEY ?? ''
  // SMTP (e.g. Gmail with an app password) goes over a Cloudflare TCP socket.
  const mailEnv: Env = env.MAIL_DRIVER === 'smtp' ? { ...env, SMTP_SEND: sendSmtpSocket } : env
  // Without its own secrets the service stays closed rather than running with weak hashing or shared keys.
  // A local development Worker without them keeps its previous behaviour (dev sign-in, regression tests).
  if (pepper.length < 32 || rateKey.length < 32 || !env.ALLOWED_ORIGIN)
    return env.ENVIRONMENT === 'development' ? null : json(503, 'accounts_unavailable', 'Вход и регистрация временно недоступны.')
  // Counted: same-site writes (a forged cross-site request cannot use up the day's budget) and Google/Discord round trips
  // (top-level navigations carry no Origin). The session check /auth/me is never counted.
  const write = !['GET', 'HEAD', 'OPTIONS'].includes(request.method) && request.headers.get('Origin') === env.ALLOWED_ORIGIN
  const oauthTrip = request.method === 'GET' && /^\/api\/v1\/auth\/(?:google|discord)(?:\/callback)?$/.test(path)
  if (write || oauthTrip) {
    const day = new Date().toISOString().slice(0, 10), store = d1Store(env.DB), cap = dailyLimit(env)
    // Past the cap only a read happens, so hostile traffic cannot keep spending the D1 write quota shared with the catalog.
    if (await store.dailyCount(day) >= cap || await store.dailyHit(day) > cap) return json(503, 'accounts_daily_limit', 'Аккаунты и голосование на сегодня исчерпали бесплатный лимит. Попробуйте завтра.')
  }
  const config = { origin: env.ALLOWED_ORIGIN, environment: env.ENVIRONMENT === 'development' ? 'development' : 'production', rateKey,
    adminEmails: env.ADMIN_EMAILS ?? '', mailEnabled: mailEnabled(mailEnv), registrationOpen: env.ACCOUNTS_REGISTRATION_OPEN === 'true', emergencyMode: env.EMERGENCY_MODE === 'true',
    oauth: { GOOGLE_CLIENT_ID: env.GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET: env.GOOGLE_CLIENT_SECRET, DISCORD_CLIENT_ID: env.DISCORD_CLIENT_ID,
      DISCORD_CLIENT_SECRET: env.DISCORD_CLIENT_SECRET, OAUTH_TEST_BASE: env.OAUTH_TEST_BASE, DISCORD_API_BASE: env.DISCORD_API_BASE },
    turnstileSecret: env.TURNSTILE_SECRET || undefined, turnstileSiteKey: env.TURNSTILE_SITE_KEY || undefined, contactEmail: env.CONTACT_EMAIL ?? env.ADMIN_EMAILS?.split(',')[0]?.trim(),
    community: communityEnabled(env) }
  // In-memory only: a changed secret or setting rebuilds the app.
  const key = JSON.stringify([config, pepper])
  if (cached?.key !== key) cached = { key, app: createAccountsApp({ store: d1Store(env.DB), config,
    passwords: { hash: password => hashPassword(password, pepper), verify: (password, stored) => verifyPassword(password, stored, pepper) },
    sendLinkMail: (to, purpose, link) => sendMail(mailEnv, linkMail(to, purpose, link)),
    sendNotice: (to, kind, url) => sendMail(mailEnv, noticeMail(to, kind, url)),
    community: config.community ? { db: env.DB } : null }) }
  // Cloudflare sets CF-Connecting-IP and request.cf itself; a client cannot choose them.
  const asn = (request as Request & { cf?: { asn?: number } }).cf?.asn
  return cached.app.fetch(request, { clientIp: request.headers.get('CF-Connecting-IP') ?? 'unknown', clientAsn: asn ? String(asn) : undefined })
}

/** Hourly cleanup of expired links, sessions and counters (called from the cron). */
export async function freeAccountsCleanup(env: Env, now = new Date()): Promise<void> {
  if (freeAccountsEnabled(env) && now.getUTCMinutes() < 2) await d1Store(env.DB).cleanup(now)
}
