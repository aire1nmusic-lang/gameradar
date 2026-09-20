import type { ReactNode } from 'react'
import { AlertTriangle, Info, Loader2, ShieldCheck, SearchX } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from './Button'

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton rounded-md', className)} />
}

export function Spinner({ className, size = 16 }: { className?: string; size?: number }) {
  return <Loader2 size={size} className={cn('animate-spin text-ink-400', className)} />
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  actionTo,
  onAction,
  secondary,
  className,
}: {
  icon?: ReactNode
  title: string
  description?: string
  action?: string
  actionTo?: string
  onAction?: () => void
  secondary?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'surface flex flex-col items-center rounded-xl px-6 py-14 text-center',
        className,
      )}
    >
      <div className="relative mb-5 grid h-14 w-14 place-items-center rounded-xl border border-white/8 bg-white/[0.03] text-ink-300">
        <div className="absolute inset-0 rounded-xl texture-grid opacity-40" />
        <span className="relative">{icon ?? <SearchX size={22} />}</span>
      </div>
      <h3 className="text-[17px]">{title}</h3>
      {description && <p className="mt-2 max-w-sm text-[14px] text-ink-300">{description}</p>}
      {(action || secondary) && (
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          {action &&
            (actionTo ? (
              <Button to={actionTo} variant="primary">
                {action}
              </Button>
            ) : (
              <Button onClick={onAction} variant="primary">
                {action}
              </Button>
            ))}
          {secondary}
        </div>
      )}
    </div>
  )
}

export type NoticeTone = 'info' | 'warn' | 'danger' | 'signal'

const NOTICE_STYLES: Record<NoticeTone, { wrap: string; icon: ReactNode }> = {
  info: { wrap: 'border-white/8 bg-white/[0.03] text-ink-200', icon: <Info size={16} className="text-ink-300" /> },
  signal: {
    wrap: 'border-signal-500/22 bg-signal-500/[0.07] text-signal-200',
    icon: <ShieldCheck size={16} className="text-signal-400" />,
  },
  warn: {
    wrap: 'border-warn-500/25 bg-warn-500/[0.07] text-warn-300',
    icon: <AlertTriangle size={16} className="text-warn-400" />,
  },
  danger: {
    wrap: 'border-danger-500/25 bg-danger-500/[0.07] text-danger-300',
    icon: <AlertTriangle size={16} className="text-danger-400" />,
  },
}

export function Notice({
  tone = 'info',
  title,
  children,
  action,
  className,
}: {
  tone?: NoticeTone
  title?: string
  children?: ReactNode
  action?: ReactNode
  className?: string
}) {
  const style = NOTICE_STYLES[tone]
  return (
    <div className={cn('flex items-start gap-3 rounded-lg border px-4 py-3 text-[13px]', style.wrap, className)}>
      <span className="mt-[2px] shrink-0">{style.icon}</span>
      <div className="min-w-0 flex-1">
        {title && <div className="font-medium text-ink-50">{title}</div>}
        {children && <div className={cn('text-[13px] leading-relaxed', title && 'mt-1')}>{children}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}
