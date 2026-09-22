import { hashSeed } from '@/lib/utils'
import { chronicleOfVersion } from './games'
import type { GameServer } from '@/models'

/**
 * World art registry — the bitmap layer of the Theme Engine.
 *
 * A world (game, or game + chronicle) owns a small set of key images. Nothing
 * else in the app knows a file path: components ask for a *slot* and get an
 * `WorldArt` back, so swapping artwork later is a change in this file only.
 *
 * Fallback chain:  chronicle → game → shared
 *
 * Every file lives in `public/media/worlds/<world>/<name>-<width>.webp` and is
 * published at three widths, so one entry serves heroes, cards and thumbnails.
 *
 * Key-art posters (16:9, 3840×2160 masters) are published by
 * scripts/optimize-posters.mjs as WebP at 400/800/1600/2560 px; the older
 * placeholder art keeps 400/800/1600. Replacing art means dropping files into
 * `public/media/worlds/` and editing the `ART` table below — no component
 * changes required.
 */

export type ArtSlot = 'hero' | 'card' | 'promo' | 'stage'

/** How bright the image is — drives how heavy a scrim the UI puts over it. */
export type ArtTone = 'dark' | 'medium' | 'bright'

export interface WorldArt {
  id: string
  /** path without the `-<width>.webp` suffix */
  base: string
  widths: number[]
  alt: string
  tone: ArtTone
  /** object-position per breakpoint, so the subject survives every crop */
  focus: { desktop: string; mobile: string }
}

export interface WorldMedia {
  hero?: WorldArt
  card?: WorldArt
  promo?: WorldArt
  stage?: WorldArt
  /** pool used to vary card covers inside one world */
  gallery: WorldArt[]
}

const WIDTHS = [400, 800, 1600]
/** Posters also ship a 2560 px file so full-width heroes stay sharp on HiDPI desktops. */
const POSTER_WIDTHS = [400, 800, 1600, 2560]
/** Lineage 2 posters front the showcase hero and add the full 3840 master for large/high-DPI screens. */
const SHOWCASE_WIDTHS = [...POSTER_WIDTHS, 3840]

/**
 * Worlds whose key art is the headline of the first screen: a tall, full-width
 * hero with a light scrim (`poster` preset) instead of a dimmed banner.
 * Extending the showcase to another game is adding its id here.
 */
const SHOWCASE_GAMES = new Set(['lineage2'])
export const isShowcase = (gameId?: string) => !!gameId && SHOWCASE_GAMES.has(gameId)

function art(
  base: string,
  alt: string,
  tone: ArtTone,
  focus: { desktop: string; mobile: string },
  widths: number[] = WIDTHS,
): WorldArt {
  return { id: base, base: `/media/worlds/${base}`, widths, alt, tone, focus }
}

/** A key-art poster: `mobile` is the object-position that keeps the subject in a portrait crop. */
const poster = (base: string, alt: string, tone: ArtTone, mobile: string, desktop = '50% 50%') =>
  art(base, alt, tone, { desktop, mobile }, base.startsWith('lineage-2/') ? SHOWCASE_WIDTHS : POSTER_WIDTHS)

/* ────────────────────────────────────────────────────────────────────────────
   The art itself
   ──────────────────────────────────────────────────────────────────────────── */

