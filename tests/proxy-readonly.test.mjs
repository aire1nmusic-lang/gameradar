/**
 * Read-only relay (GS_READ_ONLY=true, used by staging): the page can read
 * production data but nothing it does reaches the database.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { proxyConfig, relay } from '../ru-proxy/handler.mjs'

const env = { GS_UPSTREAM: 'https://upstream.invalid', GS_PROXY_SECRET: 'x'.repeat(40), GS_PUBLIC_ORIGINS: 'https://new.example' }
const readOnly = proxyConfig({ ...env, GS_READ_ONLY: 'true' })
const normal = proxyConfig(env)

function upstreamSpy() {
  const calls = []
  const fetchImpl = async (url, init) => { calls.push(`${init.method} ${new URL(url).pathname}`); return new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=30' } }) }
  return { calls, fetchImpl }
}
const req = (method, path, body) => new Request('https://new.example' + path, { method, body, headers: { origin: 'https://new.example', 'content-type': 'application/json' } })

test('off by default: production relay behaviour is unchanged', async () => {
  assert.equal(normal.readOnly, false)
  const spy = upstreamSpy()
  const res = await relay(req('POST', '/api/v1/votes', '{}'), normal, '203.0.113.5', spy.fetchImpl)
  assert.equal(res.status, 200)
  assert.deepEqual(spy.calls, ['POST /api/v1/votes'])
})

test('reads pass through', async () => {
  const spy = upstreamSpy()
  for (const path of ['/api/v1/games', '/api/v1/servers?limit=100', '/api/v1/servers/2b2t', '/api/v1/auth/me', '/api/v1/servers/2b2t/reward']) {
    const res = await relay(req('GET', path), readOnly, '203.0.113.5', spy.fetchImpl)
    assert.equal(res.status, 200, path)
  }
  assert.equal(spy.calls.length, 5)
})

test('every write is refused before the upstream', async () => {
  const spy = upstreamSpy()
  for (const [method, path] of [['POST', '/api/v1/votes'], ['POST', '/api/v1/votes/claim'], ['POST', '/api/v1/claims'], ['POST', '/api/v1/servers'], ['PATCH', '/api/v1/servers/x'], ['PATCH', '/api/v1/servers/x/monitoring'], ['POST', '/api/v1/servers/x/api-key'], ['POST', '/api/v1/auth/logout'], ['DELETE', '/api/v1/servers/x']]) {
    const res = await relay(req(method, path, method === 'DELETE' ? undefined : '{}'), readOnly, '203.0.113.5', spy.fetchImpl)
    assert.equal(res.status, 403, `${method} ${path}`)
    assert.equal((await res.json()).error.code, 'read_only')
  }
  assert.deepEqual(spy.calls, [])
})

test('analytics are dropped quietly', async () => {
  const spy = upstreamSpy()
  const res = await relay(req('POST', '/api/v1/events', '{"kind":"VIEW"}'), readOnly, '203.0.113.5', spy.fetchImpl)
  assert.equal(res.status, 204)
  assert.equal(res.headers.get('x-gs-read-only'), '1')
  assert.deepEqual(spy.calls, [])
})

test('sign-in cannot create users or sessions', async () => {
  const spy = upstreamSpy()
  for (const path of ['/api/v1/auth/discord', '/api/v1/auth/discord/callback?code=x&state=y']) {
    const res = await relay(req('GET', path), readOnly, '203.0.113.5', spy.fetchImpl)
    assert.equal(res.status, 403, path)
  }
  assert.deepEqual(spy.calls, [])
})
