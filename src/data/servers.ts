import { hashSeed, rng } from '@/lib/utils'
import { ProbeMethod, ServerStatus } from '@/models'
import type { ChartRange, GameServer, HistoryEvent, OnlineStatus, PromoKind, Review } from '@/models'

/**
 * Demo dataset for the GameScout prototype.
 * Everything here is fictional and generated deterministically from a seed —
 * no real server, player count or rating is represented.
 */

const NOW = Date.now()
const HOUR = 3_600_000
const DAY = 86_400_000

function iso(offsetMs: number): string {
  return new Date(NOW + offsetMs).toISOString()
}

function launchIso(hours: number): string {
  const d = new Date(NOW + hours * HOUR)
  d.setMinutes(d.getMinutes() < 30 ? 0 : 30, 0, 0)
  return d.toISOString()
}

interface RawServer {
  slug: string
  name: string
  gameId: string
  version: string
  modes: string[]
  region: string
  country: string
  flag: string
  languages: string[]
  current: number
  max: number
  status: OnlineStatus
  change24h: number
  rating: number
  reviewsCount: number
  openedYearsAgo: number
  tags: string[]
  summary: string
  description: string
  rates?: string
  promo?: PromoKind
  favorites: number
  addedDaysAgo: number
  updatedDaysAgo: number
  lastWipeDaysAgo?: number
  nextWipeInDays?: number
  launchInHours?: number
  launchType?: string
  preRegistrations?: number
  interestChange?: number
  highlights: string[]
  site: string
  discord: string
  telegram?: string
  uptime24h?: number
  checkedAgoSec?: number
  source?: string
  method?: ProbeMethod
  note?: string
}

