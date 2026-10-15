import { apiRequest } from '@/repositories/http/client'

export type PeopleRankingRow = { server_id: string; votes: number }
export type SupportRankingRow = { server_id: string; coins: number; participants: number }

type RankingPath = '/people-rating' | '/support/ranking'
const inFlight = new Map<RankingPath, Promise<unknown[]>>()
/** Hidden responsive panels may mount together. Share only their in-flight public read. */
export function readPublicRanking<T extends { server_id: string }>(path: RankingPath, fresh = false): Promise<T[]> {
  const hit = inFlight.get(path)
  if (hit && !fresh) return hit as Promise<T[]>
  const request = fetchPublicRanking<T>(path)
  inFlight.set(path, request)
  const clear = () => { if (inFlight.get(path) === request) inFlight.delete(path) }
  void request.then(clear, clear)
  return request
}
/** Both public rankings are paginated globally. A profile must read past page one too. */
async function fetchPublicRanking<T extends { server_id: string }>(path: RankingPath): Promise<T[]> {
  const rows: T[] = []
  const seen = new Set<string>()
  for (let offset = 0; offset <= 1_000_000; offset += 100) {
    const page = await apiRequest<T[]>(`${path}?limit=100&offset=${offset}`, { signal: AbortSignal.timeout(8000) })
    if (!Array.isArray(page) || page.length > 100) throw new Error('Некорректный ответ рейтинга')
    for (const row of page) {
      if (!row || typeof row.server_id !== 'string' || seen.has(row.server_id)) throw new Error('Некорректная страница рейтинга')
      seen.add(row.server_id)
      rows.push(row)
    }
    if (page.length < 100) return rows
  }
  throw new Error('Рейтинг слишком большой. Попробуйте позже.')
}
export const readPeopleRanking = (fresh = false) => readPublicRanking<PeopleRankingRow>('/people-rating', fresh)
