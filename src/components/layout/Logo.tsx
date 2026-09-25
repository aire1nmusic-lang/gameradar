import { useId } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { MARK_G, MARK_S, MARK_VIEWBOX, WORD_GAME, WORD_SCOUT, WORD_VIEWBOX } from './logoPaths'

const ratio = (viewBox: string) => {
  const [, , w, h] = viewBox.split(' ').map(Number)
  return w / h
}
const MARK_RATIO = ratio(MARK_VIEWBOX)
const WORD_RATIO = ratio(WORD_VIEWBOX)

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
          <stop offset="0" style={{ stopColor: 'var(--gs-a0)' }} />
          <stop offset="1" style={{ stopColor: 'var(--gs-a1)' }} />
        </linearGradient>
        <linearGradient id={`${id}b`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--gs-b0)' }} />
          <stop offset="1" style={{ stopColor: 'var(--gs-b1)' }} />
        </linearGradient>
      </defs>
      <path d={MARK_G} fill={`url(#${id}a)`} />
      <path d={MARK_S} fill={`url(#${id}b)`} className="gs-logo__glow" />
    </svg>
  )
}

/** "GameScout" as drawn in the logo: "Game" in silver, "Scout" in the mark's accent. */
export function GsWordmark({ height = 17, live = false, className }: { height?: number; live?: boolean; className?: string }) {
  const id = useId().replace(/:/g, '')
  return (
    <svg
      viewBox={WORD_VIEWBOX}
      height={height}
      width={Math.round(height * WORD_RATIO)}
      className={cn('gs-logo shrink-0', live && 'gs-logo--live', className)}
      role="img"
      aria-label="GameScout"
    >
      <defs>
        <linearGradient id={`${id}w`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--gs-w0)' }} />
          <stop offset="1" style={{ stopColor: 'var(--gs-w1)' }} />
        </linearGradient>
        <linearGradient id={`${id}b`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--gs-b0)' }} />
          <stop offset="1" style={{ stopColor: 'var(--gs-b1)' }} />
        </linearGradient>
      </defs>
      <path d={WORD_GAME} fill={`url(#${id}w)`} />
      <path d={WORD_SCOUT} fill={`url(#${id}b)`} />
    </svg>
  )
}

export function Logo({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <Link to="/" className={cn('group flex items-center gap-2.5', className)} aria-label="GameScout — на главную">
      <GsMark height={30} live />
      {!compact && <GsWordmark height={17} live />}
    </Link>
  )
}
