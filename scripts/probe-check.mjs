/**
 * Probes every endpoint in the import dataset with the Worker's own adapters.
 *
 *   npm run import:probe
 *
 * Runs the exact code of worker/adapters/games.ts, with Node's TCP socket in
 * place of cloudflare:sockets. One status request per endpoint, like a game
 * client refreshing its server list — this is a check, not a scan.
 * The report lands in output/import/probe-*.json.
 */
import http from 'node:http'
import https from 'node:https'
import net from 'node:net'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { loadDataset } from './import/dataset.mjs'

const { probe } = await import('../worker/adapters/games.ts')

const GAME_SLUG = { lineage2: 'lineage-2', minecraft: 'minecraft', gtarp: 'gta-rp' }

/** cloudflare:sockets' shape over a Node socket (Duplex.toWeb stalls on some reads). */
function nodeConnect(host, port) {
  const socket = net.connect({ host, port })
  const opened = new Promise((resolve, reject) => {
    socket.once('connect', resolve)
    socket.once('error', reject)
  })
  const closed = new Promise(resolve => socket.once('close', () => resolve()))
  const readable = new ReadableStream({
    start(controller) {
      socket.on('data', chunk => controller.enqueue(new Uint8Array(chunk)))
      socket.once('end', () => { try { controller.close() } catch {} })
      socket.once('error', error => { try { controller.error(error) } catch {} })
    },
    cancel() { socket.destroy() },
  })
  const writable = new WritableStream({
    write: chunk => new Promise((resolve, reject) => socket.write(chunk, error => (error ? reject(error) : resolve()))),
    abort() { socket.destroy() },
  })
  return { readable, writable, opened, closed, close: async () => void socket.destroy() }
}

/**
 * fetch() that sends only the headers the adapter set, as the Workers runtime
 * does. Node's fetch adds sec-fetch-* and encoding headers that some game
 * servers' DDoS filters drop, which would report a live server as OFFLINE.
 */
function nodeFetch(input, init = {}) {
  const url = new URL(String(input))
  return new Promise((resolve, reject) => {
    const request = (url.protocol === 'https:' ? https : http).request(url, { method: 'GET', headers: init.headers ?? {} }, response => {
      const body = [204, 304].includes(response.statusCode)
        ? null
        : new ReadableStream({
            start(controller) {
              response.on('data', chunk => controller.enqueue(new Uint8Array(chunk)))
              response.once('end', () => { try { controller.close() } catch {} })
              response.once('error', error => { try { controller.error(error) } catch {} })
            },
            cancel() { response.destroy() },
          })
      const headers = Object.entries(response.headers).filter(([, value]) => typeof value === 'string')
      resolve(new Response(body, { status: response.statusCode, headers }))
    })
    init.signal?.addEventListener('abort', () => request.destroy(new Error('aborted')))
    request.once('error', reject)
    request.end()
  })
}

const records = loadDataset().filter(record => record.endpoint)
const queue = [...records]
const results = []
await Promise.all(
  Array.from({ length: 4 }, async () => {
    for (let record = queue.shift(); record; record = queue.shift()) {
      const e = record.endpoint
      const result = await probe(
        { gameSlug: GAME_SLUG[record.game], method: e.method, host: e.host, port: e.port, apiUrl: e.url, expectName: e.expectName },
        { connect: nodeConnect, fetcher: nodeFetch },
      )
      results.push({ key: record.key, name: record.name, game: record.game, confidence: record.confidence, ...result })
      const count = result.online === null ? '—' : `${result.online}/${result.maxOnline ?? '?'}`
      console.log(`${result.status.padEnd(8)} ${record.key.padEnd(34)} ${count.padEnd(14)} ${String(result.latencyMs).padStart(5)} ms  ${result.status === 'OFFLINE' ? result.note : result.source}`)
    }
  }),
)

const tally = results.reduce((acc, r) => ({ ...acc, [r.status]: (acc[r.status] ?? 0) + 1 }), {})
console.log('\n' + Object.entries(tally).map(([status, n]) => `${status}: ${n}`).join('  '))
mkdirSync('output/import', { recursive: true })
const file = path.resolve('output/import/probe-' + new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-') + '.json')
writeFileSync(file, JSON.stringify({ at: new Date().toISOString(), tally, results }, null, 2))
console.log('Report: ' + file)
