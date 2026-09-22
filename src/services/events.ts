/**
 * Card analytics from the browser: what a player actually did.
 *
 * Fire-and-forget — a lost event must never break a click. The backend
 * dedupes per visitor, so calling this on every render of a page is harmless,
 * but pages still send VIEW once per mount.
 */
export type CardEvent = 'VIEW' | 'WEBSITE_CLICK' | 'PLAY_CLICK' | 'VOTE_CLICK' | 'CLAIM_START'

export function track(serverId: string, kind: CardEvent, source?: string) {
  if (import.meta.env.DEV && import.meta.env.VITE_DATA_SOURCE === 'mock') return
  try {
    void fetch('/api/v1/events', {
      method: 'POST',
      credentials: 'same-origin',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ serverId, kind, ...(source ? { source: source.slice(0, 40) } : {}) }),
    }).catch(() => {})
  } catch {
    // analytics is best-effort
  }
}

/** Where a visit came from, in a few coarse buckets (never a full URL). */
export function visitSource(): string {
  const params = new URLSearchParams(window.location.search)
  const utm = params.get('utm_source')
  if (utm) return utm.replace(/[^\w.-]/g, '').slice(0, 40) || 'utm'
  try {
    const ref = document.referrer ? new URL(document.referrer) : undefined
    if (!ref) return 'direct'
    if (ref.host === window.location.host) return 'gamescout'
    if (/google\.|yandex\.|bing\.|duckduckgo\./.test(ref.hostname)) return 'search'
    return ref.hostname.replace(/^www\./, '').slice(0, 40)
  } catch {
    return 'direct'
  }
}
