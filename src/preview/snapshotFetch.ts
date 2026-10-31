// Public preview builds only (VITE_SNAPSHOT=1): API reads come from a recorded snapshot of the live public API
// (scripts/preview-snapshot.mjs), so the preview runs on any static host. Writes are refused with a clear message.

/** File name of a recorded response; scripts/preview-snapshot.mjs uses the same rule. */
export function snapshotKey(pathname: string, search: string): string {
  return (pathname.replace(/^\/api\/v1\//, '') + (search ? `__${search.slice(1)}` : '')).replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 180)
}

type Row = { slug: string; name: string; gameId: string; chronicleId?: string; version?: string; rates?: string; addedAt?: string; votes?: number; support?: { coins?: number }; launch?: { at: string }; online?: { playersKnown?: boolean; freshness?: string; current?: number } }

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

export function installSnapshotFetch() {
  const real = window.fetch.bind(window)
  let all: Promise<Row[]> | undefined
  const servers = () => (all ??= real('/__snap/_all-servers.json').then(r => r.json() as Promise<Row[]>))
  const file = async (key: string) => { const response = await real(`/__snap/${key}.json`); return response.ok ? JSON.parse(await response.text()) : undefined }

  // The list endpoint, answered from the full snapshot the way the API does: filter, sort, page.
  async function list(search: URLSearchParams) {
    const games = (search.get('gameIds') ?? search.get('gameId') ?? '').split(',').filter(Boolean)
    const chronicle = search.get('chronicleId'), q = (search.get('q') ?? '').toLocaleLowerCase('ru')
    const now = Date.now()
    let rows = (await servers()).filter(s => (!games.length || games.includes(s.gameId)) && (!chronicle || s.chronicleId === chronicle)
      && (search.get('onlyLaunching') !== 'true' || (!!s.launch && Date.parse(s.launch.at) > now))
      && (!q || `${s.name} ${s.version ?? ''} ${s.rates ?? ''}`.toLocaleLowerCase('ru').includes(q)))
    const online = (s: Row) => (s.online?.playersKnown && s.online.freshness === 'fresh' ? s.online.current ?? 0 : -1)
    const sort = search.get('sort')
    if (sort === 'new') rows = [...rows].sort((a, b) => Date.parse(b.addedAt ?? '') - Date.parse(a.addedAt ?? ''))
    else if (sort === 'online') rows = [...rows].sort((a, b) => online(b) - online(a))
    else if (sort === 'launch') rows = [...rows].sort((a, b) => Date.parse(a.launch?.at ?? '') - Date.parse(b.launch?.at ?? ''))
    else if (sort === 'votes') rows = [...rows].sort((a, b) => (b.votes ?? 0) - (a.votes ?? 0))
    else if (sort === 'support') rows = [...rows].sort((a, b) => (b.support?.coins ?? 0) - (a.support?.coins ?? 0))
    const offset = Number(search.get('offset') ?? 0) || 0, limit = Number(search.get('limit') ?? 50) || 50
    return { items: rows.slice(offset, offset + limit), total: rows.length, limit, offset }
  }

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const url = new URL(href, window.location.href)
    if (url.origin !== window.location.origin || !url.pathname.startsWith('/api/')) return real(input, init)
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
    if (method !== 'GET' && method !== 'HEAD') return json(503, { error: { code: 'preview_read_only', message: 'Это превью: голосование и вход работают на gamescout.online.' } })
    if (url.pathname === '/api/v1/servers') return json(200, await list(url.searchParams))
    for (const key of [snapshotKey(url.pathname, url.search), snapshotKey(url.pathname, '')]) {
      const body = await file(key)
      if (body !== undefined) return json(200, body)
    }
    return json(404, { error: { code: 'not_found', message: 'Нет в снимке превью' } })
  }
}
