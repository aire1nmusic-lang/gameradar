/** Bounded reads. Only transient failures on public GETs get one retry; writes never do. */
export async function fetchApiResponse(url: string, init: RequestInit): Promise<Response> {
  const get = !init.method || init.method.toUpperCase() === 'GET'
  const retryable = get && !init.signal && /\/api\/v1\/(?:servers|games)(?:[/?]|$)/.test(url)
  const attempts = retryable ? 2 : 1
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const response = await fetch(url, {
        ...init,
        signal: init.signal ?? (get ? AbortSignal.timeout(15000) : undefined),
      })
      if (attempt + 1 < attempts && [502, 503, 504].includes(response.status)) {
        await response.body?.cancel()
        continue
      }
      return response
    } catch (error) {
      if (attempt + 1 === attempts) throw error
    }
  }
  throw new Error('API недоступен')
}
