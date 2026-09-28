import assert from 'node:assert/strict'
import { test } from 'node:test'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { publicPages } from '../scripts/public-pages.mjs'

const spec = readFileSync('ru-proxy/yandex/gateway.prerender.template.yaml', 'utf8')
const dist = 'dist'
const mirror = 'output/mirror-static-test'
const htmlFiles = dir => readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
  const path = join(dir, entry.name)
  return entry.isDirectory() ? htmlFiles(path) : entry.name.endsWith('.html') ? [path] : []
})

test('candidate Yandex paths match prerendered object keys and return 404 for misses', () => {
  assert.match(spec, /\/\{file\+\}:\s+get:[\s\S]*object: '\{file\}\/index\.html'/)
  assert.match(spec, /error_object:\s+object: 404\.html\s+statusCode: 404/)
  for (const route of ['/api/{path+}', '/assets/{file+}', '/media/{file+}', '/robots.txt', '/sitemap.xml']) assert.ok(spec.includes(`  ${route}:`))
  for (const page of publicPages()) {
    const key = page.path === '/' ? 'index.html' : `${page.path.slice(1)}/index.html`
    assert.ok(existsSync(join(dist, key)), `missing Object Storage key: ${key}`)
  }
  assert.ok(existsSync(join(dist, '404.html')))
})

test('Yandex staging mirror marks every HTML object noindex', () => {
  const run = spawnSync(process.execPath, ['ru-proxy/build.mjs', '--noindex', '--out', mirror], { encoding: 'utf8' })
  assert.equal(run.status, 0, run.stderr || run.stdout)
  const root = join(mirror, 'public')
  const files = htmlFiles(root)
  assert.ok(files.length > 100)
  for (const file of files) assert.match(readFileSync(file, 'utf8'), /<meta name="robots" content="noindex, nofollow"/)
  assert.ok(!existsSync(join(root, 'sitemap.xml')))
  assert.match(readFileSync(join(root, 'robots.txt'), 'utf8'), /Disallow: \/$/m)
})
