/**
 * NuVotifier v2 delivery.
 *
 * Runs the real protocol code against an in-memory NuVotifier that behaves
 * like the plugin: greets with a challenge, verifies the HMAC over the exact
 * payload it received, then acknowledges.
 *
 * The transport is injected, so this exercises the framing, the signature and
 * the acknowledgement parser without opening a socket.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { createHmac } from 'node:crypto'

const { deliverVotifierV2, encodeVotifierV2, parseVotifierGreeting, readVotifierResponse } = await import(
  '../worker/delivery/votifier-v2.ts'
)
const { ByteReader } = await import('../worker/adapters/tcp.ts')

const TOKEN = 'demo-nuvotifier-token'
const VOTE = { username: 'DemoPlayer', address: '203.0.113.10', timestamp: 1_700_000_000_000, serviceName: 'GameScout' }

/** A fake socket whose server side is scripted by `respond`. */
function fakeTransport({ greeting = 'VOTIFIER 2 challenge-abc\n', respond }) {
  const toClient = new TransformStream()
  const fromClient = new TransformStream()
  const writer = toClient.writable.getWriter()
  void writer.write(new TextEncoder().encode(greeting))

  const received = []
  void (async () => {
    const reader = fromClient.readable.getReader()
    const chunks = []
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      chunks.push(chunk.value)
      const size = chunks.reduce((total, part) => total + part.length, 0)
      const packet = new Uint8Array(size)
      let offset = 0
      for (const part of chunks) {
        packet.set(part, offset)
        offset += part.length
      }
      if (packet.length < 4) continue
      const view = new DataView(packet.buffer, packet.byteOffset, packet.byteLength)
      const length = view.getUint16(2, false)
      if (packet.length < length + 4) continue
      received.push({ magic: view.getUint16(0, false), body: new TextDecoder().decode(packet.slice(4, 4 + length)) })
      await writer.write(new TextEncoder().encode(respond(received[received.length - 1])))
      await writer.close()
      return
    }
  })()

  return {
    transport: {
      readable: toClient.readable,
      writable: fromClient.writable,
      opened: Promise.resolve(),
      closed: new Promise(() => {}),
      close: async () => {},
    },
    received,
  }
}

function acceptIfSigned(message) {
  const { payload, signature } = JSON.parse(message.body)
  const expected = createHmac('sha256', TOKEN).update(payload).digest('base64')
  return JSON.stringify({ status: signature === expected ? 'ok' : 'error' })
}

test('delivers a vote a real NuVotifier would accept', async () => {
  const fake = fakeTransport({ respond: acceptIfSigned })
  const receipt = await deliverVotifierV2(
    { host: 'mc.example.com', port: 8192, token: TOKEN },
    VOTE,
    { connect: () => fake.transport, resolveHost: async () => ['93.184.216.34'] },
  )

  assert.equal(receipt.transport, 'VOTIFIER_V2')
  assert.equal(receipt.accepted, true)
  assert.equal(fake.received.length, 1)
  assert.equal(fake.received[0].magic, 0x733a, 'v2 packets must carry the 0x733a magic header')

  const { payload } = JSON.parse(fake.received[0].body)
  const sent = JSON.parse(payload)
  assert.equal(sent.username, VOTE.username)
  assert.equal(sent.serviceName, 'GameScout')
  assert.equal(sent.challenge, 'challenge-abc', 'the server challenge must be echoed back')
  assert.ok(!fake.received[0].body.includes(TOKEN), 'the token must never travel in the packet')
})

test('a wrong token is rejected, never reported as delivered', async () => {
  const fake = fakeTransport({ respond: acceptIfSigned })
  await assert.rejects(
    deliverVotifierV2(
      { host: 'mc.example.com', port: 8192, token: 'wrong-token' },
      VOTE,
      { connect: () => fake.transport, resolveHost: async () => ['93.184.216.34'] },
    ),
    /delivery_rejected|NuVotifier rejected/,
  )
})

test('v1 servers are refused instead of being silently mishandled', () => {
  assert.throws(() => parseVotifierGreeting('VOTIFIER 1.9 abc'), /v1 is not supported/)
  assert.throws(() => parseVotifierGreeting('HELLO 2 abc'), /NuVotifier v2/)
  assert.equal(parseVotifierGreeting('VOTIFIER 2 challenge-abc'), 'challenge-abc')
})

test('the signature covers the exact payload bytes', async () => {
  const packet = await encodeVotifierV2(VOTE, 'challenge-abc', TOKEN)
  const body = JSON.parse(new TextDecoder().decode(packet.slice(4)))
  assert.equal(createHmac('sha256', TOKEN).update(body.payload).digest('base64'), body.signature)
})

test('malformed input is rejected before anything is sent', async () => {
  await assert.rejects(encodeVotifierV2({ ...VOTE, username: '' }, 'c', TOKEN), /invalid_vote|Invalid vote/)
  await assert.rejects(encodeVotifierV2({ ...VOTE, address: 'not-an-ip' }, 'c', TOKEN), /invalid_vote|Invalid vote/)
})

test('acknowledgement is parsed from raw JSON across chunk boundaries', async () => {
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder()
      controller.enqueue(encoder.encode('{"sta'))
      controller.enqueue(encoder.encode('tus":"ok"'))
      controller.enqueue(encoder.encode('}'))
      controller.close()
    },
  })
  await readVotifierResponse(new ByteReader(stream))
})
