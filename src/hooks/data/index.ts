import { useMemo } from 'react'
import { repo } from '@/repositories'
import type { AdSlot, GameServer, RankedServer, ServerQuery } from '@/models'
import {
  adForSlot,
  boostForecast,
  facetsFor,
  getServer,
  highOnline,
  listServers,
  openingServers,
  organicRating,
  ownerAnalytics,
  platformStats,
  promotedServers,
  recentlyAdded,
  risingServers,
  searchServers,
  similarServers,
  sponsoredRating,
} from '@/services'
import { useAsync } from './useAsync'

export { useAsync } from './useAsync'
export type { AsyncState } from './useAsync'

/**
 * React bindings for the service layer.
 *
 * Pages use these; they never import fixtures. The key of every hook is a
 * serialised query, so the effect re-runs exactly when the request changes.
 */

const key = (value: unknown) => JSON.stringify(value ?? null)

export function useGames() {
  return useAsync(() => repo.games.list(), [])
}

export function useGameBySlug(slug: string | undefined) {
  return useAsync(() => (slug ? repo.games.bySlug(slug) : Promise.resolve(undefined)), [slug])
}

export function useServers(query: ServerQuery, keepPrevious = false) {
  const k = key(query)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stable = useMemo(() => query, [k])
  return useAsync(() => listServers(stable), [k], keepPrevious)
}

export function useServerPage(query: ServerQuery, keepPrevious = true) {
  const k = key(query)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stable = useMemo(() => query, [k])
  return useAsync(() => searchServers(stable), [k], keepPrevious)
}

export function useServer(slug: string | undefined) {
  return useAsync(() => (slug ? getServer(slug) : Promise.resolve(undefined)), [slug])
}

export function useSimilarServers(slug: string | undefined, limit = 3) {
  return useAsync(
    () => (slug ? similarServers(slug, limit) : Promise.resolve([] as GameServer[])),
    [slug, limit],
  )
}

export function useFacets(gameId?: string) {
  return useAsync(() => facetsFor(gameId), [gameId])
}

/* ── discovery rails ────────────────────────────────────────────────────── */

export function useHighOnline(gameId?: string, limit = 6) {
  return useAsync(() => highOnline(gameId, limit), [gameId, limit])
}

export function useRisingServers(gameId?: string, limit = 5) {
  return useAsync(() => risingServers(gameId, limit), [gameId, limit])
}

export function useOpenings(gameId?: string, limit = 6) {
  return useAsync(() => openingServers(gameId, limit), [gameId, limit])
}

export function usePromoted(gameId?: string, limit = 4) {
  return useAsync(() => promotedServers(gameId, limit), [gameId, limit])
}

export function useRecentlyAdded(gameId?: string, limit = 4) {
  return useAsync(() => recentlyAdded(gameId, limit), [gameId, limit])
}

/* ── rating & commerce ──────────────────────────────────────────────────── */

export function useRating(
  scope: { gameId?: string; chronicleId?: string; sponsored?: boolean },
): ReturnType<typeof useAsync<RankedServer[]>> {
  const { gameId, chronicleId, sponsored } = scope
  return useAsync(
    () => (sponsored ? sponsoredRating(gameId, chronicleId) : organicRating(gameId, chronicleId)),
    [gameId, chronicleId, sponsored],
  )
}

export function useBoostForecast(slug: string | undefined, extraBoosts: number, gameId?: string) {
  return useAsync(
    () => (slug ? boostForecast(slug, extraBoosts, gameId) : Promise.resolve(undefined)),
    [slug, extraBoosts, gameId],
    true,
  )
}

export function useAd(slot: AdSlot, gameId?: string) {
  return useAsync(() => adForSlot(slot, gameId), [slot, gameId])
}

/* ── owner ──────────────────────────────────────────────────────────────── */

export function useOwnedServers() {
  return useAsync(async () => {
    const owner = await repo.owners.current()
    return owner ? repo.owners.serversOf(owner.id) : []
  }, [])
}

export function useOwnerAnalytics() {
  return useAsync(() => ownerAnalytics(), [])
}

/* ── platform ───────────────────────────────────────────────────────────── */

export function usePlatformStats() {
  return useAsync(() => platformStats(), [])
}
