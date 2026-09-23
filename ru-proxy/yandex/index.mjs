/**
 * Yandex Cloud Function behind API Gateway (cloud_functions integration,
 * payload_format_version "1.0"): the /api/* and /__gs/health relay of the
 * Yandex mirror. Same relay as the Vercel middleware (handler.mjs).
 *
 * The visitor's IP comes from requestContext.identity.sourceIp, which API
 * Gateway fills from the connection; client headers cannot change it.
 *
 * Env: GS_UPSTREAM, GS_PROXY_SECRET, GS_PUBLIC_ORIGINS.
 */
import { health, normaliseIp, proxyConfig, relay } from './handler.mjs'

let settings

function requestUrl(event) {
  const path = event.path ?? event.url ?? '/'
  const query = new URLSearchParams()
  for (const [name, values] of Object.entries(event.multiValueQueryStringParameters ?? {})) for (const value of values ?? []) query.append(name, value)
  if (!event.multiValueQueryStringParameters) for (const [name, value] of Object.entries(event.queryStringParameters ?? {})) query.append(name, value)
  const search = query.toString()
  return `https://mirror.invalid${path.startsWith('/') ? path : '/' + path}${search ? '?' + search : ''}`
}

async function toGateway(response) {
  const headers = {}
  response.headers.forEach((value, name) => {
    if (name !== 'set-cookie') headers[name] = value
  })
  const cookies = response.headers.getSetCookie()
  return {
    statusCode: response.status,
    headers,
    multiValueHeaders: cookies.length ? { 'Set-Cookie': cookies } : {},
    body: await response.text(),
    isBase64Encoded: false,
  }
}

export async function handler(event) {
  const clientIp = normaliseIp(event.requestContext?.identity?.sourceIp)
  const url = requestUrl(event)
  if (new URL(url).pathname === '/__gs/health') return toGateway(health(clientIp))
  try {
    settings ??= proxyConfig(process.env)
  } catch (error) {
    console.error('gs_proxy_misconfigured', String(error?.message ?? error))
    return { statusCode: 503, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, body: '{"error":{"code":"proxy_misconfigured","message":"Сервис временно недоступен"}}', isBase64Encoded: false }
  }

  const headers = new Headers()
  for (const [name, values] of Object.entries(event.multiValueHeaders ?? {})) for (const value of values ?? []) headers.append(name, value)
  if (!event.multiValueHeaders) for (const [name, value] of Object.entries(event.headers ?? {})) headers.set(name, value)
  const method = event.httpMethod ?? 'GET'
  const body = method === 'GET' || method === 'HEAD' || !event.body ? undefined : event.isBase64Encoded ? Buffer.from(event.body, 'base64') : event.body

  return toGateway(await relay(new Request(url, { method, headers, body }), settings, clientIp))
}
