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
  let failing = mode === 'error' || mode === 'image-error'
  const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jrP8AAAAASUVORK5CYII=', 'base64')
  if (mode === 'cached') await page.addInitScript(games => {
    localStorage.setItem('gs.games.v1', JSON.stringify({ at: Date.now(), games: JSON.parse(games) }))
  }, games)
  await page.route('**/*', async route => {
    const url = new URL(route.request().url())
    if (url.pathname === '/api/v1/games') {
      if (mode === 'slow' || mode === 'cached') await gate
      if (mode === 'error' && failing) return route.fulfill({ status: 503, json: { error: { message: 'Test unavailable' } } })
      return route.fulfill({ status: 200, contentType: 'application/json', body: games })
    }
    if (url.pathname.startsWith('/media/hub/')) {
      if (mode === 'real-images') return route.continue()
      if (mode === 'visual-slow') await gate
      if (mode === 'image-error' && failing) return route.abort()
      return route.fulfill({ status: 200, contentType: 'image/png', body: pixel })
    }
    // Optional fonts never hold boot. Critical images have a separate gate.
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
  await page.waitForFunction(() => !document.querySelector('.gs-loader') && !document.documentElement.classList.contains('gs-boot-pending'), null, { timeout: 15000 })
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains('gs-loader-visible')), false)
  assert.ok(await page.locator('#root').innerText())
}
try {
  for (const [width, height] of matrix) {
    const fast = await setup(width, height, 'fast')
    await ready(fast.page)
    assert.equal(await fast.page.evaluate(() => window.__loaderShown), false, 'Fast boot must not flash loader')
    await fast.context.close()

    const slow = await setup(width, height, 'visual-slow')
    await slow.page.waitForFunction(() => document.documentElement.classList.contains('gs-loader-visible'))
    await slow.page.waitForFunction(() => getComputedStyle(document.querySelector('.gs-loader')).opacity === '1')
    assert.equal(await slow.page.locator('#root').evaluate(el => getComputedStyle(el).visibility), 'hidden', 'Incomplete hall stays hidden')
    assert.equal(await slow.page.locator('.gs-loader').getByText('Подготавливаем миры', { exact: false }).count(), 1)
    const rect = await slow.page.locator('.gs-box').boundingBox()
    assert.ok(rect && rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= width && rect.y + rect.height <= height, 'Loader fits viewport')
    assert.equal(await slow.page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'No horizontal overflow')
    await slow.page.screenshot({ path: 'output/loader-qa/loader-' + width + 'x' + height + '.png' })
    const releasedAt = Date.now()
    slow.release()
    await ready(slow.page)
    assert.ok(Date.now() - releasedAt < 650, 'No artificial minimum display time')
    assert.equal(await slow.page.evaluate(() => [...document.querySelectorAll('[data-boot-visual]')].filter(i => i.getBoundingClientRect().width > 0 && i.complete && i.naturalWidth > 0).length), 4, 'Reveal contains background and all three cards')
    await slow.context.close()
    const actual = await setup(width, height, 'real-images')
    await ready(actual.page)
    assert.equal(await actual.page.evaluate(() => [...document.querySelectorAll('[data-boot-visual]')].filter(i => i.getBoundingClientRect().width > 0 && i.complete && i.naturalWidth > 1).length), 4, 'Real responsive assets must load')
    await actual.page.screenshot({ path: 'output/loader-qa/hall-ready-' + width + 'x' + height + '.png' })
    await actual.context.close()
    console.log('PASS fast/slow images, hidden incomplete hall, decoded background + 3 cards, viewport ' + width + 'x' + height)
  }
  const cached = await setup(390,844,'cached')
  await ready(cached.page)
  assert.equal(await cached.page.evaluate(() => window.__loaderShown), false, 'Cached games render cards while refresh remains pending')
  cached.release()
  await cached.context.close()
  console.log('PASS cached games with delayed background API refresh')
  const broken = await setup(390,844,'image-error')
  await broken.page.getByRole('button', { name: 'Повторить', exact: true }).waitFor()
  assert.equal(await broken.page.locator('#root').evaluate(el => getComputedStyle(el).visibility), 'hidden')
  broken.recover()
  await broken.page.getByRole('button', { name: 'Повторить', exact: true }).click()
  await ready(broken.page)
  await broken.context.close()
  console.log('PASS image failure keeps prepared loader, reload retry recovers')
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
