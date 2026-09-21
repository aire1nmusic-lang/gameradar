import type { Chronicle, Game } from '@/models'

export const GAMES: Game[] = [
  {
    id: 'minecraft',
    slug: 'minecraft',
    name: 'Minecraft',
    shortName: 'Minecraft',
    tagline: 'Выживание, скайблок, RPG и анархия',
    motif: 'cubes',
    from: '#2C7A3F',
    to: '#8CC63F',
    accent: '#7BC950',
    serversCount: 4812,
    playersOnline: 96_420,
    versions: ['1.21', '1.20.6', '1.20.4', '1.19.2', '1.16.5', '1.12.2'],
    modes: ['Survival', 'SkyBlock', 'Anarchy', 'RPG', 'Factions', 'Technic', 'MiniGames'],
    chronicles: [],
  },
  {
    id: 'gtarp',
    slug: 'gta-rp',
    name: 'GTA RP / FiveM',
    shortName: 'GTA RP',
    tagline: 'Ролевые города на FiveM, RageMP и alt:V',
    motif: 'skyline',
    from: '#F0913A',
    to: '#DB3D77',
    accent: '#F0913A',
    serversCount: 2140,
    playersOnline: 58_310,
    versions: ['FiveM', 'RageMP', 'alt:V'],
    modes: ['Serious RP', 'Light RP', 'Криминал', 'Emergency', 'Racing'],
    chronicles: [
      {
        id: 'fivem',
        slug: 'fivem',
        label: 'FiveM',
        tagline: 'Самая большая платформа ролевых серверов',
        versions: ['FiveM'],
        serversCount: 1420,
        playersOnline: 38_900,
      },
      {
        id: 'ragemp',
        slug: 'ragemp',
        label: 'RageMP',
        tagline: 'Крупные города с глубокой экономикой',
        versions: ['RageMP'],
        serversCount: 480,
        playersOnline: 14_200,
      },
      {
        id: 'altv',
        slug: 'alt-v',
        label: 'alt:V',
        tagline: 'Современная платформа с кастомными механиками',
        versions: ['alt:V'],
        serversCount: 240,
        playersOnline: 5_210,
      },
    ],
  },
  {
    id: 'lineage2',
    slug: 'lineage-2',
    name: 'Lineage 2',
    shortName: 'Lineage 2',
    tagline: 'Хроники от Interlude до Essence',
    motif: 'spire',
    from: '#3358D4',
    to: '#7A4BF0',
    accent: '#6D7BF5',
    serversCount: 1386,
    playersOnline: 41_870,
    versions: ['High Five', 'Interlude', 'Essence', 'Classic', 'Gracia Final'],
    modes: ['PvP', 'Craft-PvP', 'Low rate', 'Multiprof', 'Solo PvE'],
    chronicles: [
      {
        id: 'interlude',
        slug: 'interlude',
        label: 'Interlude',
        tagline: 'Холодная классика 2007 года',
        themeId: 'l2-interlude',
        versions: ['Interlude'],
        serversCount: 412,
        playersOnline: 12_640,
      },
      {
        id: 'high-five',
        slug: 'high-five',
        label: 'High Five',
        tagline: 'Золото, осады и пик эпохи',
        themeId: 'l2-high-five',
        versions: ['High Five'],
        serversCount: 486,
        playersOnline: 16_180,
      },
      {
        id: 'essence',
        slug: 'essence',
        label: 'Essence',
        tagline: 'Современная хроника для соло-прогресса',
        themeId: 'l2-essence',
        versions: ['Essence'],
        serversCount: 298,
        playersOnline: 9_410,
      },
      {
        id: 'classic',
        slug: 'classic',
        label: 'Classic',
        tagline: 'Медленный прогресс и цена каждой смерти',
        versions: ['Classic'],
        serversCount: 124,
        playersOnline: 2_480,
      },
      {
        id: 'gracia',
        slug: 'gracia-final',
        label: 'Gracia Final',
        tagline: 'Редкая хроника для ценителей',
        versions: ['Gracia Final'],
        serversCount: 66,
        playersOnline: 1_160,
      },
    ],
  },
  {
    id: 'rust',
    slug: 'rust',
    name: 'Rust',
    shortName: 'Rust',
    tagline: 'Вайпы, рейды и модифицированные рейты',
    motif: 'barrel',
    from: '#B84A25',
    to: '#E08A3C',
    accent: '#DD7A3C',
    serversCount: 964,
    playersOnline: 22_640,
    versions: ['Vanilla', 'Modded'],
    modes: ['Vanilla', 'x2', 'x5', 'x10', 'Solo / Duo', 'Build'],
    chronicles: [
      {
        id: 'vanilla',
        slug: 'vanilla',
        label: 'Vanilla',
        tagline: 'Чистая игра без плагинов и китов',
        versions: ['Vanilla'],
        serversCount: 318,
        playersOnline: 8_120,
      },
      {
        id: 'modded',
        slug: 'modded',
        label: 'Modded',
        tagline: 'Повышенные рейты, киты и кастомные карты',
        versions: ['Modded'],
        serversCount: 646,
        playersOnline: 14_520,
      },
    ],
  },
  {
    id: 'cs2',
    slug: 'cs2',
    name: 'Counter-Strike 2',
    shortName: 'CS2',
    tagline: 'Retake, Arena, Deathmatch и классика',
    motif: 'crosshair',
    from: '#D98324',
    to: '#2A6BB0',
    accent: '#D98324',
    serversCount: 1742,
    playersOnline: 31_180,
    versions: ['CS2'],
    modes: ['Retake', 'Arena', 'Deathmatch', 'Competitive', 'Surf', 'Aim'],
    chronicles: [],
  },
  {
    id: 'ark',
    slug: 'ark',
    name: 'ARK: Survival',
    shortName: 'ARK',
    tagline: 'Кластеры, PvE и повышенные рейты',
    motif: 'leaf',
    from: '#137A72',
    to: '#3FB57A',
    accent: '#2FA58C',
    serversCount: 486,
    playersOnline: 9_240,
    versions: ['Ascended', 'Evolved'],
    modes: ['PvE', 'PvP', 'x10', 'x25', 'Cluster'],
    chronicles: [],
  },
  {
    id: 'dayz',
    slug: 'dayz',
    name: 'DayZ',
    shortName: 'DayZ',
    tagline: 'Хардкорное выживание и RP-сервера',
    motif: 'signal',
    from: '#5C6B47',
    to: '#9AA34C',
    accent: '#8E9A55',
    serversCount: 312,
    playersOnline: 5_120,
    versions: ['1.26', '1.25'],
    modes: ['Hardcore', 'PvE', 'Roleplay'],
    chronicles: [],
  },
  {
    id: 'valheim',
    slug: 'valheim',
    name: 'Valheim',
    shortName: 'Valheim',
    tagline: 'Кооперативные миры и сезоны',
    motif: 'rune',
    from: '#27607D',
    to: '#54B0C9',
    accent: '#4E9DBE',
    serversCount: 208,
    playersOnline: 2_870,
    versions: ['Ashlands'],
    modes: ['Co-op', 'PvE', 'Сезонные'],
    chronicles: [],
  },
]

export const GAMES_BY_ID = Object.fromEntries(GAMES.map((game) => [game.id, game])) as Record<string, Game>
export const GAMES_BY_SLUG = Object.fromEntries(GAMES.map((game) => [game.slug, game])) as Record<string, Game>

export function getGame(id: string): Game {
  return GAMES_BY_ID[id] ?? GAMES[0]
}

export function getGameBySlug(slug: string | undefined): Game | undefined {
  return slug ? GAMES_BY_SLUG[slug] : undefined
}

export function getChronicle(game: Game | undefined, slug: string | undefined): Chronicle | undefined {
  if (!game || !slug) return undefined
  return game.chronicles.find((chronicle) => chronicle.slug === slug)
}

/** Which chronicle a server belongs to, resolved from its version string. */
export function chronicleOfVersion(gameId: string, version: string): Chronicle | undefined {
  return getGame(gameId).chronicles.find((chronicle) => chronicle.versions.includes(version))
}

/** Games that have their own themed world route. */
export const THEMED_GAMES = GAMES

export const REGIONS = ['EU', 'RU / CIS', 'NA', 'SEA'] as const
export const LANGUAGES = ['Русский', 'English', 'Українська', 'Polski'] as const
