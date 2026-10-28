import { createAccountsApp, gatewayClientIp } from './app.mjs'
import { linkMail, mailEnabled, sendMail } from '../worker/lib/mailer.ts'
import { sendSmtp } from '../private-api/smtp.mjs'

/**
 * Yandex Cloud Functions entry point behind API Gateway (payload_format_version 1.0).
 * Entrypoint name for the platform: `index.handler` (see build.mjs).
 */
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
    app ??= createAccountsApp({ store: await store(), config, sendLinkMail, sendNotice })
    try {
      return await toResponse(await app.fetch(toRequest(event, config.origin), { clientIp: gatewayClientIp(event) }))
    } catch {
      return { statusCode: 500, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        body: JSON.stringify({ error: { code: 'internal_error', message: 'Внутренняя ошибка' } }), isBase64Encoded: false }
    }
  }
}

const NOTICE = {
  EXISTS: ['Аккаунт уже существует', 'Этот адрес указали при регистрации на GameScout, но аккаунт с ним уже есть.'],
  NO_ACCOUNT: ['Аккаунт не найден', 'Для этого адреса запрошено восстановление пароля на GameScout, но аккаунта с ним нет.'],
}
/** A letter without any token: it only tells the owner of the address what happened and where to go. */
export function noticeMail(to, kind, accountUrl) {
  const [subject, lead] = NOTICE[kind] ?? NOTICE.NO_ACCOUNT
  const text = `${lead}

Если это были вы, откройте ${accountUrl}: войдите или восстановите пароль, либо зарегистрируйтесь с нужным адресом. Если вы ничего не запрашивали, просто удалите это письмо.

GameScout`
  const html = `<p>${lead}</p><p>Если это были вы, откройте <a href="${accountUrl}">${accountUrl}</a>. Если вы ничего не запрашивали, просто удалите это письмо.</p><p>GameScout</p>`
  return { to, subject: `GameScout: ${subject}`, text, html }
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
