import { createHttpRepositories } from './http'
import type { Repositories } from './types'
export * from './types'

let repositories: Repositories = createHttpRepositories()
export function getRepositories(): Repositories { return repositories }
export function setRepositories(next: Repositories) { repositories = next }

/** Mock loading is opt-in and eliminated from production builds. */
export async function initializeRepositories() {
  if (import.meta.env.DEV && import.meta.env.VITE_DATA_SOURCE === 'mock') {
    repositories = (await import('./mock')).mockRepositories
    const { hydrateGames } = await import('@/data/games')
    hydrateGames(await repositories.games.list())
  } else await repositories.games.list()
}
export const repo = {
  get games() { return repositories.games },
  get servers() { return repositories.servers },
  get rating() { return repositories.rating },
  get votes() { return repositories.votes },
  get boosts() { return repositories.boosts },
  get ads() { return repositories.ads },
  get owners() { return repositories.owners },
  get users() { return repositories.users },
}