const RAW: RawServer[] = [
  // ─── Minecraft ────────────────────────────────────────────────────────────
  {
    slug: 'holysky',
    name: 'HolySky',
    gameId: 'minecraft',
    version: '1.21',
    modes: ['Survival', 'PvP', 'Economy'],
    region: 'EU',
    country: 'Германия',
    flag: '🇩🇪',
    languages: ['Русский', 'English'],
    current: 1284,
    max: 3000,
    status: 'VERIFIED',
    change24h: 14,
    rating: 4.8,
    reviewsCount: 428,
    openedYearsAgo: 3,
    tags: ['Survival', 'PvP', 'Economy', 'Кланы', 'Квесты'],
    summary: 'Классическое выживание с продуманной экономикой и territory-войнами кланов.',
    description:
      'HolySky — долгоживущий survival-проект с собственной экономикой, аукционом и сезонными войнами кланов. Прогресс не сбрасывается между сезонами, донат не даёт боевого преимущества — только косметику и удобства.',
    favorites: 12_480,
    addedDaysAgo: 940,
    updatedDaysAgo: 4,
    highlights: ['Без pay-to-win механик', 'Сезоны по 4 месяца', 'Анти-чит собственной разработки'],
    site: 'holysky.gg',
    discord: 'discord.gg/holysky',
    telegram: 't.me/holysky',
    uptime24h: 99.8,
    checkedAgoSec: 42,
  },
  {
    slug: 'craftoria',
    name: 'Craftoria',
    gameId: 'minecraft',
    version: '1.20.4',
    modes: ['SkyBlock', 'Economy', 'Quests'],
    region: 'RU / CIS',
    country: 'Россия',
    flag: '🇷🇺',
    languages: ['Русский'],
    current: 2841,
    max: 4000,
    status: 'VERIFIED',
    change24h: 18,
    rating: 4.6,
    reviewsCount: 1210,
    openedYearsAgo: 5,
    tags: ['SkyBlock', 'Экономика', 'Ивенты', 'Кастом'],
    summary: 'Крупнейший русскоязычный скайблок с еженедельными ивентами и биржей ресурсов.',
    description:
      'Craftoria строит скайблок вокруг живой экономики: биржа ресурсов, контракты между игроками, еженедельные ивенты с рейтингом островов. Сервер поддерживает кроссплей Java и Bedrock.',
    promo: 'TOP',
    favorites: 24_910,
    addedDaysAgo: 1620,
    updatedDaysAgo: 1,
    highlights: ['Java + Bedrock', 'Биржа ресурсов', 'Ивенты каждую неделю'],
    site: 'craftoria.ru',
    discord: 'discord.gg/craftoria',
    telegram: 't.me/craftoria',
    uptime24h: 99.9,
    checkedAgoSec: 18,
  },
  {
    slug: 'minenova',
    name: 'MineNova',
    gameId: 'minecraft',
    version: '1.21',
    modes: ['Anarchy', 'Hardcore'],
    region: 'EU',
    country: 'Нидерланды',
    flag: '🇳🇱',
    languages: ['English', 'Русский'],
    current: 712,
    max: 1500,
    status: 'VERIFIED',
    change24h: 42,
    rating: 4.3,
    reviewsCount: 190,
    openedYearsAgo: 1,
    tags: ['Anarchy', 'Без правил', 'Hardcore', '2b2t-like'],
    summary: 'Анархия без правил и вайпов. Карта живёт с первого дня запуска.',
    description:
      'MineNova — анархия в чистом виде: карта не вайпается, правил нет, единственное ограничение — античит от краш-эксплойтов. Сервер быстро растёт за счёт сообщества стримеров.',
    favorites: 4_120,
    addedDaysAgo: 300,
    updatedDaysAgo: 12,
    highlights: ['Карта без вайпов', 'Очередь входа отключена', 'Собственный античит'],
    site: 'minenova.net',
    discord: 'discord.gg/minenova',
    uptime24h: 99.4,
    checkedAgoSec: 65,
  },
  {
    slug: 'azure-realms',
    name: 'Azure Realms',
    gameId: 'minecraft',
    version: '1.19.2',
    modes: ['RPG', 'Dungeons', 'Custom'],
    region: 'RU / CIS',
    country: 'Украина',
    flag: '🇺🇦',
    languages: ['Русский', 'Українська'],
    current: 418,
    max: 1000,
    status: 'OWNER_REPORTED',
    change24h: 3,
    rating: 4.1,
    reviewsCount: 96,
    openedYearsAgo: 2,
    tags: ['RPG', 'Данжи', 'Классы', 'Сюжет'],
    summary: 'RPG-сервер с классами, данжами и сюжетной кампанией на 40 часов.',
    description:
      'Azure Realms — кастомная RPG на базе Minecraft: шесть классов, система талантов, рейдовые данжи на 10 игроков и сюжетная линия, которую дописывают каждый сезон.',
    favorites: 2_240,
    addedDaysAgo: 620,
    updatedDaysAgo: 22,
    highlights: ['6 классов и таланты', 'Рейды на 10 игроков', 'Сюжетные обновления'],
    site: 'azurerealms.gg',
    discord: 'discord.gg/azurerealms',
    source: 'Данные сервера',
    method: ProbeMethod.OwnerSubmitted,
  },
  {
    slug: 'pixelforge',
    name: 'PixelForge',
    gameId: 'minecraft',
    version: '1.12.2',
    modes: ['Technic', 'Modded'],
    region: 'EU',
    country: 'Польша',
    flag: '🇵🇱',
    languages: ['English', 'Polski'],
    current: 0,
    max: 600,
    status: 'OFFLINE',
    change24h: -100,
    rating: 3.9,
    reviewsCount: 64,
    openedYearsAgo: 6,
    tags: ['Modded', 'Technic', 'Индустрия'],
    summary: 'Индустриальная сборка на 180 модов. Сейчас сервер не отвечает.',
    description:
      'PixelForge — техническая сборка на 180 модов с фокусом на автоматизацию и энергосети. Проект работает сезонами, между сезонами сервер может быть выключен.',
    favorites: 980,
    addedDaysAgo: 2100,
    updatedDaysAgo: 64,
    highlights: ['180 модов', 'Сезоны по 6 месяцев', 'Своя вики'],
    site: 'pixelforge.eu',
    discord: 'discord.gg/pixelforge',
    note: 'Сервер не отвечает на запросы GameScout с 09:40.',
    uptime24h: 41.2,
    checkedAgoSec: 55,
  },
  {
    slug: 'voxelia',
    name: 'Voxelia',
    gameId: 'minecraft',
    version: '1.21',
    modes: ['Survival', 'Vanilla+'],
    region: 'EU',
    country: 'Финляндия',
    flag: '🇫🇮',
    languages: ['English', 'Русский'],
    current: 1960,
    max: 2500,
    status: 'VERIFIED',
    change24h: 6,
    rating: 4.9,
    reviewsCount: 812,
    openedYearsAgo: 7,
    tags: ['Vanilla+', 'Survival', 'Сообщество', 'Без доната'],
    summary: 'Ванильное выживание без доната. Семь лет одной карты и репутация лучшего комьюнити.',
    description:
      'Voxelia — ванильный сервер, который принципиально не продаёт преимущества. Вся монетизация — добровольная поддержка. Карта ведётся с 2018 года, есть музей построек и собственная динамическая карта.',
    promo: 'VIP',
    favorites: 31_640,
    addedDaysAgo: 2400,
    updatedDaysAgo: 7,
    highlights: ['Нулевой донат', 'Карта с 2018 года', 'Модерация 24/7'],
    site: 'voxelia.world',
    discord: 'discord.gg/voxelia',
    telegram: 't.me/voxelia',
    uptime24h: 100,
    checkedAgoSec: 12,
  },
  {
    slug: 'northgate',
    name: 'Northgate',
    gameId: 'minecraft',
    version: '1.20.6',
    modes: ['Factions', 'PvP'],
    region: 'RU / CIS',
    country: 'Россия',
    flag: '🇷🇺',
    languages: ['Русский'],
    current: 534,
    max: 1200,
    status: 'ANOMALY',
    change24h: 96,
    rating: 4.0,
    reviewsCount: 141,
    openedYearsAgo: 2,
    tags: ['Factions', 'PvP', 'Рейды'],
    summary: 'Фракционный PvP с осадами баз и еженедельным рейтингом кланов.',
    description:
      'Northgate — фракционный PvP: захват территорий, осады баз в назначенное время и сезонный рейтинг кланов с призовым фондом.',
    favorites: 3_410,
    addedDaysAgo: 700,
    updatedDaysAgo: 3,
    highlights: ['Осады по расписанию', 'Сезонный призовой фонд', 'Территории кланов'],
    site: 'northgate.su',
    discord: 'discord.gg/northgate',
    note: 'Онлайн вырос на 96% за 12 минут при неизменном числе уникальных IP.',
    uptime24h: 98.1,
    checkedAgoSec: 30,
  },
  {
    slug: 'frostpeak',
    name: 'Frostpeak',
    gameId: 'minecraft',
    version: '1.21',
    modes: ['Survival', 'Seasons'],
    region: 'EU',
    country: 'Швеция',
    flag: '🇸🇪',
    languages: ['English', 'Русский'],
    current: 0,
    max: 1500,
    status: 'PENDING',
    change24h: 0,
    rating: 0,
    reviewsCount: 0,
    openedYearsAgo: 0,
    tags: ['Survival', 'Новый сезон', 'Сюжет'],
    summary: 'Новый сезон зимнего выживания с прогрессией территорий.',
    description:
      'Frostpeak открывает третий сезон: новая карта 12k×12k, система обогрева, кооперативные экспедиции и прогрессия поселений.',
    favorites: 1_180,
    addedDaysAgo: 9,
    updatedDaysAgo: 1,
    launchInHours: 5,
    launchType: 'Сезон 3 · Survival',
    preRegistrations: 6420,
    interestChange: 28,
    highlights: ['Карта 12k × 12k', 'Кооперативные экспедиции', 'Прогрессия поселений'],
    site: 'frostpeak.gg',
    discord: 'discord.gg/frostpeak',
  },

  // ─── GTA RP ───────────────────────────────────────────────────────────────
  {
    slug: 'nord-rp',
    name: 'Nord RP',
    gameId: 'gtarp',
    version: 'FiveM',
    modes: ['Serious RP', 'Экономика'],
    region: 'RU / CIS',
    country: 'Россия',
    flag: '🇷🇺',
    languages: ['Русский'],
    current: 1120,
    max: 1500,
    status: 'VERIFIED',
    change24h: 9,
    rating: 4.7,
    reviewsCount: 980,
    openedYearsAgo: 4,
    tags: ['Serious RP', 'Работы', 'Бизнесы', 'Whitelist'],
    summary: 'Serious RP с whitelist-отбором, живой экономикой и городской фракционной системой.',
    description:
      'Nord RP — серьёзный ролевой проект: вход по собеседованию, 14 государственных и криминальных фракций, полноценная экономика с налогами и банкротствами бизнесов.',
    favorites: 18_220,
    addedDaysAgo: 1400,
    updatedDaysAgo: 2,
    highlights: ['Whitelist-собеседование', '14 фракций', 'Экономика с налогами'],
    site: 'nordrp.com',
    discord: 'discord.gg/nordrp',
    telegram: 't.me/nordrp',
    uptime24h: 99.7,
    checkedAgoSec: 27,
  },
  {
    slug: 'vertex-rp',
    name: 'Vertex RP',
    gameId: 'gtarp',
    version: 'RageMP',
    modes: ['Serious RP', 'Криминал'],
    region: 'RU / CIS',
    country: 'Беларусь',
    flag: '🇧🇾',
    languages: ['Русский'],
    current: 2310,
    max: 3000,
    status: 'VERIFIED',
    change24h: 11,
    rating: 4.5,
    reviewsCount: 1640,
    openedYearsAgo: 6,
    tags: ['RageMP', 'Криминал', 'Бизнесы', 'Мэрия'],
    summary: 'Один из самых населённых RageMP-городов: мэрия, выборы и криминальные синдикаты.',
    description:
      'Vertex RP — большой ролевой город с политической системой: выборы мэра, бюджет города, лицензии на бизнес и криминальные синдикаты, которые делят районы.',
    promo: 'TOP',
    favorites: 29_140,
    addedDaysAgo: 2050,
    updatedDaysAgo: 5,
    highlights: ['Выборы мэра', 'Городской бюджет', 'Синдикаты и районы'],
    site: 'vertexrp.ru',
    discord: 'discord.gg/vertexrp',
    telegram: 't.me/vertexrp',
    uptime24h: 99.6,
    checkedAgoSec: 51,
  },
  {
    slug: 'downtown-rp',
    name: 'Downtown RP',
    gameId: 'gtarp',
    version: 'FiveM',
    modes: ['Light RP', 'Криминал'],
    region: 'RU / CIS',
    country: 'Россия',
    flag: '🇷🇺',
    languages: ['Русский'],
    current: 860,
    max: 1200,
    status: 'VERIFIED',
    change24h: -4,
    rating: 4.4,
    reviewsCount: 410,
    openedYearsAgo: 3,
    tags: ['Light RP', 'Без whitelist', 'Гонки'],
    summary: 'Лёгкий RP без собеседований: зашёл и играешь. Упор на уличную жизнь и гонки.',
    description:
      'Downtown RP делает ставку на низкий порог входа: никакого собеседования, обучение в игре за 10 минут, упор на уличные гонки, тюнинг и клубную жизнь.',
    favorites: 9_640,
    addedDaysAgo: 1100,
    updatedDaysAgo: 9,
    highlights: ['Вход без анкеты', 'Тюнинг и гонки', 'Обучение за 10 минут'],
    site: 'downtownrp.gg',
    discord: 'discord.gg/downtownrp',
    uptime24h: 99.2,
    checkedAgoSec: 74,
  },
  {
    slug: 'majestic-bay',
    name: 'Majestic Bay',
    gameId: 'gtarp',
    version: 'alt:V',
    modes: ['Roleplay', 'Экономика'],
    region: 'EU',
    country: 'Германия',
    flag: '🇩🇪',
    languages: ['English', 'Русский'],
    current: 640,
    max: 1000,
    status: 'OWNER_REPORTED',
    change24h: 5,
    rating: 4.2,
    reviewsCount: 233,
    openedYearsAgo: 1,
    tags: ['alt:V', 'Экономика', 'Недвижимость'],
    summary: 'alt:V-проект с рынком недвижимости и полноценной банковской системой.',
    description:
      'Majestic Bay — европейский alt:V проект: рынок недвижимости с ипотекой, банковская система, биржа и налоговая. Ролевая часть строится вокруг бизнеса, а не криминала.',
    favorites: 3_980,
    addedDaysAgo: 380,
    updatedDaysAgo: 14,
    highlights: ['Ипотека и недвижимость', 'Биржа', 'Бизнес-ориентированный RP'],
    site: 'majesticbay.eu',
    discord: 'discord.gg/majesticbay',
    source: 'Данные сервера',
    method: ProbeMethod.OwnerSubmitted,
  },
  {
    slug: 'redline-rp',
    name: 'Redline RP',
    gameId: 'gtarp',
    version: 'FiveM',
    modes: ['Racing RP', 'Street'],
    region: 'RU / CIS',
    country: 'Казахстан',
    flag: '🇰🇿',
    languages: ['Русский'],
    current: 380,
    max: 800,
    status: 'VERIFIED',
    change24h: 61,
    rating: 4.0,
    reviewsCount: 88,
    openedYearsAgo: 1,
    tags: ['Гонки', 'Тюнинг', 'Street RP'],
    summary: 'Уличные гонки как основа ролевой игры: команды, ставки, тюнинг-ателье.',
    description:
      'Redline RP превращает уличные гонки в ролевой мир: гоночные команды, ставки, угоны, тюнинг-ателье и ночные сходки. Экономика построена вокруг автопарка.',
    favorites: 2_060,
    addedDaysAgo: 210,
    updatedDaysAgo: 2,
    highlights: ['Гоночные команды', 'Ставки и угоны', 'Ночные сходки'],
    site: 'redlinerp.kz',
    discord: 'discord.gg/redlinerp',
    uptime24h: 99.1,
    checkedAgoSec: 39,
  },
  {
    slug: 'harbor-city-rp',
    name: 'Harbor City RP',
    gameId: 'gtarp',
    version: 'FiveM',
    modes: ['Serious RP', 'Emergency'],
    region: 'EU',
    country: 'Чехия',
    flag: '🇨🇿',
    languages: ['English'],
    current: 0,
    max: 1200,
    status: 'PENDING',
    change24h: 0,
    rating: 0,
    reviewsCount: 0,
    openedYearsAgo: 0,
    tags: ['Serious RP', 'Emergency', 'Whitelist'],
    summary: 'Портовый город с упором на службы спасения и медицину.',
    description:
      'Harbor City RP открывается с фокусом на экстренные службы: полноценная медицинская система, пожарные, береговая охрана и диспетчерская.',
    favorites: 2_740,
    addedDaysAgo: 16,
    updatedDaysAgo: 1,
    launchInHours: 9,
    launchType: 'Открытие · Serious RP',
    preRegistrations: 11_940,
    interestChange: 46,
    promo: 'FEATURED',
    highlights: ['Медицинская система', 'Диспетчерская 112', 'Whitelist с первого дня'],
    site: 'harborcityrp.eu',
    discord: 'discord.gg/harborcity',
  },
  {
    slug: 'neon-bay-rp',
    name: 'Neon Bay RP',
    gameId: 'gtarp',
    version: 'FiveM',
    modes: ['Light RP', 'Night city'],
    region: 'EU',
    country: 'Испания',
    flag: '🇪🇸',
    languages: ['English', 'Русский'],
    current: 0,
    max: 900,
    status: 'PENDING',
    change24h: 0,
    rating: 0,
    reviewsCount: 0,
    openedYearsAgo: 0,
    tags: ['Light RP', 'Клубы', 'Ночная жизнь'],
    summary: 'Ночной город: клубы, диджеи, стрит-арт и лёгкий ролевой вход.',
    description:
      'Neon Bay RP — проект о ночной жизни города: клубы с живыми диджеями, стрит-арт, подпольные вечеринки и минимальный порог входа.',
    favorites: 860,
    addedDaysAgo: 5,
    updatedDaysAgo: 1,
    launchInHours: 52,
    launchType: 'Открытие · Light RP',
    preRegistrations: 3210,
    interestChange: 19,
    highlights: ['Живые диджей-сеты', 'Кастомные интерьеры', 'Вход без анкеты'],
    site: 'neonbayrp.com',
    discord: 'discord.gg/neonbay',
  },

  // ─── Lineage 2 ────────────────────────────────────────────────────────────
  {
    slug: 'valheria-x25',
    name: 'Valheria x25',
    gameId: 'lineage2',
    version: 'High Five',
    modes: ['PvP', 'Craft-PvP'],
    region: 'RU / CIS',
    country: 'Россия',
    flag: '🇷🇺',
    languages: ['Русский'],
    current: 1490,
    max: 2500,
    status: 'VERIFIED',
    change24h: 12,
    rating: 4.6,
    reviewsCount: 520,
    openedYearsAgo: 1,
    tags: ['High Five', 'x25', 'Craft-PvP', 'Осады'],
    summary: 'Сбалансированный Craft-PvP на High Five с еженедельными осадами.',
    description:
      'Valheria x25 — классический High Five с акцентом на крафт: заточка без Мамона, еженедельные осады замков и сезонные эпик-боссы по расписанию.',
    rates: 'EXP x25 · SP x25 · Adena x15 · Drop x10',
    favorites: 8_940,
    addedDaysAgo: 420,
    updatedDaysAgo: 6,
    highlights: ['Осады каждую неделю', 'Эпики по расписанию', 'Без вайпов'],
    site: 'valheria.gg',
    discord: 'discord.gg/valheria',
    telegram: 't.me/valheria',
    uptime24h: 99.9,
    checkedAgoSec: 22,
  },
  {
    slug: 'asterion',
    name: 'Asterion',
    gameId: 'lineage2',
    version: 'Interlude',
    modes: ['Low rate', 'PvE'],
    region: 'RU / CIS',
    country: 'Россия',
    flag: '🇷🇺',
    languages: ['Русский', 'English'],
    current: 1740,
    max: 3000,
    status: 'VERIFIED',
    change24h: 4,
    rating: 4.7,
    reviewsCount: 690,
    openedYearsAgo: 4,
    tags: ['Interlude', 'x5', 'Low rate', 'Классика'],
    summary: 'Low rate Interlude для тех, кто помнит оригинальный ритм игры.',
    description:
      'Asterion — низкие рейты и максимально приближённая к оригиналу механика Interlude. Прокачка занимает месяцы, экономика держится на игроках, а не на донате.',
    rates: 'EXP x5 · SP x5 · Adena x3 · Drop x3',
    promo: 'VIP',
    favorites: 14_320,
    addedDaysAgo: 1480,
    updatedDaysAgo: 11,
    highlights: ['Оригинальные механики', 'Экономика без доната', 'Стабильные 4 года'],
    site: 'asterion.pw',
    discord: 'discord.gg/asterion',
    uptime24h: 99.8,
    checkedAgoSec: 34,
  },
  {
    slug: 'eternia',
    name: 'Eternia',
    gameId: 'lineage2',
    version: 'Essence',
    modes: ['Solo', 'PvE'],
    region: 'EU',
    country: 'Латвия',
    flag: '🇱🇻',
    languages: ['English', 'Русский'],
    current: 980,
    max: 2000,
    status: 'VERIFIED',
    change24h: 7,
    rating: 4.4,
    reviewsCount: 302,
    openedYearsAgo: 2,
    tags: ['Essence', 'Solo', 'Автоохота', 'PvE'],
    summary: 'Essence с комфортной автоохотой и прогрессом без пати-зависимости.',
    description:
      'Eternia — Essence-сервер для игроков с ограниченным временем: автоохота, соло-прогресс, еженедельные рейды и отсутствие обязательных пати-сессий.',
    rates: 'EXP x10 · Adena x8',
    favorites: 5_410,
    addedDaysAgo: 760,
    updatedDaysAgo: 18,
    highlights: ['Автоохота', 'Соло-прогресс', 'Рейды по выходным'],
    site: 'eternia.eu',
    discord: 'discord.gg/eternia',
    uptime24h: 99.5,
    checkedAgoSec: 58,
  },
  {
    slug: 'sagrada',
    name: 'Sagrada',
    gameId: 'lineage2',
    version: 'High Five',
    modes: ['PvP', 'Multiprof'],
    region: 'RU / CIS',
    country: 'Россия',
    flag: '🇷🇺',
    languages: ['Русский'],
    current: 2040,
    max: 2500,
    status: 'VERIFIED',
    change24h: 27,
    rating: 4.2,
    reviewsCount: 448,
    openedYearsAgo: 1,
    tags: ['x1200', 'PvP', 'Мультипроф', 'Быстрый старт'],
    summary: 'Быстрый PvP-старт: максимальный уровень за вечер, дальше только война.',
    description:
      'Sagrada — сервер мгновенного старта: максимальный уровень достигается за один вечер, весь контент — массовые PvP-события, захваты и турниры кланов.',
    rates: 'EXP x1200 · Adena x800',
    favorites: 7_120,
    addedDaysAgo: 260,
    updatedDaysAgo: 1,
    highlights: ['Максимум за вечер', 'Турниры кланов', 'PvP-ивенты каждый день'],
    site: 'sagrada.gg',
    discord: 'discord.gg/sagrada',
    uptime24h: 99.3,
    checkedAgoSec: 16,
  },
  {
    slug: 'elmoreden',
    name: 'Elmoreden',
    gameId: 'lineage2',
    version: 'Gracia Final',
    modes: ['PvP', 'Craft'],
    region: 'RU / CIS',
    country: 'Украина',
    flag: '🇺🇦',
    languages: ['Русский', 'Українська'],
    current: 610,
    max: 1500,
    status: 'OWNER_REPORTED',
    change24h: -8,
    rating: 3.8,
    reviewsCount: 121,
    openedYearsAgo: 3,
    tags: ['Gracia Final', 'x7', 'Craft'],
    summary: 'Редкая хроника Gracia Final с упором на крафт и территориальные войны.',
    description:
      'Elmoreden — один из немногих живых серверов на Gracia Final. Крафтовая экономика, территориальные войны и классический эндгейм.',
    rates: 'EXP x7 · Adena x5',
    favorites: 2_180,
    addedDaysAgo: 1020,
    updatedDaysAgo: 28,
    highlights: ['Редкая хроника', 'Территориальные войны', 'Крафтовая экономика'],
    site: 'elmoreden.ua',
    discord: 'discord.gg/elmoreden',
    source: 'Данные сервера',
    method: ProbeMethod.OwnerSubmitted,
  },
  {
    slug: 'drakonis-x50',
    name: 'Drakonis x50',
    gameId: 'lineage2',
    version: 'Classic',
    modes: ['PvP', 'Открытие'],
    region: 'RU / CIS',
    country: 'Россия',
    flag: '🇷🇺',
    languages: ['Русский'],
    current: 0,
    max: 3000,
    status: 'PENDING',
    change24h: 0,
    rating: 0,
    reviewsCount: 0,
    openedYearsAgo: 0,
    tags: ['Classic', 'x50', 'Открытие', 'Сезон 1'],
    summary: 'Старт первого сезона Classic x50 с призовым фондом за первый замок.',
    description:
      'Drakonis x50 открывает первый сезон: Classic-хроника, рейты x50, призовой фонд за взятие первого замка и трансляция старта.',
    rates: 'EXP x50 · Adena x30',
    favorites: 4_980,
    addedDaysAgo: 21,
    updatedDaysAgo: 1,
    launchInHours: 2.5,
    launchType: 'Открытие · Сезон 1',
    preRegistrations: 18_420,
    interestChange: 64,
    promo: 'FEATURED',
    highlights: ['Призовой фонд за первый замок', 'Трансляция старта', 'Античит на старте'],
    site: 'drakonis.gg',
    discord: 'discord.gg/drakonis',
    telegram: 't.me/drakonis',
  },
  {
    slug: 'valheria-essence',
    name: 'Valheria Essence',
    gameId: 'lineage2',
    version: 'Essence',
    modes: ['Solo', 'PvE'],
    region: 'EU',
    country: 'Германия',
    flag: '🇩🇪',
    languages: ['English', 'Русский'],
    current: 0,
    max: 2000,
    status: 'PENDING',
    change24h: 0,
    rating: 0,
    reviewsCount: 0,
    openedYearsAgo: 0,
    tags: ['Essence', 'Открытие', 'Solo'],
    summary: 'Второй сервер студии Valheria — Essence с европейским хостингом.',
    description:
      'Valheria Essence — европейская площадка команды Valheria: Essence-хроника, соло-дружелюбный прогресс, единая учётная запись с основным сервером.',
    rates: 'EXP x15 · Adena x10',
    favorites: 1_420,
    addedDaysAgo: 7,
    updatedDaysAgo: 2,
    launchInHours: 96,
    launchType: 'Открытие · Essence',
    preRegistrations: 5120,
    interestChange: 22,
    highlights: ['Общий аккаунт с Valheria x25', 'EU-хостинг', 'Соло-прогресс'],
    site: 'valheria.gg/essence',
    discord: 'discord.gg/valheria',
  },

  // ─── Rust ─────────────────────────────────────────────────────────────────
  {
    slug: 'scrapline-x5',
    name: 'Scrapline x5',
    gameId: 'rust',
    version: 'Modded',
    modes: ['x5', 'Solo / Duo'],
    region: 'EU',
    country: 'Франция',
    flag: '🇫🇷',
    languages: ['English', 'Русский'],
    current: 264,
    max: 400,
    status: 'VERIFIED',
    change24h: 16,
    rating: 4.5,
    reviewsCount: 176,
    openedYearsAgo: 2,
    tags: ['x5', 'Solo/Duo', 'Вайп по четвергам', 'Kits'],
    summary: 'Solo/Duo сервер с вайпом раз в неделю и активным античитом.',
    description:
      'Scrapline x5 — ограничение группы до двух игроков, вайп каждый четверг, повышенные рейты сбора и киты для быстрого старта.',
    favorites: 4_220,
    addedDaysAgo: 640,
    updatedDaysAgo: 2,
    lastWipeDaysAgo: 3,
    nextWipeInDays: 4,
    highlights: ['Лимит группы 2', 'Вайп по четвергам', 'Активные админы'],
    site: 'scrapline.gg',
    discord: 'discord.gg/scrapline',
    uptime24h: 99.6,
    checkedAgoSec: 29,
  },
  {
    slug: 'ironclad',
    name: 'Ironclad',
    gameId: 'rust',
    version: 'Vanilla',
    modes: ['Vanilla', 'Main'],
    region: 'RU / CIS',
    country: 'Россия',
    flag: '🇷🇺',
    languages: ['Русский'],
    current: 198,
    max: 250,
    status: 'VERIFIED',
    change24h: 3,
    rating: 4.3,
    reviewsCount: 92,
    openedYearsAgo: 3,
    tags: ['Vanilla', 'Main', 'Месячный вайп'],
    summary: 'Ванильный main с месячным циклом вайпа и стабильным ядром игроков.',
    description:
      'Ironclad — чистая ваниль без плагинов и китов. Вайп раз в месяц вместе с обновлением Facepunch, очередь на вход в вечерние часы.',
    favorites: 3_110,
    addedDaysAgo: 980,
    updatedDaysAgo: 8,
    lastWipeDaysAgo: 12,
    nextWipeInDays: 18,
    highlights: ['Чистая ваниль', 'Вайп раз в месяц', 'Очередь на вход вечером'],
    site: 'ironclad.ru',
    discord: 'discord.gg/ironclad',
    uptime24h: 99.9,
    checkedAgoSec: 44,
  },
  {
    slug: 'bunker-rust',
    name: 'Bunker Rust x2',
    gameId: 'rust',
    version: 'Modded',
    modes: ['x2', 'PvE'],
    region: 'EU',
    country: 'Нидерланды',
    flag: '🇳🇱',
    languages: ['English'],
    current: 0,
    max: 300,
    status: 'OFFLINE',
    change24h: -100,
    rating: 4.1,
    reviewsCount: 58,
    openedYearsAgo: 2,
    tags: ['x2', 'PvE', 'Вайп'],
    summary: 'Сервер на вайпе — новая карта загружается прямо сейчас.',
    description:
      'Bunker Rust x2 — PvE-ориентированный сервер с зонами без урона и еженедельным вайпом. Во время генерации карты сервер недоступен.',
    favorites: 1_640,
    addedDaysAgo: 520,
    updatedDaysAgo: 1,
    lastWipeDaysAgo: 0,
    nextWipeInDays: 7,
    highlights: ['PvE-зоны', 'Еженедельный вайп', 'Кастомные монументы'],
    site: 'bunkerrust.eu',
    discord: 'discord.gg/bunkerrust',
    note: 'Идёт вайп и генерация карты. Плановое возвращение — в течение часа.',
    uptime24h: 88.4,
    checkedAgoSec: 61,
  },
  {
    slug: 'rustpoint-x3',
    name: 'RustPoint x3',
    gameId: 'rust',
    version: 'Modded',
    modes: ['x3', 'Build'],
    region: 'RU / CIS',
    country: 'Россия',
    flag: '🇷🇺',
    languages: ['Русский'],
    current: 176,
    max: 300,
    status: 'VERIFIED',
    change24h: 33,
    rating: 4.1,
    reviewsCount: 58,
    openedYearsAgo: 1,
    tags: ['x3', 'Build', 'Рейды по расписанию'],
    summary: 'Строительный сервер x3 с рейд-окнами и защитой новичков.',
    description:
      'RustPoint x3 — рейты x3, рейды разрешены только в определённые часы, у новых игроков есть 24 часа защиты базы.',
    favorites: 1_980,
    addedDaysAgo: 180,
    updatedDaysAgo: 3,
    lastWipeDaysAgo: 5,
    nextWipeInDays: 9,
    highlights: ['Рейд-окна', 'Защита новичков 24 ч', 'Кастомные наборы'],
    site: 'rustpoint.ru',
    discord: 'discord.gg/rustpoint',
    uptime24h: 99.2,
    checkedAgoSec: 37,
  },
  {
    slug: 'dunes-x10',
    name: 'Dunes x10',
    gameId: 'rust',
    version: 'Modded',
    modes: ['x10', 'Chaos'],
    region: 'EU',
    country: 'Швеция',
    flag: '🇸🇪',
    languages: ['English', 'Русский'],
    current: 0,
    max: 500,
    status: 'PENDING',
    change24h: 0,
    rating: 0,
    reviewsCount: 0,
    openedYearsAgo: 0,
    tags: ['x10', 'Открытие', 'Chaos'],
    summary: 'Старт нового сезона x10 с кастомной пустынной картой.',
    description:
      'Dunes x10 открывает сезон на авторской пустынной карте: рейты x10, мгновенный крафт и ивенты каждые два часа.',
    favorites: 940,
    addedDaysAgo: 4,
    updatedDaysAgo: 1,
    launchInHours: 27,
    launchType: 'Открытие · Сезон 4',
    preRegistrations: 2840,
    interestChange: 31,
    highlights: ['Авторская карта', 'Мгновенный крафт', 'Ивенты каждые 2 часа'],
    site: 'dunes.gg',
    discord: 'discord.gg/dunes',
  },

  // ─── CS2 ──────────────────────────────────────────────────────────────────
  {
    slug: 'arena5',
    name: 'Arena5',
    gameId: 'cs2',
    version: 'CS2',
    modes: ['Retake', 'Arena'],
    region: 'RU / CIS',
    country: 'Россия',
    flag: '🇷🇺',
    languages: ['Русский'],
    current: 1120,
    max: 1600,
    status: 'VERIFIED',
    change24h: 8,
    rating: 4.6,
    reviewsCount: 700,
    openedYearsAgo: 2,
    tags: ['Retake', 'Arena', 'Рейтинг', '128 tick'],
    summary: 'Сеть retake-серверов с рейтингом и подбором по уровню.',
    description:
      'Arena5 — сеть из 40 retake-серверов с персональным рейтингом, подбором по уровню и статистикой каждого раунда.',
    favorites: 11_240,
    addedDaysAgo: 720,
    updatedDaysAgo: 2,
    highlights: ['40 серверов в сети', 'Подбор по рейтингу', 'Статистика раундов'],
    site: 'arena5.gg',
    discord: 'discord.gg/arena5',
    telegram: 't.me/arena5',
    uptime24h: 99.9,
    checkedAgoSec: 9,
  },
  {
    slug: 'retake-lab',
    name: 'Retake Lab',
    gameId: 'cs2',
    version: 'CS2',
    modes: ['Retake'],
    region: 'EU',
    country: 'Германия',
    flag: '🇩🇪',
    languages: ['English'],
    current: 640,
    max: 900,
    status: 'VERIFIED',
    change24h: 21,
    rating: 4.4,
    reviewsCount: 260,
    openedYearsAgo: 1,
    tags: ['Retake', 'Тренировка', 'Статистика'],
    summary: 'Тренировочные retake-площадки с разбором ошибок после матча.',
    description:
      'Retake Lab — сервера для практики: разбор раундов, тепловые карты смертей и рекомендации по позициям после каждой сессии.',
    favorites: 4_860,
    addedDaysAgo: 310,
    updatedDaysAgo: 4,
    highlights: ['Разбор раундов', 'Тепловые карты', 'Рекомендации по позициям'],
    site: 'retakelab.gg',
    discord: 'discord.gg/retakelab',
    uptime24h: 99.7,
    checkedAgoSec: 25,
  },
  {
    slug: 'dust-republic',
    name: 'Dust Republic',
    gameId: 'cs2',
    version: 'CS2',
    modes: ['Competitive', 'Classic'],
    region: 'RU / CIS',
    country: 'Россия',
    flag: '🇷🇺',
    languages: ['Русский'],
    current: 380,
    max: 640,
    status: 'OWNER_REPORTED',
    change24h: -2,
    rating: 4.0,
    reviewsCount: 130,
    openedYearsAgo: 4,
    tags: ['Classic', 'Competitive', 'Старая школа'],
    summary: 'Публичные классические сервера 5×5 с рейтингом сообщества.',
    description:
      'Dust Republic — публичные классические сервера без матчмейкинга: постоянное комьюнити, свои администраторы и ротация карт по голосованию.',
    favorites: 2_420,
    addedDaysAgo: 1240,
    updatedDaysAgo: 30,
    highlights: ['Голосование за карты', 'Постоянное комьюнити', 'Свои админы'],
    site: 'dustrepublic.ru',
    discord: 'discord.gg/dustrepublic',
    source: 'Данные сервера',
    method: ProbeMethod.OwnerSubmitted,
  },
  {
    slug: 'aimzone',
    name: 'Aimzone',
    gameId: 'cs2',
    version: 'CS2',
    modes: ['Deathmatch', 'Aim'],
    region: 'EU',
    country: 'Польша',
    flag: '🇵🇱',
    languages: ['English', 'Polski'],
    current: 210,
    max: 400,
    status: 'VERIFIED',
    change24h: 24,
    rating: 4.2,
    reviewsCount: 76,
    openedYearsAgo: 0,
    tags: ['Deathmatch', 'Aim', 'Новый'],
    summary: 'Новый deathmatch-проект с настраиваемыми режимами разминки.',
    description:
      'Aimzone — сервера для разминки: настраиваемые режимы, только пистолеты или только AWP, мгновенный респаун и счётчик точности.',
    favorites: 1_180,
    addedDaysAgo: 16,
    updatedDaysAgo: 1,
    highlights: ['Настраиваемая разминка', 'Счётчик точности', 'Мгновенный респаун'],
    site: 'aimzone.pl',
    discord: 'discord.gg/aimzone',
    uptime24h: 99.4,
    checkedAgoSec: 47,
  },

  // ─── ARK / DayZ / Valheim ─────────────────────────────────────────────────
  {
    slug: 'isla-prime',
    name: 'Isla Prime',
    gameId: 'ark',
    version: 'Ascended',
    modes: ['PvE', 'x10', 'Cluster'],
    region: 'EU',
    country: 'Нидерланды',
    flag: '🇳🇱',
    languages: ['English', 'Русский'],
    current: 148,
    max: 200,
    status: 'VERIFIED',
    change24h: 11,
    rating: 4.5,
    reviewsCount: 64,
    openedYearsAgo: 1,
    tags: ['PvE', 'x10', 'Кластер', 'Без вайпов'],
    summary: 'PvE-кластер из пяти карт с переносом персонажа и питомцев.',
    description:
      'Isla Prime — кластер из пяти карт с общим инвентарём и переносом динозавров. Рейты x10, вайпов нет, хранение построек — бессрочное.',
    rates: 'Harvest x10 · Taming x10 · XP x5',
    favorites: 2_340,
    addedDaysAgo: 340,
    updatedDaysAgo: 6,
    highlights: ['5 карт в кластере', 'Перенос персонажа', 'Без вайпов'],
    site: 'islaprime.eu',
    discord: 'discord.gg/islaprime',
    uptime24h: 99.5,
    checkedAgoSec: 53,
  },
  {
    slug: 'arkforge',
    name: 'ArkForge',
    gameId: 'ark',
    version: 'Evolved',
    modes: ['PvP', 'x25'],
    region: 'RU / CIS',
    country: 'Россия',
    flag: '🇷🇺',
    languages: ['Русский'],
    current: 96,
    max: 150,
    status: 'OWNER_REPORTED',
    change24h: 6,
    rating: 3.9,
    reviewsCount: 41,
    openedYearsAgo: 2,
    tags: ['PvP', 'x25', 'Племена'],
    summary: 'PvP-сервер с быстрым прогрессом и войнами племён.',
    description:
      'ArkForge — высокие рейты и упор на войны племён: сокращённые таймеры приручения, лимит племени 6 человек, сезон длится три месяца.',
    rates: 'Harvest x25 · Taming x25 · XP x15',
    favorites: 1_120,
    addedDaysAgo: 620,
    updatedDaysAgo: 20,
    highlights: ['Лимит племени 6', 'Сезон 3 месяца', 'Быстрое приручение'],
    site: 'arkforge.ru',
    discord: 'discord.gg/arkforge',
    source: 'Данные сервера',
    method: ProbeMethod.OwnerSubmitted,
  },
  {
    slug: 'chernarus-signal',
    name: 'Chernarus Signal',
    gameId: 'dayz',
    version: '1.26',
    modes: ['Hardcore', 'Roleplay'],
    region: 'EU',
    country: 'Чехия',
    flag: '🇨🇿',
    languages: ['English', 'Русский'],
    current: 84,
    max: 120,
    status: 'VERIFIED',
    change24h: 5,
    rating: 4.4,
    reviewsCount: 52,
    openedYearsAgo: 2,
    tags: ['Hardcore', 'RP', 'Без меток', 'Радио'],
    summary: 'Хардкорное выживание с радиосвязью и полным отключением интерфейса.',
    description:
      'Chernarus Signal — хардкор: интерфейс отключён, ориентирование по карте и компасу, внутриигровое радио и ролевые правила в зелёных зонах.',
    favorites: 1_460,
    addedDaysAgo: 540,
    updatedDaysAgo: 9,
    highlights: ['Интерфейс отключён', 'Внутриигровое радио', 'Ролевые зоны'],
    site: 'chernarussignal.eu',
    discord: 'discord.gg/chernarussignal',
    uptime24h: 99.6,
    checkedAgoSec: 31,
  },
  {
    slug: 'ashenvale',
    name: 'Ashenvale',
    gameId: 'valheim',
    version: 'Ashlands',
    modes: ['Co-op', 'PvE'],
    region: 'EU',
    country: 'Норвегия',
    flag: '🇳🇴',
    languages: ['English'],
    current: 46,
    max: 60,
    status: 'VERIFIED',
    change24h: 9,
    rating: 4.8,
    reviewsCount: 30,
    openedYearsAgo: 1,
    tags: ['Co-op', 'PvE', 'Сезоны', 'Модификации'],
    summary: 'Кооперативный мир с сезонами и аккуратным набором модификаций.',
    description:
      'Ashenvale — спокойный кооперативный сервер: сезон длится три месяца, набор модификаций подобран так, чтобы не ломать баланс, есть общий город игроков.',
    favorites: 640,
    addedDaysAgo: 260,
    updatedDaysAgo: 5,
    highlights: ['Сезоны по 3 месяца', 'Общий город игроков', 'Аккуратные моды'],
    site: 'ashenvale.no',
    discord: 'discord.gg/ashenvale',
    uptime24h: 99.8,
    checkedAgoSec: 40,
  },
]

