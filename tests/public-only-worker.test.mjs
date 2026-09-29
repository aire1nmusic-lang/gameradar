import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'node:test'

const port = 8797
const base = `http://127.0.0.1:${port}`
const wrangler = resolve('node_modules/wrangler/bin/wrangler.js')
mkdirSync(resolve('output'), { recursive: true })
const state = mkdtempSync(resolve('output/public-only-worker-state-'))
const configHome = resolve('output/wrangler-config')
const projectionSecret = 'local-projection-test-secret-32-bytes'

function runWrangler(args) {
  const result = spawnSync(process.execPath, [wrangler, ...args, '--persist-to', state], {
    encoding: 'utf8', windowsHide: true,
    env: { ...process.env, XDG_CONFIG_HOME: configHome, WRANGLER_SEND_METRICS: 'false' },
  })
  assert.equal(result.status, 0, result.stderr || result.stdout)
}

test('PUBLIC_ONLY refuses legacy private writes and accepts only signed, monotonic public snapshots', { timeout: 45000 }, async () => {
  mkdirSync(state, { recursive: true })
  mkdirSync(configHome, { recursive: true })
  runWrangler(['d1', 'migrations', 'apply', 'gamescout', '--local'])
  const seed = resolve(state, 'projection-seed.sql')
  writeFileSync(seed, `INSERT INTO games(id,slug,name,short_name,created_at) VALUES('game-local','minecraft','Minecraft','MC','2026-01-01T00:00:00Z');
INSERT INTO servers(id,slug,name,game_id,moderation,summary,added_at,updated_at) VALUES('server-local','server-local','Local server','game-local','PUBLISHED','Original summary','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z');
`)
  runWrangler(['d1', 'execute', 'gamescout', '--local', '--file', seed])
  const child = spawn(process.execPath, [wrangler, 'dev', '--local', '--ip', '127.0.0.1', '--port', String(port),
    '--inspector-port', '9238', '--persist-to', state, '--var', 'PUBLIC_ONLY:true',
    '--var', `PUBLIC_PROJECTION_SECRET:${projectionSecret}`, '--log-level', 'error'], {
    stdio: 'ignore', windowsHide: true,
    env: { ...process.env, XDG_CONFIG_HOME: configHome, WRANGLER_SEND_METRICS: 'false' },
  })
  child.unref()
  try {
    let ready = false
    for (let i = 0; i < 100; i++) {
      if (child.exitCode !== null) throw new Error('Local Worker exited before readiness')
      try {
        const response = await fetch(`${base}/api/v1/auth/me`, { signal: AbortSignal.timeout(500) })
        if (response.status === 503) { await response.arrayBuffer(); ready = true; break }
        await response.arrayBuffer()
      } catch { /* retry during startup */ }
      await new Promise(resolve => setTimeout(resolve, 250))
    }
    assert.ok(ready, 'PUBLIC_ONLY did not become active')
    for (const [method, path] of [
      ['POST', '/api/v1/auth/register'],
      ['POST', '/api/v1/votes'],
      ['POST', '/api/v1/coins/purchase'],
      ['GET', '/api/v1/admin/overview'],
    ]) {
      const response = await fetch(base + path, { method })
      assert.equal(response.status, 503, `${method} ${path}`)
      assert.equal((await response.json()).error.code, 'private_api_required')
    }
    const health = await fetch(`${base}/api/v1/health`)
    assert.equal(health.status, 200)
    await health.arrayBuffer()

    const endpoint = `${base}/api/internal/public-projection`
    const first = { serverId: 'server-local', version: 2, claimed: true,
      summary: 'Verified public summary from a signed projection.', supportCoins: 3, supportParticipants: 2 }
    const post = (body, secret = projectionSecret) => fetch(endpoint, {
      method: 'POST', headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    assert.equal((await post(first, 'wrong-secret')).status, 403)
    assert.equal((await post({ ...first, email: 'private@example.test' })).status, 400)
    assert.equal((await post(first)).status, 200)
    assert.equal((await post(first)).status, 200)
    assert.equal((await post({ ...first, summary: 'Conflicting same-version replay must be ignored.', supportCoins: 99 })).status, 200)
    assert.equal((await post({ ...first, version: 1, summary: 'An older replay must not overwrite the public summary.' })).status, 200)
    let card = await (await fetch(`${base}/api/v1/servers/server-local`)).json()
    assert.equal(card.summary, first.summary)
    assert.deepEqual(card.support, { coins: 3, participants: 2 })
    const second = { ...first, version: 3, summary: 'A newer public revision is delivered and displayed.' }
    assert.equal((await post(second)).status, 200)
    card = await (await fetch(`${base}/api/v1/servers/server-local`)).json()
    assert.equal(card.summary, second.summary)
  } finally {
    if (process.platform === 'win32') spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true })
    else child.kill('SIGTERM')
  }
})
