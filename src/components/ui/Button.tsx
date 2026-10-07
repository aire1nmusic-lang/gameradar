import type { ButtonHTMLAttributes, MouseEventHandler, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'outline' | 'promo' | 'subtle'
export type ButtonSize = 'sm' | 'md' | 'lg'

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-white text-ink-950 hover:bg-ink-100 active:bg-ink-200 shadow-[0_1px_0_rgba(255,255,255,0.4)_inset,0_8px_24px_-12px_rgba(255,255,255,0.35)] font-medium',
  secondary:
    'bg-ink-800 text-ink-50 border border-white/8 hover:bg-ink-750 hover:border-white/14 shadow-[0_1px_0_rgba(255,255,255,0.05)_inset]',
  ghost: 'text-ink-200 hover:text-ink-50 hover:bg-white/6',
  outline: 'border border-white/10 text-ink-100 hover:border-white/22 hover:bg-white/4',
  promo:
    'border border-promo-500/35 bg-promo-500/12 text-promo-200 hover:bg-promo-500/20 hover:border-promo-400/55',
  subtle: 'bg-white/5 text-ink-100 hover:bg-white/9',
}

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-[13px] rounded-md gap-1.5',
  md: 'h-10 px-4 text-sm rounded-md gap-2',
  lg: 'h-12 px-5 text-[15px] rounded-lg gap-2',
}

interface BaseProps {
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: ReactNode
  iconRight?: ReactNode
  full?: boolean
  className?: string
  children?: ReactNode
}

type ButtonProps = BaseProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> & {
    to?: string
    href?: string
  }

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  iconRight,
  full,
  className,
  children,
  to,
  href,
  ...rest
}: ButtonProps) {
  const classes = cn(
    'inline-flex items-center justify-center whitespace-nowrap transition-[background-color,border-color,color,transform,box-shadow] duration-200 active:scale-[0.985] disabled:opacity-45 disabled:pointer-events-none select-none',
    `gs-button gs-button-${variant}`,
    VARIANTS[variant],
    SIZES[size],
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

  if (to) {
    return (
      <Link to={to} className={classes}>
        {content}
      </Link>
    )
  }

  if (href) {
    return (
      <a href={href} className={classes} target="_blank" rel="noopener noreferrer" onClick={rest.onClick as MouseEventHandler<HTMLAnchorElement> | undefined}>
        {content}
      </a>
    )
  }

  return (
    <button type="button" className={classes} {...rest}>
      {content}
    </button>
  )
}

export function IconButton({
  className,
  label,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; className?: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex h-9 w-9 items-center justify-center rounded-md border border-white/8 bg-white/4 text-ink-300 transition-colors duration-200 hover:border-white/16 hover:bg-white/8 hover:text-ink-50',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}
