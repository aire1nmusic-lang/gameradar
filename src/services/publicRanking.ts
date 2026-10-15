import { apiRequest } from '@/repositories/http/client'

export type PeopleRankingRow = { server_id: string; votes: number }
export type SupportRankingRow = { server_id: string; coins: number; participants: number }

/** Both public rankings are paginated globally. A profile must read past page one too. */
export async function readPublicRanking<T extends { server_id: string }>(path: '/people-rating' | '/support/ranking'): Promise<T[]> {
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
export const readPeopleRanking = () => readPublicRanking<PeopleRankingRow>('/people-rating')
