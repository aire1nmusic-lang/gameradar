import { GAMES, getChronicle, getGameBySlug } from './games'
import { resolveTheme } from '@/theme/registry'
import { coreTheme } from '@/theme/core/tokens'
import type { GameTheme } from '@/theme/core/types'
import type { Chronicle, Game } from './types'

/**
 * Data-side view of the Theme Engine.
 *
 * Components ask this module — never the theme files directly — so the day
 * themes arrive from an API, only this file changes.
 */

export interface ResolvedWorld {
  game?: Game
  chronicle?: Chronicle
  theme: GameTheme
  /** canonical url of the world */
  path: string
}

/** Resolve a themed world from url segments. */
export function resolveWorld(gameSlug?: string, chronicleSlug?: string): ResolvedWorld {
  const game = getGameBySlug(gameSlug)
  if (!game) return { theme: coreTheme, path: '/' }

  const chronicle = getChronicle(game, chronicleSlug)

  const theme = resolveTheme({
    gameId: game.id,
    chronicleThemeId: chronicle?.themeId,
    seed: { label: game.shortName, from: game.from, to: game.to, accent: game.accent },
  })

  return {
    game,
    chronicle,
    theme,
    path: chronicle ? `/${game.slug}/${chronicle.slug}` : `/${game.slug}`,
  }
}

/** Theme for a game id, used by cards rendered outside a themed world. */
export function themeForGame(gameId: string, chronicleThemeId?: string): GameTheme {
  const game = GAMES.find((item) => item.id === gameId)
  if (!game) return coreTheme
  return resolveTheme({
    gameId: game.id,
    chronicleThemeId,
    seed: { label: game.shortName, from: game.from, to: game.to, accent: game.accent },
  })
}

/** Every routable themed world — used to register routes and build menus. */
export function worldRoutes(): Array<{ gameSlug: string; chronicleSlug?: string }> {
  const routes: Array<{ gameSlug: string; chronicleSlug?: string }> = []
  for (const game of GAMES) {
    routes.push({ gameSlug: game.slug })
    for (const chronicle of game.chronicles) {
      routes.push({ gameSlug: game.slug, chronicleSlug: chronicle.slug })
    }
  }
  return routes
}

export { coreTheme }
