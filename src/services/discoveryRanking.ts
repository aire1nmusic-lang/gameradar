import type { GameServer } from '@/models'

export const hasFreshOnline = (server: GameServer) => server.online.playersKnown === true && server.online.freshness === 'fresh' && !['UNKNOWN', 'PENDING', 'ANOMALY'].includes(server.online.status)

/** Equal category weights; tied values share rank, absent/zero evidence earns zero.
 * Normalising within each game prevents the scale of players or Coins dominating.
 * This catalogue score never changes either the votes or support leaderboard.
 */
export function balancedCatalog(servers: GameServer[]): GameServer[] {
  const scores = new Map<string, number>()
  for (const game of new Set(servers.map(server => server.gameId))) {
    const group = servers.filter(server => server.gameId === game)
    for (const metric of [(s: GameServer) => s.votes, (s: GameServer) => s.support?.coins ?? 0, (s: GameServer) => hasFreshOnline(s) ? s.online.current : 0]) {
      const values = [...new Set(group.map(metric).filter(value => value > 0))].sort((a, b) => a - b)
      for (const server of group) {
        const value = metric(server)
        const percentile = value > 0 && values.length ? (values.indexOf(value) + 1) / values.length : 0
        scores.set(server.id, (scores.get(server.id) ?? 0) + percentile / 3)
      }
    }
  }
  return [...servers].sort((a, b) => (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0) || a.name.localeCompare(b.name, 'ru') || a.id.localeCompare(b.id))
}
