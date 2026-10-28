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
  l2Master: art('lineage-2/tower-v1', 'Lineage 2 — Башня Дерзости в грозовом вихре над руинами', 'medium', { desktop: '64% 30%', mobile: '50% 20%' }, [800,1600,2000]),
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

/** Owner-approved individual chronicle banners, 20 Oct 2026. */
const L2_CHRONICLE_ART: Record<string, WorldArt> = {
  all: art('lineage-2/chronicle-all-approved-v1', 'Все хроники — дракон над крепостью', 'medium', {desktop:'72% 40%',mobile:'72% 40%'}, [400,800,1600]),
  interlude: art('lineage-2/chronicle-interlude-approved-v1', 'Interlude — ведьма в магическом городе', 'medium', {desktop:'75% 30%',mobile:'75% 30%'}, [400,800,1600]),
  'high-five': art('lineage-2/chronicle-high-five-approved-v1', 'High Five — воительница над сияющим городом', 'bright', {desktop:'75% 30%',mobile:'75% 30%'}, [400,800,1600]),
  essence: art('lineage-2/chronicle-classic-approved-v1', 'Essence — рогатый странник в утренней деревне', 'bright', {desktop:'75% 45%',mobile:'75% 45%'}, [400,800,1600]),
  other: art('lineage-2/chronicle-classic-dwarf-v2', 'Другие хроники — гном-кузнец в солнечной мастерской', 'bright', {desktop:'75% 0%',mobile:'75% 0%'}, [400,800,1600]),
  classic: art('lineage-2/chronicle-classic-dwarf-v2', 'Classic — гном-кузнец в солнечной мастерской', 'bright', {desktop:'75% 0%',mobile:'75% 0%'}, [400,800,1600]),
  gracia: art('lineage-2/chronicle-gracia-approved-v1', 'Gracia Final — воин у горящей крепости', 'medium', {desktop:'75% 25%',mobile:'75% 25%'}, [400,800,1600]),
}

/** Owner-supplied mode/platform images, 28 Oct. Navigation tiles only; world heroes stay approved. */
const MODE_TILE_ART: Record<string, WorldArt> = {
  'minecraft:survival': art('minecraft/mode-survival-owner-v1', 'Survival — деревня у реки и игрок с киркой', 'bright', {desktop:'55% 58%',mobile:'70% 55%'}, [400,800,1600]),
  'minecraft:anarchy': art('minecraft/mode-anarchy-owner-v1', 'Anarchy — разрушенный спавн, обсидиан и лава', 'dark', {desktop:'50% 55%',mobile:'65% 50%'}, [400,800,1600]),
  'minecraft:skyblock': art('minecraft/mode-skyblock-owner-v1', 'SkyBlock — остров с домом над облаками', 'bright', {desktop:'50% 55%',mobile:'50% 55%'}, [400,800,1600]),
  'minecraft:bedwars': art('minecraft/mode-bedwars-owner-v1', 'BedWars — кровать и бой команд на мосту', 'bright', {desktop:'50% 55%',mobile:'65% 55%'}, [400,800,1600]),
  'minecraft:prison': art('minecraft/mode-prison-owner-v1', 'Prison — тюремная шахта с рудами', 'dark', {desktop:'50% 55%',mobile:'70% 50%'}, [400,800,1600]),
  'minecraft:modded': art('minecraft/mode-modded-owner-v1', 'Modded — механизмы, трубы и магический портал', 'medium', {desktop:'50% 55%',mobile:'60% 55%'}, [400,800,1600]),
  'gtarp:fivem': art('gta-rp/mode-fivem-owner-v1', 'FiveM — полицейский и водитель в ночном городе', 'medium', {desktop:'50% 62%',mobile:'75% 60%'}, [400,800,1600]),
  'gtarp:ragemp': art('gta-rp/mode-ragemp-owner-v1', 'RAGE:MP — деловой квартал и представительский автомобиль', 'bright', {desktop:'50% 50%',mobile:'75% 45%'}, [400,800,1600]),
  'gtarp:altv': art('gta-rp/mode-altv-owner-v1', 'alt:V — тюнинг-гараж у ночного побережья', 'dark', {desktop:'50% 60%',mobile:'72% 55%'}, [400,800,1600]),
}

/** The All tile has its own banner without replacing the main world's approved backdrop. */
export function chronicleTileArt(gameId: string, chronicleId?: string): WorldArt | undefined {
  if (gameId !== 'lineage2') return MODE_TILE_ART[`${gameId}:${chronicleId}`] ?? worldArt('hero',gameId,chronicleId) ?? worldArt('card',gameId,chronicleId)
  const item = L2_CHRONICLE_ART[chronicleId ?? 'all']
  if (!item) return undefined
  // Tile crops differ from full-page backgrounds: protect the top of every head.
  // Mobile narrows the scene around the right-hand subject; desktop keeps the wider view.
  return { ...item, focus: {
    desktop: chronicleId === undefined || chronicleId === 'all' ? '72% 0%' : '75% 0%',
    mobile: chronicleId === undefined || chronicleId === 'all' ? '80% 0%' : '85% 0%',
  } }
}

const WORLDS: Record<string, Partial<WorldMedia>> = {
  // ── Lineage 2 — one master, one look per chronicle ───────────────────────
  lineage2: { hero: ART.l2Master, card: ART.l2Master, promo: ART.l2HighFiveHero, gallery: [ART.l2Master, ART.l2InterludeHero, ART.l2HighFiveHero, ART.l2ClassicHero, ART.l2EssenceHero] },
  'lineage2:interlude': { hero: L2_CHRONICLE_ART['interlude'], card: ART.l2InterludeCard, promo: ART.l2InterludeHero, gallery: [ART.l2InterludeHero] },
  'lineage2:high-five': { hero: L2_CHRONICLE_ART['high-five'], card: ART.l2HighFiveCard, promo: ART.l2HighFiveHero, gallery: [ART.l2HighFiveHero] },
  'lineage2:other': solo(L2_CHRONICLE_ART['other']),
  'lineage2:classic': { hero: L2_CHRONICLE_ART['classic'], card: ART.l2ClassicCard, promo: ART.l2ClassicHero, gallery: [ART.l2ClassicHero] },
  'lineage2:essence': { hero: L2_CHRONICLE_ART['essence'], card: ART.l2EssenceTile, promo: ART.l2EssenceHero, gallery: [ART.l2EssenceHero] },
  // Approved individual chronicle art; secondary historical slots are retained.
  'lineage2:gracia': { hero: L2_CHRONICLE_ART['gracia'], card: ART.l2HighFiveHero, promo: ART.l2HighFiveHero, gallery: [ART.l2HighFiveHero] },

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

/** One shared header for every Lineage 2 server page (owner art): the sunlit summer fortress on the sea cliff. */
export const L2_SERVER_COVER: WorldArt = art('lineage-2/server-castle-summer-v2', 'Lineage 2 — солнечная крепость над бирюзовым морем', 'medium', { desktop: '62% 45%', mobile: '66% 40%' }, [400, 800, 1600, 2000])

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
