import { test } from 'node:test'
import assert from 'node:assert/strict'
import { workerConfig, originalHandler, uploadedVersion, verifySite } from '../scripts/publish-primary-worker.mjs'
const settings = { compatibility_date: '2026-10-10', bindings: [{ type: 'assets', name: 'ASSETS' }, { type: 'service', name: 'GAME_API', service: 'current-api', environment: 'production' }] }
test('release retains live API and handler routing without domain/route configuration', () => {
  const c = workerConfig(settings, '/tmp/dist')
  assert.deepEqual(c.services, [{ binding: 'GAME_API', service: 'current-api', environment: 'production' }])
  assert.equal(c.no_bundle, true)
  assert.equal(c.assets.run_worker_first, true)
  for (const forbidden of ['routes', 'route', 'workers_dev', 'account_id', 'vars', 'd1_databases']) assert.ok(!(forbidden in c))
})
test('unexpected live bindings stop before publishing', () => {
  assert.throws(() => workerConfig({ ...settings, bindings: [...settings.bindings, { type: 'd1', name: 'DB' }] }, '/tmp/dist'))
  assert.throws(() => workerConfig({ ...settings, bindings: [settings.bindings[0], { type: 'service', name: 'OTHER', service: 'other' }] }, '/tmp/dist'))
})
test('only an explicit Wrangler uploaded version ID is accepted', () => {
  assert.equal(uploadedVersion('Worker Version ID: 12345678-1234-1234-1234-123456789abc\n'), '12345678-1234-1234-1234-123456789abc')
  assert.throws(() => uploadedVersion('Success without a version ID'))
})
const sha = 'a'.repeat(40)
const html = `<meta name="gs-build" content="${sha}" /><script src="/assets/a.js"></script><link href="/assets/a.css" />`
function fixture({ stale = false, htmlAsset = false, apiError = false } = {}) {
  return async url => {
    if (url.includes('/api/v1/')) return new Response(JSON.stringify({ ok: true }), { status: apiError ? 503 : 200 })
    if (url.includes('/assets/')) return new Response('asset', { headers: { 'content-type': htmlAsset ? 'text/html' : 'text/plain' } })
    return new Response(stale ? html.replaceAll(sha, '__GS_BUILD__') : html)
  }
}
test('live acceptance requires six stamped pages plus real JS/CSS and API reads', async () => { await verifySite(sha, fixture()) })
test('old primary HTML fails even when object upload succeeded', async () => { await assert.rejects(verifySite(sha, fixture({ stale: true })), /incorrect build/) })
test('SPA fallback masquerading as JS and failed public API both reject release', async () => {
  await assert.rejects(verifySite(sha, fixture({ htmlAsset: true })), /Missing asset/)
  await assert.rejects(verifySite(sha, fixture({ apiError: true })), /Public API/)
})

test('Cloudflare multipart modules support text fields without filenames and file fields', async () => {
  const code = 'export default {fetch(r,env){return env.ASSETS.fetch(r) || env.GAME_API.fetch(r)}}'
  for (const part of [code, new Blob([code], { type: 'application/javascript' })]) {
    const form = new FormData(); form.set('index.js', part)
    assert.equal(await originalHandler(new Response(form)), code)
  }
  const form = new FormData(); form.set('other.js', 'export default {}')
  await assert.rejects(originalHandler(new Response(form)), /Unexpected live routing handler/)
})
