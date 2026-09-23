/**
 * Vercel Routing Middleware: the only dynamic part of the mirror. Static files
 * (the built SPA) are served by Vercel itself; /api/* is relayed to the Worker.
 *
 * Settings are Vercel environment variables (Production):
 *   GS_UPSTREAM        the Worker origin, e.g. https://gamescout-ru-api.<account>.workers.dev
 *   GS_PROXY_SECRET    the Worker's PROXY_SECRET
 *   GS_PUBLIC_ORIGINS  this site's origins, comma-separated
 */
import { health, normaliseIp, proxyConfig, relay } from './handler.mjs'

export const config = { matcher: ['/api/:path*', '/__gs/health'] }

let settings
export default async function middleware(request) {
  // Vercel sets x-real-ip / x-forwarded-for itself and overwrites what the client sent.
  const clientIp = normaliseIp(request.headers.get('x-real-ip') ?? request.headers.get('x-forwarded-for'))
  if (new URL(request.url).pathname === '/__gs/health') return health(clientIp)
  try {
    settings ??= proxyConfig(process.env)
  } catch (error) {
    console.error('gs_proxy_misconfigured', String(error?.message ?? error))
    return new Response(JSON.stringify({ error: { code: 'proxy_misconfigured', message: 'Сервис временно недоступен' } }), {
      status: 503,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
    })
  }
  return relay(request, settings, clientIp)
}
