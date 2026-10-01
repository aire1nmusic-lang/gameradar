/**
 * Legacy card analytics are disabled in the private-core deployment.
 * Keep call sites compatible, but do not collect referrers or transmit events.
 * Re-enabling requires a separate reviewed intake/retention/consent design.
 */
export type CardEvent = 'VIEW' | 'WEBSITE_CLICK' | 'PLAY_CLICK' | 'VOTE_CLICK' | 'CLAIM_START'

export function track(_serverId: string, _kind: CardEvent, _source?: string): void {
  // Intentionally no network or storage side effects.
}

export function visitSource(): string {
  return 'direct'
}
