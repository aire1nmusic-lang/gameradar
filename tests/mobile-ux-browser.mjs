// Read-only regression for owner report #16. Every API write is aborted.
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { resolve, extname, sep } from 'node:path'
import { chromium } from 'playwright'
import { readPublicGames, readPublicCatalog } from './public-qa-data.mjs'

const fixtureDir = process.env.GS_QA_FIXTURE_DIR
const games = fixtureDir ? JSON.parse(await readFile(resolve(fixtureDir, 'games.json'))) : await readPublicGames()
const catalog = fixtureDir ? JSON.parse(await readFile(resolve(fixtureDir, 'catalog.json'))) : await readPublicCatalog()
const cards = ['lineage2', 'minecraft', 'gtarp'].flatMap(gameId => {
  const sample = catalog.items.find(s => s.gameId === gameId)
  assert.ok(sample, `Public fixture required for ${gameId}`)
  return Array.from({ length: 12 }, (_, i) => ({ ...sample,
    id: `qa-${gameId}-${i}`, slug: `qa-${gameId}-${i}`,
    name: i === 0 ? 'QA Очень длинное название игрового сервера с хрониками x1000' : `QA ${gameId} ${i}`,
    gameId, votes: 20 - i, support: { coins: 30 - i, participants: 1 },
    links: { site: 'https://example.invalid/', discord: '' }, address: '',
    launch: i === 11 ? { at: new Date(Date.now() + 86400000).toISOString() } : undefined,
  }))
})
const root = resolve('dist')
const server = createServer(async (req, res) => {
  try {
    let path = resolve(root, '.' + new URL(req.url, 'http://local').pathname)
    assert.ok(path.startsWith(root + sep))
    let body
    try { body = await readFile(path) } catch { path = root + '/index.html'; body = await readFile(path) }
    res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' })[extname(path)] ?? 'application/octet-stream')
    res.end(body)
  } catch { res.writeHead(404).end() }
})
await new Promise(r => server.listen(0, '127.0.0.1', r))
const base = `http://127.0.0.1:${server.address().port}`
const browser = await chromium.launch(process.env.GS_CHROMIUM_EXECUTABLE_PATH ? {
  executablePath: process.env.GS_CHROMIUM_EXECUTABLE_PATH,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
} : {})
const output = resolve('output/mobile-ux-qa')
await mkdir(output, { recursive: true })
const results = []
try {
  for (const [width, height] of [[320,568],[390,844],[768,1024],[1024,768],[1440,900],[844,390]]) {
    const context = await browser.newContext({ viewport: { width, height }, isMobile: width < 1024, hasTouch: width < 1024, reducedMotion: 'reduce' })
    const page = await context.newPage()
    let writes = 0
    const errors = []
    page.on('pageerror', e => errors.push(e.message))
    await page.route('**/api/v1/**', async route => {
      const req = route.request(), url = new URL(req.url()), path = url.pathname
      if (req.method() !== 'GET') { writes++; return route.abort() }
      let json = []
      if (path.endsWith('/games')) json = games
      else if (path.endsWith('/auth/me')) json = { privateCore: true, user: null, providers: [], registrationOpen: true }
      else if (path.endsWith('/people-rating')) json = cards.map(s => ({ server_id: s.id, votes: s.votes }))
      else if (path.endsWith('/support/ranking')) json = cards.map(s => ({ server_id: s.id, coins: s.support.coins, participants: 1 }))
      else if (path.endsWith('/servers')) {
        let items = cards.filter(s => !url.searchParams.get('gameId') || s.gameId === url.searchParams.get('gameId'))
        const query = url.searchParams.get('query') ?? url.searchParams.get('q')
        if (query) items = items.filter(s => s.name.toLowerCase().includes(query.toLowerCase()))
        json = { items, total: items.length, offset: 0, limit: 100 }
      } else if (/\/servers\/[^/]+$/.test(path)) json = cards.find(s => s.slug === path.split('/').at(-1) || s.id === path.split('/').at(-1))
      else if (path.includes('/copyright/restrictions/')) json = { restrictedLinks: [], restrictedMaterials: [] }
      else if (path.includes('/support/servers/')) json = { coins: 0, participants: 0, recent: [] }
      else if (path.endsWith('/payments/test/config')) json = { available: false, testOnly: true, realSalesEnabled: false }
      await route.fulfill({ json: json ?? {}, status: json === undefined ? 404 : 200 })
    })
    const noOverflow = async () => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `overflow ${width} ${page.url()}`)
    for (const game of games.filter(g => ['lineage2', 'minecraft', 'gtarp'].includes(g.id))) {
      await page.goto(base + '/' + game.slug)
      await page.locator('.gs-shelf-support .server:not(.is-skeleton)').first().waitFor()
      await noOverflow()
      const plaque = page.locator('.gs-shelf-support .server:not(.is-skeleton)').first()
      if (game.id === 'lineage2') assert.equal(await plaque.locator('.gsb-name').evaluate(e => getComputedStyle(e).color), 'rgb(255, 247, 233)')
      const box = await plaque.locator('.server-name').boundingBox()
      assert.ok(box.width > 40, `name squeezed ${width} ${game.id}`)
      await plaque.screenshot({ path: `${output}/top-${game.id}-${width}.png` })
      const profileLink = plaque.getByRole('link', { name: /^Открыть сервер/ })
      assert.equal(await profileLink.evaluate(e => getComputedStyle(e).position), 'absolute')
      await plaque.getByRole('button', { name: /^Поддержать .* за GS Coins$/ }).click()
      await page.locator('.gs-support-dialog:modal').waitFor()
      const selectedServer = await page.getByLabel('Сервер', { exact: true }).inputValue().catch(async error => {
        console.error(await page.locator('.gs-support-dialog').innerText(), errors)
        throw error
      })
      assert.equal(selectedServer, `qa-${game.id}-0`)
      assert.equal(await page.evaluate(() => document.body.style.overflow), 'hidden')
      await noOverflow()
      await page.keyboard.press('Escape')
      await page.locator('.gs-support-dialog').waitFor({ state: 'detached' })
      assert.notEqual(await page.evaluate(() => document.body.style.overflow), 'hidden')
      await page.goto(base + `/server/qa-${game.id}-0`)
      await page.getByRole('button', { name: 'Это мой сервер', exact: true }).waitFor()
      assert.equal(await page.locator('.gs-server-profile nav a').first().getAttribute('href'), '/' + game.slug)
      await page.getByRole('button', { name: 'Это мой сервер', exact: true }).click()
      await page.locator('.gs-ui-modal-panel').waitFor()
      assert.equal(await page.locator('.gs-ui-modal-panel').evaluate(e => getComputedStyle(e).backgroundColor), 'rgb(25, 28, 36)')
      const modal = await page.locator('.gs-ui-modal-panel').boundingBox()
      assert.ok(modal.x >= 0 && modal.x + modal.width <= width + 1 && modal.y >= 0 && modal.y + modal.height <= height + 1)
      await page.screenshot({ path: `${output}/claim-${game.id}-${width}.png` })
      await page.keyboard.press('Escape')
      await page.keyboard.press('/')
      await page.locator('.gs-search-surface').waitFor()
      const input = page.locator('.gs-search-surface input')
      await input.fill('QA')
      await page.getByRole('button', { name: /QA Очень длинное/ }).first().waitFor()
      const background = await page.locator('.gs-search-surface').evaluate(e => getComputedStyle(e).backgroundImage)
      assert.ok(background.includes('rgb(35, 39, 49)') && !background.includes('rgba('), background)
      await page.screenshot({ path: `${output}/search-${game.id}-${width}.png` })
      await input.press('Escape')
      if (width < 1024) {
        const cta = page.locator('.gs-profile-cta-bar')
        await cta.waitFor()
        assert.equal(await cta.evaluate(e => e.parentElement === document.body), true)
        await page.locator('footer').scrollIntoViewIfNeeded()
        const play = cta.getByRole('link', { name: 'Играть', exact: true })
        const clickable = await play.evaluate(e => { const r=e.getBoundingClientRect();return e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)) })
        assert.equal(clickable, true, 'Play covered at footer')
        await page.screenshot({ path: `${output}/footer-${game.id}-${width}.png` })
      }
      await noOverflow()
      results.push({ width, height, game: game.id, top: true, supportTarget: true, opaqueClaim: true, opaqueSearch: true, contextualHome: true, footerCTA: width < 1024 })
    }
    await page.goto(base + '/catalog?game=lineage2')
    const toolbar = page.locator('.gs-catalog-toolbar')
    await toolbar.waitFor()
    assert.equal(await toolbar.evaluate(e => getComputedStyle(e).position), 'relative')
    await noOverflow()
    await page.goto(base + '/account?game=lineage2')
    await page.locator('.gs-account-entry').waitFor()
    assert.equal(await page.locator('.gs-account-layout > header').evaluate(e => getComputedStyle(e).backgroundColor), 'rgba(0, 0, 0, 0)')
    await noOverflow()
    await page.screenshot({ path: `${output}/account-${width}.png` })
    assert.equal(writes, 0)
    assert.deepEqual(errors, [])
    await context.close()
    console.log(`PASS ${width}x${height}: 3 games, TOP-3, Coins, Claim, search, footer, navigation, filters, account; no writes`)
  }
  await writeFile(`${output}/report.json`, JSON.stringify(results, null, 2))
} finally { await browser.close(); await new Promise(r => server.close(r)) }
