import type { GameServer } from '../models/index'
import { supportOrder, peopleOrder } from './supportProjection.ts'

export type RankingBoard = 'support' | 'people'
export type ProfilePlace = { place: number; board: RankingBoard; rotating: boolean }
export type RankingContext = { gameId: string; board: RankingBoard; ids: string[] }
export const ROTATION_MS = 30_000
export const rankingPeriod = (now = Date.now()) => Math.floor(now / ROTATION_MS)
const score = (server: GameServer, board: RankingBoard) => board === 'support' ? server.support?.coins ?? 0 : server.votes
const hash = (text: string) => { let value = 2166136261; for (const char of text) value = Math.imul(value ^ char.charCodeAt(0), 16777619); return value >>> 0 }

/** Presentation only. Scores/positive ordering are unchanged. A shuffled ring moves once
 * per shared wall-clock window: routes/remounts cannot redraw or extend a zero-score slot. */
export function presentationOrder(servers: GameServer[], board: RankingBoard, period = rankingPeriod(), rotate = true): GameServer[] {
  const canonical = board === 'support' ? supportOrder : peopleOrder
  if (!rotate) return [...servers].sort(canonical)
  const positions = new Map<string, number>()
  for (const gameId of new Set(servers.map(server => server.gameId))) {
    const zero = servers.filter(server => server.gameId === gameId && score(server, board) <= 0)
      .sort((a, b) => hash(`${board}:${gameId}:${a.id}`) - hash(`${board}:${gameId}:${b.id}`) || a.id.localeCompare(b.id))
    const offset = zero.length ? ((period % zero.length) + zero.length) % zero.length : 0
    zero.forEach((server, index) => positions.set(server.id, (index - offset + zero.length) % zero.length))
  }
  return [...servers.filter(server => score(server, board) > 0).sort(canonical),
    ...servers.filter(server => score(server, board) <= 0).sort((a, b) => a.gameId.localeCompare(b.gameId) || positions.get(a.id)! - positions.get(b.id)!)]
}

export function profilePlaceFor(server: GameServer, peers: GameServer[], period = rankingPeriod(), preferred?: RankingBoard): ProfilePlace | null {
  const group = peers.filter(peer => peer.gameId === server.gameId)
  const candidates: ProfilePlace[] = []
  for (const board of preferred ? [preferred] : ['support', 'people'] as RankingBoard[]) {
    const index = presentationOrder(group, board, period).findIndex(peer => peer.id === server.id)
    if (index >= 0 && index < 3) candidates.push({ place: index + 1, board, rotating: score(group.find(peer => peer.id === server.id)!, board) <= 0 })
  }
  // Earned placement wins over an unearned rotating slot on a direct profile visit.
  return candidates.find(candidate => !candidate.rotating) ?? candidates[0] ?? null
}

/** Navigation carries only public candidate IDs/context, never a trusted rank or score. */
export function readRankingContext(value: unknown, gameId: string): RankingContext | undefined {
  if (!value || typeof value !== 'object') return
  const context = value as Partial<RankingContext>
  if (context.gameId !== gameId || !['support', 'people'].includes(context.board ?? '') || !Array.isArray(context.ids) || context.ids.length > 10_000 || !context.ids.every(id => typeof id === 'string')) return
  return { gameId, board: context.board as RankingBoard, ids: [...new Set(context.ids)] }
}
