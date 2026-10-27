/** Public facts only; never infer an opening from a registration date, wipe or beta. */
export const decode = text => text.replace(/&quot;/g, '"').replace(/&#(?:39|x27);/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
export const plain = html => decode(html.replace(/<script\b[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()
const months = ['январ', 'феврал', 'март', 'апрел', 'ма', 'июн', 'июл', 'август', 'сентябр', 'октябр', 'ноябр', 'декабр']
const launch = /(?:открыти[ея]|открыва(?:ем|ется|ются)|запуск|старт|opening|launch(?:es)?|opens?)(?:\s|[:!—–-])/iu
const otherEvent = /вайп|wipe|reset|сезон|season|обт|збт|\bobt\b|\bcbt\b|beta|бета|тест|обновлен|update|ивент|event|турнир|розыгрыш|конкурс|restart|рестарт/iu
export function openingDate(text, now = new Date()) {
  // Read one announcement at a time. A bare date, even a future one, is not evidence.
  if (!launch.test(text) || otherEvent.test(text)) return null
  const marker = text.match(launch)
  const context = text.slice(Math.max(0, marker.index - 12), marker.index + 130)
  let day, month, year
  const numeric = context.match(/\b(\d{1,2})[./](\d{1,2})(?:[./](\d{4}))?(?![\d./])/u)
  const named = context.toLowerCase().match(/\b(\d{1,2})\s+(январ|феврал|март|апрел|мая|май|июн|июл|август|сентябр|октябр|ноябр|декабр)[а-я]*(?:\s+(\d{4}))?/u)
  if (numeric) { day = +numeric[1]; month = +numeric[2]; year = numeric[3] && +numeric[3] }
  else if (named) { day = +named[1]; month = months.findIndex(m => named[2].startsWith(m)) + 1; year = named[3] && +named[3] }
  else {
    const english = context.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?/i)
    if (!english) return null
    month = ['january','february','march','april','may','june','july','august','september','october','november','december'].indexOf(english[1].toLowerCase()) + 1
    day = +english[2]; year = english[3] && +english[3]
  }
  const explicit = !!year
  year ||= now.getUTCFullYear()
  if (!explicit && month <= 2 && now.getUTCMonth() >= 10) year++
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCDate() !== day || date.getUTCMonth() !== month - 1 || date.getUTCFullYear() !== year) return null
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  if (date.getTime() < today - 45 * 86400000 || date.getTime() > today + 75 * 86400000) return null
  return date.toISOString().slice(0, 10)
}
export function announcedOpening(html, now = new Date()) {
  // Preserve block boundaries: never associate a date from a neighbouring news item.
  const blocks = html.replace(/<script\b[\s\S]*?<\/script>/gi, '').split(/<\/(?:article|section|p|li|h[1-6])\s*>/i)
  const dates = new Set(blocks.map(plain).filter(t => t.length <= 350).map(t => openingDate(t, now)).filter(Boolean))
  return dates.size === 1 ? [...dates][0] : null
}
export function gta5rpWorlds(html) {
  const json = html.match(/<script\b(?=[^>]*\bid="__NEXT_DATA__")[^>]*>([\s\S]*?)<\/script>/i)?.[1]
  if (!json) return []
  const values = JSON.parse(json)?.props?.pageProps?.values ?? {}
  return Object.values(values).filter(Array.isArray).flat().filter(r => r && typeof r.name === 'string' && /^[a-z0-9-]+\.gta5rp\.com$/.test(r.host) && Number.isInteger(r.port) && r.port > 0 && r.port <= 65535 && r.name.length <= 40)
}
export function minecraftList(html) {
  return [...new Set([...html.matchAll(/href="\/server-s(\d+)"/g)].map(m => m[1]))]
}
export function minecraftDetail(html) {
  const row = label => html.match(new RegExp(`<strong>${label}</strong>[\\s\\S]*?<td[^>]*>([\\s\\S]*?)<\\/td>`, 'i'))?.[1] ?? ''
  const website = row('Website').match(/href="(https:\/\/[^"<>]+)"/)?.[1]
  const address = html.match(/data-clipboard-text="([a-z0-9.-]+(?::\d{1,5})?)"/i)?.[1]
  const name = plain(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? '').replace(/\s*\|.*$/, '').trim()
  const version = plain(row('Minecraft Version')).slice(0, 40)
  if (!website || !address || !name || name.length > 80 || /(?:best server|join now|free ranks|бесплат|бонус|скидк|подар)/i.test(name)) return null
  const host = new URL(website).hostname
  if (/(^|\.)(discord\.(gg|com)|youtube\.com|youtu\.be|tiktok\.com|facebook\.com|minecraft-mp\.com)$/i.test(host)) return null
  const [ip, port] = address.split(':')
  return { name, website: decode(website), version: version || 'Java Edition', endpoint: { method: 'GAME_PROTOCOL', host: ip, port: port ? +port : null } }
}
