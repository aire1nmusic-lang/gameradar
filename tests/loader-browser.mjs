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
  page.on('requestfailed', request => {
    if (request.url().includes('/media/hub/')) console.log('IMAGE REQUEST FAILED', request.url(), request.failure())
  })
  page.on('console', message => {
    if (message.type() === 'error') console.log('BROWSER ERROR', message.text())
  })
  page.on('pageerror', error => console.log('BROWSER PAGE ERROR', error.message))

  await page.addInitScript(() => {
    window.__loaderShown = false
    new MutationObserver(() => {
      if (document.documentElement.classList.contains('gs-loader-visible')) window.__loaderShown = true
    }).observe(document, { attributes: true, subtree: true, attributeFilter: ['class'] })
  })
  let release
  const gate = new Promise(r => { release = r })
  let failing = mode === 'error' || mode === 'image-error'
  const pixel = '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="#123456"/></svg>'
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
      if (mode === 'real-images' || mode === 'inner-pages') return route.continue()
      if (mode === 'visual-slow') await gate
      if (mode === 'image-error' && failing) return route.abort()
      return route.fulfill({ status: 200, contentType: 'image/svg+xml', body: pixel })
    }
    if (mode === 'inner-pages' && url.pathname.startsWith('/media/')) return route.continue()
    // Optional fonts never hold boot. Critical images have a separate gate.
    if (/\.(?:webp|png|jpe?g|woff2?)(?:$)/.test(url.pathname) || /fonts\.(?:googleapis|gstatic)\.com/.test(url.hostname)) return route.abort()
    if (url.pathname.startsWith('/api/')) {
      return route.fulfill({ status: 200, json: url.pathname.includes('/auth/') ? { user: null, privateCore: true, providers: ['google', 'discord'], registrationOpen: false } : url.pathname.includes('/servers') ? { items: [], total: 0 } : [] })
    }
    if (route.request().method() !== 'GET') return route.abort()
    return route.continue()
  })
  await page.goto(base + path, { waitUntil: 'domcontentloaded' })
  return { page, context, release, recover: () => { failing = false } }
}
async function ready(page) {
  try {
    await page.waitForFunction(() => !document.querySelector('.gs-loader') && !document.documentElement.classList.contains('gs-boot-pending'), null, { timeout: 15000 })
  } catch (error) {
    console.log('BOOT DIAGNOSTIC', await page.evaluate(() => ({
      classes: document.documentElement.className,
      error: document.querySelector('[role="alert"]')?.textContent,
      root: document.querySelector('#root')?.textContent?.slice(0,800),
      games: localStorage.getItem('gs.games.v1')?.slice(0,500),
      images: [...document.querySelectorAll('[data-boot-visual]')].map(i => ({ src: i.currentSrc || i.src, width: i.getBoundingClientRect().width, complete: i.complete, natural: i.naturalWidth })),
    })))
    await page.screenshot({ path: 'output/loader-qa/boot-failure.png' })
    throw error
  }
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
    // The prepared screen must remain absent during the short black boot phase.
    await slow.page.waitForFunction(() => document.documentElement.classList.contains('gs-boot-pending'))
    if (!(await slow.page.evaluate(() => window.__loaderShown))) {
      assert.equal(await slow.page.locator('body').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(0, 0, 0)')
      assert.equal(await slow.page.locator('.gs-loader').evaluate(el => getComputedStyle(el).visibility), 'hidden')
      assert.equal(await slow.page.locator('#root').evaluate(el => getComputedStyle(el).visibility), 'hidden')
    }
    await slow.page.waitForFunction(() => document.documentElement.classList.contains('gs-loader-visible'))
    await slow.page.locator('.gs-box').evaluate(el => Promise.all(el.getAnimations().map(animation => animation.finished)))
    assert.equal(await slow.page.locator('.gs-firefly').count(), 3, 'Original attachment has exactly three lights')
    assert.deepEqual(await slow.page.locator('.gs-mark path').evaluateAll(paths => paths.map(path => path.getAttribute('fill'))), ['#e9edf2', '#34e6f5'])
    assert.equal(await slow.page.locator('.gs-boot-logo').evaluate(el => el.getBoundingClientRect().width), width <= 600 ? 65 : width >= 1200 ? 150 : 110)
    assert.equal(await slow.page.locator('.gs-name').evaluate(el => getComputedStyle(el).fontSize), width <= 600 ? '32px' : width >= 1200 ? '68px' : '48px')
    assert.equal(await slow.page.locator('.gs-loader').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(7, 9, 13)')
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
    const shades = await actual.page.locator('section [aria-hidden] .bg-gradient-to-b, section [aria-hidden] .bg-gradient-to-t').evaluateAll(els => els.map(el => getComputedStyle(el).backgroundImage))
    await actual.page.getByRole('button', { name: 'Включить светлую тему', exact: true }).click()
    await actual.page.waitForFunction(() => document.documentElement.dataset.colorMode === 'light')
    const headerChrome = await actual.page.locator('.gs-hall-header').evaluate(el => ({ background: getComputedStyle(el).backgroundColor, shadow: getComputedStyle(el).boxShadow, border: getComputedStyle(el).borderBottomWidth }))
    assert.deepEqual(headerChrome, { background: 'rgba(0, 0, 0, 0)', shadow: 'none', border: '0px' }, 'Light home header remains transparent')
    assert.notDeepEqual(await actual.page.locator('section [aria-hidden] .bg-gradient-to-b, section [aria-hidden] .bg-gradient-to-t').evaluateAll(els => els.map(el => getComputedStyle(el).backgroundImage)), shades, 'Light home visibly changes hall shading')
    assert.equal(await actual.page.locator('.gs-home-hall .gs-hall-drift').first().evaluate(el => getComputedStyle(el).filter), 'brightness(1.22) saturate(0.92)', 'Light mode illuminates the actual hall')
    const lightShades = await actual.page.locator('.gs-hall-shade-top, .gs-hall-shade-bottom, .gs-hall-shade-mobile').evaluateAll(els => els.map(el => getComputedStyle(el).backgroundImage))
    assert.ok(lightShades.every(shade => shade.includes('244, 238, 229') && !shade.includes('rgb(244, 238, 229)')), 'Light shading stays translucent, without opaque bands')
    assert.ok(shades.length > 0, 'Hall shading was inspected')
    assert.equal(await actual.page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'Light home has no overflow')
    await actual.page.screenshot({ path: 'output/loader-qa/hall-light-' + width + 'x' + height + '.png' })
    if (width === 390) {
      assert.equal(await actual.page.evaluate(() => localStorage.getItem('gs.color-mode.v1')), 'light')
      await actual.page.reload({ waitUntil: 'domcontentloaded' })
      await ready(actual.page)
      assert.equal(await actual.page.evaluate(() => document.documentElement.dataset.colorMode), 'light', 'Light home persists after reload')
      assert.equal(await actual.page.locator('.gs-hall-header').evaluate(el => getComputedStyle(el).backgroundColor), 'rgba(0, 0, 0, 0)')
    }
    await actual.page.getByRole('button', { name: 'Включить тёмную тему', exact: true }).click()
    await actual.page.waitForFunction(() => document.documentElement.dataset.colorMode === 'dark')
    assert.deepEqual(await actual.page.locator('section [aria-hidden] .bg-gradient-to-b, section [aria-hidden] .bg-gradient-to-t').evaluateAll(els => els.map(el => getComputedStyle(el).backgroundImage)), shades, 'Dark home shading restores after toggling back')
    await actual.context.close()
    console.log('PASS fast/slow images, hidden incomplete hall, decoded background + 3 cards, viewport ' + width + 'x' + height)
  }
  // Anonymous read-only inner pages: header artwork and content must not overlap.
  for (const [width, height] of matrix) {
    for (const path of ['/account', '/lineage-2', '/minecraft', '/gta-rp', '/catalog']) {
      const inner = await setup(width, height, 'inner-pages', path)
      await ready(inner.page)
      if (path === '/account') await inner.page.locator('.gs-account-entry').waitFor()
      await inner.page.locator('main img').evaluateAll(images => Promise.all(images.filter(img => !img.closest('details:not([open])') && img.getBoundingClientRect().width > 0).map(img => img.decode().catch(() => {}))))
      for (const theme of ['dark', 'light']) {
        if (theme === 'light') await inner.page.getByRole('button', { name: 'Включить светлую тему', exact: true }).click()
        await inner.page.waitForFunction(mode => document.documentElement.dataset.colorMode === mode, theme)
        const chrome = await inner.page.locator('.gs-site-header').evaluate(el => ({ background: getComputedStyle(el).backgroundColor, shadow: getComputedStyle(el).boxShadow, border: getComputedStyle(el).borderBottomWidth, blur: getComputedStyle(el).backdropFilter }))
        assert.deepEqual(chrome, { background: 'rgba(0, 0, 0, 0)', shadow: 'none', border: '0px', blur: 'none' }, 'Header has no painted strip on ' + path + '/' + theme)
        const footerChrome = await inner.page.locator('.gs-site-footer').evaluate(el => ({ background: getComputedStyle(el).backgroundColor, border: getComputedStyle(el).borderTopWidth, shadow: getComputedStyle(el).boxShadow }))
        assert.deepEqual(footerChrome, { background: 'rgba(0, 0, 0, 0)', border: '0px', shadow: 'none' }, 'Footer has no painted band')
        if (width < 768) {
          const bottomChrome = await inner.page.locator('.gs-mobile-nav').evaluate(el => ({ background: getComputedStyle(el).backgroundColor, border: getComputedStyle(el).borderTopWidth, shadow: getComputedStyle(el).boxShadow, blur: getComputedStyle(el).backdropFilter }))
          assert.deepEqual(bottomChrome, { background: path === '/lineage-2' ? 'rgba(0, 0, 0, 0)' : theme === 'light' ? 'rgba(251, 247, 238, 0.97)' : 'rgba(13, 16, 24, 0.97)', border: '0px', shadow: 'none', blur: 'none' }, 'Bottom controls have a readable surface over scrolling content')
          if (path === '/lineage-2') {
            const gradient = await inner.page.locator('.gs-mobile-nav').evaluate(el => getComputedStyle(el).backgroundImage)
            assert.ok(gradient.startsWith('linear-gradient('), 'L2 bottom controls retain a readable gradient')
            assert.ok(gradient.includes(theme === 'light' ? 'rgb(215, 220, 224)' : 'rgb(10, 16, 24)'), 'L2 gradient matches theme')
            assert.ok(gradient.includes('rgba(0, 0, 0, 0)'), 'L2 gradient fades into page without a strip')
          }
          assert.equal(await inner.page.locator('.gs-mobile-nav a').count(), path === '/lineage-2' ? 4 : 5)
        }
        if (path === '/account') assert.ok((await inner.page.locator('.gs-account-entry').boundingBox()).height >= height, 'Account scenery reaches viewport bottom with no empty theme-colored gap')
        const headerRect = await inner.page.locator('.gs-site-header').boundingBox()
        assert.equal(headerRect.y, 0)
        const heading = inner.page.locator('main h1').first()
        if (await heading.count()) assert.ok((await heading.boundingBox()).y >= headerRect.height, 'Heading clears header on ' + path)
        if (path === '/account' || ['/lineage-2', '/minecraft', '/gta-rp'].includes(path)) {
          const art = inner.page.locator(path === '/account' ? '.gs-account-entry' : path === '/lineage-2' ? '.l2a .scene' : '.gs-hero').first()
          assert.equal((await art.boundingBox()).y, 0, 'Page artwork starts behind header on ' + path)
        }
        assert.equal(await inner.page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'Inner page has no horizontal overflow on ' + path)
        if (path === '/account' || path === '/lineage-2' || width === 390 || width === 1440) await inner.page.screenshot({ path: 'output/loader-qa/inner-' + path.slice(1) + '-' + theme + '-' + width + 'x' + height + '.jpg', type: 'jpeg', quality: 82 })
      }
      await inner.context.close()
      console.log('PASS clear header dark/light, artwork under header, content bounds ' + path + ' ' + width + 'x' + height)
    }
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
