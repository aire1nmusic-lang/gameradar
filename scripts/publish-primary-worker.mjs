// Update only the asset version of the Worker already serving gamescout.online.
// Its current handler and API binding are downloaded and retained. No DNS/routes writes.
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile, rm, appendFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

export const workerName = 'gamescout-emergency-preview'
export function workerConfig(settings, directory) {
  assert.equal(settings.bindings?.length, 2, 'Unexpected bindings: review before publishing')
  const assets = settings.bindings.find(b => b.type === 'assets' && b.name === 'ASSETS')
  const service = settings.bindings.find(b => b.type === 'service' && b.name === 'GAME_API')
  assert.ok(assets && service?.service, 'Current ASSETS/GAME_API bindings required')
  return {
    name: workerName, main: 'handler.mjs', no_bundle: true, keep_vars: true,
    compatibility_date: settings.compatibility_date,
    compatibility_flags: settings.compatibility_flags || [],
    services: [{ binding: service.name, service: service.service, ...(service.environment ? { environment: service.environment } : {}), ...(service.entrypoint ? { entrypoint: service.entrypoint } : {}) }],
    assets: { directory, binding: assets.name, run_worker_first: true },
  }
}
export async function originalHandler(response) {
  const form = await response.formData()
  // Cloudflare returns the JS part without a filename, so Node exposes it as text.
  const modules = [...form.entries()].filter(([name]) => name !== 'metadata')
  assert.equal(modules.length, 1, 'Worker module shape changed; stop')
  const value = modules[0][1]
  const code = typeof value === 'string' ? value : await value.text()
  assert.ok(code.includes('.ASSETS.fetch(') && code.includes('.GAME_API.fetch('), 'Unexpected live routing handler')
  return code
}
export function uploadedVersion(output) {
  const id = output.match(/Worker Version ID:\s*([a-f0-9-]{36})/)?.[1]
  assert.ok(id, 'Wrangler did not report the uploaded version ID')
  return id
}
export async function verifySite(sha, fetcher = fetch) {
  const origin = 'https://gamescout.online'
  for (const path of ['/', '/lineage-2', '/minecraft', '/gta-rp', '/catalog', '/account']) {
    const r = await fetcher(origin + path, { headers: { 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(20000) })
    assert.ok(r.ok, `${path}: HTTP ${r.status}`)
    const body = await r.text()
    assert.ok(body.includes(`<meta name="gs-build" content="${sha}"`), `${path}: incorrect build`)
    if (path === '/') {
      const assets = [...new Set([...body.matchAll(/(?:src|href)="(\/assets\/[^"?]+\.(?:js|css))"/g)].map(m => m[1]))]
      assert.ok(assets.length >= 2, 'Missing built assets')
      for (const asset of assets) {
        const a = await fetcher(origin + asset, { signal: AbortSignal.timeout(20000) })
        assert.ok(a.ok && !/text\/html/.test(a.headers.get('content-type') || '') && (await a.arrayBuffer()).byteLength > 0, `Missing asset ${asset}`)
      }
    }
  }
  for (const path of ['/health', '/games', '/servers?limit=1']) {
    const r = await fetcher(origin + '/api/v1' + path, { signal: AbortSignal.timeout(20000) })
    assert.ok(r.ok, `Public API ${path}: HTTP ${r.status}`)
    assert.ok(await r.json(), `Public API ${path}: empty JSON`)
  }
}

async function main() {
  const sha = process.env.GITHUB_SHA
  assert.match(sha || '', /^[a-f0-9]{40}$/, 'A full release SHA is required')
  assert.ok(process.env.CLOUDFLARE_API_TOKEN && process.env.CLOUDFLARE_ACCOUNT_ID, 'Existing Cloudflare credentials required')
  assert.ok((await readFile('dist/index.html', 'utf8')).includes(`<meta name="gs-build" content="${sha}"`), 'Refuse an unstamped build')
  const base = 'https://api.cloudflare.com/client/v4/accounts/' + process.env.CLOUDFLARE_ACCOUNT_ID
  async function raw(path, init = {}) {
    const r = await fetch(base + path, { ...init, headers: { Authorization: 'Bearer ' + process.env.CLOUDFLARE_API_TOKEN, ...init.headers }, signal: AbortSignal.timeout(30000) })
    assert.ok(r.ok, `Cloudflare ${init.method || 'GET'} ${path.split('/').at(-1)}: HTTP ${r.status}`)
    return r
  }
  async function api(path, init) {
    const j = await (await raw(path, init)).json()
    assert.ok(j.success, 'Cloudflare rejected the operation')
    return j.result
  }
  const script = '/workers/scripts/' + workerName
  const domains = await api('/workers/domains')
  assert.ok(domains.some(d => d.hostname === 'gamescout.online' && d.service === workerName), 'Primary domain target changed; stop')
  const [settings, deployments, response] = await Promise.all([api(script + '/settings'), api(script + '/deployments'), raw(script)])
  const previous = deployments.deployments[0]
  assert.ok(previous?.id && previous.versions?.length && previous.versions.reduce((n, v) => n + v.percentage, 0) === 100, 'No complete rollback deployment')
  const dir = await mkdtemp(join(tmpdir(), 'gs-primary-'))
  let activated = false, version
  try {
    // The existing live Worker has one self-contained module. Refuse unexpected shapes.
    const code = await originalHandler(response)
    await writeFile(join(dir, 'handler.mjs'), code, { mode: 0o600 })
    await writeFile(join(dir, 'wrangler.json'), JSON.stringify(workerConfig(settings, resolve('dist'))), { mode: 0o600 })
    await writeFile(join(dir, 'rollback.json'), JSON.stringify(previous), { mode: 0o600 })
    const cli = resolve('node_modules/wrangler/bin/wrangler.js')
    const result = spawnSync(process.execPath, [cli, 'versions', 'upload', '--config', join(dir, 'wrangler.json'), '--message', 'GameScout ' + sha], {
      encoding: 'utf8', timeout: 600000, maxBuffer: 4 * 1024 * 1024,
      env: { ...process.env, WRANGLER_SEND_METRICS: 'false', CI: 'true' },
    })
    if (result.status !== 0) {
      let detail = (result.stdout || '') + (result.stderr || '')
      for (const secret of [process.env.CLOUDFLARE_API_TOKEN, process.env.CLOUDFLARE_ACCOUNT_ID]) detail = detail.replaceAll(secret, '[REDACTED]')
      console.error(detail.slice(-6000))
      throw new Error('Primary asset version upload failed before activation')
    }
    version = uploadedVersion((result.stdout || '') + (result.stderr || ''))
    assert.equal((await api(script + '/deployments')).deployments[0].id, previous.id, 'Another deployment happened; refuse overwrite')
    const deploy = versions => api(script + '/deployments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ strategy: 'percentage', versions }) })
    await deploy([{ version_id: version, percentage: 100 }])
    activated = true
    console.log('Primary Worker activated version', version, 'for', sha)
    let failure
    for (let attempt = 0; attempt < 8; attempt++) {
      try { await verifySite(sha); failure = null; break } catch (e) { failure = e; console.log('Waiting for primary propagation:', e.message) }
      if (attempt < 7) await new Promise(r => setTimeout(r, 3000))
    }
    if (failure) throw failure
    if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `\nPrimary domain verified: ${sha}. Worker version ${version}. Rollback version(s): ${previous.versions.map(v => v.version_id).join(', ')}. No DNS/routes/API configuration changes.\n`)
    console.log('VERIFIED primary domain: six pages, built assets and three public API reads')
  } catch (error) {
    if (activated) {
      const active = (await api(script + '/deployments')).deployments[0]
      assert.ok(active.versions.length === 1 && active.versions[0].version_id === version, 'Concurrent release detected; refuse automatic rollback')
      await api(script + '/deployments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ strategy: 'percentage', versions: previous.versions }) })
      console.log('Restored previous primary Worker deployment after failed verification')
    }
    throw error
  } finally { await rm(dir, { recursive: true, force: true }) }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch(e => { console.error(e.message); process.exitCode = 1 })
