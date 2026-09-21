import { mockRepositories } from './mock'
import type { Repositories } from './types'

export * from './types'
export { setMockLatency } from './mock'

/**
 * Composition root.
 *
 * The only place that decides where data comes from. When the Workers API is
 * live, this becomes:
 *
 *   const backend = import.meta.env.VITE_API_URL
 *   repositories = backend ? createHttpRepositories(backend) : mockRepositories
 *
 * and nothing else in the codebase changes.
 */
let repositories: Repositories = mockRepositories

export function getRepositories(): Repositories {
  return repositories
}

/** Used by tests and by the future HTTP implementation. */
export function setRepositories(next: Repositories) {
  repositories = next
}

export const repo = {
  get games() {
    return repositories.games
  },
  get servers() {
    return repositories.servers
  },
  get rating() {
    return repositories.rating
  },
  get votes() {
    return repositories.votes
  },
  get boosts() {
    return repositories.boosts
  },
  get ads() {
    return repositories.ads
  },
  get owners() {
    return repositories.owners
  },
  get users() {
    return repositories.users
  },
}
