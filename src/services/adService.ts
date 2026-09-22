import { repo } from '@/repositories'
import type { AdSlot, PromoProduct } from '@/models'
import { PROMO_PRODUCTS } from './promoCatalog'


/** Advertising use-cases. Every surface that renders these must label them. */

export function adForSlot(slot: AdSlot, gameId?: string) {
  return repo.ads.forSlot(slot, gameId)
}

export function adProducts() {
  return repo.ads.products()
}

/**
 * Promotion products (TOP / VIP / Featured / Banner / Launch) shown to owners.
 *
 * Async on purpose: the price list moves behind the API once billing exists,
 * and no caller has to change when it does.
 */
export function promoProducts(): Promise<PromoProduct[]> {
  return Promise.resolve(PROMO_PRODUCTS)
}
