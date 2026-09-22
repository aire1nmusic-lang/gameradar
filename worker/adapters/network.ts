/** Bounded network primitives. Owner-supplied targets are untrusted input. */
export class AdapterError extends Error {
  code: string
  constructor(code: string, message: string) { super(message); this.name = 'AdapterError'; this.code = code }
}

export interface NetworkOptions {
  timeoutMs?: number
  /** Test harness only; never set from a request body or production environment. */
  allowLoopback?: boolean
  fetcher?: typeof fetch
  resolveHost?: (host: string) => Promise<string[]>
  resolveSrv?: (host: string) => Promise<{ host: string; port: number } | undefined>
}

export function normalizeHost(input: string): string {
  if (!input || input.length > 253 || /[\s/@?#\\]/.test(input)) throw new AdapterError('invalid_target', 'Invalid hostname')
  let url: URL
  try { url = new URL(`http://${input}/`) } catch { throw new AdapterError('invalid_target', 'Invalid hostname') }
  if (url.port || url.username || url.password || url.pathname !== '/') throw new AdapterError('invalid_target', 'Host must not contain a port or path')
  const host = url.hostname.toLowerCase().replace(/\.$/, '')
  if (!host || host.includes('%')) throw new AdapterError('invalid_target', 'Invalid hostname')
  return host
}

function ipv4Octets(host: string): number[] | null {
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(host)) return null
  const octets = host.split('.').map(Number)
  return octets.every(n => n >= 0 && n <= 255) ? octets : null
}

export function isPublicIpv4(host: string): boolean {
  const ip = ipv4Octets(host)
  if (!ip) return false
  const [a, b, c] = ip
  return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
    (a === 192 && b === 0) || (a === 192 && b === 2) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113))
}

export function assertPublicHost(input: string, options: NetworkOptions = {}): string {
  const host = normalizeHost(input)
  if (options.allowLoopback && (host === 'localhost' || host === '127.0.0.1' || host === '[::1]')) return host
  // IPv6 monitoring is deliberately closed until pinning and reserved-range checks are implemented.
  if (host.includes(':') || host.startsWith('[')) throw new AdapterError('invalid_target', 'IPv6 targets are not supported yet')
  if (ipv4Octets(host)) {
    if (!isPublicIpv4(host)) throw new AdapterError('invalid_target', 'Private or reserved network targets are forbidden')
    return host
  }
  if (!host.includes('.') || /(^|\.)(localhost|local|internal|test|invalid|example|onion)$/.test(host) ||
      !host.split('.').every(part => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(part))) {
    throw new AdapterError('invalid_target', 'A public hostname is required')
  }
  return host
}

export function assertPort(port: number): number {
  if (!Number.isInteger(port) || port < 1 || port > 65535 || [25, 465, 587].includes(port)) {
    throw new AdapterError('invalid_target', 'Invalid or forbidden network port')
  }
  return port
}

export async function withDeadline<T>(operation: Promise<T>, timeoutMs = 5000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([operation, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new AdapterError('timeout', 'Remote service timed out')), Math.max(1, timeoutMs))
    })])
  } finally { if (timer) clearTimeout(timer) }
}

export async function readBoundedText(response: Response, maxBytes = 262144): Promise<string> {
  if (Number(response.headers.get('content-length') ?? 0) > maxBytes) {
    void response.body?.cancel().catch(() => {})
    throw new AdapterError('response_too_large', 'Remote response exceeds size limit')
  }
  if (!response.body) return ''
  const reader = response.body.getReader()
  const parts: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      size += chunk.value.byteLength
      if (size > maxBytes) throw new AdapterError('response_too_large', 'Remote response exceeds size limit')
      parts.push(chunk.value)
    }
    const body = new Uint8Array(size)
    let offset = 0
    for (const part of parts) { body.set(part, offset); offset += part.length }
    return new TextDecoder('utf-8', { fatal: true }).decode(body)
  } finally {
    void reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}

