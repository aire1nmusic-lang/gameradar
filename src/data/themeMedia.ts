import { hashSeed } from '@/lib/utils'
import { chronicleOfVersion } from './games'
import type { GameServer } from './types'

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
 * NOTE: the current set is placeholder key art produced for the prototype.
 * Replacing it means dropping new files into `public/media/worlds/` and
 * editing the `ART` table below — no component changes required.
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

function art(
  base: string,
  alt: string,
  tone: ArtTone,
  focus: { desktop: string; mobile: string },
): WorldArt {
  return { id: base, base: `/media/worlds/${base}`, widths: WIDTHS, alt, tone, focus }
}

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
    hero: ART.l2Moonlit,
    card: ART.l2Moonlit,
    promo: ART.l2Citadel,
    gallery: [ART.l2Moonlit, ART.l2Citadel],
  },
  'lineage2:high-five': {
    hero: ART.l2SkyGold,
    card: ART.l2Citadel,
    promo: ART.l2SkyGold,
    gallery: [ART.l2SkyGold, ART.l2Citadel],
  },
  'lineage2:essence': {
    hero: ART.l2Arcane,
    card: ART.l2Arcane,
    promo: ART.l2Arcane,
    gallery: [ART.l2Arcane, ART.l2Moonlit],
  },
  'lineage2:classic': {
    hero: ART.l2Citadel,
    gallery: [ART.l2Citadel, ART.l2SkyGold],
  },
  'lineage2:gracia-final': {
    hero: ART.l2Moonlit,
    gallery: [ART.l2Moonlit, ART.l2Arcane],
  },

  // ── Minecraft ────────────────────────────────────────────────────────────
  minecraft: {
    hero: ART.mcValley,
    card: ART.mcFortress,
    promo: ART.mcValley,
    gallery: [ART.mcValley, ART.mcFortress],
  },

  // ── GTA RP ───────────────────────────────────────────────────────────────
  gtarp: {
    hero: ART.gtaNeon,
    card: ART.gtaNeon,
    promo: ART.gtaNeon,
    gallery: [ART.gtaNeon],
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
  const chronicle = chronicleOfVersion(server.gameId, server.version)
  const media = resolveWorldMedia(server.gameId, chronicle?.id)
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

export function artSrcSet(art: WorldArt): string {
  return art.widths.map((width) => `${art.base}-${width}.webp ${width}w`).join(', ')
}
