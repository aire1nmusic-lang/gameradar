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
const SHOWCASE_GAMES = new Set(['lineage2', 'minecraft', 'gtarp', 'rust', 'cs2', 'dayz'])
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
  // Full-page art stays high-resolution. Approved portrait crops are a separate card layer,
  // so chronicle tiles keep the selected images without forcing 192px artwork into page heroes.
  l2ElfSunset: art('lineage-2/elf-sunset-v1', 'Lineage 2 — эльфийская воительница над закатным городом', 'bright', { desktop: '50% 0%', mobile: '62% 0%' }, [768, 1536, 2048]),
  l2Master: art('lineage-2/master-v9', 'Lineage 2 — отряд героев у замка: рыжеволосая рыцарша, эльфийка, разбойница, орк, древний великан и дракон', 'medium', { desktop: '56% 22%', mobile: '54% 20%' }, [800,1600,2000]),
  l2InterludeHero: keyart('lineage-2/interlude', 'Lineage 2 Interlude — эльфийский мир на закате', 'medium', '68% 50%', '54% 50%'),
  l2HighFiveHero: keyart('lineage-2/high-five', 'Lineage 2 High Five — осада замка и герои', 'medium', '68% 50%', '55% 50%'),
  l2EssenceHero: keyart('lineage-2/essence', 'Lineage 2 Essence — герои над королевством', 'medium', '70% 50%', '55% 50%'),
  l2ClassicHero: keyart('lineage-2/classic', 'Lineage 2 Classic — битва с драконом', 'medium', '70% 50%', '55% 50%'),
  l2InterludeCard: art('lineage-2/interlude-user-v7', 'Lineage 2 Interlude — розововолосая разбойница', 'medium', { desktop: '50% 46%', mobile: '50% 46%' }, [192]),
  l2HighFiveCard: art('lineage-2/high-five-user-v7', 'Lineage 2 High Five — рыжеволосая волшебница', 'medium', { desktop: '50% 42%', mobile: '50% 42%' }, [192]),
  l2EssenceCard: art('lineage-2/essence-user-v7', 'Lineage 2 Essence — воительница в светлых доспехах', 'medium', { desktop: '50% 38%', mobile: '50% 38%' }, [192]),
  // The user-v7 Essence portrait cuts the head off; until a new one exists the tile is a square crop of the Essence key art, knight centred.
  l2EssenceTile: keyart('lineage-2/essence', 'Lineage 2 Essence — рыцарь на фоне королевства', 'medium', '62% 40%', '62% 40%'),
  l2ClassicCard: art('lineage-2/classic-user-v7', 'Lineage 2 Classic — орк-воин', 'medium', { desktop: '50% 38%', mobile: '50% 38%' }, [192]),
  mcMaster: keyart('minecraft/master', 'Minecraft — солнечная долина с деревней, каменным замком и водопадом, игрок в алмазной броне', 'bright', '82% 55%', '60% 50%'),
  mcAnarchy: keyart('minecraft/anarchy', 'Minecraft Anarchy — разрушенный блочный город с лавой ночью', 'dark', '70% 55%'),
  mcSkyBlock: keyart('minecraft/skyblock', 'Minecraft SkyBlock — парящие острова с водопадами на рассвете, домик и сундук', 'bright', '70% 50%', '55% 50%'),
  mcMinigames: keyart('minecraft/minigames', 'Minecraft BedWars — цветные острова-базы и стеклянные мосты в пустоте', 'medium', '70% 45%'),
  gtaMaster: keyart('gta-rp/master', 'GTA RP — бульвар с пальмами на закате: полицейский, бизнесмен, байкер и девушка у спорткара', 'bright', '66% 55%', '55% 50%'),
  rustMaster: keyart('rust/master', 'Rust — база из брёвен и металла на холме у моря, выживший у ворот на рассвете', 'bright', '72% 55%', '55% 50%'),
  cs2Master: keyart('cs2/master', 'CS2 — отряд спецназа идёт через арку в солнечном городе из песчаника', 'bright', '84% 55%', '58% 50%'),
  dayzMaster: keyart('dayz/master', 'DayZ — выживший с рюкзаком идёт по пустой дороге мимо брошенной машины к деревне с церковью, осень', 'bright', '86% 55%', '58% 55%'),

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
  lineage2: { hero: ART.l2Master, card: ART.l2Master, promo: ART.l2HighFiveHero, gallery: [ART.l2Master, ART.l2InterludeHero, ART.l2HighFiveHero, ART.l2ClassicHero, ART.l2EssenceHero] },
  'lineage2:interlude': { hero: ART.l2InterludeHero, card: ART.l2InterludeCard, promo: ART.l2InterludeHero, gallery: [ART.l2InterludeHero] },
  'lineage2:high-five': { hero: ART.l2HighFiveHero, card: ART.l2HighFiveCard, promo: ART.l2HighFiveHero, gallery: [ART.l2HighFiveHero] },
  'lineage2:classic': { hero: ART.l2ClassicHero, card: ART.l2ClassicCard, promo: ART.l2ClassicHero, gallery: [ART.l2ClassicHero] },
  'lineage2:essence': { hero: ART.l2EssenceHero, card: ART.l2EssenceTile, promo: ART.l2EssenceHero, gallery: [ART.l2EssenceHero] },
  // Gracia Final stays text-only in the compact rail for now, but its route gets a full-resolution era image.
  // Gracia has no portrait yet: its tile uses the siege key art so it never repeats the High Five portrait.
  'lineage2:gracia': { hero: ART.l2HighFiveHero, card: ART.l2HighFiveHero, promo: ART.l2HighFiveHero, gallery: [ART.l2HighFiveHero] },

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
  dayz: solo(ART.dayzMaster),

  // Newer games without key art fall back to procedural art.
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
