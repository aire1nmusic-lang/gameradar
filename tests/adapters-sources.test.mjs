/**
 * Online sources beyond our own probe, and the fallback chain
 * DIRECT → OFFICIAL → EXTERNAL → UNKNOWN. No network: fetch and sockets are
 * injected.
 */
import assert from 'node:assert/strict'
import test from 'node:test'

const { readSource, count, pick } = await import('../worker/adapters/sources.ts')
const { resolveOnline } = await import('../worker/lib/monitor.ts')
const { SubrequestBudget } = await import('../worker/lib/budget.ts')

const resolveHost = async () => ['203.0.114.10']
const routes = table => async url => {
  const href = String(url)
  const hit = Object.entries(table).find(([prefix]) => href.startsWith(prefix))
  if (!hit) return new Response('not found', { status: 404 })
  const [status, body] = hit[1]
  if (status === 'throw') throw new Error('network down')
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status })
}
const source = (provider, config, tier = 'EXTERNAL') => ({ tier, provider, name: provider, url: 'https://example-monitor.net/x', config })

test('counts are parsed strictly', () => {
  assert.equal(count('1 234'), 1234)
  assert.equal(count(56), 56)
  assert.equal(count('-3'), null)
  assert.equal(count('many'), null)
  assert.equal(pick({ a: { b: [{ c: 7 }] } }, 'a.b[0].c'), 7)
})

test('mcsrvstat: online, count and the time the monitor cached it', async () => {
  const fetcher = routes({ 'https://api.mcsrvstat.us/3/': [200, { online: true, players: { online: 812, max: 1000 }, debug: { cachetime: 1790000000 } }] })
  const reading = await readSource(source('mcsrvstat', { address: 'play.example-network.net' }), { fetcher, resolveHost })
  assert.deepEqual(reading, { up: true, online: 812, maxOnline: 1000, observedAt: new Date(1790000000 * 1000).toISOString() })
})

test('BattleMetrics: status and players from the server resource', async () => {
  const fetcher = routes({ 'https://api.battlemetrics.com/servers/123': [200, { data: { attributes: { status: 'online', players: 150, maxPlayers: 200, updatedAt: '2026-09-22T10:00:00.000Z' } } }] })
  const reading = await readSource(source('battlemetrics', { id: '123' }), { fetcher, resolveHost })
  assert.equal(reading.up, true)
  assert.equal(reading.online, 150)
  assert.equal(reading.observedAt, '2026-09-22T10:00:00.000Z')
})

test('official JSON and HTML counters use the curated path / pattern', async () => {
  const fetcher = routes({
    'https://example-l2.net/api/online': [200, { servers: [{ online: '1 204' }] }],
    'https://example-l2.net/': [200, '<div class="online">Онлайн: <b>987</b></div>'],
  })
  assert.equal((await readSource(source('official_json', { url: 'https://example-l2.net/api/online', path: 'servers[0].online' }, 'OFFICIAL'), { fetcher, resolveHost })).online, 1204)
  assert.equal((await readSource(source('official_html', { url: 'https://example-l2.net/', regex: 'Онлайн:\\s*<b>(\\d+)</b>' }, 'OFFICIAL'), { fetcher, resolveHost })).online, 987)
})

/* ── the chain ─────────────────────────────────────────────────────────── */

function slpTransport(online) {
  const varInt = v => { const out = []; do { let b = v & 0x7f; v >>>= 7; if (v) b |= 0x80; out.push(b) } while (v); return out }
  const json = [...new TextEncoder().encode(JSON.stringify({ players: { online, max: 100 } }))]
  const body = [...varInt(0), ...varInt(json.length), ...json]
  let push
  return {
    readable: new ReadableStream({ start: c => { push = c } }),
    writable: new WritableStream({ write() { push.enqueue(new Uint8Array([...varInt(body.length), ...body])) } }),
    opened: Promise.resolve(), closed: new Promise(() => {}), close: async () => {},
  }
}
const mcTarget = { gameSlug: 'minecraft', method: 'GAME_PROTOCOL', host: 'play.example-network.net', port: 25565 }
const refused = () => { throw new Error('connection refused') }

test('DIRECT answer ends the chain', async () => {
  const result = await resolveOnline(mcTarget, [source('mcstatus', { address: 'x' })], { resolveHost, connect: () => slpTransport(42), fetcher: refused })
  assert.equal(result.status, 'LIVE')
  assert.equal(result.tier, 'DIRECT')
  assert.equal(result.online, 42)
})

test('DIRECT fails → a monitor with a number gives EXTERNAL, never VERIFIED', async () => {
  const fetcher = routes({ 'https://api.mcstatus.io/': [200, { online: true, retrieved_at: Date.now(), players: { online: 900, max: 1000 } }] })
  const result = await resolveOnline(mcTarget, [source('mcstatus', { address: 'x' })], { resolveHost, connect: refused, fetcher, timeoutMs: 200 })
  assert.equal(result.status, 'EXTERNAL')
  assert.equal(result.tier, 'EXTERNAL')
  assert.equal(result.online, 900)
  assert.match(result.note, /Прямая проверка/)
})

test('one monitor saying "down" loses to another with a number', async () => {
  const fetcher = routes({
    'https://api.mcsrvstat.us/': [200, { online: false }],
    'https://api.mcstatus.io/': [200, { online: true, players: { online: 5, max: 10 } }],
  })
  const result = await resolveOnline(null, [source('mcsrvstat', { address: 'x' }), source('mcstatus', { address: 'x' })], { fetcher, resolveHost })
  assert.equal(result.status, 'EXTERNAL')
  assert.equal(result.online, 5)
})