// ─── generators ─────────────────────────────────────────────────────────────

const RANGE_SHAPE: Record<ChartRange, { points: number; perDay: number; amplitude: number }> = {
  '24h': { points: 48, perDay: 48, amplitude: 0.34 },
  '7d': { points: 56, perDay: 8, amplitude: 0.28 },
  '30d': { points: 60, perDay: 2, amplitude: 0.09 },
}

function buildSeries(seed: number, range: ChartRange, current: number, trend: number, status: OnlineStatus): number[] {
  const shape = RANGE_SHAPE[range]
  const random = rng(seed + range.length * 7919)
  const base = current > 0 ? current : 0
  const reference = current > 0 ? current : 0

  if (status === 'PENDING') return []

  const values: number[] = []
  for (let i = 0; i < shape.points; i++) {
    const progress = i / (shape.points - 1)
    const wave = Math.sin((i / shape.perDay) * Math.PI * 2 - Math.PI / 2)
    const noise = (random() - 0.5) * 0.09
    const growth = 1 + (trend / 100) * (progress - 1)
    values.push(Math.max(0.04, (1 + shape.amplitude * wave) * growth * (1 + noise)))
  }

  const tail = values[values.length - 1]
  const scale = (reference || base || 1) / tail

  const result = values.map((v) => Math.max(0, Math.round(v * scale)))

  if (status === 'OFFLINE') {
    // plateau at the last known level, then fall to zero
    const lastKnown = Math.round((result[Math.floor(result.length * 0.6)] || 120) * 1.15)
    const cut = Math.floor(result.length * 0.86)
    for (let i = 0; i < result.length; i++) {
      result[i] = i < cut ? Math.max(1, Math.round(lastKnown * (0.75 + 0.5 * rng(seed + i)()))) : 0
    }
  }

  if (status === 'ANOMALY' && range === '24h') {
    const spikeAt = Math.floor(result.length * 0.9)
    for (let i = spikeAt; i < result.length; i++) {
      result[i] = Math.round(result[i] * 1.95)
    }
  }

  return result
}

