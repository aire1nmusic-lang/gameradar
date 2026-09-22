/** NuVotifier v2 compatibility; votes and reward ownership remain in the vote use-case. */
import { AdapterError } from '../adapters/network.ts'
import { withTcp, type ByteReader, type TcpOptions } from '../adapters/tcp.ts'

export interface VotifierVote {
  username: string
  address: string
  timestamp: number
  serviceName?: string
  uuid?: string
}
export interface VotifierTarget { host: string; port: number; token: string }
export interface DeliveryReceipt {
  transport: 'VOTIFIER_V2'
  /** ACK means accepted by NuVotifier, not proof that the reward plugin awarded anything. */
  accepted: true
  acknowledgedAt: string
}

export function parseVotifierGreeting(greeting: string): string {
  const parts = greeting.trim().split(/\s+/)
  if (parts.length !== 3 || parts[0] !== 'VOTIFIER' || !/^2(?:\.|$)/.test(parts[1]) ||
      !/^[A-Za-z0-9_+\-/=]{1,512}$/.test(parts[2])) {
    throw new AdapterError('unsupported_protocol', 'NuVotifier v2 challenge greeting required; v1 is not supported')
  }
  return parts[2]
}

function validIp(input: string): boolean {
  if (/^\d+\.\d+\.\d+\.\d+$/.test(input)) return input.split('.').every(p => Number(p) >= 0 && Number(p) <= 255)
  if (!input.includes(':') || input.includes('%') || /[\s/\[\]]/.test(input)) return false
  try { return new URL(`http://[${input}]/`).hostname.length > 2 } catch { return false }
}

export async function encodeVotifierV2(vote: VotifierVote, challenge: string, secret: string): Promise<Uint8Array> {
  if (!vote.username || vote.username.length > 64 || /[\x00-\x1f]/.test(vote.username) ||
      !validIp(vote.address) || !Number.isSafeInteger(vote.timestamp) || vote.timestamp < 0 ||
      !challenge || challenge.length > 512 || !secret || secret.length > 4096 ||
      (vote.uuid && !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(vote.uuid))) {
    throw new AdapterError('invalid_vote', 'Invalid vote, challenge or NuVotifier credential')
  }
  const serviceName = vote.serviceName ?? 'GameScout'
  if (!serviceName || serviceName.length > 128 || /[\x00-\x1f]/.test(serviceName)) throw new AdapterError('invalid_vote', 'Invalid service name')
  const payload = JSON.stringify({ serviceName, username: vote.username, address: vote.address,
    timestamp: vote.timestamp, challenge, ...(vote.uuid ? { uuid: vote.uuid } : {}) })
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signatureBytes = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(payload)))
  const signature = btoa(String.fromCharCode(...signatureBytes))
  const json = encoder.encode(JSON.stringify({ payload, signature }))
  if (json.length > 65535) throw new AdapterError('packet_too_large', 'Vote exceeds NuVotifier v2 packet limit')
  const packet = new Uint8Array(json.length + 4)
  const header = new DataView(packet.buffer)
  header.setUint16(0, 0x733a, false)
  header.setUint16(2, json.length, false)
  packet.set(json, 4)
  return packet
}

/** ACK is raw JSON: TCP chunks are not messages, and a trailing newline is not required. */
export async function readVotifierResponse(reader: ByteReader): Promise<void> {
  const bytes: number[] = []
  let depth = 0
  let inString = false
  let escaped = false
  let started = false
  for (let i = 0; i < 4096; i++) {
    const byte = (await reader.bytes(1))[0]
    bytes.push(byte)
    if (!started) {
      if ([9, 10, 13, 32].includes(byte)) continue
      if (byte !== 123) throw new AdapterError('invalid_response', 'NuVotifier acknowledgement must be JSON')
      started = true; depth = 1; continue
    }
    if (inString) {
      if (escaped) escaped = false
      else if (byte === 92) escaped = true
      else if (byte === 34) inString = false
    } else if (byte === 34) inString = true
    else if (byte === 123 || byte === 91) depth++
    else if (byte === 125 || byte === 93) depth--
    if (depth === 0) {
      let result: { status?: string }
      try { result = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(bytes))) }
      catch { throw new AdapterError('invalid_response', 'Malformed NuVotifier acknowledgement') }
      if (result.status === 'ok') return
      // Do not expose untrusted remote errors or secrets in the public response.
      if (result.status === 'error') throw new AdapterError('delivery_rejected', 'NuVotifier rejected the vote')
      throw new AdapterError('invalid_response', 'NuVotifier acknowledgement has an unknown status')
    }
  }
  throw new AdapterError('response_too_large', 'NuVotifier acknowledgement exceeds limit')
}

export async function deliverVotifierV2(target: VotifierTarget, vote: VotifierVote, options: TcpOptions = {}): Promise<DeliveryReceipt> {
  return withTcp(target.host, target.port, options, async (reader, writer) => {
    const challenge = parseVotifierGreeting(await reader.line(1024))
    const packet = await encodeVotifierV2(vote, challenge, target.token)
    await writer.write(packet)
    await readVotifierResponse(reader)
    return { transport: 'VOTIFIER_V2', accepted: true, acknowledgedAt: new Date().toISOString() }
  })
}
