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
    logoUrl: '', gameId, ...(gameId === 'lineage2' ? { version: ['Interlude', 'High Five', 'Essence', 'C4'][i % 4], chronicleId: i % 4 === 3 ? undefined : ['interlude', 'high-five', 'essence'][i % 4] } : {}), votes: 20 - i, support: { coins: 30 - i, participants: 1 },
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
// A geometry-only pass can capture a black placeholder before the CSS scene has decoded.
const mediaReady = page => page.evaluate(async () => {
  const sources = new Set()
  for (const element of document.querySelectorAll('.gs-account-layout,.gs-server-bg,.l2a .scene,.gs-shelf-support .server,img')) {
    if (element instanceof HTMLImageElement && element.src) sources.add(element.currentSrc || element.src)
    for (const pseudo of [null,'::before','::after']) {
      for (const match of getComputedStyle(element,pseudo).backgroundImage.matchAll(/url\(["']?([^"')]+)["']?\)/g)) sources.add(match[1])
    }
  }
  const local = [...sources].map(source=>new URL(source,location.href)).filter(url=>url.origin===location.origin&&url.pathname.startsWith('/media/'))
  await Promise.all(local.map(url=>new Promise((resolve,reject)=>{
    const image=new Image(),timer=setTimeout(()=>reject(Error('Media decode timed out: '+url.pathname)),15000)
    image.src=url.href
    image.decode().then(()=>{clearTimeout(timer);resolve()}).catch(()=>{clearTimeout(timer);reject(Error('Media decode failed: '+url.pathname))})
  })))
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))
})
try {
  for (const [width, height] of [[320,568],[390,844],[768,1024],[1024,768],[1440,900],[844,390]]) {
    const context = await browser.newContext({ viewport: { width, height }, isMobile: width < 1024, hasTouch: width < 1024, reducedMotion: 'reduce' })
    const page = await context.newPage()
    let writes = 0
    let authUnavailable = false
    const errors = []
    page.on('pageerror', e => errors.push(e.message))
    await page.route('**/api/v1/**', async route => {
      const req = route.request(), url = new URL(req.url()), path = url.pathname
      if (req.method() !== 'GET') { writes++; return route.abort() }
      let json = []
      if (path.endsWith('/auth/me') && authUnavailable) return route.fulfill({ status: 503, json: {error:{code:'private_api_required',message:'Private upstream is not a user-facing explanation'}} })
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
      // LIVE must actually advance on touch, while respecting reduced motion.
      const liveTrack=page.locator('.gs-live-track')
      await liveTrack.waitFor({state:'visible'})
      await page.emulateMedia({reducedMotion:'no-preference'})
      const motion=await liveTrack.evaluate(e=>({name:getComputedStyle(e).animationName,state:getComputedStyle(e).animationPlayState,transform:getComputedStyle(e).transform}))
      assert.notEqual(motion.name,'none','LIVE autoplay is enabled without a reduced-motion preference')
      assert.equal(motion.state,'running','LIVE is not frozen by mobile hover styles')
      await page.waitForTimeout(180)
      assert.notEqual(await liveTrack.evaluate(e=>getComputedStyle(e).transform),motion.transform,'LIVE content advances rather than showing a static badge')
      if(width<1024) {
        await page.locator('.gs-live-view').hover()
        assert.equal(await liveTrack.evaluate(e=>getComputedStyle(e).animationPlayState),'running','Touch hover does not leave the ticker paused')
        await page.mouse.move(0,0)
      }
      await page.emulateMedia({reducedMotion:'reduce'})
      assert.equal(await liveTrack.evaluate(e=>getComputedStyle(e).animationName),'none','Reduced motion keeps the strip static')
      await noOverflow()
      if (game.id === 'lineage2') {
        const picker = page.locator('.gs-inline-picker')
        const summary = picker.locator('summary')
        const search = page.getByRole('searchbox', { name: 'Поиск по названию или рейтам', exact: true })
        await search.fill('QA')
        // The product currently defaults to dark; exercise the retained light CSS too.
        for (const mode of ['dark', 'light']) {
          await page.evaluate(mode => { document.documentElement.dataset.colorMode = mode }, mode)
          assert.equal(await picker.getAttribute('open'), null)
          const before = await page.locator('#l2-catalog').evaluate(e => e.getBoundingClientRect().top + scrollY)
          await summary.click()
          const grid = picker.getByRole('navigation', { name: 'Выбрать хроники', exact: true })
          await grid.waitFor({ state: 'visible' })
          const gridBox = await grid.boundingBox()
          const pickerBox = await picker.boundingBox()
          const searchBox = await search.boundingBox()
          const summaryBox = await summary.boundingBox()
          assert.ok(summaryBox.width >= pickerBox.width - 3, 'The entire panel heading is clickable, not a narrow generic button')
          assert.ok(summaryBox.y >= searchBox.y + searchBox.height - 1, 'Picker is below search at every width')
          assert.ok(gridBox.y >= summaryBox.y + summaryBox.height - 1, 'Grid is below its heading')
          const after = await page.locator('#l2-catalog').evaluate(e => e.getBoundingClientRect().top + scrollY)
          assert.ok(after - before >= gridBox.height - 3, 'Open grid pushes shelves down instead of covering them')
          assert.equal(await grid.evaluate(e => getComputedStyle(e).position), 'static')
          assert.equal(await grid.locator('a').count(), 4)
          for (const tile of await grid.locator('a').all()) {
            const r = await tile.boundingBox()
            assert.ok(r.width >= 44 && r.height >= 44, 'Chronicle touch target')
            assert.ok(r.height <= 155, 'Compact chronicles leave room for the catalog at every width')
            const imageBox = await tile.locator('img').boundingBox()
            const captionBox = await tile.locator('.gs-inline-caption').boundingBox()
            assert.ok(imageBox.height <= 95, 'Chronicle illustration stays compact on desktop and mobile')
            assert.ok(captionBox.y >= imageBox.y + imageBox.height - 1, 'Chronicle name has its own matte strip below the artwork')
            assert.ok(captionBox.height >= 44 && captionBox.x >= r.x && captionBox.x + captionBox.width <= r.x + r.width + 1, 'Readable label stays inside the card')
            assert.equal(await tile.locator('.gs-inline-caption').evaluate(e => e.scrollWidth <= e.clientWidth), true, 'Chronicle label is not clipped')
            assert.equal(await tile.locator('.gs-inline-caption').evaluate(e => getComputedStyle(e).color), mode === 'dark' ? 'rgb(255, 247, 233)' : 'rgb(23, 33, 40)', 'Chronicle captions keep readable theme-appropriate contrast on matte glass')
            const framing = await tile.locator('img').evaluate(image => {
              const css=getComputedStyle(image),mobile=matchMedia('(max-width:767px)').matches
              const expected=image.style.getPropertyValue(mobile?'--chronicle-focus-mobile':'--chronicle-focus-desktop').trim()
              return {actual:css.objectPosition,expected}
            })
            assert.equal(framing.actual,framing.expected,'Mobile and desktop use their own subject framing')
            assert.ok(framing.actual.endsWith('0%'),'The top of the artwork is preserved rather than cutting off heads')
          }
          await grid.locator('img').evaluateAll(images => Promise.all(images.map(image => image.decode())))
          const thumbnails=await grid.locator('img').evaluateAll(images=>images.map(image=>image.currentSrc))
          assert.equal(new Set(thumbnails).size,4,'All four chronicle thumbnails have different source images')
          assert.ok(await grid.getByRole('link',{name:'Другие хроники',exact:true}).locator('img').getAttribute('src').then(src=>src.includes('chronicle-classic-dwarf-v2')),'Other chronicles use the approved dwarf')
          assert.ok(await grid.getByRole('link',{name:'Essence',exact:true}).locator('img').getAttribute('src').then(src=>src.includes('chronicle-classic-approved-v1')),'Essence uses the approved village traveller')
          await noOverflow()
          assert.equal(await search.inputValue(), 'QA', 'Expanding keeps the search query')
          await page.screenshot({ path: `${output}/chronicles-${width}-${mode}.png` })
          // Small cropped render proof in the logs supports visual review without a local browser.
          if(mode==='dark'&&[390,1440].includes(width)) {
            const proof=await picker.screenshot({type:'jpeg',quality:78})
            console.log('CHRONICLE_CROP_PROOF '+width+' '+proof.toString('base64'))
          }
          await picker.getByRole('link', { name: 'Все серверы', exact: true }).press('Escape')
          assert.equal(await picker.getAttribute('open'), null)
          assert.equal(await summary.evaluate(e => e === document.activeElement), true, 'Escape restores summary focus')
          await summary.press('Enter')
          await picker.getByRole('link', { name: 'Все серверы', exact: true }).click()
          assert.equal(await picker.getAttribute('open'), null, 'Selecting current era closes without route change')
        }
        await page.evaluate(() => { document.documentElement.dataset.colorMode = 'dark' })
        await search.fill('')
        await summary.click()
        const target = game.chronicles[0]
        await picker.getByRole('link', { name: target.label, exact: true }).click()
        await page.waitForURL(base + '/' + game.slug + '/' + target.slug)
        await page.locator('.gs-inline-current').filter({ hasText: target.label }).waitFor()
        assert.equal(await page.locator('.gs-inline-picker').getAttribute('open'), null)
        await page.locator('.gs-inline-summary').click()
        assert.equal(await page.getByRole('navigation', { name: 'Выбрать хроники', exact: true }).getByRole('link', { name: target.label, exact: true }).getAttribute('aria-current'), 'page')
        await noOverflow()
        await page.getByRole('navigation', { name: 'Выбрать хроники', exact: true }).getByRole('link', { name: 'Другие хроники', exact: true }).click()
        await page.waitForURL(base + '/' + game.slug + '/other')
        await page.locator('.gs-inline-current').filter({ hasText: 'Другие хроники' }).waitFor()
        await page.waitForFunction(() => document.querySelectorAll('.gs-shelf-people .server:not(.is-skeleton)').length === 3)
        assert.equal(await page.locator('.gs-shelf-people .server:not(.is-skeleton)').count(), 3, 'Other chronicles includes all unassigned C4 cards and excludes the three main versions')
        await page.locator('.gs-inline-summary').click()
        await page.getByRole('link', { name: 'Все серверы', exact: true }).click()
        await page.waitForURL(base + '/' + game.slug)
        await page.locator('.gs-shelf-support .server:not(.is-skeleton)').first().waitFor()
      }
      if (game.id === 'minecraft') {
        const picker = page.locator('.gs-inline-picker')
        const search = page.getByRole('searchbox', { name: 'Поиск по названию или рейтам', exact: true })
        const searchBox = await search.boundingBox()
        const summaryBox = await picker.locator('summary').boundingBox()
        assert.ok(summaryBox.y >= searchBox.y + searchBox.height - 1, 'Minecraft modes follow search without overlap')
        assert.ok((await page.locator('.l2a--minecraft .hero').boundingBox()).height < 340, 'Minecraft hero stays compact')
        assert.match(await page.locator('.l2a--minecraft .hero h1').evaluate(e=>getComputedStyle(e).fontFamily), /Pixelify Sans/, 'Minecraft retains its own block display face instead of the shared fantasy font')
        await picker.locator('summary').click()
        const modes = picker.getByRole('navigation', { name: 'Выбрать режим', exact: true })
        await modes.waitFor({ state: 'visible' })
        assert.equal(await modes.getByRole('link').count(), game.chronicles.length)
        await noOverflow()
        if (game.chronicles.length) {
          const target = game.chronicles[0]
          await modes.getByRole('link', { name: target.label, exact: true }).click()
          await page.waitForURL(base + '/' + game.slug + '/' + target.slug)
          await page.locator('.gs-inline-current').filter({hasText:target.label}).waitFor()
          assert.equal(await page.locator('.gs-inline-picker').getAttribute('open'), null)
          await page.locator('.gs-inline-summary').click()
          await page.getByRole('link', {name:'Все серверы',exact:true}).click()
          await page.waitForURL(base + '/' + game.slug)
          await page.locator('.gs-shelf-support .server:not(.is-skeleton)').first().waitFor()
        } else await picker.locator('summary').press('Escape')
        await mediaReady(page)
        await page.screenshot({path:`${output}/minecraft-world-${width}.png`})
        if ([390,1440].includes(width)) console.log('MINECRAFT_PROOF '+width+' '+(await page.screenshot({type:'jpeg',quality:70})).toString('base64'))
      }
      const plaque = page.locator('.gs-shelf-support .server:not(.is-skeleton)').first()
      await mediaReady(page)
      if (game.id === 'lineage2') assert.equal(await plaque.locator('.gsb-name').evaluate(e => getComputedStyle(e).color), 'rgb(255, 247, 233)')
      if (game.id === 'minecraft' || game.id === 'gtarp') {
        for (const rank of [1, 2, 3]) {
          const badge = page.locator(`.gs-shelf-support .server[data-rank="${rank}"] .gs-rank-medal`)
          assert.equal(await badge.getAttribute('aria-label'), `Место ${rank}`)
          assert.equal(await badge.getAttribute('data-game-rank'), game.id)
          const art = page.locator(`.gs-shelf-support .server[data-rank="${rank}"] .gs-game-plaque img`)
          assert.equal(await art.getAttribute('src'), `/media/ranks/${game.id}-top-${rank}-character-v1-800.webp`)
          assert.ok(await art.evaluate(e => e.complete && e.naturalWidth === 800), 'Character plaque decodes')
          const artBounds = await art.evaluate(e => {
            const picture = e.getBoundingClientRect(), row = e.closest('.server').getBoundingClientRect()
            return { pictureWidth:picture.width, pictureHeight:picture.height, rowWidth:row.width, rowHeight:row.height }
          })
          assert.ok(Math.abs(artBounds.pictureWidth-artBounds.rowWidth) <= 1 && Math.abs(artBounds.pictureHeight-artBounds.rowHeight) <= 1, 'Character artwork fills the whole plaque behind its information grid')
          assert.notEqual(await badge.evaluate(e => getComputedStyle(e.closest('.server'), '::after').backgroundImage), 'none', 'Information band is a separate CSS layer')
          const content = await badge.evaluate(e => {
            const row = e.closest('.server'), rect = row.getBoundingClientRect()
            const name = row.querySelector('.server-name').getBoundingClientRect()
            const meta = row.querySelector('.server-meta').getBoundingClientRect()
            const metric = row.querySelector('.server-right').getBoundingClientRect()
            const fav = row.querySelector('.fav').getBoundingClientRect()
            return { nameHeight:name.height, metaBottom:meta.bottom-rect.top, rowHeight:rect.height, metricRight:metric.right, favLeft:fav.left }
          })
          assert.ok(content.nameHeight <= 22, 'Long plaque name stays on one line')
          assert.ok(content.metaBottom <= content.rowHeight - 6, 'Mode caption remains inside the plaque')
          assert.ok(content.metricRight <= content.favLeft + 1, `Counter does not overlap favourite: ${game.id} ${width}px rank${rank} ${JSON.stringify(content)}`)

          const icon = badge.locator('img')
          assert.equal(await icon.getAttribute('src'), `/media/ranks/${game.id}-rank-${rank}-approved-v1.webp`)
          assert.ok(await icon.evaluate(e => e.complete && e.naturalWidth === 192), 'Approved rank icon decodes')
          assert.equal(await badge.evaluate(e => getComputedStyle(e).backgroundImage), 'none', 'No legacy slab behind transparent icon')
          const rect = await badge.boundingBox()
          assert.ok(rect.width > 0 && rect.width <= 80 && rect.height <= 80, 'Rank icon stays within its plaque area')
        }
      }
      const box = await plaque.locator('.server-name').boundingBox()
      assert.ok(box.width > 40, `name squeezed ${width} ${game.id}`)
      await plaque.screenshot({ path: `${output}/top-${game.id}-${width}.png` })
      if (game.id === 'lineage2') await page.locator('.gs-shelf-people .server:not(.is-skeleton)').first().screenshot({ path: `${output}/top-people-${game.id}-${width}.png` })
      const profileLink = plaque.getByRole('link', { name: /^Открыть сервер/ })
      assert.equal(await profileLink.evaluate(e => getComputedStyle(e).position), 'absolute')
      await plaque.getByRole('button', { name: /^Поддержать .* за GS Coins$/ }).click()
      await page.locator('.gs-support-dialog:modal').waitFor()
      const selectedServer = await page.getByLabel('Сервер', { exact: true }).inputValue().catch(async error => {
        console.error(await page.locator('.gs-support-dialog').innerText(), errors)
        throw error
      })
      assert.equal(selectedServer, `qa-${game.id}-0`)
      const studio = page.locator('.gs-support-studio')
      for (const heading of await page.locator('.gs-support-dialog-head h2,.gs-support-preview h3').all()) assert.equal(await heading.evaluate(e=>getComputedStyle(e).color),'rgb(255, 247, 233)','Support headings remain readable on smoked glass')
      assert.equal(await page.locator('.gs-support-login').evaluate(e => getComputedStyle(e).backgroundColor), 'rgb(200, 255, 85)', 'Support action keeps the vivid lime brand accent')
      assert.equal(await studio.locator('.gs-projection-row').count(), 3, 'Compact forecast initially shows three positions')
      for (const caption of await studio.locator('.gs-projection-coins').all()) assert.equal(await caption.evaluate(e=>getComputedStyle(e).color),'rgb(199, 208, 213)','Forecast captions remain readable on smoked glass')
      await studio.getByRole('button', { name: '25', exact: true }).click()
      assert.equal(await studio.getByLabel('Количество Coins', { exact: true }).inputValue(), '25')
      await studio.getByRole('button', { name: 'Увеличить количество Coins', exact: true }).click()
      assert.equal(await studio.getByLabel('Количество Coins', { exact: true }).inputValue(), '26')
      await studio.getByRole('button', { name: 'Уменьшить количество Coins', exact: true }).click()
      assert.equal(await studio.getByLabel('Количество Coins', { exact: true }).inputValue(), '25')
      await studio.getByRole('button', { name: 'Ещё позиции', exact: true }).click()
      assert.equal(await page.locator('.gs-support-login').evaluate(e => getComputedStyle(e).backgroundColor), 'rgb(200, 255, 85)', 'Support action keeps the vivid lime brand accent')
      assert.equal(await studio.locator('.gs-projection-row').count(), 7)
      await studio.getByRole('button', { name: 'Свернуть список', exact: true }).click()
      await studio.getByLabel('Сервер', { exact: true }).selectOption(`qa-${game.id}-11`)
      await studio.getByLabel('Количество Coins', { exact: true }).fill('1')
      assert.equal(await page.locator('.gs-support-login').evaluate(e => getComputedStyle(e).backgroundColor), 'rgb(200, 255, 85)', 'Support action keeps the vivid lime brand accent')
      assert.equal(await studio.locator('.gs-projection-row').count(), 3)
      assert.equal(await studio.locator('.gs-projection-target').getAttribute('data-preview-id'), `qa-${game.id}-11`, 'Compact window includes selected server even at bottom of ranking')
      await studio.getByLabel('Количество Coins', { exact: true }).fill('0')
      await studio.getByRole('alert').waitFor()
      assert.equal(await studio.locator('.gs-position-next').count(), 0, 'Invalid amount has no forecast')
      await studio.getByLabel('Количество Coins', { exact: true }).fill('10')
      await studio.getByLabel('Сервер', { exact: true }).selectOption(`qa-${game.id}-0`)
      const dialogBox = await page.locator('.gs-support-dialog').boundingBox()
      assert.ok(dialogBox.x >= 0 && dialogBox.y >= 0 && dialogBox.x + dialogBox.width <= width + 1 && dialogBox.y + dialogBox.height <= height + 1, 'Support dialog fits viewport')
      const regions = await studio.evaluate(e => {
        const box = selector => { const r=e.querySelector(selector).getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom} }
        return {form:box('.gs-support-form'),preview:box('.gs-support-preview'),checkout:box('.gs-support-checkout')}
      })
      if (width < 768) assert.ok(regions.preview.y >= regions.form.bottom - 1, 'Forecast follows amount without overlap')
      else assert.ok(regions.preview.x >= regions.form.right - 1, 'Desktop forecast is beside amount')
      assert.ok(regions.checkout.y >= Math.max(regions.form.bottom, regions.preview.bottom) - 1, 'Checkout follows both sections')
      for (const button of await studio.locator('.gs-amount-preset,.gs-support-stepper>button').all()) {
        const r=await button.boundingBox();assert.ok(r.width>=44&&r.height>=44, 'Coin controls have 44px touch targets')
      }
      await page.screenshot({ path: `${output}/support-redesign-${game.id}-${width}.png` })

      assert.equal(await page.evaluate(() => document.body.style.overflow), 'hidden')
      await noOverflow()
      await page.keyboard.press('Escape')
      await page.locator('.gs-support-dialog').waitFor({ state: 'detached' })
      assert.notEqual(await page.evaluate(() => document.body.style.overflow), 'hidden')
      await page.goto(base + `/server/qa-${game.id}-0`)
      await page.getByRole('button', { name: 'Это мой сервер', exact: true }).waitFor()
      assert.equal(await page.locator('.gs-server-profile nav a').first().getAttribute('href'), '/' + game.slug)
      const dossier = page.locator('.gs-profile-dossier')
      const dossierBox = await dossier.boundingBox()
      const avatar = page.locator('.gs-profile-avatar')
      const avatarBox = await avatar.boundingBox()
      assert.ok(Math.abs(avatarBox.width-avatarBox.height)<1, 'Avatar cell stays square')
      assert.ok(avatarBox.x>=dossierBox.x&&avatarBox.y>=dossierBox.y&&avatarBox.x+avatarBox.width<=dossierBox.x+dossierBox.width&&avatarBox.y+avatarBox.height<=dossierBox.y+dossierBox.height, 'Avatar stays within framed server identity')
      assert.equal(await avatar.evaluate(e=>getComputedStyle(e).transform),'none')
      const image=avatar.locator('img')
      if(await image.count()) assert.equal(await image.evaluate(e=>{const m=new DOMMatrixReadOnly(getComputedStyle(e).transform);return Math.abs(m.b)<.001&&Math.abs(m.c)<.001}),true,'Avatar bitmap has no rotation or skew')
      const titleBox=await page.getByRole('heading',{level:1}).boundingBox()
      assert.ok(titleBox.x>=avatarBox.x+avatarBox.width-1,'Server name has its own column beside avatar')
      await page.screenshot({ path: `${output}/identity-redesign-${game.id}-${width}.png` })

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
    for (const mode of ['dark','light']) {
      await page.evaluate(mode=>{document.documentElement.dataset.colorMode=mode},mode)
      const sort = toolbar.getByRole('button',{name:'Сортировка',exact:true})
      await sort.click()
      const menu = toolbar.getByRole('listbox',{name:'Сортировка',exact:true})
      await menu.waitFor({state:'visible'})
      const menuBox = await menu.boundingBox()
      assert.ok(menuBox.x>=0&&menuBox.x+menuBox.width<=width+1,'Sort menu fits the phone and desktop')
      await noOverflow()
      await page.screenshot({path:`${output}/catalog-sort-${width}-${mode}.png`})
      if (mode==='dark'&&[390,1440].includes(width)) console.log('CONTROL_PROOF catalog-'+width+' '+(await toolbar.screenshot({type:'jpeg',quality:75})).toString('base64'))
      await menu.getByRole('option',{name:'Онлайн',exact:true}).click()
      await menu.waitFor({state:'detached'})
      assert.match(await sort.innerText(),/Онлайн/)
      await sort.click()
      await menu.getByRole('option',{name:'Общий топ',exact:true}).waitFor()
      await sort.press('Escape')
      await menu.waitFor({state:'detached'})
      const matte = await toolbar.evaluate(e=>getComputedStyle(e).backgroundImage)
      await page.goto(base + '/rating?game=lineage2')
      const tabs=page.locator('.gs-rating-switch')
      await page.evaluate(mode=>{document.documentElement.dataset.colorMode=mode},mode)
      if (width<768) {
        await tabs.waitFor({state:'visible'})
        assert.equal(await tabs.evaluate(e=>getComputedStyle(e).backgroundImage),matte,'Catalog toolbar and rating switch share the same matte surface')
        await tabs.getByRole('button',{name:'Голоса',exact:true}).click()
        assert.equal(await tabs.getByRole('button',{name:'Голоса',exact:true}).getAttribute('aria-pressed'),'true')
        await tabs.getByRole('button',{name:'Поддержка',exact:true}).click()
        if(mode==='dark'&&width===390) console.log('CONTROL_PROOF rating-'+width+' '+(await page.locator('.gs-rating-tools').screenshot({type:'jpeg',quality:75})).toString('base64'))
      }
      await noOverflow()
      await page.screenshot({path:`${output}/rating-controls-${width}-${mode}.png`})
      await page.goto(base + '/catalog?game=lineage2')
      await toolbar.waitFor()
    }
    await page.evaluate(()=>{document.documentElement.dataset.colorMode='dark'})
    await page.goto(base + '/account?game=lineage2')
    await page.locator('.gs-account-entry').waitFor()
    await mediaReady(page)
    if (width < 768) {
      const clip={x:0,y:80,width,height:100}
      const scene=await page.screenshot({clip,animations:'disabled'})
      const hidden=await page.addStyleTag({content:'#root .gs-account-layout:not(#qa-hide-scene)::before{background-image:none!important}'})
      const withoutScene=await page.screenshot({clip,animations:'disabled'})
      await hidden.evaluate(element=>element.remove())
      if(scene.equals(withoutScene)) {
        await page.screenshot({path:`${output}/account-scene-failure-${width}.png`})
        console.error(await page.locator('.gs-account-layout').evaluate(e=>({width:innerWidth,design:document.documentElement.dataset.design,world:document.documentElement.dataset.world,isolation:getComputedStyle(e).isolation,before:getComputedStyle(e,'::before').background,htmlClass:document.documentElement.className})))
      }
      assert.equal(scene.equals(withoutScene),false,'Decoded account scene is actually painted, rather than covered by a black page')
    }
    assert.equal(await page.locator('.gs-account-layout > header').evaluate(e => getComputedStyle(e).backgroundColor), 'rgba(0, 0, 0, 0)')
    await noOverflow()
    await page.screenshot({ path: `${output}/account-${width}.png` })
    // A private API outage must not advertise open registration; recover without a reload.
    authUnavailable = true
    await page.reload()
    await page.getByText('Вход временно недоступен. Попробуйте позже.', { exact: true }).waitFor()
    assert.equal(await page.getByRole('button', { name: 'Создать', exact: true }).count(), 0)
    assert.equal(await page.getByRole('button', { name: 'Войти', exact: true }).isDisabled(), true)
    await noOverflow()
    authUnavailable = false
    await page.getByRole('button', { name: 'Повторить подключение', exact: true }).click()
    await page.getByRole('button', { name: 'Создать', exact: true }).waitFor()
    assert.equal(await page.getByRole('button', { name: 'Войти', exact: true }).isEnabled(), true)
    assert.equal(writes, 0)
    assert.deepEqual(errors, [])
    await context.close()
    console.log(`PASS ${width}x${height}: 3 games, TOP-3, Coins, Claim, search, footer, navigation, filters, account; no writes`)
  }
  await writeFile(`${output}/report.json`, JSON.stringify(results, null, 2))
} finally { await browser.close(); await new Promise(r => server.close(r)) }
