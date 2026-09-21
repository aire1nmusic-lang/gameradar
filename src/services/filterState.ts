/**
 * Catalogue filter state.
 *
 * This is UI state, not storage: it describes what the player ticked in the
 * filter panel. `toServerQuery` (catalogService) turns it into a repository
 * query, so the panel never needs to know the API shape.
 */

export interface CatalogFilters {
  query: string
  games: string[]
  versions: string[]
  modes: string[]
  regions: string[]
  languages: string[]
  minOnline: number
  minRating: number
  verifiedOnly: boolean
  openedWithin: 'any' | '30d' | '90d' | '365d'
  wipeSoon: boolean
  hideOffline: boolean
}

export const EMPTY_FILTERS: CatalogFilters = {
  query: '',
  games: [],
  versions: [],
  modes: [],
  regions: [],
  languages: [],
  minOnline: 0,
  minRating: 0,
  verifiedOnly: false,
  openedWithin: 'any',
  wipeSoon: false,
  hideOffline: false,
}

/** How many conditions the player has applied — drives the mobile badge. */
export function countActiveFilters(filters: CatalogFilters): number {
  let count = 0
  count += filters.games.length
  count += filters.versions.length
  count += filters.modes.length
  count += filters.regions.length
  count += filters.languages.length
  if (filters.minOnline > 0) count++
  if (filters.minRating > 0) count++
  if (filters.verifiedOnly) count++
  if (filters.openedWithin !== 'any') count++
  if (filters.wipeSoon) count++
  if (filters.hideOffline) count++
  return count
}
