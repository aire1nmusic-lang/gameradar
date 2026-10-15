import { ApiError, badRequest } from './core.ts'

/** Read only published vote totals from the Russian core. Never relay visitor data. */
export async function publicPeopleRanking(params: URLSearchParams, fetcher: typeof fetch = fetch) {
  if ([...params.keys()].some(key => !['limit', 'offset', 'gameId'].includes(key)) ||
      [...new Set(params.keys())].some(key => params.getAll(key).length !== 1))
    throw badRequest('Некорректная страница рейтинга')
  const limit = Number(params.get('limit') ?? 100), offset = Number(params.get('offset') ?? 0)
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100 ||
      !Number.isSafeInteger(offset) || offset < 0 || offset > 1000000)
    throw badRequest('Некорректная страница рейтинга')
  // This endpoint's canonical paging is global, just like the private core.
  // gameId is tolerated for older clients; the catalogue joins by server ID.
  const url = `https://priv.gamescout.online/api/v1/people-rating?limit=${limit}&offset=${offset}`
  try {
    const response = await fetcher(url, { method: 'GET', credentials: 'omit', redirect: 'error',
      headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(6000) })
    if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) throw new Error('upstream')
    const reader = response.body?.getReader()
    if (!reader) throw new Error('empty')
    let size = 0
    const chunks: Uint8Array[] = []
    try {
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        size += value.byteLength
        if (size > 65536) throw new Error('oversize')
        chunks.push(value)
      }
    } finally { await reader.cancel() }
    const bytes = new Uint8Array(size)
    let position = 0
    for (const chunk of chunks) { bytes.set(chunk, position); position += chunk.length }
    const rows: unknown = JSON.parse(new TextDecoder().decode(bytes))
    if (!Array.isArray(rows) || rows.length > limit) throw new Error('invalid')
    const seen = new Set<string>()
    return rows.map(row => {
      if (!row || typeof row.server_id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(row.server_id) ||
          !Number.isSafeInteger(row.votes) || row.votes < 0 || seen.has(row.server_id)) throw new Error('invalid')
      seen.add(row.server_id)
      // Explicit DTO: no names, users, sessions, IPs or unexpected upstream fields.
      return { server_id: row.server_id, votes: row.votes as number }
    })
  } catch {
    throw new ApiError(503, 'Голоса игроков временно недоступны. Попробуйте позже.', 'ranking_unavailable')
  }
}
