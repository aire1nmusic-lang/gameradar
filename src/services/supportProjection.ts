import type { GameServer } from '../models/index'

export const supportOrder = (a: GameServer, b: GameServer) => (b.support?.coins ?? 0) - (a.support?.coins ?? 0) || (b.support?.participants ?? 0) - (a.support?.participants ?? 0) || a.id.localeCompare(b.id)
export const peopleOrder = (a: GameServer, b: GameServer) => b.votes - a.votes || a.id.localeCompare(b.id)

/** A snapshot estimate; equal totals give a range because participant identity is private. */
export function projectSupport(servers: GameServer[], serverId: string, amount: number) {
  const target = servers.find(s => s.id === serverId)
  if (!target || !Number.isSafeInteger(amount) || amount < 1 || amount > 10000) return undefined
  const peers = servers.filter(s => s.gameId === target.gameId)
  const current = [...peers].sort(supportOrder)
  const total = (target.support?.coins ?? 0) + amount
  const others = peers.filter(s => s.id !== target.id)
  const first = 1 + others.filter(s => (s.support?.coins ?? 0) > total).length
  const last = first + others.filter(s => (s.support?.coins ?? 0) === total).length
  const next = peers.map(s => s.id === target.id ? {...s, support: {...s.support, coins:total, participants:s.support?.participants ?? 0}} : s).sort(supportOrder)
  const index = next.findIndex(s => s.id === target.id)
  const start = Math.max(0, Math.min(index - 3, next.length - 7))
  return {current:current.findIndex(s => s.id === target.id)+1, first, last, total, position:index+1, count:peers.length, rows:next.slice(start,start+7), start}
}
