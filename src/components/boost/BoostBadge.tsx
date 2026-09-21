import { Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatNumber } from '@/lib/format'
import { TIER_LABEL, tierOf } from '@/services'

/**
 * Paid-placement markers.
 *
 * These never take the active game theme: commerce is always the same violet
 * across every world, so a player can recognise paid placement instantly.
 */

export function BoostBadge({ boosts, className }: { boosts?: number; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border border-promo-400/40 bg-promo-500/15 px-2 py-[3px] text-[10px] font-semibold tracking-[0.1em] text-promo-200 uppercase backdrop-blur-sm',
        className,
      )}
      title="Платное продвижение. Не влияет на независимый рейтинг GameRadar."
    >
      <Zap size={10} fill="currentColor" />
      Boosted
      {boosts !== undefined && boosts > 0 && (
        <span className="num font-mono text-[9.5px] font-normal tracking-normal text-promo-300/80">
          {formatNumber(boosts)}
        </span>
      )}
    </span>
  )
}

export function TierBadge({ rank, className }: { rank: number; className?: string }) {
  const tier = tierOf(rank)
  if (!tier) return null
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-2 py-[3px] font-mono text-[10px] font-semibold tracking-[0.12em] uppercase',
        tier === 'top1' && 'bg-warn-500/18 text-warn-300 ring-1 ring-warn-500/35',
        tier === 'top3' && 'bg-white/10 text-ink-100 ring-1 ring-white/18',
        tier === 'top10' && 'bg-white/6 text-ink-300 ring-1 ring-white/10',
        className,
      )}
    >
      {TIER_LABEL[tier]}
    </span>
  )
}

export function PremiumBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold tracking-[0.12em] uppercase',
        'border border-warn-400/40 bg-gradient-to-r from-warn-500/20 to-promo-500/20 text-warn-300',
        className,
      )}
      title="Premium-размещение владельца сервера"
    >
      <svg width="10" height="10" viewBox="0 0 20 20" aria-hidden>
        <path d="M10 1.6l2.47 5.01 5.53.8-4 3.9.94 5.5L10 14.21l-4.94 2.6.94-5.5-4-3.9 5.53-.8L10 1.6z" fill="currentColor" />
      </svg>
      Premium
    </span>
  )
}
