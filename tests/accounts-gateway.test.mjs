import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { accountsRoutes, apiRoutes, renderAccountsGateway } from '../scripts/yandex-private-gateway.mjs'

const lf = text => text.split('\r\n').join('\n')
const candidate = lf(readFileSync('ru-proxy/yandex/gateway.accounts-fn.template.yaml', 'utf8'))
const staticSpec = lf(readFileSync('ru-proxy/yandex/gateway.prerender.template.yaml', 'utf8'))

test('accounts candidate is generated from the current static routes and is not stale', () => {
  assert.equal(candidate, renderAccountsGateway(staticSpec))
  assert.match(candidate, /^# Candidate only: replace placeholders/)
  assert.ok(!candidate.includes('  /__internal/'))
  assert.ok(!candidate.includes('serverless_containers') && !candidate.includes('__PRIVATE_'), 'no private container or VM is referenced')
})

test('only health and /auth reach the accounts function; every other private route fails closed; public reads are unchanged', () => {
  const byPath = Object.fromEntries(accountsRoutes.map(route => [route.path, route.target]))
  assert.equal(byPath['/api/v1/health'], 'accounts')
  assert.equal(byPath['/api/v1/auth/{path+}'], 'accounts')
  assert.deepEqual(Object.keys(byPath).filter(path => byPath[path] === 'accounts').sort(), ['/api/v1/auth/{path+}', '/api/v1/health'])
  for (const route of apiRoutes) {
    if (route.target === 'private' && !['/api/v1/health', '/api/v1/auth/{path+}'].includes(route.path)) assert.equal(byPath[route.path], 'deny', route.path)
    if (route.target === 'public') assert.equal(byPath[route.path], 'public', route.path)
  }
  assert.equal(accountsRoutes.length, apiRoutes.length)
  assert.equal((candidate.match(/function_id: __ACCOUNTS_FUNCTION_ID__/g) ?? []).length, 2)
  assert.equal((candidate.match(/service_account_id: __ACCOUNTS_GATEWAY_SERVICE_ACCOUNT_ID__/g) ?? []).length, 2)
  assert.equal((candidate.match(/type: dummy\n        http_code: 404/g) ?? []).length, 14)
})

test('every route the accounts function implements is reachable through the gateway auth/health routes', () => {
  const source = readFileSync('accounts-fn/app.mjs', 'utf8')
  const implemented = [...source.matchAll(/app\.(get|post)\('(\/api\/v1\/[^']+)'/g)].map(match => match[2])
  assert.ok(implemented.length >= 8)
  // Cabinet reads exist only for the Cloudflare deployment (superseded Yandex candidate does not route them).
  const cabinet = ['/api/v1/owners/me/claims', '/api/v1/owners/me/servers', '/api/v1/coins/me', '/api/v1/me/email', '/api/v1/me/email/confirm']
  for (const path of implemented.filter(p => !cabinet.includes(p))) assert.ok(path === '/api/v1/health' || path.startsWith('/api/v1/auth/'), `${path} would be hidden by the gateway`)
})
