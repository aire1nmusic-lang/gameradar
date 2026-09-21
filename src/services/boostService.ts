import { repo } from '@/repositories'

/** Commercial use-cases. Pricing lives in the repository, rules live here. */

export function boostPackages() {
  return repo.boosts.packages()
}

export function boostForecast(slug: string, extraBoosts: number, gameId?: string) {
  return repo.boosts.forecast(slug, extraBoosts, gameId)
}

export function activeBoostsFor(serverId: string) {
  return repo.boosts.activeFor(serverId)
}

export function createBoostOrder(serverId: string, packageId: string, ownerId: string) {
  return repo.boosts.createOrder({ serverId, packageId, ownerId })
}

/** What a purchase can never buy — rendered verbatim on /boost. */
export const NOT_FOR_SALE = [
  'Статус VERIFIED ONLINE — только по результатам проверки',
  'Позиция в независимом рейтинге',
  'Значения онлайна и история графика',
  'Отзывы и оценки игроков',
]
