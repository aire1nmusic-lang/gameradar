import { hashSeed, rng } from '@/lib/utils'
import { SERVERS_BY_SLUG } from './servers'
import type { GameServer } from './types'

export interface OwnerMetric {
  key: string
  label: string
  value: number
  change: number
  format: 'number' | 'percent'
  hint: string
}

export interface OwnerProject {
  server: GameServer
  metrics: OwnerMetric[]
  views: number[]
  clicks: number[]
  rankPosition: number
  rankTotal: number
  rankChange: number
  sources: Array<{ label: string; value: number }>
  countries: Array<{ label: string; flag: string; value: number }>
}

function seriesFor(slug: string, base: number, trend: number, points = 30): number[] {
  const random = rng(hashSeed(slug))
  const out: number[] = []
  for (let i = 0; i < points; i++) {
    const progress = i / (points - 1)
    const week = Math.sin((i / 7) * Math.PI * 2) * 0.16
    const noise = (random() - 0.5) * 0.18
    out.push(Math.max(1, Math.round(base * (1 + trend * progress) * (1 + week + noise))))
  }
  return out
}

function project(
  slug: string,
  opts: {
    views: number
    clicks: number
    favorites: number
    rankPosition: number
    rankTotal: number
    rankChange: number
    viewsChange: number
    clicksChange: number
    favoritesChange: number
  },
): OwnerProject {
  const server = SERVERS_BY_SLUG[slug]
  const ctr = (opts.clicks / opts.views) * 100
  return {
    server,
    metrics: [
      {
        key: 'views',
        label: 'Просмотры карточки',
        value: opts.views,
        change: opts.viewsChange,
        format: 'number',
        hint: 'Сколько раз игроки открывали вашу карточку за 30 дней',
      },
      {
        key: 'clicks',
        label: 'Переходы на сервер',
        value: opts.clicks,
        change: opts.clicksChange,
        format: 'number',
        hint: 'Клики по кнопке «Играть», сайту и Discord',
      },
      {
        key: 'ctr',
        label: 'CTR',
        value: Number(ctr.toFixed(1)),
        change: Math.round((opts.clicksChange - opts.viewsChange) * 10) / 10,
        format: 'percent',
        hint: 'Доля просмотров, которые превратились в переход',
      },
      {
        key: 'favorites',
        label: 'В избранном',
        value: opts.favorites,
        change: opts.favoritesChange,
        format: 'number',
        hint: 'Игроки, добавившие сервер в избранное',
      },
    ],
    views: seriesFor(slug + 'views', opts.views / 30 / 1.4, 0.55),
    clicks: seriesFor(slug + 'clicks', opts.clicks / 30 / 1.4, 0.48),
    rankPosition: opts.rankPosition,
    rankTotal: opts.rankTotal,
    rankChange: opts.rankChange,
    sources: [
      { label: 'Каталог GameRadar', value: 46 },
      { label: 'Главная страница', value: 24 },
      { label: 'Поиск по сайту', value: 18 },
      { label: 'Похожие серверы', value: 12 },
    ],
    countries: [
      { label: 'Россия', flag: '🇷🇺', value: 41 },
      { label: 'Германия', flag: '🇩🇪', value: 17 },
      { label: 'Украина', flag: '🇺🇦', value: 14 },
      { label: 'Казахстан', flag: '🇰🇿', value: 11 },
      { label: 'Прочие', flag: '🌍', value: 17 },
    ],
  }
}

export const OWNER_PROJECTS: OwnerProject[] = [
  project('holysky', {
    views: 184_240,
    clicks: 32_410,
    favorites: 12_480,
    rankPosition: 17,
    rankTotal: 4812,
    rankChange: 4,
    viewsChange: 12.4,
    clicksChange: 18.2,
    favoritesChange: 6.1,
  }),
  project('frostpeak', {
    views: 42_180,
    clicks: 9_640,
    favorites: 1_180,
    rankPosition: 62,
    rankTotal: 4812,
    rankChange: 21,
    viewsChange: 148,
    clicksChange: 176,
    favoritesChange: 94,
  }),
]

export interface OwnerAlert {
  id: string
  kind: 'ok' | 'info' | 'warn'
  title: string
  body: string
  at: string
}

export const OWNER_ALERTS: OwnerAlert[] = [
  {
    id: 'a1',
    kind: 'ok',
    title: 'Verified Online активен',
    body: 'Прямой запрос к 185.42.x.x:25565 выполняется каждые 60 секунд. Успешных проверок за сутки — 99,8%.',
    at: 'сегодня, 14:32',
  },
  {
    id: 'a2',
    kind: 'info',
    title: 'Рост переходов +18%',
    body: 'Основной источник — блок «Сейчас высокий онлайн» на главной странице.',
    at: 'вчера, 09:10',
  },
  {
    id: 'a3',
    kind: 'warn',
    title: 'Описание давно не обновлялось',
    body: 'Последнее изменение — 62 дня назад. Карточки с актуальным описанием получают в среднем на 12% больше переходов.',
    at: '3 дня назад',
  },
]

export interface PromoProduct {
  id: string
  name: string
  tag: string
  description: string
  bullets: string[]
  priceLabel: string
  accent: 'top' | 'vip' | 'featured' | 'banner' | 'launch'
}

export const PROMO_PRODUCTS: PromoProduct[] = [
  {
    id: 'top',
    name: 'TOP',
    tag: 'Позиция в каталоге',
    description: 'Ваш сервер занимает верхнюю позицию в выдаче по выбранной игре.',
    bullets: ['Закреплённое место в каталоге', 'Метка «Продвижение»', 'До 5 позиций на игру'],
    priceLabel: 'от 4 900 ₽ / неделя',
    accent: 'top',
  },
  {
    id: 'vip',
    name: 'VIP',
    tag: 'Выделенная карточка',
    description: 'Карточка получает акцентную рамку и увеличенный формат в списках.',
    bullets: ['Акцентное оформление', 'Увеличенный формат', 'Логотип большего размера'],
    priceLabel: 'от 2 900 ₽ / неделя',
    accent: 'vip',
  },
  {
    id: 'featured',
    name: 'Featured',
    tag: 'Главная страница',
    description: 'Размещение в подборке на главной странице GameRadar.',
    bullets: ['Блок на главной', 'Ротация каждые 15 минут', 'Отдельная статистика'],
    priceLabel: 'от 7 900 ₽ / неделя',
    accent: 'featured',
  },
  {
    id: 'banner',
    name: 'Banner',
    tag: 'Рекламные блоки',
    description: 'Баннерные места в каталоге и на страницах игр — всегда с пометкой «Реклама».',
    bullets: ['Каталог и страницы игр', 'Не более 1 блока на экран', 'Отчёт по показам и кликам'],
    priceLabel: 'от 5 900 ₽ / неделя',
    accent: 'banner',
  },
  {
    id: 'launch',
    name: 'Launch Promotion',
    tag: 'Перед открытием',
    description: 'Продвижение сервера до старта: предрегистрации и напоминание игрокам.',
    bullets: ['Блок «Открываются сегодня»', 'Push-напоминание игрокам', 'Счётчик предрегистраций'],
    priceLabel: 'от 9 900 ₽ / запуск',
    accent: 'launch',
  },
]
