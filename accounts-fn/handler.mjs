import { isIP } from 'node:net'
import { createAccountsApp } from './app.mjs'
import { noticeMail } from './mail.mjs'
import { hashPassword, verifyPassword } from '../private-api/crypto.mjs'

export { noticeMail }
import { linkMail, mailEnabled, sendMail } from '../worker/lib/mailer.ts'
import { sendSmtp } from '../private-api/smtp.mjs'

/**
 * Yandex Cloud Functions entry point behind API Gateway (payload_format_version 1.0).
 * Entrypoint name for the platform: `index.handler` (see build.mjs).
 */
/** The API Gateway appends/sets the caller address; prefer its own field, else the LAST X-Forwarded-For entry. */
export function gatewayClientIp(event) {
  const own = event?.requestContext?.identity?.sourceIp
  if (typeof own === 'string' && isIP(own)) return own
  const forwarded = event?.headers?.['X-Forwarded-For'] ?? event?.headers?.['x-forwarded-for']
  const last = typeof forwarded === 'string' ? forwarded.split(',').at(-1)?.trim() : ''
  return last && isIP(last) ? last : 'unknown'
}

export function configFromEnv(env = process.env) {
  const mailEnv = { ENVIRONMENT: 'production', MAIL_DRIVER: env.MAIL_DRIVER, MAIL_FROM: env.MAIL_FROM, RESEND_API_KEY: env.RESEND_API_KEY,
    UNISENDER_API_KEY: env.UNISENDER_API_KEY, SMTP_HOST: env.SMTP_HOST, SMTP_PORT: env.SMTP_PORT, SMTP_USER: env.SMTP_USER,
    SMTP_PASSWORD: env.SMTP_PASSWORD, SMTP_TLS: env.SMTP_TLS, SMTP_SEND: sendSmtp }
  return { origin: env.PUBLIC_ORIGIN, environment: 'production', rateKey: env.RATE_HASH_KEY, mailEnv, mailEnabled: mailEnabled(mailEnv),
    // Sign-ups stay closed until the owner sets REGISTRATION_OPEN=true; EMERGENCY_MODE is an operator switch.
    registrationOpen: env.REGISTRATION_OPEN === 'true', emergencyMode: env.EMERGENCY_MODE === 'true' }
}

export function toRequest(event, origin) {
  const url = new URL(event.path || '/', origin)
  const query = event.multiValueQueryStringParameters ?? {}
  for (const [name, values] of Object.entries(query)) for (const value of values ?? []) url.searchParams.append(name, value)
  if (!Object.keys(query).length) for (const [name, value] of Object.entries(event.queryStringParameters ?? {})) url.searchParams.set(name, value)
  const method = (event.httpMethod || 'GET').toUpperCase()
  const headers = new Headers()
  for (const [name, value] of Object.entries(event.headers ?? {})) if (typeof value === 'string') headers.set(name, value)
  const body = ['GET', 'HEAD'].includes(method) || event.body == null ? undefined
    : event.isBase64Encoded ? Buffer.from(event.body, 'base64') : event.body
  return new Request(url, { method, headers, body })
}

export async function toResponse(response) {
  const headers = {}
  for (const [name, value] of response.headers) if (name !== 'set-cookie') headers[name] = value
  const cookies = response.headers.getSetCookie()
  return { statusCode: response.status, headers, ...(cookies.length ? { multiValueHeaders: { 'Set-Cookie': cookies } } : {}),
    body: await response.text(), isBase64Encoded: false }
}

export function createHandler({ store, config, sendLinkMail, sendNotice }) {
  let app
  return async function handle(event) {
    app ??= createAccountsApp({ store: await store(), config, sendLinkMail, sendNotice, passwords: { hash: hashPassword, verify: verifyPassword } })
    try {
      return await toResponse(await app.fetch(toRequest(event, config.origin), { clientIp: gatewayClientIp(event) }))
    } catch {
      return { statusCode: 500, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        body: JSON.stringify({ error: { code: 'internal_error', message: 'Внутренняя ошибка' } }), isBase64Encoded: false }
    }
  }
}

let cached
export async function handler(event, context) {
  if (!cached) {
    const config = configFromEnv()
    const { createYdbStore } = await import('./store-ydb.mjs')
    let pending
    cached = createHandler({ config, store: () => (pending ??= createYdbStore()),
      sendLinkMail: (to, purpose, link) => sendMail(config.mailEnv, linkMail(to, purpose, link)),
      sendNotice: (to, kind, accountUrl) => sendMail(config.mailEnv, noticeMail(to, kind, accountUrl)) })
  }
  return cached(event, context)
}
