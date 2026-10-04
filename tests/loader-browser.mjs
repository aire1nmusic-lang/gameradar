import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFile, mkdir } from 'node:fs/promises'
import { resolve, extname, sep } from 'node:path'
import { chromium } from 'playwright'

// Only anonymous public reads. Delays/errors are intercepted in this browser.
const live = process.env.LOADER_BASE_URL
const gamesResponse = await fetch('https://gamescout.online/api/v1/games', { signal: AbortSignal.timeout(15000) })
assert.equal(gamesResponse.status, 200)
const games = await gamesResponse.text()
assert.ok(Array.isArray(JSON.parse(games)))
let server
let base = live
if (!base) {
  const root = resolve('dist')
  server = createServer(async (req, res) => {
    try {
      const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname)
      let file = resolve(root, '.' + path)
      if (file !== root && !file.startsWith(root + sep)) throw new Error('Invalid path')
      if (!extname(file)) file += '/index.html'
      let body
      try { body = await readFile(file) } catch { body = await readFile(root + '/index.html'); file = 'index.html' }
      const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.woff2': 'font/woff2' }
      res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream' }).end(body)
    } catch { res.writeHead(404).end() }
  })
  await new Promise(r => server.listen(4177, '127.0.0.1', r))
  base = 'http://127.0.0.1:4177'
}
await mkdir('output/loader-qa', { recursive: true })
const browser = await chromium.launch({ headless: true })
const matrix = [[320,568],[390,844],[844,390],[768,1024],[1024,768],[1024,800],[1440,900],[1920,1080]]
async function setup(width, height, mode, path = '/') {
  const context = await browser.newContext({ viewport: { width, height } })
  const page = await context.newPage()
  await page.addInitScript(() => {
    window.__loaderShown = false
    new MutationObserver(() => {
      if (document.documentElement.classList.contains('gs-loader-visible')) window.__loaderShown = true
    }).observe(document, { attributes: true, subtree: true, attributeFilter: ['class'] })
  })
  let release
  const gate = new Promise(r => { release = r })
  let failing = mode === 'error'
  await page.route('**/*', async route => {
    const url = new URL(route.request().url())
    if (url.pathname === '/api/v1/games') {
      if (mode === 'slow') await gate
      if (failing) return route.fulfill({ status: 503, json: { error: { message: 'Test unavailable' } } })
      return route.fulfill({ status: 200, contentType: 'application/json', body: games })
    }
    // Block scenery/fonts entirely: neither may prevent startup.
    if (/\.(?:webp|png|jpe?g|woff2?)(?:$)/.test(url.pathname) || /fonts\.(?:googleapis|gstatic)\.com/.test(url.hostname)) return route.abort()
    if (url.pathname.startsWith('/api/')) {
      return route.fulfill({ status: 200, json: url.pathname.includes('/auth/') ? { user: null } : url.pathname.includes('/servers') ? { items: [], total: 0 } : [] })
    }
    if (route.request().method() !== 'GET') return route.abort()
    return route.continue()
  })
  await page.goto(base + path, { waitUntil: 'domcontentloaded' })
  return { page, context, release, recover: () => { failing = false } }
}
async function ready(page) {
  await page.waitForFunction(() => !document.querySelector('.gs-loader') && !document.querySelector('#root .seo-snapshot'), { timeout: 15000 })
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains('gs-loader-visible')), false)
  assert.ok(await page.locator('#root').innerText())
}
try {
  for (const [width, height] of matrix) {
    const fast = await setup(width, height, 'fast')
    await ready(fast.page)
    assert.equal(await fast.page.evaluate(() => window.__loaderShown), false, 'Fast boot must not flash loader')
    await fast.context.close()

    const slow = await setup(width, height, 'slow')
    await slow.page.waitForFunction(() => document.documentElement.classList.contains('gs-loader-visible'))
    const rect = await slow.page.locator('.gs-box').boundingBox()
    assert.ok(rect && rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= width && rect.y + rect.height <= height, 'Loader fits viewport')
    assert.equal(await slow.page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'No horizontal overflow')
    await slow.page.screenshot({ path: 'output/loader-qa/loader-' + width + 'x' + height + '.png' })
    const releasedAt = Date.now()
    slow.release()
    await ready(slow.page)
    assert.ok(Date.now() - releasedAt < 650, 'No artificial minimum display time')
    await slow.context.close()
    console.log('PASS fast/slow, blocked fonts/background, viewport ' + width + 'x' + height)
  }
  const failure = await setup(390,844,'error')
  await failure.page.getByRole('button', { name: 'Повторить', exact: true }).waitFor()
  failure.recover()
  await failure.page.getByRole('button', { name: 'Повторить', exact: true }).click()
  await ready(failure.page)
  await failure.context.close()
  const nested = await setup(768,1024,'slow','/lineage-2')
  await nested.page.waitForFunction(() => document.documentElement.classList.contains('gs-loader-visible'))
  nested.release()
  await ready(nested.page)
  await nested.context.close()
  console.log('PASS retry and prerendered nested route; ' + (live ? 'production assets' : 'local build'))
} finally {
  await browser.close()
  if (server) await new Promise(r => server.close(r))
}