const REVIEW_AUTHORS = [
  'Дмитрий_К',
  'shadowfax',
  'Алина',
  'NoScopeIvan',
  'kraftwerk',
  'Мария П.',
  'zerocool',
  'Олег',
  'vasya_pupkin',
  'nightingale',
  'Арсений',
  'lonewolf',
  'Катя',
  'roninx',
]

const REVIEW_TEXTS: Array<{ text: string; min: number; max: number; playtime: string }> = [
  {
    text: 'Играю третий месяц. Онлайн в карточке совпадает с тем, что вижу в игре — это уже редкость. Админы отвечают в дискорде за пару минут.',
    min: 5,
    max: 5,
    playtime: '184 часа',
  },
  {
    text: 'Хороший баланс: донат есть, но он не ломает PvP. За месяц ни разу не встретил ситуацию, где решали деньги.',
    min: 4,
    max: 5,
    playtime: '96 часов',
  },
  {
    text: 'Первые два вечера было сложно разобраться, туториал слабоват. Дальше втянулся, сообщество помогает новичкам.',
    min: 4,
    max: 4,
    playtime: '41 час',
  },
  {
    text: 'Вечером на спавне бывают просадки, но в целом стабильно. За полгода сервер падал один раз.',
    min: 4,
    max: 4,
    playtime: '312 часов',
  },
  {
    text: 'Лучшее, что находил за последний год в этой игре. Контент обновляют регулярно, а не раз в полгода.',
    min: 5,
    max: 5,
    playtime: '228 часов',
  },
  {
    text: 'После последнего обновления часть механик сломалась, чинили три дня. Компенсацию выдали, претензий нет.',
    min: 3,
    max: 4,
    playtime: '150 часов',
  },
  {
    text: 'Онлайн заметно просел после вайпа, но ядро игроков осталось. Играть комфортно, очередей нет.',
    min: 3,
    max: 4,
    playtime: '78 часов',
  },
  {
    text: 'Администрация адекватная, жалобы разбирают по логам, а не по настроению. Это подкупает.',
    min: 5,
    max: 5,
    playtime: '204 часа',
  },
  {
    text: 'Не хватает англоязычного канала поддержки, всё общение на русском. В остальном придраться не к чему.',
    min: 4,
    max: 4,
    playtime: '62 часа',
  },
  {
    text: 'Зашёл по рекомендации GameScout, остался. Проверенный онлайн реально помогает выбирать — раньше тратил вечера впустую.',
    min: 5,
    max: 5,
    playtime: '119 часов',
  },
  {
    text: 'Средне. Идея интересная, реализация местами сырая, но команда явно работает над проектом.',
    min: 3,
    max: 3,
    playtime: '29 часов',
  },
  {
    text: 'Играем кланом, всё устраивает: осады по расписанию, античит ловит, экономика живая.',
    min: 5,
    max: 5,
    playtime: '390 часов',
  },
]

