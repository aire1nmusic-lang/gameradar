import { hashSeed } from '@/lib/utils'
import { chronicleOfVersion } from './games'
import type { GameServer } from '@/models'

/**
 * World art registry — the bitmap layer of the Theme Engine.
 *
 * A world (game, or game + chronicle) owns ONE master key art and, where the
 * chronicle or mode has its own identity, one more. Nothing else in the app
 * knows a file path: components ask for a *slot* and get a `WorldArt` back.
 *
 * Fallback chain:  chronicle → game → shared
 *
 * Every file lives in `public/media/worlds/<world>/<name>-<width>.webp` at
 * 400/800/1600/2560/3840 px, published by scripts/publish-keyart.mjs from
 * the masters in Постеры/ai-keyart (kept out of the repo).
 *
 * Every master is composed the same way: the subject sits in the right two
 * thirds, the left third is quiet — that is where headings and search go.
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

const KEYART_WIDTHS = [400, 800, 1600, 2560, 3840]
const LEGACY_WIDTHS = [400, 800, 1600]

/** Every game with key art puts it at the centre of its first screen. */
const SHOWCASE_GAMES = new Set(['lineage2', 'minecraft', 'gtarp', 'rust', 'cs2'])
export const isShowcase = (gameId?: string) => !!gameId && SHOWCASE_GAMES.has(gameId)

function art(base: string, alt: string, tone: ArtTone, focus: { desktop: string; mobile: string }, widths: number[] = KEYART_WIDTHS): WorldArt {
  return { id: base, base: `/media/worlds/${base}`, widths, alt, tone, focus }
}

/** A key-art master: `mobile` is the object-position that keeps the subject in a portrait crop. */
const keyart = (base: string, alt: string, tone: ArtTone, mobile: string, desktop = '50% 50%') => art(base, alt, tone, { desktop, mobile })

/* ────────────────────────────────────────────────────────────────────────────
   The art itself
   ──────────────────────────────────────────────────────────────────────────── */

const ART = {
  l2Master: keyart('lineage-2/master', 'Lineage 2 — отряд из четырёх рас на скале перед готической крепостью на рассвете, дракон в тумане', 'dark', '68% 50%'),
  l2Interlude: keyart('lineage-2/interlude', 'Lineage 2 Interlude — рыцарь и тёмный эльф идут к воротам каменного города на рассвете', 'medium', '70% 55%'),
  l2HighFive: keyart('lineage-2/high-five', 'Lineage 2 High Five — отряд перед крепостью с осадными знамёнами', 'dark', '68% 50%'),
  l2Classic: keyart('lineage-2/classic', 'Lineage 2 Classic — трое искателей приключений на дороге к деревне в сером тумане', 'medium', '45% 50%'),
  l2Essence: keyart('lineage-2/essence', 'Lineage 2 Essence — камаэль, тёмный эльф и маг на кристальном мосту к небесной цитадели', 'bright', '50% 50%'),
  mcMaster: keyart('minecraft/master', 'Minecraft — блочный замок над водопадом, портал и фонари на закате', 'medium', '72% 50%'),
  mcAnarchy: keyart('minecraft/anarchy', 'Minecraft Anarchy — разрушенный блочный город с лавой ночью', 'dark', '70% 55%'),
  mcSkyBlock: keyart('minecraft/skyblock', 'Minecraft SkyBlock — парящий остров с домом и деревом над облаками', 'bright', '40% 50%'),
  mcMinigames: keyart('minecraft/minigames', 'Minecraft BedWars — цветные острова-базы и стеклянные мосты в пустоте', 'medium', '70% 45%'),
  gtaMaster: keyart('gta-rp/master', 'GTA RP — ночной бульвар в дождь, неон, полицейская машина и пальмы', 'dark', '70% 60%'),
  rustMaster: keyart('rust/master', 'Rust — база из ржавого металла на закате, выживший на крыше, вертолёт вдали', 'medium', '68% 50%'),
  cs2Master: keyart('cs2/master', 'CS2 — боец с винтовкой в песчаном переулке, дым гранаты', 'bright', '62% 50%'),

  stage: art('shared/obsidian-stage', 'Тёмная арена между мирами', 'dark', { desktop: '50% 58%', mobile: '50% 62%' }, LEGACY_WIDTHS),
} satisfies Record<string, WorldArt>

