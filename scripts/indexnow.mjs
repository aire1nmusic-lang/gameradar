// Tells Yandex (IndexNow) which public pages exist or changed, so new pages are crawled in days, not weeks.
// Run after a successful site deploy:  node scripts/indexnow.mjs            (every URL of the live sitemap)
//                                     node scripts/indexnow.mjs /about /lineage-2   (only these paths)
// The key in public/indexnow.txt is public by design: IndexNow checks that the site serves it.
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const ORIGIN = 'https://gamescout.online'
const ENDPOINT = 'https://yandex.com/indexnow'
const key = readFileSync(new URL('../public/indexnow.txt', import.meta.url), 'utf8').trim()
const keyLocation = `${ORIGIN}/indexnow.txt`

export function urlsFromSitemap(xml) {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1].replace(/&amp;/g, '&')).filter(url => url.startsWith(ORIGIN + '/'))
}

export function payload(urls) {
  return { host: new URL(ORIGIN).host, key, keyLocation, urlList: urls.slice(0, 10000) }
}

async function main() {
  const served = await fetch(keyLocation, { headers: { 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(15000) })
  if (!served.ok || (await served.text()).trim() !== key) throw new Error(`${keyLocation} does not serve the current key yet: deploy the site first`)
  const paths = process.argv.slice(2)
  const urls = paths.length ? paths.map(path => ORIGIN + (path.startsWith('/') ? path : '/' + path))
    : urlsFromSitemap(await (await fetch(`${ORIGIN}/sitemap.xml`, { signal: AbortSignal.timeout(15000) })).text())
  if (!urls.length) throw new Error('No URLs to submit')
  const response = await fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(payload(urls)), signal: AbortSignal.timeout(30000) })
  // 200/202 accepted; 422 a URL is not on this host; 403 the key file did not match.
  console.log(`IndexNow (Yandex): HTTP ${response.status} for ${urls.length} URLs`)
  if (response.status !== 200 && response.status !== 202) process.exit(1)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main()