function buildReviews(seed: number, rating: number, count: number): Review[] {
  if (count === 0) return []
  const random = rng(seed + 104729)
  const total = Math.min(6, Math.max(3, Math.round(count / 90) + 3))
  const used = new Set<number>()
  const reviews: Review[] = []

  for (let i = 0; i < total; i++) {
    let idx = Math.floor(random() * REVIEW_TEXTS.length)
    let guard = 0
    while (used.has(idx) && guard++ < 20) idx = Math.floor(random() * REVIEW_TEXTS.length)
    used.add(idx)
    const source = REVIEW_TEXTS[idx]
    const drift = rating >= 4.5 ? 0 : rating >= 4.2 ? -0.4 : -0.9
    const value = Math.max(2, Math.min(5, Math.round(source.max + drift)))
    reviews.push({
      id: `${seed}-${i}`,
      author: REVIEW_AUTHORS[Math.floor(random() * REVIEW_AUTHORS.length)],
      hue: Math.floor(random() * 360),
      rating: value,
      date: iso(-Math.round((3 + random() * 120) * DAY)),
      playtime: source.playtime,
      text: source.text,
      helpful: Math.round(random() * 64),
      verifiedPlayer: random() > 0.35,
    })
  }
  return reviews.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
}

function buildEvents(raw: RawServer, openedAt: string): HistoryEvent[] {
  const events: HistoryEvent[] = []
  if (raw.lastWipeDaysAgo !== undefined) {
    events.push({ label: 'Последний вайп', date: iso(-raw.lastWipeDaysAgo * DAY), kind: 'wipe' })
  }
  if (raw.nextWipeInDays !== undefined) {
    events.push({ label: 'Следующий вайп', date: iso(raw.nextWipeInDays * DAY), kind: 'season' })
  }
  events.push({ label: 'Последнее обновление', date: iso(-raw.updatedDaysAgo * DAY), kind: 'update' })
  if (raw.status === 'VERIFIED') {
    events.push({ label: 'Подключён Verified Online', date: iso(-Math.min(raw.addedDaysAgo, 240) * DAY), kind: 'verify' })
  }
  events.push({ label: 'Добавлен в GameScout', date: iso(-raw.addedDaysAgo * DAY), kind: 'open' })
  if (raw.status !== 'PENDING') {
    events.push({ label: 'Открытие проекта', date: openedAt, kind: 'open' })
  }
  return events
}

