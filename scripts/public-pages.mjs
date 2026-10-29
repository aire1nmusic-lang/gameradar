/** Build-time public snapshot. Only confirmed imported facts are used here. */
import { importSql, loadDataset } from './import/dataset.mjs'
import { readFileSync } from 'node:fs'

export const ORIGIN = 'https://gamescout.online'
// Only the games open on the site (src/data/liveGames.ts). Rust, CS2 and DayZ are hidden for now.
export const GAME_SLUG = { lineage2: 'lineage-2', minecraft: 'minecraft', gtarp: 'gta-rp' }
export const GAME_NAME = { lineage2: 'Lineage 2', minecraft: 'Minecraft', gtarp: 'GTA RP' }
export const escapeHtml = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

export function publicRecords() {
  if (process.env.GS_SEO_SNAPSHOT_FILE) {
    const snapshot = JSON.parse(readFileSync(process.env.GS_SEO_SNAPSHOT_FILE, 'utf8'))
    if (!Array.isArray(snapshot.records) || !snapshot.records.length || snapshot.records.some(record => !record.slug)) throw new Error('Invalid public SEO snapshot')
    return snapshot.records.filter(record => GAME_SLUG[record.game])
  }
  const records = loadDataset().filter(record => record.confidence === 'confirmed' && GAME_SLUG[record.game])
  const { plan } = importSql(records)
  const byKey = new Map(records.map(record => [record.key, record]))
  return plan.map(item => ({ ...byKey.get(item.key), slug: item.slug }))
}

const sentence = values => values.filter(Boolean).join(' · ')
const fact = (label, value) => `${label}: ${value || 'не указано'}`


const legal = JSON.parse(readFileSync(new URL('../src/data/legal.json', import.meta.url), 'utf8'))
const about = JSON.parse(readFileSync(new URL('../src/data/about.json', import.meta.url), 'utf8'))
const guides = JSON.parse(readFileSync(new URL('../src/data/worldGuides.json', import.meta.url), 'utf8'))
// Same wording as the app (src/components/world/WorldGuide.tsx).
export const chronicleDescription = meta => `${meta.intro} Рейты, дата открытия и онлайн с указанием источника.`
export function serverCount(count) {
  const last = count % 10, tens = count % 100
  const word = last === 1 && tens !== 11 ? 'сервер' : last >= 2 && last <= 4 && (tens < 12 || tens > 14) ? 'сервера' : 'серверов'
  return `В каталоге ${count} ${word}.`
}
const chronicleGuide = (game, slug) => guides.chronicles[`${GAME_SLUG[game]}/${slug}`] ?? { label: slug, title: `Серверы ${GAME_NAME[game]} ${slug}`, intro: `Серверы ${GAME_NAME[game]}: ${slug}.` }
const chronicleLabel = (game, slug) => chronicleGuide(game, slug).label
const faqHtml = faq => faq.length ? `<h2>Вопросы и ответы</h2>${faq.map(([question, answer]) => `<h3>${escapeHtml(question)}</h3><p>${escapeHtml(answer)}</p>`).join('')}` : ''
const faqPage = faq => ({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faq.map(([name, text]) => ({ '@type': 'Question', name, acceptedAnswer: { '@type': 'Answer', text } })) })
const itemList = (name, items) => ({ '@context': 'https://schema.org', '@type': 'ItemList', name, numberOfItems: items.length,
  itemListElement: items.slice(0, 100).map((record, index) => ({ '@type': 'ListItem', position: index + 1, url: `${ORIGIN}/server/${record.slug}`, name: record.name })) })
