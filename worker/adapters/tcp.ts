import { AdapterError, assertPort, resolvePublicHost, withDeadline, type NetworkOptions } from './network.ts'

export interface TcpTransport {
  readable: ReadableStream<Uint8Array>
  writable: WritableStream<Uint8Array>
  opened: Promise<unknown>
  closed: Promise<void>
  close(): Promise<void>
}
export type TcpConnector = (host: string, port: number) => Promise<TcpTransport> | TcpTransport
export interface TcpOptions extends NetworkOptions { connect?: TcpConnector }

export async function cloudflareConnect(host: string, port: number): Promise<TcpTransport> {
  const { connect } = await import('cloudflare:sockets')
  return connect({ hostname: host, port }, { secureTransport: 'off' }) as unknown as TcpTransport
}

export class ByteReader {
  reader: ReadableStreamDefaultReader<Uint8Array>
  buffer: Uint8Array = new Uint8Array(0)
  maxBytes: number
  total = 0
  constructor(stream: ReadableStream<Uint8Array>, maxBytes = 131072) { this.reader = stream.getReader(); this.maxBytes = maxBytes }
  async fill(minBytes: number): Promise<void> {
    if (minBytes > this.maxBytes) throw new AdapterError('response_too_large', 'Packet exceeds limit')
    while (this.buffer.length < minBytes) {
      const result = await this.reader.read()
      if (result.done) throw new AdapterError('unexpected_eof', 'Remote service closed an incomplete packet')
      this.total += result.value.length
      if (this.total > this.maxBytes) throw new AdapterError('response_too_large', 'Response exceeds limit')
      this.buffer = concatBytes(this.buffer, result.value)
    }
  }
  async bytes(length: number): Promise<Uint8Array> {
    await this.fill(length)
    const result = this.buffer.slice(0, length)
    this.buffer = this.buffer.slice(length)
    return result
  }
  async line(maxBytes = 4096): Promise<string> {
    let end = this.buffer.indexOf(10)
    while (end < 0) {
      if (this.buffer.length >= maxBytes) throw new AdapterError('response_too_large', 'Line exceeds limit')
      await this.fill(this.buffer.length + 1)
      end = this.buffer.indexOf(10)
    }
    if (end >= maxBytes) throw new AdapterError('response_too_large', 'Line exceeds limit')
    return new TextDecoder('utf-8', { fatal: true }).decode(await this.bytes(end + 1)).trimEnd()
  }
  async varInt(): Promise<number> {
    let value = 0
    for (let i = 0; i < 5; i++) {
      const byte = (await this.bytes(1))[0]
      if (i === 4 && (byte & 0xf0)) throw new AdapterError('invalid_packet', 'VarInt exceeds 32 bits')
      value |= (byte & 0x7f) << (7 * i)
      if (!(byte & 0x80)) return value
    }
    throw new AdapterError('invalid_packet', 'Invalid VarInt')
  }
  close(): void { void this.reader.cancel().catch(() => {}) }
}

export function concatBytes(...chunks: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0))
  let offset = 0
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length }
  return result
}

export async function withTcp<T>(host: string, port: number, options: TcpOptions, run: (reader: ByteReader, writer: WritableStreamDefaultWriter<Uint8Array>) => Promise<T>): Promise<T> {
  const address = await resolvePublicHost(host, options)
  assertPort(port)
  let transport: TcpTransport | undefined
  let reader: ByteReader | undefined
  let writer: WritableStreamDefaultWriter<Uint8Array> | undefined
  let stopped = false
  try {
    return await withDeadline((async () => {
      transport = await (options.connect ?? cloudflareConnect)(address, port)
      void transport.closed.catch(() => {})
      if (stopped) { void transport.close().catch(() => {}); throw new AdapterError('timeout', 'Remote service timed out') }
      await transport.opened
      if (stopped) throw new AdapterError('timeout', 'Remote service timed out')
      reader = new ByteReader(transport.readable)
      writer = transport.writable.getWriter()
      return run(reader, writer)
    })(), options.timeoutMs)
  } finally {
    stopped = true
    reader?.close()
    if (writer) void writer.abort().catch(() => {})
    if (transport) void transport.close().catch(() => {})
  }
}
