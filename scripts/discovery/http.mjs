import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
const UA = 'GameScoutBot/1.1 (+https://gamescout.online; public catalog discovery)'
export function publicAddress(address) {
  if (isIP(address) === 4) {
    const [a,b] = address.split('.').map(Number)
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0)) || (a === 100 && b >= 64 && b <= 127) || (a === 198 && (b === 18 || b === 19)))
  }
  // Only global unicast IPv6; mapped/private/link-local/multicast are rejected.
  return isIP(address) === 6 && /^[23][0-9a-f]{0,3}:/i.test(address) && !/^2001:db8:/i.test(address)
}
export function robotsAllowed(text, pathname, agent = 'gamescoutbot') {
  const groups = []; let group; let hasRules = false
  for (const line of text.split(/\r?\n/)) {
    const m = line.replace(/#.*$/, '').trim().match(/^([a-z-]+)\s*:\s*(.*)$/i)
    if (!m) continue
    const [, raw, value] = m; const field = raw.toLowerCase()
    if (field === 'user-agent') {
      if (!group || hasRules) { group = { agents: [], rules: [] }; groups.push(group); hasRules = false }
      group.agents.push(value.toLowerCase())
    } else if (group && ['allow', 'disallow'].includes(field)) { group.rules.push({ allow: field === 'allow', path: value }); hasRules = true }
  }
  const specific = groups.filter(g => g.agents.some(a => a !== '*' && agent.includes(a)))
  const applicable = specific.length ? specific : groups.filter(g => g.agents.includes('*'))
  let best = null
  for (const {rules} of applicable) for (const rule of rules) {
    if (!rule.path) continue
    const pattern = '^' + rule.path.replace(/[.+?^{}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\$$/, '$')
    if (new RegExp(pattern).test(pathname) && (!best || rule.path.length > best.path.length || (rule.path.length === best.path.length && rule.allow))) best = rule
  }
  return !best || best.allow
}
export function createReader({ pauseMs = 1500, timeoutMs = 12000 } = {}) {
  const cache = new Map(); let last = 0; let requests = 0
  const deadline = Date.now() + 7 * 60 * 1000
  async function raw(url, redirects = 0, robotsRequest = false) {
    if (Date.now() > deadline || ++requests > 120) throw new Error('discovery HTTP budget exhausted')
    const u = new URL(url)
    if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443')) throw new Error('only public HTTPS pages')
    const addresses = await lookup(u.hostname, { all: true })
    if (!addresses.length || addresses.some(a => !publicAddress(a.address))) throw new Error('non-public host')
    const wait = last + pauseMs - Date.now(); if (wait > 0) await new Promise(r => setTimeout(r, wait)); last = Date.now()
    const response = await fetch(u, { redirect: 'manual', headers: { 'User-Agent': UA, Accept: 'text/html,application/json,text/plain' }, signal: AbortSignal.timeout(timeoutMs) })
    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel()
      if (redirects >= 3) throw new Error('redirect limit')
      const next = new URL(response.headers.get('location'), u)
      // Every target page, including same-origin redirects, must pass robots.
      // Cross-origin robots redirects fail closed rather than recursing through policy discovery.
      if (robotsRequest) {
        if (next.origin !== u.origin || next.pathname !== '/robots.txt') throw new Error('unsupported robots redirect')
        return raw(next, redirects + 1, true)
      }
      return read(next.toString(), redirects + 1)
    }
    if (!response.ok) { await response.body?.cancel(); throw new Error('HTTP ' + response.status) }
    let size = 0; const chunks = []
    for await (const chunk of response.body) { size += chunk.length; if (size > 1500000) throw new Error('page too large'); chunks.push(chunk) }
    return { url: u.toString(), text: Buffer.concat(chunks).toString('utf8') }
  }
  async function read(url, redirects = 0) {
    const u = new URL(url)
    if (!cache.has(u.origin)) cache.set(u.origin, raw(u.origin + '/robots.txt', 0, true).then(r => r.text).catch(error => {
      if (error.message === 'HTTP 404') return ''
      throw error
    }))
    const robots = await cache.get(u.origin)
    if (!robotsAllowed(robots, u.pathname + u.search)) throw new Error('robots.txt disallows page')
    return raw(u, redirects)
  }
  return read
}
