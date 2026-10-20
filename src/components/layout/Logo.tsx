import { useId } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { MARK_G, MARK_S, MARK_VIEWBOX } from './logoPaths'

const ratio = (viewBox: string) => {
  const [, , w, h] = viewBox.split(' ').map(Number)
  return w / h
}
const MARK_RATIO = ratio(MARK_VIEWBOX)

/**
 * The GS mark. Colours come from CSS variables (--gs-a* for the G, --gs-b* for
 * the S), so a theme can repaint it and `.gs-logo--live` can animate it.
 * Gradient ids are per instance: a logo hidden with display:none must not
 * take the others' gradients with it.
 */
export function GsMark({ height = 30, live = false, className }: { height?: number; live?: boolean; className?: string }) {
  const id = useId().replace(/:/g, '')
  return (
    <svg
      viewBox={MARK_VIEWBOX}
      height={height}
      width={Math.round(height * MARK_RATIO)}
      className={cn('gs-logo shrink-0', live && 'gs-logo--live', className)}
      aria-hidden
    >
      <defs>
        <linearGradient id={`${id}a`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--gs-a0, #f5f7fa)' }} />
          <stop offset="1" style={{ stopColor: 'var(--gs-a1, #8d96a3)' }} />
        </linearGradient>
        <linearGradient id={`${id}b`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--gs-b0, #6ff7ff)' }} />
          <stop offset="1" style={{ stopColor: 'var(--gs-b1, #10c3e3)' }} />
        </linearGradient>
      </defs>
      <path d={MARK_G} fill={`url(#${id}a) #f5f7fa`} />
      <path d={MARK_S} fill={`url(#${id}b) #10c3e3`} className="gs-logo__glow" />
    </svg>
  )
}

/**
 * "GameScout" set in Saira ExtraBold (112.5 % width) — the typeface closest to
 * the approved logo that stays crisp letter by letter at header size. "Game" is
 * silver, "Scout" takes the mark's accent and follows the palette animation.
 */
export function GsWordmark({ size = 20, live = false, className }: { size?: number; live?: boolean; className?: string }) {
  return (
    <span className={cn('gs-logo gs-wordmark', live && 'gs-logo--live', className)} style={{ fontSize: size }}>
      <span className="gs-wordmark__game">Game</span>
      <span className="gs-wordmark__scout">Scout</span>
    </span>
  )
}

export function Logo({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <Link to="/" className={cn('group flex items-center gap-2.5', className)} aria-label="GameScout — на главную">
      <GsMark height={30} live />
      {!compact && <GsWordmark size={20} live />}
    </Link>
  )
}
