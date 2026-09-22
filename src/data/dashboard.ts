import { hashSeed, rng } from '@/lib/utils'
import { SERVERS_BY_SLUG } from './servers'
import type { OwnerAlert, OwnerMetric, OwnerProject } from '@/models'
export type { OwnerAlert, OwnerMetric, OwnerProject }

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
      { label: 'Каталог GameScout', value: 46 },
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

export type { PromoProduct } from '@/models'
export { PROMO_PRODUCTS } from '@/services/promoCatalog'