function build(raw: RawServer): GameServer {
  const seed = hashSeed(raw.slug)
  const random = rng(seed)
  const openedAt = raw.launchInHours
    ? launchIso(raw.launchInHours)
    : iso(-(raw.openedYearsAgo * 365 + Math.floor(random() * 120)) * DAY)

  const history: Record<ChartRange, number[]> = {
    '24h': buildSeries(seed, '24h', raw.current, raw.change24h, raw.status),
    '7d': buildSeries(seed, '7d', raw.current, raw.change24h * 0.6, raw.status),
    '30d': buildSeries(seed, '30d', raw.current, raw.change24h * 0.3, raw.status),
  }

  const day = history['24h']
  const week = history['7d']
  const month = history['30d']

  return {
    id: raw.slug,
    slug: raw.slug,
    name: raw.name,
    gameId: raw.gameId,
    version: raw.version,
    modes: raw.modes,
    region: raw.region,
    country: raw.country,
    flag: raw.flag,
    languages: raw.languages,
    online: {
      status: raw.status,
      current: raw.current,
      max: raw.max,
      change24h: raw.change24h,
      peak24h: day.length ? Math.max(...day) : 0,
      avg7d: week.length ? Math.round(week.reduce((a, b) => a + b, 0) / week.length) : 0,
      // a 30-day peak can never be lower than the 24-hour one
      peak30d: day.length
        ? Math.max(Math.round(Math.max(...day) * 1.06), ...week, ...month)
        : 0,
      checkedAgoSec: raw.checkedAgoSec ?? 64,
      source: raw.source ?? 'GameScout Direct Query',
      method: raw.method ?? ProbeMethod.GameProtocol,
      uptime24h: raw.uptime24h ?? 0,
      checksPerDay: 1440,
      note: raw.note,
    },
    rating: raw.rating,
    reviewsCount: raw.reviewsCount,
    openedAt,
    lastWipeAt: raw.lastWipeDaysAgo !== undefined ? iso(-raw.lastWipeDaysAgo * DAY) : undefined,
    nextWipeAt: raw.nextWipeInDays !== undefined ? iso(raw.nextWipeInDays * DAY) : undefined,
    updatedAt: iso(-raw.updatedDaysAgo * DAY),
    tags: raw.tags,
    summary: raw.summary,
    description: raw.description,
    rates: raw.rates,
    hue: seed % 360,
    promo: raw.promo,
    launch: raw.launchInHours
      ? {
          at: launchIso(raw.launchInHours),
          type: raw.launchType ?? 'Открытие',
          preRegistrations: raw.preRegistrations ?? 0,
          interestChange: raw.interestChange ?? 0,
          promoted: raw.promo === 'FEATURED',
        }
      : undefined,
    addedAt: iso(-raw.addedDaysAgo * DAY),
    trendScore: raw.change24h,
    favorites: raw.favorites,
    votes: Math.round(raw.favorites * 0.18 + Math.abs(raw.change24h) * 12),
    moderation: ServerStatus.Published,
    demo: true,
    links: { site: raw.site, discord: raw.discord, telegram: raw.telegram },
    highlights: raw.highlights,
    history,
    events: buildEvents(raw, openedAt),
    reviews: buildReviews(seed, raw.rating, raw.reviewsCount),
  }
}

