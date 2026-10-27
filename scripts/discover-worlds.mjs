/** Public catalogue enrichment for GTA/MC and conservative official opening refresh for all worlds.
 * Plan: node scripts/discover-worlds.mjs ; write: add --write. No private API/cloud resources.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createReader } from './discovery/http.mjs'
import { plain, gta5rpWorlds, minecraftList, minecraftDetail, announcedOpening } from './discovery/facts.mjs'
import { loadDataset, validateRecord } from './import/dataset.mjs'
const write = process.argv.includes('--write')
const read = createReader()
const now = new Date(); const day = now.toISOString().slice(0,10)
const games = ['gtarp','minecraft','lineage2']
const datasets = Object.fromEntries(games.map(g => [g, JSON.parse(readFileSync(`import/${g}.json`, 'utf8'))]))
loadDataset()
const report = { at: now.toISOString(), added: [], updated: [], candidates: [], skipped: [], sources: [] }
const changed = new Set()
async function page(url) {
  try { const result = await read(url); report.sources.push({ url, status: 'ok' }); return result }
  catch (error) { report.sources.push({ url, status: 'unavailable', reason: error.message }); return null }
}
function add(game, record) {
  const list = datasets[game]
  if (list.some(r => r.key === record.key || r.name.toLowerCase() === record.name.toLowerCase())) return
  validateRecord(record, 'discovery')
  list.push(record); changed.add(game); report.added.push({ game, key: record.key, name: record.name })
}
// Official SSR exposes stable world names/hosts; corroborate EACH world with the platform's live master.
// Master player counts are deliberately NOT imported as independently verified measurements.
const gta = await page('https://gta5rp.com/')
const masterPage = await page('https://cdn.rage.mp/master/')
if (gta && masterPage) {
  let master
  try { master = JSON.parse(masterPage.text) } catch { report.skipped.push({ game: 'gtarp', reason: 'invalid platform master JSON' }) }
  if (master) {
    for (const world of gta5rpWorlds(gta.text)) {
      const address = world.host + ':' + world.port
      const match = master[address]
      if (!match || !String(match.name).toLowerCase().includes(world.name.toLowerCase()) || !/gta5rp\.com/i.test(match.url ?? '')) {
        report.skipped.push({ game: 'gtarp', name: world.name, reason: 'official world not corroborated by platform master' }); continue
      }
      const key = 'gta:' + address
      // open_at is only accepted as an explicit, valid ISO timestamp, never a numeric guess.
      const opened = typeof world.open_at === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(world.open_at) && Number.isFinite(Date.parse(world.open_at)) ? new Date(world.open_at).toISOString() : null
      const existing = datasets.gtarp.find(r => r.key === key)
      if (existing && opened && existing.openedAt !== opened) {
        report.updated.push({ key, field: 'openedAt', before: existing.openedAt ?? null, after: opened, evidence: gta.url })
        existing.openedAt = opened; existing.checkedAt = day; changed.add('gtarp')
      }
      add('gtarp', {
        key, game: 'gtarp', name: 'GTA5RP · ' + world.name, website: 'https://gta5rp.com/',
        chronicle: 'ragemp', version: 'RAGE:MP', languages: ['Русский'], country: null, endpoint: null, openedAt: opened,
        source: { name: 'Официальный сайт GTA5RP', url: 'https://gta5rp.com/' },
        refs: [{ name: 'Официальный список миров GTA5RP', url: 'https://gta5rp.com/' }, { name: 'RAGE:MP platform master', url: 'https://cdn.rage.mp/master/' }],
        checkedAt: day, confidence: 'confirmed',
        notes: `Official world ${address} corroborated with RAGE:MP master on ${day}. Catalog identity only; no direct online endpoint is claimed.`,
      })
    }
    const hosts = new Set()
    for (const value of Object.values(master)) {
      try {
        const url = new URL(value.url)
        if (url.protocol !== 'https:' || /(^|\.)(rage\.mp|discord\.gg|discord\.com)$/.test(url.hostname) || hosts.has(url.hostname)) continue
        hosts.add(url.hostname)
        report.candidates.push({ game: 'gtarp', website: url.origin, reason: 'platform-listed project; official identity requires confirmation' })
      } catch { /* master includes missing/bare URLs; not enough evidence */ }
    }
  }
}
// A listing registration date is NOT a server opening. Require a real project site that also
// publishes this exact game address; social-only listings remain candidates rather than fake cards.
const mcList = await page('https://minecraft-mp.com/servers/latest/')
if (mcList) for (const id of minecraftList(mcList.text).slice(0,8)) {
  const listingUrl = `https://minecraft-mp.com/server-s${id}`
  if (datasets.minecraft.some(r => r.refs?.some(ref => ref.url === listingUrl))) continue
  const detail = await page(listingUrl)
  if (!detail) continue
  const facts = minecraftDetail(detail.text)
  if (!facts) { report.skipped.push({ game: 'minecraft', url: listingUrl, reason: 'no supported official website/address' }); continue }
  if (datasets.minecraft.some(r => r.endpoint?.host === facts.endpoint.host)) continue
  const official = await page(facts.website)
  if (!official || !plain(official.text).toLowerCase().includes(facts.endpoint.host.toLowerCase()) || !/minecraft/i.test(plain(official.text))) {
    report.candidates.push({ game: 'minecraft', website: facts.website, reason: 'official site did not corroborate game address' }); continue
  }
  try {
    add('minecraft', {
      ...facts, key: 'mc:' + facts.endpoint.host + (facts.endpoint.port ? ':' + facts.endpoint.port : ''), game: 'minecraft',
      chronicle: null, languages: [], country: null, openedAt: announcedOpening(official.text, now),
      source: { name: 'Официальный сайт', url: official.url },
      refs: [{ name: 'Официальный сайт', url: official.url }, { name: 'Minecraft-MP listing', url: listingUrl }],
      checkedAt: day, confidence: 'confirmed', notes: `Listing address corroborated on official website on ${day}. Listing registration is not treated as launch.`,
    })
  } catch (error) { report.skipped.push({ game: 'minecraft', url: listingUrl, reason: error.message }) }
}
// Rotate a bounded batch every scheduled slot, so all existing projects are revisited without
// launching hundreds of HTTP requests per run. Shared-site/multi-world launches require structured
// per-world evidence (above); never assign a homepage date to every world in a network.
const slot = Math.floor(now.getTime() / (8 * 3600000))
for (const game of games) {
  const list = datasets[game].filter(r => r.confidence === 'confirmed' && r.website)
  for (let n = 0; n < Math.min(8,list.length); n++) {
    const record = list[(slot * 8 + n) % list.length]
    const host = new URL(record.website).hostname.replace(/^www\./,'')
    if (list.filter(r => new URL(r.website).hostname.replace(/^www\./,'') === host).length > 1) continue
    const official = await page(record.website)
    if (!official) continue
    const date = announcedOpening(official.text, now, { rates: game === 'lineage2' ? record.rates : null })
    if (!date || date < day || record.openedAt === date) continue
    // Historical first opening must never be overwritten by a re-opening of the same server.
    if (record.openedAt && record.openedAt < day) {
      report.candidates.push({ game, key: record.key, date, reason: 'possible reopening; preserve original opening until distinct world is identified' }); continue
    }
    report.updated.push({ key: record.key, field: 'openedAt', before: record.openedAt ?? null, after: date, evidence: official.url })
    record.openedAt = date; record.checkedAt = day; changed.add(game)
  }
}
// Validate all proposed files before the first write; a failed source does not erase existing facts.
for (const game of changed) for (const record of datasets[game]) validateRecord(record, game)
mkdirSync('output/discovery', { recursive: true })
writeFileSync('output/discovery/worlds-run.json', JSON.stringify(report,null,2) + '\n')
if (write) for (const game of changed) writeFileSync(`import/${game}.json`, JSON.stringify(datasets[game],null,2) + '\n')
console.log(JSON.stringify({ mode: write ? 'written' : 'plan', added: report.added, updated: report.updated, candidates: report.candidates.length, skipped: report.skipped.length, unavailable: report.sources.filter(s => s.status !== 'ok').length },null,2))
if (write) loadDataset()
if (!report.sources.some(s => s.status === 'ok')) throw new Error('All discovery sources unavailable; inspect report')
