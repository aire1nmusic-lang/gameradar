import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { useGameTheme } from './ThemeProvider'
import { ThemeFrame } from './Decor'

/* ────────────────────────────────────────────────────────────────────────────
   Themed primitives.
   These read only CSS variables published by ThemeScope, so the same markup
   renders as a Minecraft block, a Lineage 2 carved panel or a neon GTA card.
   ──────────────────────────────────────────────────────────────────────────── */

export function ThemedCard({
  children,
  className,
  interactive = true,
  frame = true,
  to,
}: {
  children: ReactNode
  className?: string
  interactive?: boolean
  frame?: boolean
  to?: string
}) {
  const classes = cn('gt-card relative block', interactive && 'gt-card--interactive', className)
  const content = (
    <>
      {frame && <ThemeFrame />}
      {children}
    </>
  )
  return to ? (
    <Link to={to} className={classes}>
      {content}
    </Link>
  ) : (
    <div className={classes}>{content}</div>
  )
}

export function ThemedPanel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('gt-panel', className)}>{children}</div>
}

export function ThemedButton({
  children,
  to,
  href,
  onClick,
  variant = 'primary',
  size = 'md',
  className,
  icon,
  iconRight,
  full,
}: {
  children: ReactNode
  to?: string
  href?: string
  onClick?: () => void
  variant?: 'primary' | 'outline' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  className?: string
  icon?: ReactNode
  iconRight?: ReactNode
  full?: boolean
}) {
  const classes = cn(
    'gt-btn',
    variant === 'primary' && 'gt-btn--primary',
    variant === 'outline' && 'gt-btn--outline',
    variant === 'ghost' && 'gt-btn--ghost',
    size === 'sm' && 'h-8 px-3 text-[12.5px]',
    size === 'md' && 'h-10 px-4 text-[13.5px]',
    size === 'lg' && 'h-12 px-6 text-[15px]',
    full && 'w-full',
    className,
  )
  const content = (
    <>
      {icon}
      {children}
      {iconRight}
    </>
  )
  if (to) return <Link to={to} className={classes}>{content}</Link>
  if (href)
    return (
      <a href={href} target="_blank" rel="noreferrer" className={classes}>
        {content}
      </a>
    )
  return (
    <button type="button" onClick={onClick} className={classes}>
      {content}
    </button>
  )
}

export function ThemedBadge({
  children,
  className,
  icon,
}: {
  children: ReactNode
  className?: string
  icon?: ReactNode
}) {
  return (
    <span className={cn('gt-badge', className)}>
      {icon}
      {children}
    </span>
  )
}

/** Small uppercase label above a heading, styled by the world's typography. */
export function ThemedEyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('gt-eyebrow', className)}>{children}</div>
}

/**
 * Display heading.
 *
 * `size` is the desktop size; the rendered value is fluid, so a themed
 * heading never has to fight a responsive utility class (inline styles would
 * always win). `displayScale` lets an epic world (High Five) run slightly
 * larger than a technical one (CS2) without touching layout code.
 */
export function ThemedHeading({
  children,
  size = 28,
  minSize,
  as: Tag = 'h2',
  className,
}: {
  children: ReactNode
  size?: number
  /** floor used on narrow screens; defaults to a readable proportion of `size` */
  minSize?: number
  as?: 'h1' | 'h2' | 'h3'
  className?: string
}) {
  const theme = useGameTheme()
  const max = size * theme.typography.displayScale
  const min = minSize ?? Math.max(max * 0.56, Math.min(max, 20))

  return (
    <Tag
      className={cn('gt-display', className)}
      style={{ fontSize: `clamp(${min.toFixed(1)}px, ${(max / 12.5).toFixed(2)}vw, ${max.toFixed(1)}px)` }}
    >
      {children}
    </Tag>
  )
}

/** Thin ornamental divider — a hairline in most worlds, a rule in fantasy ones. */
export function ThemedDivider({ className }: { className?: string }) {
  const theme = useGameTheme()
  return (
    <div aria-hidden className={cn('flex items-center gap-2', className)}>
      <span
        className="h-px flex-1"
        style={{ background: `linear-gradient(90deg, transparent, ${theme.colors.border}, transparent)` }}
      />
      {theme.card.frame === 'carved' && (
        <svg width="10" height="10" viewBox="0 0 10 10" style={{ color: theme.colors.primary }} aria-hidden>
          <path d="M5 0 6.6 3.4 10 5 6.6 6.6 5 10 3.4 6.6 0 5l3.4-1.6Z" fill="currentColor" opacity="0.6" />
        </svg>
      )}
      <span
        className="h-px flex-1"
        style={{ background: `linear-gradient(90deg, transparent, ${theme.colors.border}, transparent)` }}
      />
    </div>
  )
}