function legalBody(doc, dated = `Редакция от ${legal.updated}`) {
  const sections = doc.sections.map(section => `<h2>${escapeHtml(section.heading)}</h2>${(section.paragraphs || []).map(text => `<p>${escapeHtml(text)}</p>`).join('')}${section.list ? `<ul>${section.list.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : ''}`).join('')
  const links = (doc.links || []).map(link => `<a href="${escapeHtml(link.to)}">${escapeHtml(link.label)}</a>`).join(' · ')
  return `<h1>${escapeHtml(doc.title)}</h1><p>${escapeHtml(dated)}</p>${sections}${links ? `<p>${links}</p>` : ''}<p>Контакт: ${escapeHtml(legal.operator.contactEmail)}</p>`
}

export function publicPages(records = publicRecords()) {
  const games = Object.keys(GAME_SLUG).filter(game => records.some(record => record.game === game))
  const cards = items => items.map(record => `<li><a href="/server/${escapeHtml(record.slug)}"><strong>${escapeHtml(record.name)}</strong></a><span>${escapeHtml(sentence([GAME_NAME[record.game], record.version || record.chronicle, record.rates || record.modes.join(', '), record.region || record.country]))}</span><small>Онлайн не указан · <a href="/server/${escapeHtml(record.slug)}">Подробнее</a></small></li>`).join('')
  const gameLinks = games.map(game => `<li><a href="/${GAME_SLUG[game]}">${GAME_NAME[game]}</a></li>`).join('')
  const pages = [
    { path: '/', title: 'GameScout — каталог игровых серверов', description: 'Каталог серверов Lineage 2, Minecraft и GTA RP с проверяемыми характеристиками и отдельными рейтингами.', body: `<h1>GameScout — каталог игровых серверов</h1><p>Выберите игру и откройте карточку сервера. Онлайн показывается только при наличии актуального измерения.</p><ul class="seo-games">${gameLinks}</ul><p><a href="/catalog">Все серверы</a> · <a href="/about">О проекте и методика</a> · <a href="/copyright">Правообладателям</a></p>` },
    { path: '/games', title: 'Игры — GameScout', description: 'Игры с публичными карточками серверов в GameScout.', body: `<h1>Игры</h1><ul class="seo-games">${gameLinks}</ul>` },
    { path: '/catalog', title: 'Каталог серверов — GameScout', description: 'Публичные карточки серверов с названием, версией, режимом и регионом. Актуальный онлайн загружается отдельно.', body: `<h1>Каталог серверов</h1><p>Опубликованные характеристики серверов. Актуальный онлайн и сортировки загружаются после открытия страницы.</p><ul class="seo-cards">${cards(records)}</ul>` },
    { path: '/owners', title: 'Владельцам серверов — GameScout', description: 'Подтверждение владения сервером и управление своей карточкой в GameScout.', body: '<h1>Владельцам серверов</h1><p>Права на карточку выдаются после проверки Claim. Владелец может оставаться игроком на других серверах.</p><p><a href="/account">Войти в аккаунт</a> · <a href="/catalog">Найти сервер</a></p>' },
    { path: '/copyright', title: 'Правообладателям — GameScout', description: 'Сообщить GameScout о спорной ссылке или материале на странице сервера.', body: '<h1>Правообладателям</h1><p>Укажите конкретную спорную ссылку и основание претензии. Заявление проверяет администратор; карточка сервера автоматически не удаляется.</p><p>Форма доступна после загрузки страницы.</p>' },
    { path: legal.privacy.path, title: legal.privacy.title + ' — GameScout', description: legal.privacy.description, body: legalBody(legal.privacy) },
    { path: legal.terms.path, title: legal.terms.title + ' — GameScout', description: legal.terms.description, body: legalBody(legal.terms) },
    { path: about.path, title: about.title + ' — GameScout', description: about.description, body: legalBody(about, `Обновлено ${about.updated}`) },
  ]
  for (const game of games) {
    const subset = records.filter(record => record.game === game)
    const guide = guides.games[game], base = `/${GAME_SLUG[game]}`
    const chroniclePath = chronicle => `${base}/${chronicle}`
    const chronicleSlugs = [...new Set(subset.map(record => record.chronicle).filter(Boolean))]
    if (game === 'lineage2' && !chronicleSlugs.includes('other')) chronicleSlugs.push('other')
    const chronicleLinks = chronicleSlugs.map(slug => `<a href="${chroniclePath(slug)}">${escapeHtml(chronicleLabel(game, slug))}</a>`).join(' · ')
    const worldPage = (path, title, description, heading, intro, items, extra = '', faq = []) => pages.push({ path, title: title + ' — GameScout', description,
      body: `<h1>${escapeHtml(heading)}</h1><p>${escapeHtml(intro)}</p><p>${escapeHtml(serverCount(items.length))}</p><ul class="seo-cards">${cards(items)}</ul>${extra}${faqHtml(faq)}`,
      jsonLd: [itemList(heading, items), ...(faq.length ? [faqPage(faq)] : [])] })
    worldPage(base, guide.title, guide.description, `Серверы ${GAME_NAME[game]}`, guide.intro, subset,
      `<p>${chronicleLinks}</p><p><a href="/catalog?game=${game}">Каталог с фильтрами</a> · <a href="/about">Как проверяется онлайн</a></p>`, guide.faq)
    for (const slug of chronicleSlugs) {
      const items = slug === 'other' ? subset.filter(record => !['Interlude', 'High Five', 'Essence'].includes(record.version)) : subset.filter(record => record.chronicle === slug)
      const meta = chronicleGuide(game, slug)
      worldPage(chroniclePath(slug), meta.title, chronicleDescription(meta), `${GAME_NAME[game]} — ${meta.label}`, meta.intro, items,
        `<p><a href="${base}">Все серверы ${GAME_NAME[game]}</a> · ${chronicleLinks}</p>`)
    }
  }
  for (const record of records) {
    const details = [fact('Версия или хроники', record.version || record.chronicle), fact('Рейты или режим', record.rates || record.modes.join(', ')), fact('Дата открытия', record.openedAt?.slice(0, 10)), fact('Регион', record.region || record.country), 'Онлайн не указан']
    pages.push({ path: `/server/${record.slug}`, title: `${record.name} — сервер ${GAME_NAME[record.game]} — GameScout`, description: sentence([record.name, GAME_NAME[record.game], record.version || record.chronicle, record.rates || record.modes.join(', '), record.region || record.country]), lastmod: record.checkedAt?.slice(0, 10), body: `<nav><a href="/">GameScout</a> / <a href="/${GAME_SLUG[record.game]}">${GAME_NAME[record.game]}</a></nav><h1>${escapeHtml(record.name)}</h1><p>Опубликованные характеристики сервера.</p><ul class="seo-facts">${details.map(detail => `<li>${escapeHtml(detail)}</li>`).join('')}</ul><p>Народный рейтинг, Поддержка и история онлайна загружаются из актуального каталога.</p><p><a href="/${GAME_SLUG[record.game]}">Другие серверы ${GAME_NAME[record.game]}</a></p>` })
  }
  return pages
}
