import { SERVERS_BY_SLUG } from './servers'
import type { GameServer } from '@/models'

/**
 * Advertising inventory.
 *
 * Every slot is declared here so the ad layer can later be swapped for a real
 * ad server without touching page code. Creatives in the prototype always
 * point at servers that exist in the mock dataset.
 */

export type AdSlotId = 'top-banner' | 'sidebar' | 'takeover' | 'featured' | 'inline'

export interface AdCreative {
  id: string
  slot: AdSlotId
  advertiser: string
  serverSlug?: string
  headline: string
  sub: string
  cta: string
  href: string
  /** which game world the campaign is bought for; undefined = platform-wide */
  gameId?: string
}

export const AD_INVENTORY: AdCreative[] = [
  {
    id: 'top-l2',
    slot: 'top-banner',
    advertiser: 'Drakonis x50',
    serverSlug: 'drakonis-x50',
    headline: 'Открытие Classic x50 уже сегодня',
    sub: 'Призовой фонд за первый замок · предрегистрация открыта',
    cta: 'Забрать место',
    href: '/server/drakonis-x50',
    gameId: 'lineage2',
  },
  {
    id: 'top-mc',
    slot: 'top-banner',
    advertiser: 'Craftoria',
    serverSlug: 'craftoria',
    headline: 'Скайблок нового сезона',
    sub: 'Биржа ресурсов, ивенты каждую неделю, Java + Bedrock',
    cta: 'Играть',
    href: '/server/craftoria',
    gameId: 'minecraft',
  },
  {
    id: 'top-gta',
    slot: 'top-banner',
    advertiser: 'Vertex RP',
    serverSlug: 'vertex-rp',
    headline: 'Город, где решают выборы',
    sub: 'Мэрия, бюджет и криминальные синдикаты на RageMP',
    cta: 'Войти в город',
    href: '/server/vertex-rp',
    gameId: 'gtarp',
  },
  {
    id: 'top-default',
    slot: 'top-banner',
    advertiser: 'GameScout Boost',
    headline: 'Ваш сервер может быть здесь',
    sub: 'Рекламные места в мире каждой игры — от 990 ₽',
    cta: 'Выбрать пакет',
    href: '/boost',
  },
  {
    id: 'side-l2',
    slot: 'sidebar',
    advertiser: 'Asterion',
    serverSlug: 'asterion',
    headline: 'Interlude x5',
    sub: 'Экономика без доната. Четыре года без вайпов.',
    cta: 'Смотреть сервер',
    href: '/server/asterion',
    gameId: 'lineage2',
  },
  {
    id: 'side-mc',
    slot: 'sidebar',
    advertiser: 'Voxelia',
    serverSlug: 'voxelia',
    headline: 'Ваниль без доната',
    sub: 'Карта живёт с 2018 года. Модерация 24/7.',
    cta: 'Смотреть сервер',
    href: '/server/voxelia',
    gameId: 'minecraft',
  },
  {
    id: 'side-default',
    slot: 'sidebar',
    advertiser: 'GameScout Boost',
    headline: 'Sidebar-баннер',
    sub: 'Постоянное место в мире игры на всю неделю.',
    cta: 'Забронировать',
    href: '/boost',
  },
  {
    id: 'takeover-l2',
    slot: 'takeover',
    advertiser: 'Valheria x25',
    serverSlug: 'valheria-x25',
    headline: 'Осады каждую неделю',
    sub: 'Craft-PvP на High Five с эпиками по расписанию',
    cta: 'Открыть сервер',
    href: '/server/valheria-x25',
    gameId: 'lineage2',
  },
  {
    id: 'takeover-default',
    slot: 'takeover',
    advertiser: 'GameScout Boost',
    headline: 'Брендирование мира игры',
    sub: 'Фон, баннер и featured-карточка в одном пакете',
    cta: 'Узнать подробнее',
    href: '/boost',
  },
]

export function adFor(slot: AdSlotId, gameId?: string): AdCreative | undefined {
  return (
    AD_INVENTORY.find((creative) => creative.slot === slot && creative.gameId === gameId) ??
    AD_INVENTORY.find((creative) => creative.slot === slot && !creative.gameId)
  )
}

export function adServer(creative: AdCreative | undefined): GameServer | undefined {
  return creative?.serverSlug ? SERVERS_BY_SLUG[creative.serverSlug] : undefined
}

/** Commercial inventory description used on /boost and /owners. */
export const AD_PRODUCTS = [
  {
    id: 'top-banner',
    name: 'TOP banner',
    place: 'Верх страницы игры',
    size: '1200 × 180',
    description: 'Первый экран мира игры. Один рекламодатель в ротации на игру.',
    priceLabel: 'от 12 900 ₽ / неделя',
  },
  {
    id: 'sidebar',
    name: 'Sidebar banner',
    place: 'Правая колонка каталога и рейтинга',
    size: '300 × 600',
    description: 'Видно на протяжении всей прокрутки списка серверов.',
    priceLabel: 'от 7 900 ₽ / неделя',
  },
  {
    id: 'takeover',
    name: 'Game background takeover',
    place: 'Фон мира игры',
    size: 'Фоновый слой',
    description: 'Брендирование фона страницы игры с пометкой «Реклама».',
    priceLabel: 'от 24 900 ₽ / неделя',
  },
  {
    id: 'FEATURED',
    name: 'Featured server card',
    place: 'Блок над рейтингом',
    size: 'Крупная карточка',
    description: 'Расширенная карточка с артом, описанием и кнопкой «Играть».',
    priceLabel: 'от 9 900 ₽ / неделя',
  },
  {
    id: 'premium',
    name: 'Premium badge',
    place: 'Карточка сервера',
    size: 'Значок',
    description: 'Значок Premium в списках и на странице сервера.',
    priceLabel: 'от 2 900 ₽ / месяц',
  },
] as const