/* ────────────────────────────────────────────────────────────────────────────
   World → art mapping
   Key is `gameId` or `gameId:chronicleId`.
   ──────────────────────────────────────────────────────────────────────────── */

const SHARED: WorldMedia = {
  stage: ART.stage,
  gallery: [],
}

const solo = (item: WorldArt): Partial<WorldMedia> => ({ hero: item, card: item, promo: item, gallery: [item] })

const WORLDS: Record<string, Partial<WorldMedia>> = {
  // ── Lineage 2 — one master, one look per chronicle ───────────────────────
  lineage2: { hero: ART.l2Master, card: ART.l2Master, promo: ART.l2HighFive, gallery: [ART.l2Master, ART.l2Interlude, ART.l2HighFive, ART.l2Classic, ART.l2Essence] },
  'lineage2:interlude': solo(ART.l2Interlude),
  'lineage2:high-five': solo(ART.l2HighFive),
  'lineage2:classic': solo(ART.l2Classic),
  'lineage2:essence': solo(ART.l2Essence),
  // Gracia Final has no art of its own yet: the era sits between Interlude and High Five.
  'lineage2:gracia': solo(ART.l2HighFive),

  // ── Minecraft — the survival world fronts the game, modes vary ───────────
  minecraft: { hero: ART.mcMaster, card: ART.mcMaster, promo: ART.mcSkyBlock, gallery: [ART.mcMaster, ART.mcSkyBlock, ART.mcMinigames, ART.mcAnarchy] },
  'minecraft:survival': solo(ART.mcMaster),
  'minecraft:anarchy': solo(ART.mcAnarchy),
  'minecraft:skyblock': solo(ART.mcSkyBlock),
  'minecraft:prison': solo(ART.mcAnarchy),
  'minecraft:modded': solo(ART.mcMaster),
  // The catalogue files minigame networks under BedWars.
  'minecraft:bedwars': solo(ART.mcMinigames),

  // ── GTA RP — platforms (FiveM / RAGE:MP / alt:V) share the city ──────────
  gtarp: solo(ART.gtaMaster),

  rust: solo(ART.rustMaster),
  cs2: solo(ART.cs2Master),

  // DayZ and newer games have no key art yet and fall back to procedural art.
}

/* ────────────────────────────────────────────────────────────────────────────
   Resolution
   ──────────────────────────────────────────────────────────────────────────── */

/** Merged media for a world, following chronicle → game → shared. */
export function resolveWorldMedia(gameId?: string, chronicleId?: string): WorldMedia {
  const game = gameId ? WORLDS[gameId] : undefined
  const chronicle = gameId && chronicleId ? WORLDS[`${gameId}:${chronicleId}`] : undefined

  const gallery = chronicle?.gallery?.length ? chronicle.gallery : (game?.gallery ?? SHARED.gallery)

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
 * Cover art for a server: the art of its chronicle (or game), varied
 * deterministically across the world gallery so a grid doesn't repeat one image.
 */
export function serverArt(server: GameServer): WorldArt | undefined {
  const chronicleId = server.chronicleId ?? chronicleOfVersion(server.gameId, server.version)?.id
  const media = resolveWorldMedia(server.gameId, chronicleId)
  if (!media.gallery.length) return media.card ?? media.hero
  const index = hashSeed(server.slug) % media.gallery.length
  return media.gallery[index]
}

/** Art for an advertising creative, so paid units look native to the world. */
export function promoArt(gameId?: string, seed?: string): WorldArt | undefined {
  const media = resolveWorldMedia(gameId)
  if (seed && media.gallery.length > 1) return media.gallery[hashSeed(seed) % media.gallery.length]
  return media.promo ?? media.hero
}

/* ────────────────────────────────────────────────────────────────────────────
   URL helpers
   ──────────────────────────────────────────────────────────────────────────── */

export function artSrc(art: WorldArt, width = 1600): string {
  const closest = art.widths.reduce((best, current) => (Math.abs(current - width) < Math.abs(best - width) ? current : best))
  return `${art.base}-${closest}.webp`
}

export function artSrcSet(art: WorldArt, widths: number[] = art.widths): string {
  return widths.map((width) => `${art.base}-${width}.webp ${width}w`).join(', ')
}
