/** Visible initial HTML and metadata for crawlable public routes in the Pages build. */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ORIGIN, escapeHtml, publicPages } from './public-pages.mjs'

const template = readFileSync('dist/index.html', 'utf8')
const rootStart = template.indexOf('<div id="root">')
const bodyEnd = template.indexOf('</body>', rootStart)
const rootEnd = template.lastIndexOf('</div>', bodyEnd) + 6
if (rootStart < 0 || bodyEnd < 0 || rootEnd <= rootStart) throw new Error('Vite HTML structure changed; cannot prerender')

const style = `<style>.seo-snapshot{max-width:1208px;margin:0 auto;padding:26px 20px 72px;color:#e8eaf0;font:16px/1.55 Inter,system-ui,sans-serif}.seo-snapshot header{display:flex;gap:20px;align-items:center;padding:10px 0 22px;border-bottom:1px solid #30343e}.seo-snapshot a{color:#67dce7}.seo-snapshot h1{font-size:clamp(27px,4vw,42px);line-height:1.2}.seo-snapshot ul{padding:0;list-style:none}.seo-games{display:flex;flex-wrap:wrap;gap:16px}.seo-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px}.seo-cards li,.seo-facts li{display:grid;gap:5px;padding:16px;border:1px solid #30343e;border-radius:12px;background:#12151c}.seo-cards span,.seo-cards small{color:#a9b0bd}.seo-facts{display:grid;gap:8px}</style>`
const json = value => JSON.stringify(value).replace(/</g, '\\u003c')
function render(page) {
  const canonical = ORIGIN + page.path
  const title = escapeHtml(page.title)
  const description = escapeHtml(page.description)
  let html = template.replace(/<title>[\s\S]*?<\/title>/, `<title>${title}</title>`)
    .replace(/<meta\s+name="description"\s+content="[\s\S]*?"\s*\/>/, `<meta name="description" content="${description}" />`)
  html = html.replace('</head>', `<meta name="robots" content="${page.noindex ? 'noindex, nofollow' : 'index, follow'}" />${page.noindex ? '' : `<link rel="canonical" href="${escapeHtml(canonical)}" /><script type="application/ld+json" data-seo="jsonld">${json({ '@context': 'https://schema.org', '@type': 'WebPage', name: page.title, url: canonical, inLanguage: 'ru' })}</script>`}${style}</head>`)
  const start = html.indexOf('<div id="root">')
  const end = html.lastIndexOf('</div>', html.indexOf('</body>', start)) + 6
  if (start < 0 || end < 0) throw new Error(`No root in ${page.path}`)
  const body = `<div id="root"><div class="seo-snapshot"><header><a href="/">GameScout</a><a href="/catalog">Каталог</a><a href="/rating">Рейтинги</a></header><main>${page.body}</main></div></div>`
  return html.slice(0, start) + body + html.slice(end)
}

const pages = [...publicPages(), ...[
  ['/rating', 'Рейтинги', 'Актуальные рейтинги загружаются после открытия страницы.'],
  ['/openings', 'Открытия серверов', 'Актуальные открытия загружаются после открытия страницы.'],
  ['/account', 'Аккаунт', 'Вход и регистрация GameScout.'],
  ['/dashboard', 'Кабинет владельца', 'Управление сервером GameScout.'],
  ['/admin', 'Админский кабинет', 'Управление GameScout.'],
  ['/add-server', 'Добавить сервер', 'Добавление сервера в GameScout.'],
  ['/favorites', 'Избранное', 'Избранные серверы GameScout.'],
  ['/boost', 'Продвижение', 'Информация о продвижении в GameScout.'],
  ['/states', 'Состояния интерфейса', 'Состояния интерфейса GameScout.'],
  ['/design', 'Варианты оформления', 'Варианты оформления GameScout.'],
].map(([path, title, description]) => ({ path, title: `${title} — GameScout`, description, noindex: true, body: `<h1>${escapeHtml(title)}</h1><p>${escapeHtml(description)}</p>` }))]
for (const page of pages) {
  const target = page.path === '/' ? 'dist/index.html' : join('dist', page.path.slice(1), 'index.html')
  mkdirSync(join(target, '..'), { recursive: true })
  writeFileSync(target, render(page))
}
console.log(`Prerendered ${pages.length} public routes`)
