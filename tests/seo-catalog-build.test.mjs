import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs'

const fixture = { slug: 'fixture-l2', name: 'Fixture L2', gameId: 'lineage2', chronicleId: 'interlude', version: null, modes: ['PvP'], rates: 'x10', openedAt: '2026-09-27T00:00:00Z', region: 'EU', country: 'DE', moderation: 'PUBLISHED', demo: false, updatedAt: '2026-09-27T00:00:00Z', ownerId: 'must-not-be-public' }
const manifest = 'output/seo-public-snapshot.json'

function npm(args, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, { cwd: process.cwd(), env: { ...process.env, SEO_BASE_URL: '', ...env }, shell: process.platform === 'win32' })
    let output = ''
    child.stdout.on('data', chunk => { output += chunk })
    child.stderr.on('data', chunk => { output += chunk })
    child.once('error', reject)
    child.once('close', code => resolve({ code, output }))
  })
}

test('catalog-sourced build and second API reconciliation complete', { timeout: 120000 }, async () => {
  const previous = existsSync(manifest) ? readFileSync(manifest) : null
  const server = createServer((_request, response) => {
    response.setHeader('content-type', 'application/json')
    response.end(JSON.stringify({ items: [fixture], total: 1, limit: 100, offset: 0 }))
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  try {
    const { port } = server.address()
    const run = await npm(['run', 'build:catalog', '--', `http://127.0.0.1:${port}/`])
    assert.equal(run.code, 0, run.output)
    assert.match(run.output, /Public catalog build verified: 1 cards/)
    const page = readFileSync('dist/server/fixture-l2/index.html', 'utf8')
    assert.match(page, /Fixture L2/)
    assert.ok(!page.includes('must-not-be-public'))
    assert.ok(!readFileSync(manifest, 'utf8').includes('must-not-be-public'))
  } finally {
    await new Promise(resolve => server.close(resolve))
    if (previous) writeFileSync(manifest, previous)
    else if (existsSync(manifest)) rmSync(manifest)
    const restored = await npm(['run', 'build'])
    assert.equal(restored.code, 0, restored.output)
  }
})
