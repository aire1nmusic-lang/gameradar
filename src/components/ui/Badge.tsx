import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import type { PromoKind } from '@/models'

export type BadgeTone = 'neutral' | 'signal' | 'promo' | 'warn' | 'danger' | 'outline'

const TONES: Record<BadgeTone, string> = {
  neutral: 'bg-white/6 text-ink-200 border-white/8',
  signal: 'bg-signal-500/12 text-signal-300 border-signal-500/25',
  promo: 'bg-promo-500/12 text-promo-200 border-promo-500/28',
  warn: 'bg-warn-500/12 text-warn-300 border-warn-500/25',
  danger: 'bg-danger-500/12 text-danger-300 border-danger-500/25',
  outline: 'bg-transparent text-ink-300 border-white/10',
}

export function Badge({
  tone = 'neutral',
  children,
  icon,
  className,
  uppercase,
}: {
  tone?: BadgeTone
  children: ReactNode
  icon?: ReactNode
  className?: string
  uppercase?: boolean
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-[3px] text-[11px] leading-5 font-medium',
        uppercase && 'uppercase tracking-[0.08em] text-[10px]',
        TONES[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  )
}

/** Small descriptive tag used on server cards (modes, features). */
export function Tag({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-sm border border-white/7 bg-white/[0.035] px-2 py-1 text-[11.5px] leading-none text-ink-300',
        className,
      )}
    >
      {children}
    </span>
  )
}

export function PromoLabel({ kind, className }: { kind: PromoKind; className?: string }) {
  const label = kind
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border border-promo-500/30 bg-promo-500/10 px-2 py-[3px] text-[10px] font-semibold uppercase tracking-[0.1em] text-promo-200',
        className,
      )}
      title="Платное размещение. Не влияет на независимый рейтинг GameRadar."
    >
      <span className="h-1 w-1 rounded-full bg-promo-400" />
      {label}
      <span className="font-normal tracking-normal text-promo-300/70 normal-case">Продвижение</span>
    </span>
  )
}

export function TrendChip({ value, className }: { value: number; className?: string }) {
  if (value === 0) {
    return <span className={cn('text-[12px] text-ink-400', className)}>без изменений</span>
  }
  const up = value > 0
  return (
    <span
      className={cn(
        'num inline-flex items-center gap-0.5 rounded-sm px-1.5 py-0.5 text-[12px] font-medium',
        up ? 'bg-signal-500/10 text-signal-300' : 'bg-danger-500/10 text-danger-300',
        className,
      )}
    >
      <svg width="9" height="9" viewBox="0 0 10 10" aria-hidden className={up ? '' : 'rotate-180'}>
        <path d="M5 1.2 9 8.4H1L5 1.2Z" fill="currentColor" />
      </svg>
      {Math.abs(Math.round(value))}%
    </span>
  )
}
