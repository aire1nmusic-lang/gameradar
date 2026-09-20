import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'

export function RadarMark({ size = 26, animated = true }: { size?: number; animated?: boolean }) {
  return (
    <span
      className="relative grid shrink-0 place-items-center overflow-hidden rounded-[9px] border border-white/10 bg-ink-900"
      style={{ width: size + 8, height: size + 8 }}
    >
      <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
        <circle cx="16" cy="16" r="11" fill="none" stroke="currentColor" strokeWidth="1.2" className="text-ink-600" />
        <circle cx="16" cy="16" r="6" fill="none" stroke="currentColor" strokeWidth="1.2" className="text-ink-700" />
        <g className={animated ? 'origin-center animate-sweep' : 'origin-center'} style={{ transformBox: 'fill-box' }}>
          <path d="M16 16 L29 11 A14 14 0 0 1 29 21 Z" fill="var(--color-signal-400)" opacity="0.5" />
        </g>
        <circle cx="16" cy="16" r="2.4" fill="var(--color-signal-400)" />
        <circle cx="23.5" cy="10.5" r="1.5" fill="var(--color-signal-300)" opacity="0.9" />
      </svg>
    </span>
  )
}

export function Logo({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <Link to="/" className={cn('group flex items-center gap-2.5', className)} aria-label="GameRadar — на главную">
      <RadarMark />
      {!compact && (
        <span className="font-display text-[17px] leading-none font-semibold tracking-[-0.02em] text-ink-50">
          Game<span className="text-ink-300 transition-colors group-hover:text-signal-300">Radar</span>
        </span>
      )}
    </Link>
  )
}
