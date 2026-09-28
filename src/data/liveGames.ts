/**
 * Games open on the site right now. Rust, CS2 and DayZ stay in the database
 * and the code, but players do not see them until they are switched back on
 * here (and in scripts/public-pages.mjs for the static SEO pages).
 */
export const LIVE_GAME_IDS = ['lineage2', 'minecraft', 'gtarp'] as const
const LIVE = new Set<string>(LIVE_GAME_IDS)
export const isLiveGame = (gameId: string | undefined) => !!gameId && LIVE.has(gameId)
