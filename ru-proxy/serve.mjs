/**
 * Local stand-in for the Vercel mirror: serves a built SPA and relays /api/*
 * through the same handler. For tests and local checks only.
 *
 *   node ru-proxy/serve.mjs --dist dist --port 8798
 * Env: GS_UPSTREAM, GS_PROXY_SECRET, GS_PUBLIC_ORIGINS (as on Vercel);
 * GS_TEST_CLIENT_IP_HEADER names a header that plays the platform's client-IP
 * header (tests only; Vercel sets x-real-ip itself).
 */
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'
import { health, normaliseIp, proxyConfig, relay } from './handler.mjs'

const arg = (name, fallback) => {
  const at = process.argv.indexOf('--' + name)
  return at > 0 ? process.argv[at + 1] : fallback
}
const dist = path.resolve(arg('dist', 'dist'))
const port = Number(arg('port', 8798))
const config = proxyConfig(process.env)
const testIpHeader = process.env.GS_TEST_CLIENT_IP_HEADER?.toLowerCase()

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml', '.woff2': 'font/woff2' }

async function staticFile(pathname) {
  const file = path.join(dist, decodeURIComponent(pathname))
  if (!file.startsWith(dist)) return null
  try {
    if ((await stat(file)).isFile()) return { body: await readFile(file), type: TYPES[path.extname(file)] ?? 'application/octet-stream' }
  } catch {}
  return null
}

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://127.0.0.1:${port}`)
    const clientIp = normaliseIp((testIpHeader && req.headers[testIpHeader]) || req.socket.remoteAddress)
    let response
    if (url.pathname === '/__gs/health') response = health(clientIp)
    else if (url.pathname.startsWith('/api/')) {
      const chunks = []
      for await (const chunk of req) chunks.push(chunk)
      const headers = new Headers()
      for (const [name, value] of Object.entries(req.headers)) if (typeof value === 'string') headers.set(name, value)
      const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : Buffer.concat(chunks)
      response = await relay(new Request(`http://127.0.0.1:${port}${url.pathname}${url.search}`, { method: req.method, headers, body }), config, clientIp)
    } else {
      const file = (await staticFile(url.pathname)) ?? (path.extname(url.pathname) ? null : await staticFile('/index.html'))
      response = file
        ? new Response(file.body, { headers: { 'Content-Type': file.type, 'X-Robots-Tag': 'noindex, nofollow' } })
        : new Response('Not found', { status: 404 })
    }
    const headers = {}
    response.headers.forEach((value, name) => {
      if (name !== 'set-cookie') headers[name] = value
    })
    const cookies = response.headers.getSetCookie()
    if (cookies.length) headers['set-cookie'] = cookies
    res.writeHead(response.status, headers)
    if (response.body) Readable.fromWeb(response.body).pipe(res)
    else res.end()
  } catch (error) {
    console.error(error)
    res.writeHead(500)
    res.end()
  }
}).listen(port, '127.0.0.1', () => console.log(`GameScout mirror on http://127.0.0.1:${port}`))
