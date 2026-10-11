/**
 * Read-only public catalog bridge for CI when the Yandex entry is unreachable from GitHub.
 * The service binding calls the existing production GameScout Worker directly:
 * no D1 credentials, no private API routes and no public DNS changes.
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (request.method !== 'GET' || url.pathname !== '/api/v1/servers') {
      return new Response('Not found', { status: 404 })
    }
    if ([...url.searchParams.keys()].some(key => !['limit', 'offset'].includes(key))) {
      return new Response('Unsupported query', { status: 400 })
    }
    const limit = url.searchParams.get('limit')
    const offset = url.searchParams.get('offset')
    if (limit !== '100' || offset === null || !/^(0|[1-9][0-9]*)$/.test(offset) ||
        Number(offset) > 100000 || Number(offset) % 100 !== 0) {
      return new Response('Invalid catalog page', { status: 400 })
    }
    const endpoint = 'https://gamescout.online/api/v1/servers?limit=100&offset=' + offset
    try {
      const res = await env.CATALOG_API.fetch(new Request(endpoint, {
        method: 'GET',
        headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
      }))
      return new Response(res.body, {
        status: res.status,
        headers: {
          'Content-Type': res.headers.get('Content-Type') || 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
          'X-Robots-Tag': 'noindex, nofollow',
          'X-Content-Type-Options': 'nosniff',
        },
      })
    } catch {
      return new Response('Catalog temporarily unavailable', { status: 502,
        headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' } })
    }
  },
}
