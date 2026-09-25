/**
 * GameScout front proxy: relays same-origin /api/* calls to the Cloudflare
 * Worker server-to-server, so a visitor's browser never connects to Cloudflare.
 *
 * Not an open proxy: the upstream origin is fixed by configuration, only paths
 * under /api/ are relayed, and only an allow-list of request headers passes.
 * The visitor's IP travels in X-GS-Client-IP next to the shared secret in
 * X-GS-Proxy-Auth; whatever a client sends in those or in X-Forwarded-For is
 * dropped here.
 *
 * GS_READ_ONLY=true (staging): nothing the page does can persist. Writes are
 * refused, view/click analytics are dropped with 204, the reward lookup (it
 * lazily inserts a default row) answers 204, and sign-in through Google,
 * Yandex, VK and Discord is closed so no users or sessions are created. The Worker behind is unchanged.
 */

/** Request headers the API reads; everything else stays at the proxy. */
const REQUEST_HEADERS = ['accept', 'accept-language', 'authorization', 'content-type', 'cookie', 'if-none-match', 'if-modified-since', 'user-agent']
/** Response headers that describe the upstream hop or its encoding, not the API answer. */
const DROPPED_RESPONSE_HEADERS = ['cf-ray', 'cf-cache-status', 'server', 'report-to', 'nel', 'alt-svc', 'content-encoding', 'content-length', 'transfer-encoding', 'connection', 'keep-alive', 'x-powered-by', 'speculation-rules']
const METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'])
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])
export const MAX_BODY_BYTES = 1024 * 1024
const IP_PATTERN = /^(?:\d{1,3}(?:\.\d{1,3}){3}|[0-9a-f:]{2,39})$/i

/** Reads the proxy settings; throws on a configuration that must not go live. */
export function proxyConfig(env) {
  const upstream = new URL(env.GS_UPSTREAM ?? '')
  if (upstream.protocol !== 'https:' && env.GS_ALLOW_HTTP_UPSTREAM !== 'true') throw new Error('GS_UPSTREAM must be https')
  const secret = env.GS_PROXY_SECRET ?? ''
  if (secret.length < 32) throw new Error('GS_PROXY_SECRET must be at least 32 characters')
  // Comma- or semicolon-separated (yc --environment reserves the comma).
  const publicOrigins = (env.GS_PUBLIC_ORIGINS ?? '').split(/[,;]/).map(o => o.trim()).filter(Boolean)
  if (!publicOrigins.length) throw new Error('GS_PUBLIC_ORIGINS is empty')
  return { upstream: upstream.origin, secret, publicOrigins, timeoutMs: Number(env.GS_TIMEOUT_MS ?? 25000), readOnly: env.GS_READ_ONLY === 'true' }
}

const problem = (status, code, message) =>
  new Response(JSON.stringify({ error: { code, message } }), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-GS-Via': 'proxy' },
  })

const READ_ONLY_MESSAGE = 'Это тестовая копия GameScout: изменения здесь отключены'
/** Analytics the page sends on its own; on a read-only copy they are dropped quietly. */
const DROPPED_WHEN_READ_ONLY = new Set(['/api/v1/events'])
/** GET routes that create users or sessions (OAuth starts and callbacks). */
const SIGN_IN = /^\/api\/v1\/auth\/(?:discord|google|yandex|vk)(?:\/|$)/
/** A GET that lazily inserts a default vote-integration row; the page treats a missing answer as "no data". */
const LAZY_WRITE_READS = /^\/api\/v1\/servers\/[^/]+\/reward$/
const readOnlyEmpty = () => new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store', 'X-GS-Via': 'proxy', 'X-GS-Read-Only': '1' } })

/** The visitor's IP as the hosting platform reports it, or undefined when it is not an IP. */
export function normaliseIp(value) {
  const ip = value?.split(',')[0]?.trim().replace(/^::ffff:(?=\d)/, '')
  return ip && IP_PATTERN.test(ip) ? ip : undefined
}

