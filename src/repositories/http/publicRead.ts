/** Public catalog reads share one in-flight request and a short memory cache. */
const pending = new Map<string, Promise<Response>>()
const cached = new Map<string, { at: number; response: Response }>()
const TTL = 15000

export function invalidatePublicReads() { cached.clear() }

export function apiFailureMessage(status: number): string {
  if ([502, 503, 504].includes(status)) return 'Сервис временно недоступен. Попробуйте немного позже.'
  if (status === 429) return 'Слишком много запросов. Подождите немного и попробуйте снова.'
  return 'Не удалось выполнить запрос'
}

async function boundedFetch(url: string, init: RequestInit): Promise<Response> {
  const get = !init.method || init.method.toUpperCase() === 'GET'
  const retryable = get && !init.signal && /\/api\/v1\/(?:servers|games)(?:[/?]|$)/.test(url)
  const attempts = retryable ? 2 : 1
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const response = await fetch(url, { ...init, signal: init.signal ?? (get ? AbortSignal.timeout(15000) : undefined) })
      if (attempt + 1 < attempts && [502, 503, 504].includes(response.status)) {
        await response.body?.cancel()
        continue
      }
      return response
    } catch (error) { if (attempt + 1 === attempts) throw error }
  }
  throw new Error('API недоступен')
}

export async function fetchApiResponse(url: string, init: RequestInit): Promise<Response> {
  const get = !init.method || init.method.toUpperCase() === 'GET'
  // Exact public routes only. Never reuse auth, ownership, votes, balances or writes.
  const share = get && !init.signal && !new Headers(init.headers).has('authorization') && /\/api\/v1\/(?:games|servers)(?:\?|$)/.test(url)
  if (!share) return boundedFetch(url, init)
  const existing = cached.get(url)
  if (existing && Date.now() - existing.at < TTL) return existing.response.clone()
  let request = pending.get(url)
  if (!request) {
    request = boundedFetch(url, init).then(async response => {
      if (response.status === 200 && response.headers.get('content-type')?.includes('application/json')) {
        const buffered = new Response(await response.arrayBuffer(), { status: response.status, statusText: response.statusText, headers: response.headers })
        cached.delete(url)
        cached.set(url, { at: Date.now(), response: buffered })
        if (cached.size > 60) cached.delete(cached.keys().next().value!)
        return buffered
      }
      return response
    }).finally(() => { pending.delete(url) })
    pending.set(url, request)
  }
  return (await request).clone()
}