test('OFFICIAL is tried before EXTERNAL and is OWNER_REPORTED', async () => {
  const fetcher = routes({
    'https://example-l2.net/api/online': [200, { online: 300 }],
    'https://api.battlemetrics.com/': [200, { data: { attributes: { status: 'online', players: 1 } } }],
  })
  const result = await resolveOnline(null, [source('battlemetrics', { id: '1' }), source('official_json', { url: 'https://example-l2.net/api/online', path: 'online' }, 'OFFICIAL')], { fetcher, resolveHost })
  assert.equal(result.status, 'OWNER_REPORTED')
  assert.equal(result.tier, 'OFFICIAL')
})

test('only sources that failed → UNKNOWN, not a false OFFLINE', async () => {
  const result = await resolveOnline(null, [source('mcstatus', { address: 'x' })], { fetcher: routes({ 'https://api.mcstatus.io/': ['throw'] }), resolveHost })
  assert.equal(result.status, 'UNKNOWN')
  assert.equal(result.online, null)
})

test('DIRECT down while every monitor is unreachable → UNKNOWN, not a false OFFLINE', async () => {
  const result = await resolveOnline(mcTarget, [source('mcstatus', { address: 'x' })], { resolveHost, connect: refused, fetcher: routes({}), timeoutMs: 200 })
  assert.equal(result.status, 'UNKNOWN')
  assert.match(result.note, /оснований для OFFLINE недостаточно/)
})

test('DIRECT down and a monitor also reports it down → OFFLINE', async () => {
  const fetcher = routes({ 'https://api.mcstatus.io/': [200, { online: false }] })
  const result = await resolveOnline(mcTarget, [source('mcstatus', { address: 'x' })], { resolveHost, connect: refused, fetcher, timeoutMs: 200 })
  assert.equal(result.status, 'OFFLINE')
  assert.match(result.note, /Прямая проверка GameScout и mcstatus/)
})

test('DIRECT down with no other source to ask → OFFLINE from our own probe', async () => {
  const result = await resolveOnline(mcTarget, [], { resolveHost, connect: refused, timeoutMs: 200 })
  assert.equal(result.status, 'OFFLINE')
  assert.equal(result.tier, 'DIRECT')
})

test('a source that is not available (Steam without key) is not even tried', async () => {
  let called = false
  const result = await resolveOnline(null, [source('steam', { address: '203.0.114.10:28015' })], { fetcher: async () => ((called = true), new Response('{}')), resolveHost })
  assert.equal(called, false)
  assert.equal(result.status, 'UNKNOWN')
  assert.match(result.note, /не подключён/)
})

test('running out of the invocation budget is marked skipped, never stored as OFFLINE', async () => {
  const budget = new SubrequestBudget(0)
  const fetcher = async () => { budget.take(); return new Response('{}') }
  const result = await resolveOnline(null, [source('mcstatus', { address: 'x' })], { fetcher, resolveHost })
  assert.equal(result.skipped, true)
})

test('budget: reservations must fit, real subrequests are capped', () => {
  const budget = new SubrequestBudget(12)
  assert.equal(budget.reserve(10), true)
  assert.equal(budget.reserve(10), false, 'a second card does not fit')
  budget.release(10)
  assert.equal(budget.reserve(10), true)
  for (let i = 0; i < 12; i++) budget.take()
  assert.throws(() => budget.take(), /budget/)
})

/* ── Steam Web API ─────────────────────────────────────────────────────── */

const steam = config => source('steam', config)
const withKey = { steamKey: 'test-key-not-real' }
const steamApi = body => routes({ 'https://api.steampowered.com/': body })

test('Steam: the key is required and never leaks into errors', async () => {
  await assert.rejects(readSource(steam({ address: '203.0.114.10:28015' }), { resolveHost }, {}), /not configured/)
  await assert.rejects(readSource(steam({ address: '203.0.114.10:28015' }), { fetcher: steamApi([403, 'Forbidden']), resolveHost }, withKey), error => {
    assert.equal(error.code, 'steam_forbidden')
    assert.ok(!String(error.message).includes('test-key-not-real'))
    return true
  })
  await assert.rejects(readSource(steam({ address: '203.0.114.10:28015' }), { fetcher: steamApi([429, 'slow down']), resolveHost }, withKey), { code: 'rate_limited' })
})

test('Steam: a listed server gives the count; Rust cp/mp tags beat the wrapped player fields', async () => {
  const fetcher = steamApi([200, { response: { servers: [{ addr: '203.0.114.10:28016', gameport: 28015, players: 17, max_players: 182, gametype: 'monthly,cp785,mp850,v2560' }] } }])
  const reading = await readSource(steam({ address: '203.0.114.10:28015' }), { fetcher, resolveHost }, withKey)
  assert.equal(reading.up, true)
  assert.equal(reading.online, 785)
  assert.equal(reading.maxOnline, 850)
})

test('Steam: another address in the answer is refused; an empty list means down', async () => {
  const other = steamApi([200, { response: { servers: [{ addr: '198.51.200.1:27015', gameport: 27015, players: 5 }] } }])
  await assert.rejects(readSource(steam({ address: '203.0.114.10:27015' }), { fetcher: other, resolveHost }, withKey), { code: 'address_mismatch' })
  const empty = steamApi([200, { response: {} }])
  assert.equal((await readSource(steam({ address: '203.0.114.10:27015' }), { fetcher: empty, resolveHost }, withKey)).up, false)
  const broken = steamApi([200, {}])
  await assert.rejects(readSource(steam({ address: '203.0.114.10:27015' }), { fetcher: broken, resolveHost }, withKey), { code: 'invalid_payload' })
})