export const SERVERS: GameServer[] = RAW.map(build)

export const SERVERS_BY_SLUG = Object.fromEntries(SERVERS.map((s) => [s.slug, s])) as Record<string, GameServer>

export function getServer(slug: string | undefined): GameServer | undefined {
  return slug ? SERVERS_BY_SLUG[slug] : undefined
}

// ─── selectors ──────────────────────────────────────────────────────────────

const live = (s: GameServer) => s.online.status !== 'PENDING'

export const liveServers = SERVERS.filter(live)

export function highOnline(limit = 6): GameServer[] {
  return [...liveServers]
    .filter((s) => s.online.status === 'VERIFIED')
    .sort((a, b) => b.online.current - a.online.current)
    .slice(0, limit)
}

export function risingServers(limit = 5): GameServer[] {
  return [...liveServers]
    .filter((s) => s.online.status !== 'OFFLINE' && s.online.status !== 'ANOMALY' && s.trendScore > 10)
    .sort((a, b) => b.trendScore - a.trendScore)
    .slice(0, limit)
}

export function openingServers(limit = 6): GameServer[] {
  return SERVERS.filter((s) => s.launch)
    .sort((a, b) => new Date(a.launch!.at).getTime() - new Date(b.launch!.at).getTime())
    .slice(0, limit)
}

