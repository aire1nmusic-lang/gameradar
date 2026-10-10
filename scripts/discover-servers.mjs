/**
 * Finds new Lineage 2 servers on public monitoring lists and adds them to the curated dataset.
 *
 *   node scripts/discover-servers.mjs              plan only: print what would be added
 *   node scripts/discover-servers.mjs --write      append confirmed records to import/lineage2.json
 *   options: --pages <n> (list pages, default 3), --limit <n> (new records per run, default 12)
 *
 * Rules, the same as for hand-curated records:
 *  - only facts (name, official site, chronicle, rates, opening date); no descriptions, logos or screenshots;
 *  - a listing alone is an advertisement: a record is added only when the project's own website answers
 *    and names the project, which gives the two independent sources a "confirmed" record needs;
 *  - only pages the monitor's robots.txt allows are read, one request at a time with a pause between them.
 * The monitor is used to discover servers; it is not shown on the site as the source of the card.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { loadDataset, validateRecord } from './import/dataset.mjs'

const args = process.argv.slice(2)
const flag = name => args.includes(name)
const option = (name, fallback) => {
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : fallback
}
const WRITE = flag('--write')
const PAGES = Math.min(10, Math.max(1, Number(option('--pages', 3))))
const LIMIT = Math.min(40, Math.max(1, Number(option('--limit', 12))))
const UA = 'GameScoutBot/1.0 (+https://gamescout.online; catalog discovery)'
const MONITOR = 'https://la2.mmotop.ru'
const DATASET_FILE = path.resolve('import/lineage2.json')
const REPORT_DIR = path.resolve('output/discovery')
const PAUSE_MS = 1500
const today = new Date()
const isoDay = date => date.toISOString().slice(0, 10)

// Allowed by https://la2.mmotop.ru/robots.txt (Allow: /, /?page=; Disallow: /*?* and listed sections).
const ROBOTS_OK = [/^\/$/, /^\/\?page=\d+$/, /^\/servers\/\d+$/, /^\/servers\/\d+\/url$/]

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
let lastRequest = 0
async function politeFetch(url, init = {}) {
  const wait = lastRequest + PAUSE_MS - Date.now()
  if (wait > 0) await sleep(wait)
  lastRequest = Date.now()
  return fetch(url, { ...init, headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml', ...init.headers }, signal: AbortSignal.timeout(15000) })
}
async function monitorPage(pathname) {
  if (!ROBOTS_OK.some(re => re.test(pathname))) throw new Error('robots.txt does not allow ' + pathname)
  const response = await politeFetch(MONITOR + pathname, { redirect: pathname.endsWith('/url') ? 'manual' : 'follow' })
  return response
}

const decode = text => text.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
const plain = html => decode(html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()

/** Server boxes of a rating page: id, listing title, rate badges and the "new" marker. */
function parseList(html) {
  const found = []
  for (const box of html.split('<div class="box-servers"').slice(1)) {
    const title = box.match(/class="this-name"[^>]*title="([^"]+)"[^>]*href="[^"]*\/servers\/(\d+)"/)
    if (!title) continue
    const rates = [...box.matchAll(/class="[a-z]+-billet"[^>]*href="[^"]*\/worlds\/\d+">\s*([^<]{1,20})</g)].map(m => m[1].trim())
    found.push({ id: title[2], title: decode(title[1]).trim(), rates, isNew: /class=['"]new-server['"]/.test(box) })
  }
  return found
}

const MONTHS = { январ: 1, феврал: 2, март: 3, апрел: 4, ма: 5, июн: 6, июл: 7, август: 8, сентябр: 9, октябр: 10, ноябр: 11, декабр: 12 }
/** Opening date written in a listing title: "Старт 2 Октября", "открытие 09.10", "OBT 15.10". */
function openingDate(text) {
  const lower = text.toLowerCase()
  let day, month
  const named = lower.match(/(\d{1,2})\s+(январ|феврал|март|апрел|мая|май|июн|июл|август|сентябр|октябр|ноябр|декабр)[а-я]*/)
  if (named) {
    day = Number(named[1])
    month = MONTHS[named[2].startsWith('ма') ? 'ма' : named[2]]
  } else {
    const numeric = lower.match(/(?:старт|открыт|open|обт|збт|obt|cbt)[^0-9]{0,12}(\d{1,2})[./](\d{1,2})(?![./]?\d{3})/)
    if (numeric) { day = Number(numeric[1]); month = Number(numeric[2]) }
  }
  if (!day || !month || day > 31 || month > 12) return null
  const year = today.getUTCFullYear()
  const date = new Date(Date.UTC(year, month - 1, day))
  // Only "2 января" written in November–December means next year; any other past date is simply old.
  if (month <= 2 && today.getUTCMonth() >= 10 && date.getTime() < today.getTime()) date.setUTCFullYear(year + 1)
  return isoDay(date)
}

const CHRONICLES = [
  [/\b(essence|эссенс)\b/i, 'essence', 'Essence'],
  [/\b(interlude|интерлюд|il)\b/i, 'interlude', 'Interlude'],
  [/\b(high\s*five|hf|хай\s*файв)\b/i, 'high-five', 'High Five'],
  [/\bclassic\b/i, 'classic', 'Classic'],
  [/\b(epilogue|эпилог)\b/i, null, 'Gracia Epilogue'],
  [/\b(gracia\s*final|gracia|gf)\b/i, null, 'Gracia Final'],
  [/\b(goddess of destruction|god)\b/i, null, 'Goddess of Destruction'],
  [/\b(c4|scions? of destiny)\b/i, null, 'C4'],
  [/\b(c5|oath of blood)\b/i, null, 'C5'],
  [/\b(c3|rise of darkness)\b/i, null, 'C3'],
  [/\b(c1|harbingers of war)\b/i, null, 'C1'],
  [/\b(freya)\b/i, null, 'Freya'],
  [/\b(remastered)\b/i, null, 'Remastered'],
]
const chronicleOf = text => {
  for (const [re, id, label] of CHRONICLES) if (re.test(text)) return { chronicle: id, version: label }
  return null
}

const AD_WORDS = /(старт|открыт|онлайн|акци|бонус|вайп|скидк|подар|жми|бесплат|сегодня|новый|\bnew\b|обт|збт|\d{1,2}[./]\d{1,2}|январ|феврал|март|апрел|мая|июн|июл|август|сентябр|октябр|ноябр|декабр)/i
/** Brand of a site: "la2world.ru" → "La2world.ru". */
const brandOf = host => host.charAt(0).toUpperCase() + host.slice(1)
/**
 * The project's name, never the advertising around it. A listing title is kept only when it is short,
 * carries the site's brand and has no ad words; otherwise the card is named after the site, with rates.
 */
function cleanName(title, host, rate) {
  const base = host.split('.')[0].replace(/[^a-z0-9]/g, '')
  let name = title.split(/\s*[-–—|/]+\s+|\s+[-–—|/]+\s*|——|\s[🔥⭐❗✅⚡]/u)[0]
  name = name.replace(/[\p{Extended_Pictographic}️]/gu, '').replace(/\s+/g, ' ').trim()
  const compact = name.toLowerCase().replace(/[^a-z0-9]/g, '')
  const usable = name.length >= 3 && name.length <= 32 && name.split(' ').length <= 4 && !AD_WORDS.test(name) && compact.includes(base.slice(0, 5))
  if (usable) return name
  return brandOf(host) + (rate ? ' ' + rate : '')
}
// Throwaway promo domains are not a project's site.
const SPAM_HOST = /(bonus|promo|casino|\bbet|\d{1,2}-\d{1,2}|server\.link)/i

const hostOf = url => { try { return new URL(url).hostname.replace(/^www\./, '').toLowerCase() } catch { return null } }

/** The project's own site must answer and mention the project; returns its clean origin. */
async function confirmOfficial(rawUrl) {
  let url
  try { url = new URL(rawUrl) } catch { return { ok: false, reason: 'bad url' } }
  if (!['http:', 'https:'].includes(url.protocol)) return { ok: false, reason: 'not http' }
  const origin = 'https://' + url.hostname.replace(/^www\./, '') + '/'
  let response
  try { response = await politeFetch(origin) } catch (error) { return { ok: false, reason: 'site unreachable: ' + error.message } }
  if (!response.ok) return { ok: false, reason: 'site answered ' + response.status }
  const html = (await response.text()).slice(0, 400000)
  const text = plain(html).toLowerCase()
  // The site must carry its own brand: a parked or redirect page does not.
  const site = url.hostname.replace(/^www\./, '').toLowerCase()
  const base = site.split('.')[0]
  if (base.length >= 3 && !text.includes(base) && !html.toLowerCase().includes(site)) return { ok: false, reason: 'site does not name its own brand' }
  if (!/lineage|l2|интерлюд|interlude|high five|essence/i.test(text)) return { ok: false, reason: 'site is not about Lineage 2' }
  return { ok: true, origin: new URL(response.url).origin + '/' }
}

async function main() {
  const dataset = JSON.parse(readFileSync(DATASET_FILE, 'utf8'))
  loadDataset() // the existing dataset must be valid before anything is added
  const knownIds = new Set()
  const knownHosts = new Set()
  const knownNames = new Set()
  for (const record of dataset) {
    for (const ref of [record.source, ...(record.refs ?? [])]) {
      const id = ref?.url?.match(/mmotop\.ru\/servers\/(\d+)/)?.[1]
      if (id) knownIds.add(id)
    }
    const host = hostOf(record.website)
    if (host) knownHosts.add(host)
    knownNames.add(record.name.toLowerCase())
  }

  const listed = new Map()
  for (let page = 1; page <= PAGES; page++) {
    const response = await monitorPage(page === 1 ? '/' : `/?page=${page}`)
    if (!response.ok) { console.log(`list page ${page}: HTTP ${response.status}, stop`); break }
    const items = parseList(await response.text())
    if (!items.length) break
    for (const item of items) if (!listed.has(item.id)) listed.set(item.id, item)
  }

  const windowStart = today.getTime() - 45 * 86400000
  const windowEnd = today.getTime() + 75 * 86400000
  const report = { at: new Date().toISOString(), listed: listed.size, added: [], skipped: [] }
  const additions = []
  for (const item of listed.values()) {
    if (additions.length >= LIMIT) break
    if (knownIds.has(item.id)) continue
    const parsed = openingDate(item.title)
    const inWindow = !!parsed && Date.parse(parsed) >= windowStart && Date.parse(parsed) <= windowEnd
    // A date far from today is more likely a stale ad than the real opening: better none than a wrong one.
    const opened = inWindow ? parsed : null
    const fresh = item.isNew || inWindow
    if (!fresh) continue
    const page = await monitorPage(`/servers/${item.id}`)
    const pageText = page.ok ? plain(await page.text()) : ''
    const chronicle = chronicleOf(item.title) ?? chronicleOf(pageText.match(/Теги(.{0,200})/)?.[1] ?? '')
    if (!chronicle) { report.skipped.push({ id: item.id, title: item.title, reason: 'chronicle not stated' }); continue }

    const jump = await monitorPage(`/servers/${item.id}/url`)
    const location = jump.headers.get('location')
    if (!location) { report.skipped.push({ id: item.id, title: item.title, reason: 'no official site link' }); continue }
    const host = hostOf(location)
    if (!host || /mmotop\.ru$/.test(host)) { report.skipped.push({ id: item.id, title: item.title, reason: 'link does not leave the monitor' }); continue }
    if (knownHosts.has(host)) { report.skipped.push({ id: item.id, title: item.title, reason: 'site already in catalog' }); continue }
    if (SPAM_HOST.test(host)) { report.skipped.push({ id: item.id, title: item.title, reason: 'promo domain' }); continue }
    const official = await confirmOfficial(location)
    if (!official.ok) { report.skipped.push({ id: item.id, title: item.title, reason: official.reason }); continue }

    const rate = item.rates.find(value => /^x\s?\d/i.test(value)) ?? item.title.match(/\bx\s?\d{1,6}\b/i)?.[0] ?? null
    const name = cleanName(item.title, host, rate ? rate.replace(/\s/g, '').toLowerCase() : null)
    if (knownNames.has(name.toLowerCase())) { report.skipped.push({ id: item.id, title: item.title, reason: 'name already in catalog' }); continue }
    const listing = `${MONITOR}/servers/${item.id}`
    const record = {
      key: `l2:${host}`,
      game: 'lineage2',
      name,
      website: official.origin,
      chronicle: chronicle.chronicle,
      version: chronicle.version,
      rates: rate ? rate.replace(/\s/g, '').toLowerCase() : null,
      openedAt: opened,
      languages: [],
      country: null,
      endpoint: null,
      source: { name: 'Официальный сайт', url: official.origin },
      refs: [{ name: 'Официальный сайт', url: official.origin }, { name: 'MMOTOP Lineage 2', url: listing }],
      checkedAt: isoDay(today),
      confidence: 'confirmed',
      notes: `Found automatically on ${isoDay(today)}; official site answered and names the project.`,
    }
    try { validateRecord(record, 'discovery') } catch (error) { report.skipped.push({ id: item.id, title: item.title, reason: 'invalid: ' + error.message }); continue }
    additions.push(record)
    knownHosts.add(host)
    knownNames.add(name.toLowerCase())
    report.added.push({ id: item.id, name, website: official.origin, version: chronicle.version, rates: record.rates, openedAt: opened })
  }

  mkdirSync(REPORT_DIR, { recursive: true })
  writeFileSync(path.join(REPORT_DIR, 'last-run.json'), JSON.stringify(report, null, 2))
  console.log(`Listed on monitor: ${report.listed}. New and confirmed: ${report.added.length}. Skipped: ${report.skipped.length}.`)
  for (const item of report.added) console.log(`  + ${item.name} · ${item.version}${item.rates ? ' · ' + item.rates : ''}${item.openedAt ? ' · ' + item.openedAt : ''} · ${item.website}`)
  for (const item of report.skipped) console.log(`  - ${item.title}: ${item.reason}`)

  if (WRITE && additions.length) {
    const next = [...dataset, ...additions]
    writeFileSync(DATASET_FILE, JSON.stringify(next, null, 2) + '\n')
    loadDataset() // the whole dataset must still validate after the write
    console.log(`Written ${additions.length} record(s) to ${path.relative(process.cwd(), DATASET_FILE)}`)
  } else if (!WRITE && additions.length) {
    console.log('Plan only: re-run with --write to add them.')
  }
}

main().catch(error => { console.error(error); process.exit(1) })
