import { cn } from '@/lib/utils'
import { formatNumber, formatRating, plural } from '@/lib/format'

function Star({ fill, size = 12 }: { fill: number; size?: number }) {
  const id = `star-${Math.round(fill * 100)}-${size}`
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden className="shrink-0">
      <defs>
        <linearGradient id={id}>
          <stop offset={`${fill * 100}%`} stopColor="currentColor" />
          <stop offset={`${fill * 100}%`} stopColor="currentColor" stopOpacity="0.16" />
        </linearGradient>
      </defs>
      <path
        d="M10 1.6l2.47 5.01 5.53.8-4 3.9.94 5.5L10 14.21l-4.94 2.6.94-5.5-4-3.9 5.53-.8L10 1.6z"
        fill={`url(#${id})`}
      />
    </svg>
  )
}

export function Rating({
  value,
  count,
  size = 'md',
  showCount = true,
  className,
}: {
  value: number
  count?: number
  size?: 'sm' | 'md' | 'lg'
  showCount?: boolean
  className?: string
}) {
  if (!value) {
    return <span className={cn('text-[12px] text-ink-400', className)}>Нет оценок</span>
  }
  const starSize = size === 'lg' ? 15 : size === 'sm' ? 11 : 12
  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <span className="flex items-center gap-[2px] text-warn-400">
        {[0, 1, 2, 3, 4].map((i) => (
          <Star key={i} fill={Math.max(0, Math.min(1, value - i))} size={starSize} />
        ))}
      </span>
      <span
        className={cn(
          'num font-medium text-ink-100',
          size === 'lg' ? 'text-base' : size === 'sm' ? 'text-[12px]' : 'text-[13px]',
        )}
      >
        {formatRating(value)}
      </span>
      {showCount && count !== undefined && (
        <span className={cn('text-ink-400', size === 'lg' ? 'text-[13px]' : 'text-[12px]')}>
          · {formatNumber(count)} {plural(count, ['отзыв', 'отзыва', 'отзывов'])}
        </span>
      )}
    </span>
  )
}
