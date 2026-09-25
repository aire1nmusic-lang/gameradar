import { useState } from 'react'
import { cn, hashSeed } from '@/lib/utils'
import { initialsOf } from './ServerLogo'

const SIZES = {
  xs: 'h-6 w-6 text-[10px]',
  sm: 'h-8 w-8 text-[12px]',
  md: 'h-10 w-10 text-[14px]',
  lg: 'h-14 w-14 text-[18px]',
}

/** A person's picture from their provider, or initials on a colour seeded by their id. */
export function Avatar({
  name,
  seed,
  src,
  size = 'md',
  className,
}: {
  name: string
  /** stable id that picks the fallback colour */
  seed: string
  src?: string
  size?: keyof typeof SIZES
  className?: string
}) {
  const [failed, setFailed] = useState(false)
  const hue = hashSeed(seed || name) % 360
  const showImage = !!src && !failed
  return (
    <span
      aria-hidden
      className={cn(
        'relative grid shrink-0 place-items-center overflow-hidden rounded-full font-display font-semibold text-white/95',
        SIZES[size],
        className,
      )}
      style={{
        background: showImage ? 'var(--color-ink-800)' : `linear-gradient(145deg, hsl(${hue} 55% 42%), hsl(${(hue + 40) % 360} 55% 24%))`,
        boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.1)',
      }}
    >
      {showImage ? (
        <img src={src} alt="" referrerPolicy="no-referrer" onError={() => setFailed(true)} className="h-full w-full object-cover" />
      ) : (
        initialsOf(name || '?')
      )}
    </span>
  )
}
