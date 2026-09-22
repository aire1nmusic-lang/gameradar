import type { Chronicle, Game } from '@/models'

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
export function getGame(id: string): Game {
  const game = GAMES_BY_ID[id]
  if (!game) throw new Error('Игра не найдена в каталоге: ' + id)
  return game
}
export function getGameBySlug(slug: string | undefined): Game | undefined { return slug ? GAMES_BY_SLUG[slug] : undefined }
export function getChronicle(game: Game | undefined, slug: string | undefined): Chronicle | undefined { return game?.chronicles.find(c => c.slug === slug) }
export function chronicleOfVersion(gameId: string, version: string): Chronicle | undefined { return GAMES_BY_ID[gameId]?.chronicles.find(c => c.versions.includes(version)) }
export const REGIONS = ['EU', 'RU / CIS', 'NA', 'SEA'] as const
export const LANGUAGES = ['Русский', 'English', 'Українська', 'Polski'] as const