const ART = {
  l2Citadel: art(
    'lineage-2/citadel-sunset',
    'Величественная цитадель на закате, герои на скале над городом',
    'medium',
    { desktop: '50% 46%', mobile: '62% 50%' },
  ),
  l2Moonlit: art(
    'lineage-2/moonlit-citadel',
    'Лунная цитадель над туманными горами',
    'dark',
    { desktop: '52% 45%', mobile: '70% 45%' },
  ),
  l2SkyGold: art(
    'lineage-2/sky-citadel-gold',
    'Золотой закат над небесной цитаделью',
    'bright',
    { desktop: '56% 44%', mobile: '72% 44%' },
  ),
  l2Arcane: art(
    'lineage-2/arcane-portal',
    'Эпический город у магического портала',
    'medium',
    { desktop: '50% 42%', mobile: '58% 40%' },
  ),
  mcValley: art(
    'minecraft/voxel-valley',
    'Воксельная долина с деревней и замком',
    'bright',
    { desktop: '50% 50%', mobile: '60% 55%' },
  ),
  mcFortress: art(
    'minecraft/fortress-sunset',
    'Закатная долина с крепостью в блочном мире',
    'medium',
    { desktop: '50% 50%', mobile: '66% 50%' },
  ),
  gtaNeon: art(
    'gta-rp/neon-skyline',
    'Неоновая ночь над мегаполисом',
    'dark',
    { desktop: '50% 50%', mobile: '54% 45%' },
  ),
  rustOutpost: art(
    'rust/wasteland-outpost',
    'Постапокалиптический аванпост на закате',
    'medium',
    { desktop: '50% 52%', mobile: '60% 55%' },
  ),
  cs2Dawn: art(
    'cs2/dawn-raid',
    'Тактическая схватка на рассвете',
    'medium',
    { desktop: '50% 50%', mobile: '44% 48%' },
  ),

  // ── key-art posters ────────────────────────────────────────────────────
  l2Interlude: poster('lineage-2/interlude-poster', 'Lineage II Interlude — герои у стен готического города', 'medium', '50% 55%'),
  l2Essence: poster('lineage-2/essence-poster', 'Lineage II Essence — отряд героев на фоне небесной цитадели', 'bright', '50% 50%', '50% 45%'),
  l2Classic: poster('lineage-2/classic-poster', 'Lineage II Classic — битва у крепости на закате', 'medium', '45% 50%'),
  l2Gracia: poster('lineage-2/gracia-final-poster', 'Lineage II Gracia Final — тёмная цитадель под алой луной', 'dark', '70% 50%'),
  mcSurvival: poster('minecraft/survival-poster', 'Minecraft Survival — долина с водопадами на рассвете', 'medium', '70% 55%'),
  mcAnarchy: poster('minecraft/anarchy-poster', 'Minecraft Anarchy — разрушенный город в огне', 'dark', '80% 50%'),
  mcSkyBlock: poster('minecraft/skyblock-poster', 'Minecraft SkyBlock — парящие острова над облаками', 'bright', '62% 50%'),
  mcPrison: poster('minecraft/prison-poster', 'Minecraft Prison — крепость-тюрьма в горах', 'medium', '65% 50%'),
  mcMinigames: poster('minecraft/minigames-poster', 'Minecraft Minigames — парящие арены мини-игр', 'bright', '60% 50%'),
  mcModded: poster('minecraft/modded-rpg-poster', 'Minecraft Modded / RPG — магический город в сиянии кристаллов', 'medium', '75% 50%'),
  gtaRoleplay: poster('gta-rp/roleplay-poster', 'GTA RP — вечерняя улица города с полицией и жителями', 'dark', '50% 55%'),
  gtaFreeroam: poster('gta-rp/freeroam-poster', 'GTA Freeroam — прибрежное шоссе и небоскрёбы днём', 'bright', '55% 55%'),
  gtaPvp: poster('gta-rp/pvp-poster', 'GTA PvP — ночная перестрелка в порту', 'dark', '40% 60%'),
  gtaDrift: poster('gta-rp/drift-racing-poster', 'GTA Drift & Racing — дрифт на ночном серпантине', 'dark', '35% 60%'),
  gtaGang: poster('gta-rp/gang-crime-poster', 'GTA Gang & Crime — банда у машин на закате', 'dark', '35% 55%'),

  stage: art(
    'shared/obsidian-stage',
    'Тёмная арена между мирами',
    'dark',
    { desktop: '50% 58%', mobile: '50% 62%' },
  ),
} satisfies Record<string, WorldArt>

/* ────────────────────────────────────────────────────────────────────────────
   World → art mapping
   Key is `gameId` or `gameId:chronicleId`.
   ──────────────────────────────────────────────────────────────────────────── */

const SHARED: WorldMedia = {
  stage: ART.stage,
  gallery: [],
}

