import { test } from 'node:test'
import assert from 'node:assert/strict'
import { workerConfig, originalHandler, uploadedVersion, verifySite, deploymentSnapshot, promoteVersion } from '../scripts/publish-primary-worker.mjs'
const settings = { compatibility_date: '2026-10-10', bindings: [{ type: 'assets', name: 'ASSETS' }, { type: 'service', name: 'GAME_API', service: 'current-api', environment: 'production' }] }
test('release retains live API and handler routing without domain/route configuration', () => {
  const c = workerConfig(settings, '/tmp/dist')
  assert.deepEqual(c.services, [{ binding: 'GAME_API', service: 'current-api', environment: 'production' }])
  assert.equal(c.no_bundle, true)
  assert.equal(c.assets.run_worker_first, true)
  assert.equal(c.assets.html_handling, 'none')
  assert.equal(c.assets.not_found_handling, 'none')
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
    return new Response(stale ? html.replaceAll(sha, '__GS_BUILD__') : html,{headers:{'cache-control':'no-cache'}})
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

test('inactive version is verified independently before activation, without private/API writes', async () => {
  const seen = []
  const fake = fixture()
  await verifySite(sha, async url => { seen.push(url); return fake(url) }, 'https://inactive.workers.dev', false)
  assert.ok(seen.length >= 8)
  assert.ok(seen.every(url => url.startsWith('https://inactive.workers.dev/') && !url.includes('/api/')))
})
test('current build marker cannot hide corrupt asset bytes or stale HTML cache',async()=>{
  await verifySite(sha,fixture(),'https://inactive.workers.dev',false,async()=>Buffer.from('asset'))
  await assert.rejects(verifySite(sha,fixture(),'https://inactive.workers.dev',false,async()=>Buffer.from('wrong asset')),/Incorrect asset bytes/)
  const cached=async url=>{const r=await fixture()(url);r.headers.set('cache-control','public,max-age=3600');return r}
  await assert.rejects(verifySite(sha,cached),/stale caching/)
})

const oldA='11111111-1111-1111-1111-111111111111',oldB='22222222-2222-2222-2222-222222222222',candidate='33333333-3333-3333-3333-333333333333'
function promotion({lostResponse=false,failedCheck=false,concurrent=false,failedPersist=false,failedRollbackCheck=false}={}) {
  const previous={id:'old-deployment',versions:[{version_id:oldA,percentage:60},{version_id:oldB,percentage:40}]}
  let active=structuredClone(previous),calls=0,checks=0
  const saved=[]
  return {manifest:{status:'uploaded',candidate,previous},saved,get active(){return active},get calls(){return calls},get checks(){return checks},deps:{
    current:async()=>structuredClone(active),
    persist:async value=>{if(failedPersist)throw Error('disk failure');saved.push(structuredClone(value))},
    deploy:async versions=>{
      calls++;active={id:'deployment-'+calls,versions}
      if(lostResponse&&calls===1)throw Error('response lost after activation')
    },
    verify:async()=>{if(concurrent)active={id:'someone-else',versions:[{version_id:oldB,percentage:100}]};if(failedCheck||concurrent)throw Error('postflight failed')},
    verifyRollback:async()=>{checks++;if(failedRollbackCheck)throw Error('restored build not visible')},
  }}
}
test('rollback snapshots retain only complete validated traffic vectors, without metadata',()=>{
  assert.deepEqual(deploymentSnapshot({id:'old',author_email:'private',versions:[{version_id:oldA,percentage:100}]}),{id:'old',versions:[{version_id:oldA,percentage:100}]})
  for(const versions of [[{version_id:oldA,percentage:99}],[{version_id:'wrong',percentage:100}],[{version_id:oldA,percentage:50},{version_id:oldA,percentage:50}]])assert.throws(()=>deploymentSnapshot({id:'old',versions}))
})
test('candidate is durably recorded as activating before any traffic change',async()=>{
  const p=promotion();await promoteVersion(p.manifest,p.deps)
  assert.deepEqual(p.saved.map(x=>x.status),['activating','verified']);assert.equal(p.calls,1)
  const failure=promotion({failedPersist:true});await assert.rejects(promoteVersion(failure.manifest,failure.deps),/disk failure/);assert.equal(failure.calls,0)
})
for(const kind of ['failedCheck','lostResponse'])test(`${kind} restores the complete previous split and checks the restored site`,async()=>{
  const p=promotion({[kind]:true});await assert.rejects(promoteVersion(p.manifest,p.deps),/rolled-back/)
  assert.deepEqual(p.active.versions,p.manifest.previous.versions);assert.equal(p.calls,2);assert.equal(p.checks,1)
  assert.equal(p.saved.at(-1).status,'rolled-back')
})
test('concurrent release is never overwritten by rollback',async()=>{
  const p=promotion({concurrent:true});await assert.rejects(promoteVersion(p.manifest,p.deps),/rollback-blocked/)
  assert.equal(p.calls,1);assert.equal(p.active.id,'someone-else');assert.equal(p.checks,0)
})
test('restoring traffic without a successful old-build postflight is not claimed successful',async()=>{
  const p=promotion({failedCheck:true,failedRollbackCheck:true});await assert.rejects(promoteVersion(p.manifest,p.deps),/rollback-blocked/)
  assert.equal(p.saved.at(-1).status,'rollback-blocked')
})
