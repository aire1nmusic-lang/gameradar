import { repo } from '@/repositories'
import { chronicleOfVersion } from '@/data/games'
import type { Chronicle, GameServer } from '@/models'

/** Single-server use-cases. */

export function getServer(slug: string) {
  return repo.servers.bySlug(slug)
}

export function similarServers(slug: string, limit = 3) {
  return repo.servers.similar(slug, limit)
}

export function submitServer(input: Partial<GameServer>) {
  return repo.servers.submit(input)
}

/** The chronicle a server belongs to, derived from its version label. */
export function chronicleOf(server: GameServer): Chronicle | undefined {
  return server.chronicleId
    ? chronicleOfVersion(server.gameId, server.version)
    : chronicleOfVersion(server.gameId, server.version)
}

/** Per-card analytics for the owner dashboard. */
export async function ownerAnalytics() {
  const owner = await repo.owners.current()
  return owner ? repo.owners.analytics(owner.id) : []
}

/** Servers of one owner — used by the dashboard. */
export async function ownedServers() {
  const owner = await repo.owners.current()
  if (!owner) return []
  return repo.owners.serversOf(owner.id)
}

export function claimServer(serverId: string, userId: string, method: Parameters<typeof repo.owners.claim>[0]['method']) {
  return repo.owners.claim({ serverId, userId, method })
}