export function promotedServers(limit = 4): GameServer[] {
  const order: Record<string, number> = { top: 0, featured: 1, vip: 2 }
  return SERVERS.filter((s) => s.promo && live(s))
    .sort((a, b) => (order[a.promo!] ?? 9) - (order[b.promo!] ?? 9))
    .slice(0, limit)
}

export function recentlyAdded(limit = 4): GameServer[] {
  return [...SERVERS]
    .sort((a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime())
    .slice(0, limit)
}

export function topRated(limit = 10): GameServer[] {
  return [...liveServers]
    .filter((s) => s.reviewsCount > 30)
    .sort((a, b) => b.rating * Math.log10(b.reviewsCount + 10) - a.rating * Math.log10(a.reviewsCount + 10))
    .slice(0, limit)
}

export function similarServers(server: GameServer, limit = 3): GameServer[] {
  return liveServers
    .filter((s) => s.slug !== server.slug)
    .map((s) => {
      let score = 0
      if (s.gameId === server.gameId) score += 6
      if (s.version === server.version) score += 3
      score += s.modes.filter((m) => server.modes.includes(m)).length * 2
      if (s.region === server.region) score += 1
      if (s.online.status === 'VERIFIED') score += 1
      return { s, score }
    })
    .sort((a, b) => b.score - a.score || b.s.online.current - a.s.online.current)
    .slice(0, limit)
    .map((x) => x.s)
}

export function serversByGame(gameId: string): GameServer[] {
  return SERVERS.filter((s) => s.gameId === gameId)
}

// ─── platform level stats (demo) ────────────────────────────────────────────

export const PLATFORM_STATS = {
  servers: 12_486,
  playersOnline: 184_920,
  verifiedServers: 8_412,
  checksPerMinute: 41_600,
  games: 8,
}
