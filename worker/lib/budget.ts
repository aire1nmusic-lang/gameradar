/**
 * Subrequest budget of one Worker invocation.
 *
 * Cloudflare caps the fetch()/connect() calls one invocation may make (50 on
 * the free plan). Past the cap every further call throws, which would turn
 * healthy servers into OFFLINE. The monitoring pass therefore reserves a
 * worst-case amount before it starts a card and simply leaves the card for the
 * next tick when the reservation does not fit.
 */
import { AdapterError } from '../adapters/network.ts'

export const BUDGET_EXHAUSTED = 'budget_exhausted'
export const BUDGET_MESSAGE = 'Subrequest budget of this invocation is exhausted'

export class SubrequestBudget {
  readonly limit: number
  used = 0
  reserved = 0

  constructor(limit: number) {
    this.limit = limit
  }

  get free(): number {
    return this.limit - this.used - this.reserved
  }

  /** Holds `amount` for one card; false when it would not fit. */
  reserve(amount: number): boolean {
    if (this.free < amount) return false
    this.reserved += amount
    return true
  }

  release(amount: number): void {
    this.reserved = Math.max(0, this.reserved - amount)
  }

  /** Counts one real subrequest; refuses past the hard limit. */
  take(): void {
    if (this.used >= this.limit) throw new AdapterError(BUDGET_EXHAUSTED, BUDGET_MESSAGE)
    this.used++
  }
}
