import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'node:test'

const port = 8797
const base = `http://127.0.0.1:${port}`
const wrangler = resolve('node_modules/wrangler/bin/wrangler.js')
const state = resolve('output/public-only-worker-state')
const configHome = resolve('output/wrangler-config')

test('PUBLIC_ONLY refuses legacy private writes while public health remains available', { timeout: 45000 }, async () => {
  mkdirSync(state, { recursive: true })
  mkdirSync(configHome, { recursive: true })
  const child = spawn(process.execPath, [wrangler, 'dev', '--local', '--ip', '127.0.0.1', '--port', String(port),
    '--inspector-port', '9238', '--persist-to', state, '--var', 'PUBLIC_ONLY:true', '--log-level', 'error'], {
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
  } finally {
    if (process.platform === 'win32') spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true })
    else child.kill('SIGTERM')
  }
})
