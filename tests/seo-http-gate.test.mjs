import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')

async function run(script, cwd, env = {}) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(process.execPath, [join(root, script)], {
      cwd, env: { ...process.env, GS_SEO_SNAPSHOT_FILE: '', SEO_BASE_URL: '', ...env },
    })
    let output = ''
    child.stdout.on('data', chunk => { output += chunk })
    child.stderr.on('data', chunk => { output += chunk })
    child.once('error', reject)
    child.once('close', code => resolveRun({ code, output }))
  })
}

test('HTTP SEO gate rejects malformed structured data, test-page indexing and asset SPA fallbacks', { timeout: 30000 }, async t => {
  const dir = await mkdtemp(join(tmpdir(), 'gamescout-seo-http-gate-'))
  const snapshot = join(dir, 'public-snapshot.json')
  let fault = ''
  const server = createServer(async (request, response) => {
    try {
      const path = new URL(request.url, 'http://localhost').pathname
      const asset = path.startsWith('/assets/') || path.startsWith('/media/')
      let source, status = 200
      try {
        const file = path === '/' ? 'index.html' : ['robots.txt', 'sitemap.xml'].includes(path.slice(1)) ? path.slice(1) : `${path.slice(1)}/index.html`
        source = await readFile(join(dir, 'dist', file), 'utf8')
      } catch {
        source = await readFile(join(dir, 'dist/404.html'), 'utf8')
        status = fault === 'asset-spa' && asset ? 200 : 404
      }
      if (path === '/' && fault === 'jsonld') source = source.replace(/(<script type="application\/ld\+json"[^>]*>)[\s\S]*?(<\/script>)/, '$1{invalid-json$2')
      if (path === '/design' && fault === 'test-index') source = source.replace('noindex, nofollow', 'index, follow')
      if (status === 404 && fault === 'empty-404') source = ''
      response.writeHead(status, { 'content-type': path.endsWith('.xml') ? 'application/xml' : path.endsWith('.txt') ? 'text/plain' : 'text/html; charset=utf-8' })
      response.end(source)
    } catch { response.writeHead(500); response.end('fixture failed') }
  })
  try {
    await mkdir(join(dir, 'dist'), { recursive: true })
    await mkdir(join(dir, 'public'), { recursive: true })
    await writeFile(snapshot, JSON.stringify({ records: ['lineage2', 'minecraft', 'gtarp'].map(game => ({
      slug: `fixture-${game}`, name: `Fixture ${game}`, game, modes: [], chronicle: null,
    })) }))
    await writeFile(join(dir, 'dist/index.html'), await readFile(join(root, 'index.html')))
    await writeFile(join(dir, 'dist/404.html'), await readFile(join(root, 'public/404.html')))
    await writeFile(join(dir, 'dist/robots.txt'), await readFile(join(root, 'public/robots.txt')))
    for (const script of ['scripts/sitemap.mjs', 'scripts/prerender-public.mjs']) {
      const generated = await run(script, dir, { GS_SEO_SNAPSHOT_FILE: snapshot })
      assert.equal(generated.code, 0, generated.output)
    }
    await writeFile(join(dir, 'dist/sitemap.xml'), await readFile(join(dir, 'public/sitemap.xml')))
    await new Promise(resolveListen => server.listen(0, '127.0.0.1', resolveListen))
    const origin = `http://127.0.0.1:${server.address().port}`
    for (const [mode, message] of [['', /HTTP passed/], ['empty-404', /HTTP passed/], ['jsonld', /invalid JSON-LD/], ['test-index', /\/design: robots/], ['asset-spa', /missing asset must return HTTP 404/]]) {
      await t.test(mode || 'valid initial HTML', async () => {
        fault = mode
        const checked = await run('tests/seo-http.mjs', dir, { SEO_BASE_URL: origin, GS_SEO_SNAPSHOT_FILE: snapshot })
        if (mode && mode !== 'empty-404') assert.notEqual(checked.code, 0, checked.output)
        else assert.equal(checked.code, 0, checked.output)
        assert.match(checked.output, message)
      })
    }
  } finally {
    if (server.listening) await new Promise(resolveClose => server.close(resolveClose))
    await rm(dir, { recursive: true, force: true })
  }
})
