import { repo } from '@/repositories'
import type { AdSlot } from '@/models'


/** Advertising use-cases. Every surface that renders these must label them. */

export function adForSlot(slot: AdSlot, gameId?: string) {
  return repo.ads.forSlot(slot, gameId)
}

export function adProducts() {
  return repo.ads.products()
}

/** Promotion products (TOP / VIP / Featured / Launch) shown to owners. */
export function promoProducts() {
  return Promise.resolve([])
}
