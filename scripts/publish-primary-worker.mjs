// Update only the asset version of the Worker already serving gamescout.online.
// Its current handler and API binding are downloaded and retained. No DNS/routes writes.
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile, rm, appendFile, mkdir, rename, open } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'

export const workerName = 'gamescout-emergency-preview'
const manifestPath = resolve('output/primary-release/rollback.json')
const versionId = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
export function deploymentSnapshot(deployment) {
  assert.ok(deployment?.id && Array.isArray(deployment.versions) && deployment.versions.length, 'No complete rollback deployment')
  const versions = deployment.versions.map(({version_id, percentage}) => {
    assert.ok(versionId.test(version_id) && Number.isFinite(percentage) && percentage >= 0 && percentage <= 100, 'Invalid rollback version/traffic')
    return {version_id, percentage}
  }).sort((a,b)=>a.version_id.localeCompare(b.version_id))
  assert.equal(new Set(versions.map(v=>v.version_id)).size, versions.length, 'Duplicate rollback versions')
  assert.ok(Math.abs(versions.reduce((sum,v)=>sum+v.percentage,0)-100)<0.000001, 'Incomplete rollback traffic split')
  return {id:deployment.id, versions}
}
export async function saveManifest(file, value) {
  await mkdir(dirname(file), {recursive:true})
  const pending = file+'.tmp', handle = await open(pending,'w',0o600)
  try { await handle.writeFile(JSON.stringify(value,null,2)+'\n'); await handle.sync() } finally { await handle.close() }
  await rename(pending,file)
  if(process.platform!=='win32') { const dir=await open(dirname(file),'r'); try { await dir.sync() } finally { await dir.close() } }
}
const sameTraffic = (a,b)=>JSON.stringify(deploymentSnapshot({id:'compare',versions:a}).versions)===JSON.stringify(deploymentSnapshot({id:'compare',versions:b}).versions)
// A deployment request can succeed even when its HTTP response is lost.
export async function promoteVersion(manifest, {current, deploy, persist, verify, verifyRollback=async()=>{}}) {
  assert.equal(manifest.status,'uploaded')
  assert.ok(versionId.test(manifest.candidate), 'Invalid candidate')
  assert.equal((await current()).id,manifest.previous.id,'Concurrent release detected; refuse activation')
  manifest.status='activating'; await persist(manifest)
  try {
    await deploy([{version_id:manifest.candidate,percentage:100}])
    assert.ok(sameTraffic((await current()).versions,[{version_id:manifest.candidate,percentage:100}]),'Activation traffic mismatch')
    await verify()
    manifest.status='verified'; await persist(manifest)
  } catch(error) {
    manifest.failure=String(error.message).slice(0,500)
    try {
      const active=await current()
      if(!sameTraffic(active.versions,manifest.previous.versions)) {
        assert.ok(sameTraffic(active.versions,[{version_id:manifest.candidate,percentage:100}]),'Concurrent release detected; refuse rollback')
        await deploy(manifest.previous.versions)
        assert.ok(sameTraffic((await current()).versions,manifest.previous.versions),'Rollback traffic not confirmed')
      }
      await verifyRollback()
      manifest.status='rolled-back'
    } catch(rollbackError) { manifest.status='rollback-blocked'; manifest.rollbackFailure=String(rollbackError.message).slice(0,500) }
    await persist(manifest)
    throw new Error(`Primary release failed (${manifest.status}): ${error.message}`)
  }
}
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
    // The existing handler resolves /index.html itself; automatic canonical redirects loop.
    assets: { directory, binding: assets.name, run_worker_first: true, html_handling: 'none', not_found_handling: 'none' },
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
export async function verifySite(sha, fetcher = fetch, origin = 'https://gamescout.online', checkApi = true, expectedAsset = null) {
  for (const path of ['/', '/lineage-2', '/minecraft', '/gta-rp', '/catalog', '/account']) {
    const r = await fetcher(origin + path, { headers: { 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(20000) })
    assert.ok(r.ok, `${path}: HTTP ${r.status}`)
    const body = await r.text()
    assert.ok(body.includes(`<meta name="gs-build" content="${sha}"`), `${path}: incorrect build (${body.match(/name="gs-build" content="([^"]+)"/)?.[1] || 'missing'})`)
    if (path === '/') {
      assert.match(r.headers.get('cache-control') || '', /no-cache|no-store/i, 'Primary HTML must not use stale caching')
      // ASSETS/version URLs can legitimately return HIT for the exact new immutable
      // content. Freshness is established by the expected SHA and asset bytes,
      // not by rejecting the provider's cache-status label.
      const assets = [...new Set([...body.matchAll(/(?:src|href)="(\/assets\/[^"?]+\.(?:js|css))"/g)].map(m => m[1]))]
      assert.ok(assets.length >= 2, 'Missing built assets')
      for (const asset of assets) {
        const a = await fetcher(origin + asset, { signal: AbortSignal.timeout(20000) })
        assert.ok(a.ok && !/text\/html/.test(a.headers.get('content-type') || ''), `Missing asset ${asset}`)
        const bytes=Buffer.from(await a.arrayBuffer())
        assert.ok(bytes.length>0, `Missing asset ${asset}`)
        if(expectedAsset)assert.equal(createHash('sha256').update(bytes).digest('hex'),createHash('sha256').update(await expectedAsset(asset)).digest('hex'),`Incorrect asset bytes ${asset}`)
      }
    }
  }
  if (checkApi) for (const path of ['/health', '/games', '/servers?limit=1']) {
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
  const previous = deploymentSnapshot(deployments.deployments[0])
  if(process.argv.includes('--snapshot')) {
    const live=await fetch('https://gamescout.online/',{headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(20000)})
    assert.ok(live.ok,'Cannot verify previous primary build')
    const previousBuild=(await live.text()).match(/name="gs-build" content="([a-f0-9]{40})"/)?.[1]
    assert.ok(previousBuild,'Previous primary build marker is required for rollback acceptance')
    await saveManifest(manifestPath,{schema:1,worker:workerName,sha,previous,previousBuild,status:'snapshotted',createdAt:new Date().toISOString()})
    console.log('Primary rollback snapshot saved before upload; preserve output/primary-release/rollback.json durably')
    return
  }
  const manifest=JSON.parse(await readFile(manifestPath,'utf8'))
  assert.ok(manifest.schema===1 && manifest.worker===workerName && manifest.sha===sha && manifest.status==='snapshotted','A fresh persisted rollback snapshot is required')
  const age=Date.now()-Date.parse(manifest.createdAt)
  assert.ok(Number.isFinite(age)&&age>=-60000&&age<3600000,'Rollback snapshot expired')
  assert.match(manifest.previousBuild||'',/^[a-f0-9]{40}$/,'Previous build required')
  assert.deepEqual(previous,manifest.previous,'Deployment changed after snapshot; refuse overwrite')
  const dir = await mkdtemp(join(tmpdir(), 'gs-primary-'))
  let version
  try {
    // The existing live Worker has one self-contained module. Refuse unexpected shapes.
    const code = await originalHandler(response)
    await writeFile(join(dir, 'handler.mjs'), code, { mode: 0o600 })
    await writeFile(join(dir, 'wrangler.json'), JSON.stringify(workerConfig(settings, resolve('dist'))), { mode: 0o600 })
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
    const output = (result.stdout || '') + (result.stderr || '')
    version = uploadedVersion(output)
    manifest.candidate=version; manifest.status='uploaded'; await saveManifest(manifestPath,manifest)
    const preview = output.match(/Version Preview URL:\s*(https:\/\/[^\s]+)/)?.[1]
    assert.ok(preview, 'Existing version previews required for safe asset preflight')
    const previewURL = new URL(preview)
    assert.ok(previewURL.hostname.startsWith(version.slice(0, 8) + '-' + workerName + '.') && previewURL.hostname.endsWith('.workers.dev'), 'Unexpected provider preview URL')
    const expectedAsset=asset=>readFile(resolve('dist','.'+asset))
    await verifySite(sha, fetch, previewURL.origin, false, expectedAsset)
    const verifySeo=origin=>{
      const gate=spawnSync(process.execPath,['tests/seo-http.mjs'],{stdio:'inherit',timeout:300000,
        env:{...process.env,SEO_BASE_URL:origin,GS_SEO_SNAPSHOT_FILE:'output/seo-public-snapshot.json'}})
      assert.ok(!gate.error&&gate.status===0,'Initial HTTP HTML/SEO postflight failed')
    }
    verifySeo(previewURL.origin)
    console.log('VERIFIED inactive version: six pages and JS/CSS without redirect loops')
    assert.equal((await api(script + '/deployments')).deployments[0].id, previous.id, 'Another deployment happened; refuse overwrite')
    const deploy = versions => api(script + '/deployments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ strategy: 'percentage', versions }) })
    await promoteVersion(manifest,{
      current:async()=>deploymentSnapshot((await api(script+'/deployments')).deployments[0]),deploy,
      persist:value=>saveManifest(manifestPath,value),
      verifyRollback:()=>verifySite(manifest.previousBuild),
      verify:async()=>{
        let failure
        for(let attempt=0;attempt<20;attempt++) {
          try { await verifySite(sha,fetch,'https://gamescout.online',true,expectedAsset); failure=null; break } catch(e) { failure=e; console.log('Waiting for primary propagation:',e.message) }
          if(attempt<19) await new Promise(r=>setTimeout(r,3000))
        }
        if(failure)throw failure
        verifySeo('https://gamescout.online')
      },
    })
    if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `\nPrimary domain verified: ${sha}. Worker version ${version}. Rollback version(s): ${previous.versions.map(v => v.version_id).join(', ')}. No DNS/routes/API configuration changes.\n`)
    console.log('VERIFIED primary domain: six pages, built assets and three public API reads')
  } catch(error) {
    if(manifest.status==='uploaded') {
      manifest.status='preflight-failed';manifest.failure=String(error.message).slice(0,500)
      await saveManifest(manifestPath,manifest)
    }
    throw error
  } finally { await rm(dir, { recursive: true, force: true }) }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch(e => { console.error(e.message); process.exitCode = 1 })
