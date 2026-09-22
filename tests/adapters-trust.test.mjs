/**
 * The online trust model, adapter by adapter.
 *
 * What a status promises is the product: VERIFIED only when GameScout counted
 * the players itself from the endpoint of that specific server; a number the
 * server declares about itself is LIVE; Lineage 2 never publishes a count.
 * Transports are injected, so no test touches the network.
 */
import assert from 'node:assert/strict'
import test from 'node:test'

const { probeMinecraft, probeFiveM, probeLineage2 } = await import('../worker/adapters/games.ts')

const PUBLIC_IP = '203.0.114.10'
const resolveHost = async () => [PUBLIC_IP]

function varInt(value) {
  const bytes = []
  do {
    let byte = value & 0x7f
    value >>>= 7
    if (value) byte |= 0x80
    bytes.push(byte)
  } while (value)
  return bytes
}

/** A socket whose server side answers with `reply` once the client wrote, or greets first. */
function scriptedTransport(reply, { greet = false, seen = [] } = {}) {
  let push
  const readable = new ReadableStream({
    start: controller => {
      push = controller
      if (greet) controller.enqueue(new Uint8Array(reply))
    },
  })
  const writable = new WritableStream({
    write(chunk) {
      seen.push(chunk)
      push.enqueue(new Uint8Array(reply))
    },
  })
  return { readable, writable, opened: Promise.resolve(), closed: new Promise(() => {}), close: async () => {} }
}

function slpReply(status) {
  const json = [...new TextEncoder().encode(JSON.stringify(status))]
  const body = [...varInt(0x00), ...varInt(json.length), ...json]
  return [...varInt(body.length), ...body]
}

test('Minecraft SLP is LIVE with the count the server declares — never VERIFIED', async () => {
  const result = await probeMinecraft('play.example-network.net', 25565, {
    resolveHost,
    connect: () => scriptedTransport(slpReply({ players: { online: 1234, max: 5000 } })),
  })
  assert.equal(result.status, 'LIVE')
  assert.equal(result.online, 1234)
  assert.equal(result.maxOnline, 5000)
  assert.equal(result.method, 'GAME_PROTOCOL')
})

test('Minecraft honours the _minecraft._tcp SRV record when no port is given', async () => {
  const dialled = []
  const result = await probeMinecraft('play.example-network.net', null, {
    resolveHost,
    resolveSrv: async () => ({ host: 'node7.example-network.net', port: 25577 }),
    connect: (host, port) => {
      dialled.push(port)
      return scriptedTransport(slpReply({ players: { online: 5, max: 20 } }))
    },
  })
  assert.deepEqual(dialled, [25577])
  assert.equal(result.status, 'LIVE')
  assert.match(result.source, /node7\.example-network\.net:25577/)
})

test('Lineage 2 login server is LIVE without a player count', async () => {
  const result = await probeLineage2('login.example-l2.net', 2106, { resolveHost, connect: () => scriptedTransport([0x01], { greet: true }) })
  assert.equal(result.status, 'LIVE')
  assert.equal(result.online, null)
})

/** A FiveM server's built-in HTTP endpoints; `routes` maps path → [status, body]. */
function fivem(routes) {
  return async url => {
    const [status, body] = routes[new URL(String(url)).pathname] ?? [404, '']
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status })
  }
}

const INFO = { vars: { sv_projectName: '^3Example ^7City RP', sv_maxClients: '128' } }
const DYNAMIC = { hostname: 'Example City RP | whitelist', clients: 41, sv_maxclients: 128 }

const roster = n => Array.from({ length: n }, (_, i) => ({ id: i + 1, name: 'Player ' + (i + 1) }))

test('FiveM: a roster counted directly from the identified server is VERIFIED', async () => {
  const fetcher = fivem({ '/info.json': [200, INFO], '/dynamic.json': [200, { ...DYNAMIC, clients: 41 }], '/players.json': [200, roster(40)] })
  const result = await probeFiveM('http://203.0.114.10:30120/', { fetcher, resolveHost }, 'Example City RP')
  assert.equal(result.status, 'VERIFIED')
  assert.equal(result.online, 40, 'the count is the roster we received, not the declared number')
  assert.equal(result.maxOnline, 128)
})

test('FiveM: an anonymised players.json (placeholder entries) is only LIVE', async () => {
  const placeholders = Array.from({ length: 41 }, () => ({ endpoint: '127.0.0.1', id: 0, identifiers: [], name: 'Player', ping: 0 }))
  const fetcher = fivem({ '/info.json': [200, INFO], '/dynamic.json': [200, DYNAMIC], '/players.json': [200, placeholders] })
  const result = await probeFiveM('http://203.0.114.10:30120/', { fetcher, resolveHost }, 'Example City RP')
  assert.equal(result.status, 'LIVE')
  assert.equal(result.online, 41)
  assert.match(result.note, /обезличенный/)
})

test('FiveM: a roster that contradicts dynamic.json is only LIVE', async () => {
  const fetcher = fivem({ '/info.json': [200, INFO], '/dynamic.json': [200, { ...DYNAMIC, clients: 300 }], '/players.json': [200, roster(12)] })
  const result = await probeFiveM('http://203.0.114.10:30120/', { fetcher, resolveHost }, 'Example City RP')
  assert.equal(result.status, 'LIVE')
})

test('FiveM: info.json alone proves the server answers, with no number', async () => {
  const fetcher = fivem({ '/info.json': [200, INFO] })
  const result = await probeFiveM('http://203.0.114.10:30120/', { fetcher, resolveHost }, 'Example City RP')
  assert.equal(result.status, 'LIVE')
  assert.equal(result.online, null)
})

test('FiveM: an endpoint answering as another project is ANOMALY with no number', async () => {
  const fetcher = fivem({ '/info.json': [200, { vars: { sv_projectName: 'Someone Else RP' } }], '/players.json': [200, roster(1)] })
  const result = await probeFiveM('http://203.0.114.10:30120/', { fetcher, resolveHost }, 'Example City RP')
  assert.equal(result.status, 'ANOMALY')
  assert.equal(result.online, null)
})

test('FiveM: hidden players.json falls back to the declared count as LIVE', async () => {
  const fetcher = fivem({ '/info.json': [200, INFO], '/dynamic.json': [200, DYNAMIC], '/players.json': [403, ''] })
  const result = await probeFiveM('http://203.0.114.10:30120/', { fetcher, resolveHost }, 'Example City RP')
  assert.equal(result.status, 'LIVE')
  assert.equal(result.online, 41)
})

test('FiveM: data relayed through Cfx.re is never VERIFIED', async () => {
  const fetcher = fivem({ '/info.json': [200, INFO], '/players.json': [200, roster(1)] })
  const result = await probeFiveM('https://example-abc123.users.cfx.re/', { fetcher, resolveHost }, 'Example City RP')
  assert.equal(result.status, 'LIVE')
})

test('FiveM: no endpoint answering is OFFLINE', async () => {
  const fetcher = fivem({})
  const result = await probeFiveM('http://203.0.114.10:30120/', { fetcher, resolveHost })
  assert.equal(result.status, 'OFFLINE')
  assert.equal(result.online, null)
})
