import type { Chronicle, Game } from '@/models'
import { otherL2Chronicle } from './l2Chronicles'
import { isLiveGame } from './liveGames'

/** API-hydrated catalogue metadata shared with synchronous theme resolution.
 * These collections contain no server fixtures or invented statistics. */
export const GAMES: Game[] = []
export const GAMES_BY_ID: Record<string, Game> = {}
export const GAMES_BY_SLUG: Record<string, Game> = {}
export const THEMED_GAMES = GAMES

export function hydrateGames(games: Game[]) {
  GAMES.splice(0, GAMES.length, ...games)
  for (const key of Object.keys(GAMES_BY_ID)) delete GAMES_BY_ID[key]
  for (const key of Object.keys(GAMES_BY_SLUG)) delete GAMES_BY_SLUG[key]
  for (const game of games) { GAMES_BY_ID[game.id] = game; GAMES_BY_SLUG[game.slug] = game }
}
const CACHE_KEY = 'gs.games.v1'
const CACHE_MAX_AGE = 7 * 24 * 3_600_000

/**
 * Keeps the catalogue's structure (names, slugs, chronicles, colours) for an
 * instant start on the next visit. Online numbers are zeroed: a cached count
 * is not "online now", and the fresh list replaces it within a second.
 */
export function cacheGames(games: Game[]) {
  try {
    const structure = games.map((game) => ({ ...game, playersOnline: 0, chronicles: game.chronicles.map((c) => ({ ...c, playersOnline: 0 })) }))
    localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), games: structure }))
  } catch {
    // storage blocked or full: the next visit simply waits for the network
  }
}

export function cachedGames(): Game[] | undefined {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return undefined
    const { at, games } = JSON.parse(raw) as { at: number; games: Game[] }
    const live = Array.isArray(games) ? games.filter((game) => isLiveGame(game.id)) : []
    return live.length > 0 && Date.now() - at < CACHE_MAX_AGE ? live : undefined
  } catch {
    return undefined
  }
}

export function getGame(id: string): Game {
  const game = GAMES_BY_ID[id]
  if (!game) throw new Error('Игра не найдена в каталоге: ' + id)
  return game
}
export function getGameBySlug(slug: string | undefined): Game | undefined { return slug ? GAMES_BY_SLUG[slug] : undefined }
export function getChronicle(game: Game | undefined, slug: string | undefined): Chronicle | undefined { return game?.id === 'lineage2' && slug === 'other' ? otherL2Chronicle(game) : game?.chronicles.find(c => c.slug === slug) }
export function chronicleOfVersion(gameId: string, version: string): Chronicle | undefined { return GAMES_BY_ID[gameId]?.chronicles.find(c => c.versions.includes(version)) }
export const REGIONS = ['EU', 'RU / CIS', 'NA', 'SEA'] as const
export const LANGUAGES = ['Русский', 'English', 'Українська', 'Polski'] as const
