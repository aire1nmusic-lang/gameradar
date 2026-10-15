// Release code to the existing Worker using versions only: no route/DNS/schema writes.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export async function verifyPublicRanking(fetcher = fetch) {
  const origin = 'https://gamescout.online/api/v1'
  for (const path of ['/health', '/games', '/servers?limit=1', '/support/ranking?limit=1', '/people-rating?limit=1']) {
    const r = await fetcher(origin + path, { headers: { 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(15000) })
    const value = await r.json().catch(() => null)
    assert.ok(r.ok && r.headers.get('content-type')?.includes('application/json'), `${path}: HTTP ${r.status} ${value?.error?.code || ''} marker=${r.headers.get('x-gs-public-votes') || 'missing'}`)
    if (path.includes('people-rating')) {
      assert.ok(Array.isArray(value) && value.length <= 1, 'Invalid ranking response')
      for (const row of value) assert.ok(typeof row.server_id === 'string' && Number.isSafeInteger(row.votes) && row.votes >= 0 && Object.keys(row).sort().join(',') === 'server_id,votes', 'Invalid public vote DTO')
    }
  }
  // The legacy D1 private API must remain closed; this release never reroutes sessions.
  const auth = await fetcher(origin + '/auth/me', { signal: AbortSignal.timeout(15000) })
  assert.equal(auth.status, 503, 'Private routing changed unexpectedly')
  assert.equal((await auth.json()).error?.code, 'private_api_required')
}

async function main() {
  assert.ok(process.env.CLOUDFLARE_API_TOKEN && process.env.CLOUDFLARE_ACCOUNT_ID, 'Existing credentials required')
  const base = 'https://api.cloudflare.com/client/v4/accounts/' + process.env.CLOUDFLARE_ACCOUNT_ID + '/workers/scripts/gamescout-api'
  async function api(path, init = {}) {
    const r = await fetch(base + path, { ...init, headers: { Authorization: 'Bearer ' + process.env.CLOUDFLARE_API_TOKEN, ...init.headers }, signal: AbortSignal.timeout(30000) })
    assert.ok(r.ok, `Worker API ${init.method || 'GET'} ${path}: HTTP ${r.status}`)
    const result = await r.json(); assert.ok(result.success, 'Worker operation failed'); return result.result
  }
  const settings = await api('/settings')
  assert.ok(settings.bindings.some(b => b.name === 'DB' && b.type === 'd1' && b.id === '28f90736-92b9-4261-82f5-ed5d8f55f239'), 'Unexpected public database')
  assert.ok(settings.bindings.some(b => b.name === 'PUBLIC_ONLY' && b.text === 'true'), 'PUBLIC_ONLY must stay enabled')
  const previous = (await api('/deployments')).deployments[0]
  assert.ok(previous?.id && previous.versions?.length && previous.versions.reduce((n, v) => n + v.percentage, 0) === 100, 'Rollback version required')
  const upstream = await fetch('https://priv.gamescout.online/api/v1/people-rating?limit=1', { redirect: 'error', signal: AbortSignal.timeout(15000) })
  assert.ok(upstream.ok && Array.isArray(await upstream.json()), 'Russian vote source unavailable; no release')
  const cli = resolve('node_modules/wrangler/bin/wrangler.js')
  const upload = spawnSync(process.execPath, [cli, 'versions', 'upload', '--config', 'wrangler.toml', '--message', 'Public votes ' + process.env.GITHUB_SHA], {
    encoding: 'utf8', timeout: 600000, maxBuffer: 4 * 1024 * 1024,
    env: { ...process.env, CI: 'true', WRANGLER_SEND_METRICS: 'false' },
  })
  if (upload.status !== 0) {
    let detail = (upload.stdout || '') + (upload.stderr || '')
    for (const secret of [process.env.CLOUDFLARE_API_TOKEN, process.env.CLOUDFLARE_ACCOUNT_ID]) detail = detail.replaceAll(secret, '[REDACTED]')
    console.error(detail.slice(-5000)); throw new Error('Worker upload failed before activation')
  }
  const version = ((upload.stdout || '') + (upload.stderr || '')).match(/Worker Version ID:\s*([a-f0-9-]{36})/)?.[1]
  assert.ok(version, 'Explicit uploaded version required')
  const preview = ((upload.stdout || '') + (upload.stderr || '')).match(/Version Preview URL:\s*(https:\/\/[^\s]+)/)?.[1]
  if (preview) {
    const target = new URL(preview)
    assert.ok(target.hostname.startsWith(version.slice(0, 8) + '-gamescout-api.') && target.hostname.endsWith('.workers.dev'), 'Unexpected preview address')
    const r = await fetch(target.origin + '/api/v1/people-rating?limit=1', { signal: AbortSignal.timeout(15000) })
    const value = await r.json().catch(() => null)
    assert.ok(r.ok && Array.isArray(value), `Inactive public vote preflight: HTTP ${r.status} ${value?.error?.code || ''}`)
    console.log('VERIFIED inactive public vote endpoint')
  }
  console.log('Uploaded public API version', version)
  const resource = await api('/versions/' + version)
  const identity = bindings => bindings.map(b => [b.name, b.type, b.id ?? b.service ?? null]).sort((a, b) => a[0].localeCompare(b[0]))
  assert.deepEqual(identity(resource.resources.bindings), identity(settings.bindings), 'Bindings changed; refuse activation')
  assert.equal((await api('/deployments')).deployments[0].id, previous.id, 'Concurrent deployment; stop')
  const deploy = versions => api('/deployments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ strategy: 'percentage', versions }) })
  await deploy([{ version_id: version, percentage: 100 }])
  console.log('Activated public API version', version)
  try {
    let failure
    for (let attempt = 0; attempt < 30; attempt++) {
      try { await verifyPublicRanking(); failure = null; break } catch (error) { failure = error; console.log('Waiting for public API:', error.message) }
      if (attempt < 29) await new Promise(r => setTimeout(r, 3000))
    }
    if (failure) throw failure
    console.log('VERIFIED public votes, catalog and support; private D1 stays closed. Version', version, 'rollback', previous.versions.map(v => v.version_id).join(','))
  } catch (error) {
    const current = (await api('/deployments')).deployments[0]
    assert.ok(current.versions.length === 1 && current.versions[0].version_id === version, 'Concurrent deployment; refuse automatic rollback')
    await deploy(previous.versions)
    console.log('Previous public API version restored after failed verification')
    throw error
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch(e => { console.error(e.message); process.exitCode = 1 })