const WORLDS: Record<string, Partial<WorldMedia>> = {
  // ── Lineage 2 — high fantasy MMORPG, one look per chronicle ──────────────
  lineage2: {
    hero: ART.l2Citadel,
    card: ART.l2Moonlit,
    promo: ART.l2SkyGold,
    gallery: [ART.l2Citadel, ART.l2Moonlit, ART.l2SkyGold, ART.l2Arcane],
  },
  'lineage2:interlude': {
    hero: ART.l2Interlude,
    card: ART.l2Interlude,
    promo: ART.l2Interlude,
    gallery: [ART.l2Interlude],
  },
  // No High Five poster yet: keeps the prototype art.
  'lineage2:high-five': {
    hero: ART.l2SkyGold,
    card: ART.l2Citadel,
    promo: ART.l2SkyGold,
    gallery: [ART.l2SkyGold, ART.l2Citadel],
  },
  'lineage2:essence': {
    hero: ART.l2Essence,
    card: ART.l2Essence,
    promo: ART.l2Essence,
    gallery: [ART.l2Essence],
  },
  'lineage2:classic': {
    hero: ART.l2Classic,
    card: ART.l2Classic,
    promo: ART.l2Classic,
    gallery: [ART.l2Classic],
  },
  // chronicle id is "gracia" (slug "gracia-final")
  'lineage2:gracia': {
    hero: ART.l2Gracia,
    card: ART.l2Gracia,
    promo: ART.l2Gracia,
    gallery: [ART.l2Gracia],
  },

  // ── Minecraft ────────────────────────────────────────────────────────────
  // Survival is the base mode, so it fronts the game world.
  minecraft: {
    hero: ART.mcSurvival,
    card: ART.mcSurvival,
    promo: ART.mcSkyBlock,
    gallery: [ART.mcSurvival, ART.mcSkyBlock, ART.mcMinigames, ART.mcPrison, ART.mcAnarchy, ART.mcModded],
  },
  'minecraft:survival': { hero: ART.mcSurvival, card: ART.mcSurvival, promo: ART.mcSurvival, gallery: [ART.mcSurvival] },
  'minecraft:anarchy': { hero: ART.mcAnarchy, card: ART.mcAnarchy, promo: ART.mcAnarchy, gallery: [ART.mcAnarchy] },
  'minecraft:skyblock': { hero: ART.mcSkyBlock, card: ART.mcSkyBlock, promo: ART.mcSkyBlock, gallery: [ART.mcSkyBlock] },
  'minecraft:prison': { hero: ART.mcPrison, card: ART.mcPrison, promo: ART.mcPrison, gallery: [ART.mcPrison] },
  'minecraft:modded': { hero: ART.mcModded, card: ART.mcModded, promo: ART.mcModded, gallery: [ART.mcModded] },
  // The catalogue files minigame networks under BedWars; the Minigames poster fronts that page.
  'minecraft:bedwars': { hero: ART.mcMinigames, card: ART.mcMinigames, promo: ART.mcMinigames, gallery: [ART.mcMinigames] },

  // ── GTA RP ───────────────────────────────────────────────────────────────
  // Chronicles here are platforms (FiveM / RAGE:MP / alt:V), not play styles,
  // so they inherit the world: Roleplay fronts it, the other posters vary cards.
  gtarp: {
    hero: ART.gtaRoleplay,
    card: ART.gtaRoleplay,
    promo: ART.gtaGang,
    gallery: [ART.gtaRoleplay, ART.gtaFreeroam, ART.gtaGang, ART.gtaDrift, ART.gtaPvp],
  },

  // ── Rust ─────────────────────────────────────────────────────────────────
  rust: {
    hero: ART.rustOutpost,
    card: ART.rustOutpost,
    promo: ART.rustOutpost,
    gallery: [ART.rustOutpost],
  },

  // ── CS2 ──────────────────────────────────────────────────────────────────
  cs2: {
    hero: ART.cs2Dawn,
    card: ART.cs2Dawn,
    promo: ART.cs2Dawn,
    gallery: [ART.cs2Dawn],
  },

  // ARK / DayZ / Valheim have no key art yet and fall back to procedural art.
}

/* ────────────────────────────────────────────────────────────────────────────
   Resolution
   ──────────────────────────────────────────────────────────────────────────── */

/** Merged media for a world, following chronicle → game → shared. */
export function resolveWorldMedia(gameId?: string, chronicleId?: string): WorldMedia {
  const game = gameId ? WORLDS[gameId] : undefined
  const chronicle = gameId && chronicleId ? WORLDS[`${gameId}:${chronicleId}`] : undefined

  const gallery = chronicle?.gallery?.length
    ? chronicle.gallery
    : (game?.gallery ?? SHARED.gallery)

  return {
    hero: chronicle?.hero ?? game?.hero ?? SHARED.hero,
    card: chronicle?.card ?? game?.card ?? chronicle?.hero ?? game?.hero ?? SHARED.card,
    promo: chronicle?.promo ?? game?.promo ?? chronicle?.hero ?? game?.hero ?? SHARED.promo,
    stage: chronicle?.stage ?? game?.stage ?? SHARED.stage,
    gallery,
  }
}

/** One slot of a world. Returns undefined when the world has no key art. */
export function worldArt(slot: ArtSlot, gameId?: string, chronicleId?: string): WorldArt | undefined {
  return resolveWorldMedia(gameId, chronicleId)[slot]
}

/**
 * Cover art for a server.
 *
 * A server has no bespoke art in the prototype, so it inherits the art of its
 * chronicle (or game) — varied deterministically across the world gallery so a
 * grid of cards doesn't repeat one image.
 */
export function serverArt(server: GameServer): WorldArt | undefined {
  // The stored chronicle wins; the version label is only a fallback for cards without one.
  const chronicleId = server.chronicleId ?? chronicleOfVersion(server.gameId, server.version)?.id
  const media = resolveWorldMedia(server.gameId, chronicleId)
  if (!media.gallery.length) return media.card ?? media.hero
  const index = hashSeed(server.slug) % media.gallery.length
  return media.gallery[index]
}

/** Art for an advertising creative, so paid units look native to the world. */
export function promoArt(gameId?: string, seed?: string): WorldArt | undefined {
  const media = resolveWorldMedia(gameId)
  if (seed && media.gallery.length > 1) {
    return media.gallery[hashSeed(seed) % media.gallery.length]
  }
  return media.promo ?? media.hero
}

/* ────────────────────────────────────────────────────────────────────────────
   URL helpers
   ──────────────────────────────────────────────────────────────────────────── */

export function artSrc(art: WorldArt, width = 1600): string {
  const closest = art.widths.reduce((best, current) =>
    Math.abs(current - width) < Math.abs(best - width) ? current : best,
  )
  return `${art.base}-${closest}.webp`
}

export function artSrcSet(art: WorldArt, widths: number[] = art.widths): string {
  return widths.map((width) => `${art.base}-${width}.webp ${width}w`).join(', ')
}