/** Resolve A records through a fixed resolver and pin TCP connections to the checked IPv4. */
export async function resolvePublicHost(input: string, options: NetworkOptions = {}): Promise<string> {
  const host = assertPublicHost(input, options)
  if (ipv4Octets(host) || host === 'localhost' || host === '[::1]') return host
  let addresses: string[]
  if (options.resolveHost) addresses = await options.resolveHost(host)
  else {
    const controller = new AbortController()
    try {
      const results = await withDeadline(Promise.all(['A', 'AAAA'].map(async type => {
        const response = await (options.fetcher ?? fetch)(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(host)}&type=${type}`, {
          headers: { Accept: 'application/dns-json' }, redirect: 'manual', signal: controller.signal,
        })
        if (!response.ok) throw new AdapterError('dns_failed', 'DNS lookup failed')
        return JSON.parse(await readBoundedText(response, 16384)) as { Status?: number; Answer?: { type: number; data: string }[] }
      })), options.timeoutMs)
      if (results.some(result => result.Status !== 0)) throw new AdapterError('dns_failed', 'DNS lookup failed')
      addresses = results.flatMap(result => (result.Answer ?? []).filter(answer => answer.type === 1 || answer.type === 28).map(answer => answer.data))
    } finally { controller.abort() }
  }
  if (!addresses.length || addresses.some(address => !isPublicIpv4(address) && !isPublicIpv6(address))) {
    throw new AdapterError('invalid_target', 'DNS must resolve only to public addresses')
  }
  return addresses.find(isPublicIpv4) ?? addresses[0]
}

/**
 * Minecraft's `_minecraft._tcp` SRV record, as the vanilla client resolves it.
 * Returns undefined when the name has no SRV record; the caller then uses the
 * default port. The target is validated like any other host before use.
 */
export async function resolveMinecraftSrv(input: string, options: NetworkOptions = {}): Promise<{ host: string; port: number } | undefined> {
  const host = assertPublicHost(input, options)
  if (ipv4Octets(host) || host === 'localhost') return undefined
  if (options.resolveSrv) return options.resolveSrv(host)
  const controller = new AbortController()
  try {
    const answer = await withDeadline((async () => {
      const response = await (options.fetcher ?? fetch)(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent('_minecraft._tcp.' + host)}&type=SRV`, {
        headers: { Accept: 'application/dns-json' }, redirect: 'manual', signal: controller.signal,
      })
      if (!response.ok) throw new AdapterError('dns_failed', 'DNS lookup failed')
      return JSON.parse(await readBoundedText(response, 16384)) as { Status?: number; Answer?: { type: number; data: string }[] }
    })(), options.timeoutMs)
    // "priority weight port target." — lowest priority wins, as in the client.
    const records = (answer.Answer ?? [])
      .filter(record => record.type === 33)
      .map(record => record.data.trim().split(/\s+/))
      .filter(parts => parts.length === 4)
      .map(([priority, , port, target]) => ({ priority: Number(priority), port: Number(port), host: target.replace(/\.$/, '') }))
      .sort((a, b) => a.priority - b.priority)
    const best = records[0]
    if (!best) return undefined
    return { host: assertPublicHost(best.host, options), port: assertPort(best.port) }
  } finally { controller.abort() }
}

/** One DNS answer per probe: a probe that makes several requests resolves once. */
export function memoizedResolver(options: NetworkOptions): NetworkOptions {
  if (options.resolveHost) return options
  const cache = new Map<string, Promise<string>>()
  return {
    ...options,
    resolveHost: host => {
      if (!cache.has(host)) cache.set(host, resolvePublicHost(host, options))
      return cache.get(host)!.then(address => [address])
    },
  }
}

export function assertPublicUrl(input: string, options: NetworkOptions = {}): URL {
  let url: URL
  try { url = new URL(input) } catch { throw new AdapterError('invalid_target', 'Invalid URL') }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash) {
    throw new AdapterError('invalid_target', 'Only HTTP(S) URLs without credentials or fragments are allowed')
  }
  assertPublicHost(url.hostname, options)
  if (url.port) assertPort(Number(url.port))
  return url
}

/** No redirects, bounded bytes/time, no cookies or owner supplied headers. */
export async function fetchPublicText(input: string, options: NetworkOptions & { maxBytes?: number } = {}): Promise<string> {
  const url = assertPublicUrl(input, options)
  await resolvePublicHost(url.hostname, options)
  const controller = new AbortController()
  try {
    return await withDeadline((async () => {
      // 'manual' is the only non-following mode workerd implements; a 3xx is
      // then rejected here so a redirect can never pivot us to a private host.
      const response = await (options.fetcher ?? fetch)(url, {
        redirect: 'manual', signal: controller.signal,
        headers: { Accept: 'application/json, text/plain', 'User-Agent': 'GameScout/1.0 (+https://gamescout.online)' },
      })
      if (response.status >= 300 && response.status < 400) {
        void response.body?.cancel().catch(() => {})
        throw new AdapterError('redirect_refused', 'Remote endpoint answered with a redirect')
      }
      if (!response.ok) {
        void response.body?.cancel().catch(() => {})
        throw new AdapterError(`http_${response.status}`, 'Remote endpoint did not return a successful response')
      }
      return readBoundedText(response, options.maxBytes)
    })(), options.timeoutMs)
  } finally { controller.abort() }
}

/** Global-unicast IPv6 only; reject documentation, protocol assignment and transition ranges. */
export function isPublicIpv6(input: string): boolean {
  if (!input.includes(':') || input.includes('.') || input.includes('%')) return false
  let canonical: string
  try { canonical = new URL(`http://[${input}]/`).hostname.slice(1, -1) } catch { return false }
  const first = Number.parseInt(canonical.split(':')[0], 16)
  if (first < 0x2000 || first > 0x3fff || first === 0x2002) return false
  if (first === 0x2001) {
    const second = Number.parseInt(canonical.split(':')[1] || '0', 16)
    if (second < 0x200 || second === 0xdb8) return false
  }
  if (first === 0x3fff && Number.parseInt(canonical.split(':')[1] || '0', 16) < 0x1000) return false
  return true
}

export async function safeFetchText(input: string, options: { maxBytes?: number; timeoutMs?: number; allowedOrigins?: string[] } = {}): Promise<string> {
  let url: URL
  try { url = new URL(input) } catch { throw new AdapterError('invalid_target', 'Invalid URL') }
  const allowLoopback = (options.allowedOrigins ?? []).includes(url.origin) &&
    ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  return fetchPublicText(input, { maxBytes: options.maxBytes, timeoutMs: options.timeoutMs, allowLoopback })
}

