import { cn } from '@/lib/utils'

const SIZES = {
  xs: 'h-8 w-8 rounded-sm text-[11px]',
  sm: 'h-10 w-10 rounded-md text-[13px]',
  md: 'h-12 w-12 rounded-lg text-[15px]',
  lg: 'h-16 w-16 rounded-lg text-xl',
  xl: 'h-[88px] w-[88px] rounded-xl text-3xl',
}

export function initialsOf(name: string): string {
  const caps = name.replace(/[^A-Za-zА-Яа-я0-9 ]/g, '').match(/[A-ZА-Я0-9]/g)
  if (caps && caps.length >= 2) return caps.slice(0, 2).join('')
  const words = name.trim().split(/\s+/)
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

export function ServerLogo({
  name,
  hue,
  size = 'md',
  className,
}: {
  name: string
  hue: number
  size?: keyof typeof SIZES
  className?: string
}) {
  return (
    <div
      className={cn(
        'relative grid shrink-0 place-items-center overflow-hidden font-display font-semibold tracking-tight text-white/95',
        SIZES[size],
        className,
      )}
      style={{
        background: `linear-gradient(145deg, hsl(${hue} 62% 40%), hsl(${(hue + 42) % 360} 58% 22%))`,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.22), inset 0 0 0 1px rgba(255,255,255,0.08)',
      }}
      aria-hidden
    >
      <span
        className="absolute inset-0 opacity-30 mix-blend-overlay texture-dots"
        style={{ backgroundSize: '8px 8px' }}
      />
      <span className="relative drop-shadow-[0_1px_2px_rgba(0,0,0,0.4)]">{initialsOf(name)}</span>
    </div>
  )
}
