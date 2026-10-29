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
    await page.clock.install()
    page.setDefaultTimeout(20000)
    page.setDefaultNavigationTimeout(20000)
    let writes = 0
    let authUnavailable = false
    let authMailDisabled = false
    let authPolicyMissing = false
    let profileBoard = 'support'
    const errors = []
    page.on('pageerror', e => errors.push(e.message))
    await page.route('**/api/v1/**', async route => {
      const req = route.request(), url = new URL(req.url()), path = url.pathname
      if (req.method() !== 'GET') { writes++; return route.abort() }
      const apiCards = profileBoard === 'support' ? cards : cards.map(s => ({ ...s, support: { coins: 0, participants: 0 }, ...(['online','zero'].includes(profileBoard) ? { votes: 0, online: { ...s.online, status: 'VERIFIED', playersKnown: true, freshness: 'fresh', current: 10000 - Number(s.id.split('-').at(-1)) * 100 } } : {}), ...(profileBoard === 'ordinary' ? { votes: 0, online: { ...s.online, status: 'UNKNOWN', playersKnown: false, freshness: 'unknown' } } : {}) }))
      let json = []
      if (path.endsWith('/auth/me') && authUnavailable) return route.fulfill({ status: 503, json: {error:{code:'private_api_required',message:'Private upstream is not a user-facing explanation'}} })
      if (path.endsWith('/games')) json = games
      else if (path.endsWith('/auth/me')) json = { privateCore: true, emailLogin: !authMailDisabled, user: null, providers: [], ...(authPolicyMissing?{}:{registrationOpen: true}) }
      else if (path.endsWith('/people-rating')) json = apiCards.map(s => ({ server_id: s.id, votes: s.votes }))
      else if (path.endsWith('/support/ranking')) json = apiCards.map(s => ({ server_id: s.id, coins: s.support.coins, participants: 1 }))
      else if (path.endsWith('/servers')) {
        const selectedGames=(url.searchParams.get('gameIds')??url.searchParams.get('gameId')??'').split(',').filter(Boolean)
        let items = apiCards.filter(s => !selectedGames.length || selectedGames.includes(s.gameId))
        const query = url.searchParams.get('query') ?? url.searchParams.get('q')
        if (query) items = items.filter(s => s.name.toLowerCase().includes(query.toLowerCase()))
        json = { items, total: items.length, offset: 0, limit: 100 }
      } else if (/\/servers\/[^/]+$/.test(path)) json = apiCards.find(s => s.slug === path.split('/').at(-1) || s.id === path.split('/').at(-1))
      else if (path.includes('/copyright/restrictions/')) json = { restrictedLinks: [], restrictedMaterials: [] }
      else if (path.includes('/support/servers/')) json = { coins: 0, participants: 0, recent: [] }
      else if (path.endsWith('/payments/test/config')) json = { available: false, testOnly: true, realSalesEnabled: false }
      await route.fulfill({ json: json ?? {}, status: json === undefined ? 404 : 200 })
    })
    const noOverflow = async () => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `overflow ${width} ${page.url()}`)
    for (const game of games.filter(g => ['lineage2', 'minecraft', 'gtarp'].includes(g.id))) {
      console.log(`QA ${width}x${height} ${game.id}: home`)
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
        const touchTicker = await liveTrack.evaluate(e=>({state:getComputedStyle(e).animationPlayState,coarse:matchMedia('(pointer:coarse)').matches,noHover:matchMedia('(hover:none)').matches,active:!!document.querySelector('.gs-live-view:active')}))
        assert.equal(touchTicker.state,'running',`Touch hover does not leave ticker paused: ${JSON.stringify(touchTicker)}`)
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
      if (game.id === 'minecraft' || game.id === 'gtarp') {
        const picker = page.locator('.gs-inline-picker')
        const search = page.getByRole('searchbox', { name: 'Поиск по названию или рейтам', exact: true })
        const searchBox = await search.boundingBox()
        const summaryBox = await picker.locator('summary').boundingBox()
        assert.ok(summaryBox.y >= searchBox.y + searchBox.height - 1, 'Minecraft modes follow search without overlap')
        if (game.id === 'minecraft') assert.ok((await page.locator('.l2a--minecraft .hero').boundingBox()).height < 340, 'Minecraft hero stays compact')
        if (game.id === 'minecraft') assert.match(await page.locator('.l2a--minecraft .hero h1').evaluate(e=>getComputedStyle(e).fontFamily), /Pixelify Sans/, 'Minecraft retains its own block display face instead of the shared fantasy font')
        await picker.locator('summary').click()
        const modes = picker.getByRole('navigation', { name: game.id === 'gtarp' ? 'Выбрать платформу' : 'Выбрать режим', exact: true })
        await modes.waitFor({ state: 'visible' })
        assert.equal(await modes.getByRole('link').count(), game.chronicles.length)
        await mediaReady(page)
        // Width-descriptor srcset reports density-corrected naturalWidth (e.g.160px on320px viewport), not file pixel width.
        await page.waitForFunction(()=>[...document.querySelectorAll('.gs-inline-grid img')].every(image=>image.complete&&image.naturalWidth>0),null,{timeout:10000})
        const modeSources=await modes.locator('img').evaluateAll(images=>images.map(image=>({src:image.currentSrc,ready:image.complete&&image.naturalWidth>0,naturalWidth:image.naturalWidth})))
        assert.equal(new Set(modeSources.map(image=>image.src)).size,game.chronicles.length,'Each mode/platform has its own owner-supplied scene')
        assert.ok(modeSources.every(image=>image.ready&&image.src.includes('-owner-v1-')),`All supplied mode/platform images decode: ${JSON.stringify(modeSources)}`)
        await modes.screenshot({path:`${output}/mode-art-${game.id}-${width}.png`})
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
        await page.screenshot({path:`${output}/${game.id}-world-${width}.png`})
        if ([390,1440].includes(width)) console.log('MINECRAFT_PROOF '+width+' '+(await page.screenshot({type:'jpeg',quality:70})).toString('base64'))
      }
      const plaque = page.locator('.gs-shelf-support .server:not(.is-skeleton)').first()
      await mediaReady(page)
      assert.equal(await plaque.locator('.gsb-name').evaluate(e => getComputedStyle(e).color), 'rgb(255, 247, 233)')
      // All worlds share the owner-approved L2 component, density and information bar.
      assert.equal(await page.locator('.catalog-grid > .gsb').count(), 3, 'Same three boards in every world')
      const columns = await page.locator('.catalog-grid').evaluate(e => getComputedStyle(e).gridTemplateColumns.split(' ').length)
      assert.equal(columns, width > 1180 ? 3 : 1, 'Same responsive board columns as L2')
      for (const kind of ['support','people']) {
        const board = page.locator(`.gs-shelf-${kind}`)
        const sizes = []
        for (const rank of [1,2,3]) {
          const card = board.locator(`.gsb-plaque[data-rank="${rank}"]`)
          await card.scrollIntoViewIfNeeded()
          await mediaReady(page)
          const rect = await card.boundingBox()
          sizes.push(rect)
          assert.ok(rect.height <= 215, 'Compact L2 plaque height, never a tall poster')
          const art = card.locator('.gsb-art img')
          assert.ok(await art.evaluate(e => e.complete && e.naturalWidth >= 800), 'Place scene decodes')
          const medal = card.locator('.gsb-medal img')
          assert.equal(await medal.getAttribute('alt'), `${rank} место`)
          if (game.id !== 'lineage2') {
            assert.equal(await medal.getAttribute('src'), `/media/ranks/${game.id}-rank-${rank}-approved-v1.webp`)
            assert.ok(await medal.evaluate(e => e.complete && e.naturalWidth === 192), 'Approved rank icon retained')
            const badge = await medal.boundingBox()
            assert.ok(badge.width >= 70 && badge.width <= 96, 'Readable rank has the same scale as L2')
          }
          if (rank === 1) {
            const hero = card.locator('.gsb-hero')
            assert.ok(await hero.evaluate(e => e.complete && e.naturalWidth >= 300), 'Separate first-place character decodes')
            const heroBox = await hero.boundingBox()
            assert.ok(heroBox.y < rect.y - 35 && heroBox.height > rect.height, 'Only first-place hero breaks prominently out of the frame')
          } else assert.equal(await card.locator('.gsb-hero').count(),0)
          const content = await card.evaluate(e => {
            const row=e.getBoundingClientRect(),bar=e.querySelector('.gsb-bar').getBoundingClientRect(),name=e.querySelector('.gsb-name').getBoundingClientRect(),meta=e.querySelector('.gsb-meta').getBoundingClientRect(),metric=e.querySelector('.gsb-num').getBoundingClientRect(),fav=e.querySelector('.gsb-fav').getBoundingClientRect()
            return {rowBottom:row.bottom,barTop:bar.top,barBottom:bar.bottom,nameBottom:name.bottom,metaBottom:meta.bottom,metricRight:metric.right,favLeft:fav.left}
          })
          assert.ok(content.barBottom <= content.rowBottom + 1 && content.metaBottom <= content.rowBottom, 'Live caption remains inside the frame')
          assert.ok(content.metricRight <= content.favLeft + 1, 'Counter and favourite do not overlap')
          assert.equal(await card.locator('.gsb-name').evaluate(e => getComputedStyle(e).color),'rgb(255, 247, 233)')
          const inset=await card.locator('.gsb-fav').evaluate(e=>{const a=e.getBoundingClientRect(),b=e.closest('.gsb-plaque').getBoundingClientRect();return {width:a.width,height:a.height,right:b.right-a.right}})
          assert.ok(inset.width>=44&&inset.height>=44&&inset.right>=10, 'Favourite has a full touch target inset from the frame')
          if(kind === 'support') {
            const coin=card.locator('.gsb-coin')
            assert.equal(await coin.getAttribute('src'),'/media/ranks/coin-stack-96.webp')
            assert.ok(await coin.evaluate(e=>e.complete && e.naturalWidth===96),'Same illustrated coin as L2')
          }
          await card.screenshot({path:`${output}/compact-${kind}-${game.id}-${rank}-${width}.png`})
        }
        assert.ok(sizes.every(r => Math.abs(r.width-sizes[0].width)<1), 'All places have the same full width as L2')
        assert.ok(sizes[0].height >= sizes[1].height, 'First place remains strongest')
      }
      if(game.id !== 'lineage2') {
        for(const rank of [1,2,3]) assert.notEqual(
          await page.locator(`.gs-shelf-support .p${rank} .gsb-art img`).getAttribute('src'),
          await page.locator(`.gs-shelf-people .p${rank} .gsb-art img`).getAttribute('src'), 'Votes and support retain separate artwork')
      }
      if(game.id==='gtarp') {
        const characters = await page.locator('.gsb-plaque[data-character]').evaluateAll(es=>es.map(e=>e.dataset.character))
        assert.deepEqual(characters,['Michael De Santa','Franklin Clinton','Trevor Philips','Carl Johnson','Tommy Vercetti','Niko Bellic'])
      }
      await plaque.evaluate(e=>window.scrollTo(0,Math.max(0,scrollY+e.getBoundingClientRect().top-170)))
      await mediaReady(page)
      await page.screenshot({path:`${output}/compact-world-${game.id}-${width}.png`})
      const box = await plaque.locator('.server-name').boundingBox()
      assert.ok(box.width > 40, `name squeezed ${width} ${game.id}`)
      await plaque.screenshot({ path: `${output}/top-${game.id}-${width}.png` })
      if (game.id === 'lineage2') await page.locator('.gs-shelf-people .server:not(.is-skeleton)').first().screenshot({ path: `${output}/top-people-${game.id}-${width}.png` })
      const profileLink = plaque.getByRole('link', { name: /^Открыть сервер/ })
      assert.equal(await profileLink.evaluate(e => getComputedStyle(e).position), 'absolute')
      await plaque.getByRole('button', { name: /^Поддержать .* за GS Coins$/ }).click()
      await page.locator('.gs-support-dialog:modal').waitFor()
      const selectedServer = await page.getByLabel('Сервер', { exact: true }).getAttribute('data-value').catch(async error => {
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
      assert.match(await studio.locator('.gs-support-rubles').innerText(),/1[\s\u00a0\u202f]?250 ₽/)
      await studio.getByRole('button', { name: 'Увеличить количество Coins', exact: true }).click()
      assert.equal(await studio.getByLabel('Количество Coins', { exact: true }).inputValue(), '26')
      await studio.getByRole('button', { name: 'Уменьшить количество Coins', exact: true }).click()
      assert.equal(await studio.getByLabel('Количество Coins', { exact: true }).inputValue(), '25')
      await studio.getByRole('button', { name: 'Ещё позиции', exact: true }).click()
      assert.equal(await page.locator('.gs-support-login').evaluate(e => getComputedStyle(e).backgroundColor), 'rgb(200, 255, 85)', 'Support action keeps the vivid lime brand accent')
      assert.equal(await studio.locator('.gs-projection-row').count(), 7)
      await studio.getByRole('button', { name: 'Свернуть список', exact: true }).click()
      await studio.getByLabel('Сервер', { exact: true }).click()
      await studio.getByLabel('Поиск сервера для поддержки').fill(cards.find(s=>s.id===`qa-${game.id}-11`).name)
      await studio.getByRole('option').filter({hasText:cards.find(s=>s.id===`qa-${game.id}-11`).name}).click()
      await studio.getByLabel('Количество Coins', { exact: true }).fill('1')
      assert.equal(await page.locator('.gs-support-login').evaluate(e => getComputedStyle(e).backgroundColor), 'rgb(200, 255, 85)', 'Support action keeps the vivid lime brand accent')
      assert.equal(await studio.locator('.gs-projection-row').count(), 3)
      assert.equal(await studio.locator('.gs-projection-target').getAttribute('data-preview-id'), `qa-${game.id}-11`, 'Compact window includes selected server even at bottom of ranking')
      await studio.getByLabel('Количество Coins', { exact: true }).fill('0')
      await studio.getByRole('alert').waitFor()
      assert.equal(await studio.locator('.gs-position-next').count(), 0, 'Invalid amount has no forecast')
      await studio.getByLabel('Количество Coins', { exact: true }).fill('10')
      await studio.getByLabel('Сервер', { exact: true }).click()
      await studio.getByLabel('Поиск сервера для поддержки').fill(cards.find(s=>s.id===`qa-${game.id}-0`).name)
      await studio.getByRole('option').filter({hasText:cards.find(s=>s.id===`qa-${game.id}-0`).name}).click()
      await studio.getByLabel('Сервер', { exact: true }).press('ArrowDown')
      await studio.getByLabel('Поиск сервера для поддержки').fill('нет-такого-проекта-qa')
      await studio.getByRole('status').filter({hasText:'Сервер не найден'}).waitFor()
      await studio.getByLabel('Поиск сервера для поддержки').press('Escape')
      await studio.locator('.gs-server-picker-popover').waitFor({state:'detached'})
      assert.ok(await page.locator('.gs-support-dialog').isVisible(),'First Escape closes only the open server picker; the next Escape closes support')
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
      for(const label of ['7 дней','30 дней','24 часа']){
        await page.getByRole('button',{name:label,exact:true}).click()
        assert.equal(await page.getByRole('button',{name:label,exact:true}).getAttribute('aria-pressed'),'true')
        assert.equal(await page.getByRole('button',{name:label,exact:true}).evaluate(e=>getComputedStyle(e).color),'rgb(23, 33, 40)','Selected lime chart control has dark readable ink')
        await noOverflow()
      }
      const voteHeadings=await page.locator('.gs-vote-panel > div.uppercase').all()
      assert.ok(voteHeadings.length>0,'Profile has a player-rating heading')
      for(const heading of voteHeadings) assert.equal(await heading.evaluate(e=>getComputedStyle(e).color),'rgb(213, 255, 145)','Both responsive player-rating headings stay readable on transparent glass')
      const glass=await page.locator('.gs-profile-dossier').evaluate(e=>{const s=getComputedStyle(e);return {background:s.backgroundImage,blur:s.backdropFilter,color:s.color}})
      assert.ok(glass.background.includes('0.12)')&&/0\.04[0-9]*\)/.test(glass.background), 'Page glass transmits the scene with the shared light matte tint')
      assert.ok(glass.blur.includes('blur(5px)'), 'Owner-selected light diffusion preserves scene detail at every viewport')
      assert.equal(await page.getByRole('heading',{level:1}).evaluate(e=>getComputedStyle(e).color),'rgb(243, 247, 250)')
      const shield = page.locator('.gs-profile-place-shield')
      await shield.waitFor()
      await mediaReady(page)
      assert.match(await shield.getAttribute('src'), /medal-1-glass-192\.webp$/)
      const shieldBox = await shield.boundingBox(), headerBox = await page.locator('.gs-profile-dossier').boundingBox()
      assert.equal(Math.round(shieldBox.width), width >= 1280 ? 164 : width < 640 ? 128 : 136, 'TOP shield is prominent at every viewport')
      assert.ok(shieldBox.x >= headerBox.x && shieldBox.x + shieldBox.width <= headerBox.x + headerBox.width + 1 && shieldBox.y >= headerBox.y && shieldBox.y + shieldBox.height <= headerBox.y + headerBox.height + 1, 'Large shield remains inside the original header')
      const supportMaterial = await page.locator('.gs-profile-support').evaluate(e=>{const s=getComputedStyle(e);return {background:s.backgroundImage,blur:s.backdropFilter,after:getComputedStyle(e,'::after').content}})
      assert.equal(supportMaterial.background, glass.background, 'Support CTA uses exactly the surrounding glass material')
      assert.equal(supportMaterial.blur, glass.blur)
      assert.equal(supportMaterial.after, 'none', 'Old gold sweep no longer covers the support CTA')
      assert.equal(await page.locator('.gs-profile-particles').evaluate(e=>getComputedStyle(e).display), 'none', 'Reduced motion removes particles')
      assert.equal(await page.locator('.gs-profile-dossier').evaluate(e=>getComputedStyle(e,'::before').animationName), 'none', 'Reduced motion keeps the metallic rim still')
      await page.emulateMedia({reducedMotion:'no-preference'})
      assert.equal(await page.locator('.gs-profile-particles').evaluate(e=>getComputedStyle(e).pointerEvents), 'none', 'Decoration never intercepts controls')
      assert.equal(await page.locator('.gs-profile-dossier').evaluate(e=>getComputedStyle(e,'::before').animationName), 'gs-profile-bevel')
      for (const panel of await page.locator('.gs-profile-dossier,.gs-server-profile .gs-panel,.gs-profile-support,.gs-server-profile .surface,.gs-vote-panel').all()) {
        assert.notEqual(await panel.evaluate(e=>getComputedStyle(e,'::before').display),'none','The legacy world theme must not hide the actual bevel')
      }
      assert.equal(await page.locator('.gs-profile-particle').first().evaluate(e=>getComputedStyle(e).animationPlayState), 'running')
      await page.emulateMedia({reducedMotion:'reduce'})
      for (const action of await page.locator('.gs-server-profile .gs-button-primary,.gs-server-profile .gt-btn--primary').all()) {
        assert.equal(await action.evaluate(e=>getComputedStyle(e).color),'rgb(23, 33, 40)','Every lime profile action keeps dark readable ink, including vote/login')
        assert.equal(await action.evaluate(e=>getComputedStyle(e).webkitTextStrokeWidth),'0px','Primary action labels never inherit the pale-text contour')
      }
      const favorite=page.locator('.gs-profile-favorite')
      const wasFavorite=await favorite.getAttribute('aria-pressed')
      assert.equal(await favorite.locator('svg').evaluate(e=>getComputedStyle(e).width),'19px')
      await favorite.click()
      assert.notEqual(await favorite.getAttribute('aria-pressed'),wasFavorite,'Favorite toggles its accessible state')
      await favorite.click()
      assert.equal(await favorite.getAttribute('aria-pressed'),wasFavorite,'Favorite can be undone without API writes')
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
      await dossier.screenshot({ path: `${output}/profile-top-header-${game.id}-${width}.png` })

      await page.getByRole('button', { name: 'Это мой сервер', exact: true }).click()
      await page.locator('.gs-ui-modal-panel').waitFor()
      const modalGlass=await page.locator('.gs-ui-modal-panel').evaluate(e=>({background:getComputedStyle(e).backgroundImage,blur:getComputedStyle(e).backdropFilter}))
      assert.ok(modalGlass.background.includes('0.78)')&&modalGlass.background.includes('0.84)'), 'Overlapping claim panel uses tinted smoky glass')
      assert.ok(modalGlass.blur.includes('blur(20px)'), 'Modal frost separates overlapping content')
      const modal = await page.locator('.gs-ui-modal-panel').boundingBox()
      assert.ok(modal.x >= 0 && modal.x + modal.width <= width + 1 && modal.y >= 0 && modal.y + modal.height <= height + 1)
      await page.screenshot({ path: `${output}/claim-${game.id}-${width}.png` })
      await page.keyboard.press('Escape')
      await page.keyboard.press('/')
      await page.locator('.gs-search-surface').waitFor()
      const input = page.locator('.gs-search-surface input')
      await input.fill('QA')
      await page.getByRole('option', { name: /QA Очень длинное/ }).first().waitFor()
      const background = await page.locator('.gs-search-surface').evaluate(e => getComputedStyle(e).backgroundImage)
      assert.equal(background,modalGlass.background,'Search and claim use the same smoky glass')
      assert.ok((await page.locator('.gs-search-surface').evaluate(e=>getComputedStyle(e).backdropFilter)).includes('blur(20px)'))
      assert.equal(await input.evaluate(e=>getComputedStyle(e).borderTopWidth),'0px','Search has one outer field, no nested input frame')
      assert.equal(await input.getAttribute('aria-label'),'Название сервера, версия или режим')
      await page.getByRole('button',{name:'Очистить запрос',exact:true}).click()
      assert.equal(await input.inputValue(),'')
      assert.equal(await input.evaluate(e=>document.activeElement===e),true)
      await input.fill('QA')
      await page.getByRole('option', { name: /QA Очень длинное/ }).first().waitFor()
      await input.press('ArrowDown')
      assert.equal(await input.getAttribute('aria-activedescendant'),'gs-search-option-0')

      const searchBounds=await page.locator('.gs-search-surface').boundingBox()
      assert.ok(searchBounds.x>=0&&searchBounds.y>=0&&searchBounds.x+searchBounds.width<=width+1&&searchBounds.y+searchBounds.height<=height+1,'Entire search surface stays within viewport, including landscape')
      const closeBounds=await page.getByRole('button',{name:'Закрыть поиск',exact:true}).boundingBox()
      assert.ok(closeBounds.width>=44&&closeBounds.height>=44,'Search close has a full touch target')
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
      console.log(`QA ${width}x${height} ${game.id}: catalog`)
      // Parity must hold after leaving the home page, not just on its shelves.
      assert.equal(await page.locator('.gs-server-fullbg .gs-server-bg').count(), 1, 'Every primary game has the same full-scene profile')
      assert.equal(await page.locator('.gs-profile-distinction').count(), 1, 'A real positive TOP3 fixture earns the large header shield')
      if ([390,1440].includes(width)) {
        for (const board of ['support','people']) {
          profileBoard = board
          for (const rank of [1,2,3]) {
            await page.goto(base + `/server/qa-${game.id}-${rank-1}?ranking=${board}`)
            await page.locator(`.gs-server-profile[data-profile-place="${rank}"][data-profile-board="${board}"]`).waitFor()
            await mediaReady(page)
            assert.match(await page.locator('.gs-profile-place-shield').getAttribute('src'), new RegExp(`medal-${rank}-glass-192\\.webp$`))
            assert.equal(await page.locator('.gs-profile-place-shield').evaluate(e=>e.complete&&e.naturalWidth===192),true, 'Existing approved shield decodes')
            assert.equal(await page.locator('.gs-profile-particle svg').first().getAttribute('class').then(s=>s.includes(board==='support'?'lucide-coins':'lucide-thumbs-up')),true,'Decoration matches the selected support/people board')
            await noOverflow()
            await page.locator('.gs-profile-dossier').screenshot({path:`${output}/profile-place-${game.id}-${board}-${rank}-${width}.png`})
            if(rank===1&&board==='support') await page.screenshot({path:`${output}/profile-glass-${game.id}-${width}.png`,fullPage:true})
          }
        }
        profileBoard = 'support'
      }
      await page.goto(base + `/catalog?game=${game.id}`)
      await page.locator('.gs-catalog-podium .gsb-plaque').first().waitFor()
      assert.equal(await page.locator('.gs-catalog-podium .gsb-plaque').count(), 3)
      assert.equal(await page.locator('.gs-catalog-podium .gsb').getAttribute('data-game'), game.id)
      await mediaReady(page)
      await noOverflow()
      // Scroll/decode each plaque before capture: offscreen compositor tiles can be blank.
      for(const rank of [1,2,3]){
        const card=page.locator(`.gs-catalog-podium .gsb-plaque[data-rank="${rank}"]`)
        await card.scrollIntoViewIfNeeded()
        await mediaReady(page)
        // At320px the avatar is intentionally display:none; lazy hidden images never load.
        await page.waitForFunction(selector=>{const images=[...document.querySelector(selector).querySelectorAll('img')].filter(image=>image.getClientRects().length>0);return images.length>=2&&images.every(image=>image.complete&&image.naturalWidth>0)}, `.gs-catalog-podium .gsb-plaque[data-rank="${rank}"]`, {timeout:10000})
        await card.screenshot({path:`${output}/catalog-place-${game.id}-${rank}-${width}.png`})
      }
      await page.evaluate(()=>scrollTo(0,0))
      await page.screenshot({path:`${output}/catalog-parity-${game.id}-${width}.png`})
      const sortControl=page.locator('.gs-catalog-toolbar').getByRole('button',{name:'Сортировка',exact:true})
      for (const [label,podiumExpected] of [['Онлайн',true],['Рост',true],['Голоса',true],['Поддержка',true],['Рейтинг',true],['Новые',false],['Открытие',false],['Общий топ',true]]) {
        await sortControl.click()
        await page.getByRole('option',{name:label,exact:true}).click()
        await page.waitForFunction(expected=>document.querySelectorAll('.gs-catalog-podium .gsb-plaque').length===(expected?3:0),podiumExpected)
        await noOverflow()
      }
      if(width>=640){
        await page.getByRole('button',{name:'Плитка',exact:true}).click()
        await page.locator('.gs-tile-grid').waitFor()
        assert.equal(await page.locator('.gs-catalog-podium .gsb-plaque').count(),3,'Grid keeps the same TOP3')
        await noOverflow()
        await page.getByRole('button',{name:'Список',exact:true}).click()
      }
      console.log(`QA ${width}x${height} ${game.id}: filters`)
      await page.getByRole('button',{name:'Фильтры',exact:true}).click()
      await page.locator('.gs-l2-filter-sheet').waitFor({state:'visible'})
      const filterBox=await page.locator('.gs-l2-filter-sheet>div').boundingBox()
      assert.ok(filterBox.x>=-1&&filterBox.x+filterBox.width<=width+1&&filterBox.y>=-1&&filterBox.y+filterBox.height<=height+1,'Same filter portal fits every viewport')
      const filterPanel=page.locator('.gs-l2-filter-sheet')
      for(const chip of await filterPanel.locator('.gs-chip').all()){
        await chip.click()
        assert.equal(await chip.getAttribute('aria-pressed'),'true','Filter chip responds and announces its selected state')
        const box=await chip.boundingBox();assert.ok(box.height>=44,`Filter chip has a 44px touch target: ${game.id}/${width}/${await chip.innerText()}=${box.height}`)
      }
      for(const toggle of await filterPanel.getByRole('switch').all()){
        const before=await toggle.getAttribute('aria-checked')
        await toggle.click()
        assert.notEqual(await toggle.getAttribute('aria-checked'),before)
        await toggle.click()
        assert.equal(await toggle.getAttribute('aria-checked'),before)
      }
      const range=filterPanel.getByRole('slider')
      await range.focus()
      await range.press('ArrowRight')
      assert.equal(await range.inputValue(),'50')
      await range.press('Home')
      console.log(`QA ${width}x${height} ${game.id}: filter date options`)
      const dateSelect=filterPanel.getByRole('button',{name:'Сортировка',exact:true})
      for(const label of ['За последние 30 дней','За последние 3 месяца','За последний год','Любая']){
        await dateSelect.click()
        await filterPanel.getByRole('option',{name:label,exact:true}).click()
        assert.match(await dateSelect.innerText(),new RegExp(label))
      }
      await page.screenshot({path:`${output}/filters-parity-${game.id}-${width}.png`})
      await filterPanel.getByRole('button',{name:'Сбросить',exact:true}).click()
      await page.getByRole('button',{name:/^Показать \d/}).click()
      await page.locator('.gs-l2-filter-sheet').waitFor({state:'detached'})
      await page.getByRole('button',{name:'Поиск серверов',exact:true}).click()
      const catalogSearch=page.getByPlaceholder('Название сервера, игра, режим…')
      await catalogSearch.fill('not-a-real-server-qa')
      await page.getByText('По этим фильтрам ничего не нашлось',{exact:true}).waitFor()
      await page.getByRole('button',{name:'Очистить',exact:true}).click()
      await page.locator('.gs-catalog-podium .gsb-plaque').first().waitFor()
      console.log(`QA ${width}x${height} ${game.id}: rating`)
      await page.goto(base + `/rating?game=${game.id}&all=people`)
      await page.locator('.gsb-pair .gs-shelf-people .gsb-plaque').first().waitFor()
      assert.equal(await page.locator('.gsb-pair .gsb-plaque').count(),6,'Both rating categories use shared TOP3')
      for (const category of ['support','people']) {
        if(width<1024){
          await page.getByRole('button',{name:category==='support'?'Поддержка':'Голоса',exact:true}).click()
          assert.equal(await page.locator(`.gsb-pair>.gs-shelf-${category}`).isVisible(),true)
          assert.equal(await page.locator(`.gsb-pair>.gs-shelf-${category==='support'?'people':'support'}`).isVisible(),false,'Category button changes content')
        }
        assert.equal(await page.locator(`.gsb-pair>.gs-shelf-${category} .gsb-more a`).getAttribute('href'),`/rating?game=${game.id}&all=${category}`,'All link preserves game and category')
      }
      await page.getByRole('button',{name:'Поддержать сервер',exact:true}).click()
      await page.locator('.gs-support-dialog').waitFor({state:'visible'})
      await page.getByRole('button',{name:'Закрыть поддержку',exact:true}).click()
      await page.locator('.gs-support-dialog').waitFor({state:'detached'})
      await mediaReady(page)
      await noOverflow()
      await page.screenshot({path:`${output}/rating-parity-${game.id}-${width}.png`})
      await page.goto(base + `/openings?game=${game.id}`)
      for(const label of ['Сегодня','На неделе','Все']){
        await page.getByRole('button',{name:label,exact:true}).click()
        assert.equal(await page.getByRole('button',{name:label,exact:true}).getAttribute('aria-pressed'),'true')
        await noOverflow()
      }
      await page.screenshot({path:`${output}/openings-parity-${game.id}-${width}.png`})
      await page.goto(base + `/favorites?game=${game.id}`)
      await page.getByRole('heading',{level:1}).waitFor()
      await noOverflow()
      console.log(`QA ${width}x${height} ${game.id}: account`)
      await page.goto(base + `/account?game=${game.id}`)
      await page.locator('.gs-account-entry').waitFor()
      await noOverflow()
      await page.getByRole('button',{name:'Создать',exact:true}).click()
      await page.getByRole('button',{name:'Создать аккаунт',exact:true}).waitFor()
      await page.getByRole('button',{name:'Создать аккаунт',exact:true}).scrollIntoViewIfNeeded()
      assert.ok(await page.getByRole('button',{name:'Создать аккаунт',exact:true}).isVisible(),'Registration action remains reachable by scrolling in portrait and landscape')
      await page.getByRole('button',{name:'Показать пароль',exact:true}).click()
      assert.equal(await page.locator('#account-password').getAttribute('type'),'text')
      await page.getByRole('button',{name:'Скрыть пароль',exact:true}).click()
      await page.getByRole('button',{name:'Войти',exact:true}).click()
      await page.getByRole('button',{name:'Забыли пароль?',exact:true}).click()
      await page.getByRole('button',{name:'Отправить ссылку',exact:true}).waitFor()
      await noOverflow()
      await page.getByRole('button',{name:'Вернуться ко входу',exact:true}).click()
      if(width<768&&game.id!=='lineage2') assert.ok((await page.locator('.gs-account-layout').evaluate(e=>getComputedStyle(e,'::before').backgroundImage)).includes(`/media/worlds/${game.slug}/`),'Account retains the selected game artwork')
      await page.screenshot({path:`${output}/account-parity-${game.id}-${width}.png`})
      await page.goto(base + `/add-server?game=${game.id}`)
      await page.locator('.gs-owner-steps').waitFor()
      await noOverflow()
      for(const step of await page.locator('.gs-owner-step').all()) {
        assert.equal(await step.locator('strong').evaluate(e=>getComputedStyle(e).color),'rgb(243, 247, 250)','Owner steps have bright text on dark glass')
        const bg=await step.evaluate(e=>getComputedStyle(e).backgroundImage)
        assert.ok(bg.includes('0.12)')&&/0\.04[0-9]*\)/.test(bg), 'Inline owner steps share transparent page glass: '+bg)
      }
      await page.screenshot({path:`${output}/owner-ui-${game.id}-${width}.png`})
      // Owner acceptance: zero-score list -> profile -> back/reload shares one real30s window.
      profileBoard = 'zero'
      const currentTime=await page.evaluate(()=>Date.now())
      const zeroWindowStart=(Math.floor(currentTime/30000)+1)*30000
      await page.clock.pauseAt(new Date(zeroWindowStart+1000))
      await page.goto(base + '/' + game.slug)
      await page.locator('.gs-shelf-people .gsb-plaque').first().waitFor()
      const zeroLink = page.locator('.gs-shelf-people .gsb-plaque[data-rank="1"] .gsb-hitbox')
      const initialHref=await zeroLink.getAttribute('href')
      const awarded=new Set(await page.locator('.gs-shelf-support .gsb-plaque .gsb-hitbox,.gs-shelf-people .gsb-plaque .gsb-hitbox').evaluateAll(links=>links.map(link=>new URL(link.href).pathname)))
      const ordinary=cards.find(server=>server.gameId===game.id&&!awarded.has('/server/'+server.slug))
      assert.ok(ordinary,'A twelve-server fixture has candidates outside both TOP3 boards')
      await page.goto(base + '/server/' + ordinary.slug)
      await page.locator('.gs-server-profile').waitFor()
      await page.waitForFunction(()=>document.querySelectorAll('.gs-profile-rank-chip[data-ranking]').length===2)
      assert.equal(await page.locator('.gs-profile-distinction,.gs-profile-particles').count(),0,'Measured online alone never awards a TOP shield')
      assert.equal(await page.getByText(/по онлайну/i).count(),0,'No third online leaderboard on profiles')
      await page.goto(base + '/' + game.slug)
      await zeroLink.waitFor()
      assert.equal(await zeroLink.getAttribute('href'),initialHref,'Reload inside the window never redraws the zero-score TOP')
      const supportLink=page.locator('.gs-shelf-support .gsb-plaque[data-rank="1"] .gsb-hitbox')
      await supportLink.click()
      await page.locator('.gs-server-profile[data-profile-board="support"][data-profile-place="1"]').waitFor()
      assert.match(await page.locator('.gs-profile-rotation-note').innerText(),/без поддержки/)
      await page.goBack()
      await zeroLink.waitFor()
      const placeScenes=new Set()
      for(const rank of [1,2,3]){
        const link=page.locator(`.gs-shelf-people .gsb-plaque[data-rank="${rank}"] .gsb-hitbox`)
        const expected=await link.getAttribute('href')
        await link.click()
        await page.waitForURL(base+expected)
        await page.locator(`.gs-server-profile[data-profile-board="people"][data-profile-place="${rank}"]`).waitFor()
        assert.equal(await page.locator('.gs-profile-distinction').getAttribute('data-rotating'),'true')
        assert.match(await page.locator('.gs-profile-rotation-note').innerText(),/без голосов/)
        const scene=await page.locator('.gs-server-bg').evaluate(e=>getComputedStyle(e).backgroundImage)
        assert.ok(scene.includes('/media/ranks/'),'The actual background switches to the current approved place scene')
        placeScenes.add(scene)
        await noOverflow()
        if(rank===1){
          // Clock is intentionally paused: decode images without waiting for animation frames.
          await page.locator('.gs-profile-place-shield').evaluate(image=>image.decode())
          await page.screenshot({path:`${output}/rotating-profile-${game.id}-${width}.png`})
        }
        await page.goBack()
        await page.locator('.gs-shelf-people .gsb-plaque').first().waitFor()
        assert.equal(await zeroLink.getAttribute('href'),initialHref,'Returning does not restart or redraw the30second window')
      }
      assert.equal(placeScenes.size,3,'Every place has its own approved background')
      await zeroLink.click()
      await page.locator('.gs-server-profile[data-profile-place="1"][data-profile-board="people"]').waitFor()
      // Navigation/screenshot work may consume emulated time across documents.
      // Test absolute shared-window edges, not a fixed delay from an assumed clock.
      const beforeState=await page.locator('.gs-server-profile').evaluate(e=>({now:Date.now(),period:e.dataset.rankingPeriod,count:e.dataset.rankingCount,place:e.dataset.profilePlace,rankChips:[...e.querySelectorAll('.gs-profile-rank-chip')].map(e=>e.textContent)}))
      const beforeEdge=await page.evaluate(()=>Date.now())
      const lastMillisecond=zeroWindowStart+29999
      assert.ok(beforeEdge<=lastMillisecond,`Fixture crossed its window before the boundary check: ${beforeEdge-zeroWindowStart}ms`)
      await page.clock.runFor(lastMillisecond-beforeEdge)
      assert.equal(await page.evaluate(()=>Date.now()),lastMillisecond,'Boundary probe is exactly29.999seconds into the shared window')
      const edgeState=await page.locator('.gs-server-profile').evaluate(e=>({now:Date.now(),period:e.dataset.rankingPeriod,count:e.dataset.rankingCount,place:e.dataset.profilePlace,rankChips:[...e.querySelectorAll('.gs-profile-rank-chip')].map(e=>e.textContent),url:location.pathname+location.search}))
      console.log('ROTATION_EDGE_PROOF '+JSON.stringify({width,game:game.id,zeroWindowStart,beforeState,edgeState}))
      assert.equal(edgeState.place,'1',`Place remains through29.999seconds of the same window: ${JSON.stringify({beforeState,edgeState,zeroWindowStart})}`)
      await page.clock.runFor(2)
      assert.equal(await page.evaluate(()=>Date.now()),zeroWindowStart+30001,'Expiry probe crosses the exact shared boundary')
      await page.locator('.gs-profile-place-shield').waitFor({state:'detached'})
      assert.equal(await page.locator('.gs-server-profile').getAttribute('data-profile-place'),null,'An expired rotating first place has no stale metal/shield')
      assert.equal(await page.locator('.gs-profile-particles').count(),0)
      const ordinaryScene=await page.locator('.gs-server-bg').evaluate(e=>getComputedStyle(e).backgroundImage)
      assert.ok(ordinaryScene.includes('/media/worlds/')&&!ordinaryScene.includes('/media/ranks/'),'A real ordinary world image returns after leaving TOP3, never an empty CSS variable')
      await page.locator('.gs-server-bg').evaluate(async element=>{const url=getComputedStyle(element).backgroundImage.match(/url\(["']?([^"')]+)["']?\)/)?.[1];if(!url)throw Error('Ordinary scene missing');const image=new Image();image.src=url;await image.decode()})
      await page.goBack()
      await zeroLink.waitFor()
      assert.notEqual(await zeroLink.getAttribute('href'),initialHref,'List advances on the same boundary as the profile')
      const nextHref=await zeroLink.getAttribute('href')
      await page.reload()
      await zeroLink.waitFor()
      assert.equal(await zeroLink.getAttribute('href'),nextHref,'A reload cannot reclaim the expired slot')
      await page.clock.resume()
      await page.clock.setSystemTime(new Date())
      profileBoard = 'support'
      results.push({ width, height, game: game.id, top: true, supportTarget: true, smokyClaim: true, smokySearch: true, contextualHome: true, footerCTA: width < 1024 })
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
      const hidden=await page.addStyleTag({content:'@layer gs-surfaces { #root .gs-account-layout::before{background-image:none!important} }'})
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
    // A read-only synthetic account covers the owner-reported mixed panel finishes.
    await page.route('**/api/v1/auth/me', route=>route.fulfill({json:{privateCore:true,emailLogin:true,registrationOpen:true,providers:[],user:{id:'qa-glass-player',displayName:'QA Player',roles:['PLAYER'],permissions:[],emailVerified:false,loginMethod:'google'}}}))
    await page.route('**/api/v1/coins/me', route=>route.fulfill({json:{balance:0,nominalRub:50,ledger:[]}}))
    await page.reload()
    await page.locator('.gs-account-card').waitFor()
    await page.locator('.gs-account-claim').click()
    const accountPanels=await page.locator('.gs-account-hero,.gs-account-card,.gs-coins-card,.gs-account-empty,.gs-account-claim,.gs-account-wallet>summary').evaluateAll(elements=>elements.map(e=>({background:getComputedStyle(e).backgroundImage,blur:getComputedStyle(e).backdropFilter})))
    assert.ok(accountPanels.length>=6,'All reported account panels are present')
    for(const panel of accountPanels) {
      assert.equal(panel.background,accountPanels[0].background,'Every inline account panel shares one glass tint')
      assert.ok(panel.blur.includes('blur(5px)'), 'Account panels have a light matte finish')
    }
    await noOverflow()
    await mediaReady(page)
    const scenery=async()=>page.locator(width<768?'.gs-account-layout':'.gs-world-backdrop').evaluate((e,mobile)=>{const s=getComputedStyle(e,mobile?'::before':null);return {height:s.height,position:s.position,focus:s.backgroundPosition,image:s.backgroundImage}},width<768)
    const sceneBefore=await scenery()
    await page.evaluate(()=>window.scrollTo(0,Math.min(400,document.documentElement.scrollHeight-innerHeight)))
    assert.deepEqual(await scenery(),sceneBefore,'Scrolling does not resize or reposition the fixed cover')
    assert.equal(sceneBefore.position,'fixed')
    await page.screenshot({path:`${output}/account-signed-in-glass-${width}.png`})
    await page.unroute('**/api/v1/auth/me')
    await page.unroute('**/api/v1/coins/me')
    await page.reload()
    await page.locator('.gs-account-entry').waitFor()
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
    // A mail outage blocks sign-up/reset, while existing password accounts still sign in.
    authMailDisabled = true
    await page.reload()
    await page.getByText('Регистрация и восстановление по почте временно недоступны.',{exact:true}).waitFor()
    assert.equal(await page.getByRole('button',{name:'Создать',exact:true}).count(),0)
    assert.equal(await page.getByRole('button',{name:'Забыли пароль?',exact:true}).isDisabled(),true)
    assert.equal(await page.getByRole('button',{name:'Войти',exact:true}).isEnabled(),true)
    await noOverflow()
    await page.screenshot({path:`${output}/account-mail-unavailable-${width}.png`})
    authMailDisabled = false
    authPolicyMissing = true
    await page.reload()
    await page.getByText('Регистрация пока закрыта.',{exact:true}).waitFor()
    assert.equal(await page.getByRole('button',{name:'Создать',exact:true}).count(),0)
    assert.equal(await page.getByRole('button',{name:'Войти',exact:true}).isEnabled(),true)
    await noOverflow()
    assert.equal(writes, 0)
    assert.deepEqual(errors, [])
    await context.close()
    console.log(`PASS ${width}x${height}: 3 games, TOP-3, Coins, Claim, search, footer, navigation, filters, account; no writes`)
  }
  await writeFile(`${output}/report.json`, JSON.stringify(results, null, 2))
} finally { await browser.close(); await new Promise(r => server.close(r)) }