/**
 * @param {Request} request   the visitor's request (its URL is on the public host)
 * @param {{upstream:string, secret:string, publicOrigins:string[], timeoutMs:number}} config
 * @param {string|undefined} clientIp  taken from the platform, never from client headers
 */
export async function relay(request, config, clientIp, fetchImpl = fetch) {
  const url = new URL(request.url)
  if (!url.pathname.startsWith('/api/')) return problem(404, 'not_found', 'Маршрут не найден')
  if (!METHODS.has(request.method)) return problem(405, 'method_not_allowed', 'Метод не поддерживается')

  if (config.readOnly) {
    if (!SAFE_METHODS.has(request.method)) {
      if (DROPPED_WHEN_READ_ONLY.has(url.pathname)) return readOnlyEmpty()
      return problem(403, 'read_only', READ_ONLY_MESSAGE)
    }
    if (SIGN_IN.test(url.pathname)) return problem(403, 'read_only', READ_ONLY_MESSAGE)
    if (LAZY_WRITE_READS.test(url.pathname)) return readOnlyEmpty()
  }

  const target = new URL(url.pathname + url.search, config.upstream)
  if (target.origin !== config.upstream) return problem(400, 'bad_path', 'Неверный путь')

  const origin = request.headers.get('origin')
  const ownOrigin = origin && config.publicOrigins.includes(origin)
  // Same rule as the Worker: a foreign page may not write through us.
  if (origin && !ownOrigin && !SAFE_METHODS.has(request.method)) return problem(403, 'forbidden', 'Источник запроса не разрешён')

  const headers = new Headers()
  for (const name of REQUEST_HEADERS) {
    const value = request.headers.get(name)
    if (value !== null) headers.set(name, value)
  }
  if (ownOrigin) headers.set('origin', origin)
  headers.set('x-gs-proxy-auth', config.secret)
  if (clientIp) headers.set('x-gs-client-ip', clientIp)

  let body
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    if (Number(request.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) return problem(413, 'payload_too_large', 'Слишком большой запрос')
    body = await request.arrayBuffer()
    if (body.byteLength > MAX_BODY_BYTES) return problem(413, 'payload_too_large', 'Слишком большой запрос')
  }

  let upstream
  try {
    upstream = await fetchImpl(target, {
      method: request.method,
      headers,
      body,
      redirect: 'manual',
      signal: AbortSignal.timeout(config.timeoutMs),
    })
  } catch (error) {
    // The upstream address stays in the platform log, never in the answer.
    console.error('gs_proxy_upstream_failed', request.method, url.pathname, String(error?.name ?? error))
    return problem(502, 'upstream_unavailable', 'Сервис временно недоступен, попробуйте позже')
  }

  const out = new Headers(upstream.headers)
  for (const name of DROPPED_RESPONSE_HEADERS) out.delete(name)
  const location = out.get('location')
  if (location) {
    const next = new URL(location, config.upstream)
    if (next.origin === config.upstream) out.set('location', next.pathname + next.search + next.hash)
  }
  // Personal answers must never be kept by the platform's edge cache.
  if (out.has('set-cookie') || !out.has('cache-control') || !SAFE_METHODS.has(request.method)) out.set('cache-control', 'private, no-store')
  out.set('cdn-cache-control', 'no-store')
  out.set('vercel-cdn-cache-control', 'no-store')
  out.set('x-gs-via', 'proxy')

  const empty = request.method === 'HEAD' || upstream.status === 204 || upstream.status === 304
  return new Response(empty ? null : upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: out })
}

/** Lets a tester see that the mirror answers and which IP the API will count them by. */
export function health(clientIp) {
  return new Response(JSON.stringify({ ok: true, via: 'gamescout-proxy', ip: clientIp ?? null }), {
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-GS-Via': 'proxy' },
  })
}
