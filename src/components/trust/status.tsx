import type { ReactNode } from 'react'
import { AlertTriangle, CalendarClock, Loader2, PowerOff, Radio, ShieldCheck, Upload } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatSeconds } from '@/lib/format'
import { OnlineStatus } from '@/models'

interface StatusMeta {
  label: string
  short: string
  icon: ReactNode
  pill: string
  text: string
  dot: string
  caption: string
}

/**
 * The trust vocabulary of the platform.
 *
 * These labels and colours are identical in every game world — a player must
 * be able to read them the same way everywhere, so themes never touch them.
 */
export const STATUS_META: Record<OnlineStatus, StatusMeta> = {
  [OnlineStatus.Verified]: {
    label: 'VERIFIED ONLINE',
    short: 'Verified',
    icon: <ShieldCheck size={12} strokeWidth={2.4} />,
    pill: 'border-signal-500/28 bg-signal-500/10',
    text: 'text-signal-300',
    dot: 'bg-signal-400',
    caption: 'Онлайн получен и проверен GameRadar',
  },
  [OnlineStatus.Live]: {
    label: 'LIVE',
    short: 'Live',
    icon: <Radio size={12} strokeWidth={2.4} />,
    pill: 'border-signal-500/18 bg-signal-500/[0.06]',
    text: 'text-signal-200/85',
    dot: 'bg-signal-300',
    caption: 'Сервер отвечает, но точный онлайн подтвердить нельзя',
  },
  [OnlineStatus.OwnerReported]: {
    label: 'REPORTED ONLINE',
    short: 'Reported',
    icon: <Upload size={12} strokeWidth={2.4} />,
    pill: 'border-white/10 bg-white/[0.04]',
    text: 'text-ink-300',
    dot: 'bg-ink-400',
    caption: 'Данные предоставлены владельцем сервера',
  },
  [OnlineStatus.Offline]: {
    label: 'OFFLINE',
    short: 'Offline',
    icon: <PowerOff size={12} strokeWidth={2.4} />,
    pill: 'border-danger-500/28 bg-danger-500/10',
    text: 'text-danger-300',
    dot: 'bg-danger-400',
    caption: 'GameRadar не получает ответ от сервера',
  },
  [OnlineStatus.Anomaly]: {
    label: 'DATA ANOMALY',
    short: 'Аномалия',
    icon: <AlertTriangle size={12} strokeWidth={2.4} />,
    pill: 'border-warn-500/28 bg-warn-500/10',
    text: 'text-warn-300',
    dot: 'bg-warn-400',
    caption: 'Обнаружены подозрительные данные',
  },
  [OnlineStatus.Pending]: {
    label: 'СКОРО ОТКРЫТИЕ',
    short: 'Скоро',
    icon: <CalendarClock size={12} strokeWidth={2.4} />,
    pill: 'border-promo-500/25 bg-promo-500/8',
    text: 'text-promo-200',
    dot: 'bg-promo-400',
    caption: 'Проверка онлайна начнётся после запуска',
  },
  [OnlineStatus.Checking]: {
    label: 'ПРОВЕРЯЕМ ОНЛАЙН',
    short: 'Проверка',
    icon: <Loader2 size={12} className="animate-spin" strokeWidth={2.4} />,
    pill: 'border-white/10 bg-white/[0.04]',
    text: 'text-ink-200',
    dot: 'bg-ink-300',
    caption: 'Выполняется запрос к серверу',
  },
}

export function LiveDot({ status, className }: { status: OnlineStatus; className?: string }) {
  const meta = STATUS_META[status]
  return (
    <span
      className={cn(
        'inline-block h-[6px] w-[6px] rounded-full',
        meta.dot,
        (status === OnlineStatus.Verified || status === OnlineStatus.Live) && 'animate-pulse-dot',
        className,
      )}
    />
  )
}

export function StatusBadge({
  status,
  size = 'md',
  withDot = true,
  className,
}: {
  status: OnlineStatus
  size?: 'sm' | 'md' | 'lg'
  withDot?: boolean
  className?: string
}) {
  const meta = STATUS_META[status]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border font-semibold uppercase tracking-[0.09em]',
        size === 'sm' ? 'px-2 py-[3px] text-[9.5px]' : size === 'lg' ? 'px-3 py-1.5 text-[11px]' : 'px-2.5 py-1 text-[10px]',
        meta.pill,
        meta.text,
        className,
      )}
      title={meta.caption}
    >
      {withDot && status === OnlineStatus.Verified ? <LiveDot status={status} /> : meta.icon}
      {meta.label}
    </span>
  )
}

/** "Проверено GameRadar 42 сек. назад" — the line that carries the whole promise. */
export function VerifiedLine({
  status,
  seconds,
  source,
  className,
  size = 'sm',
}: {
  status: OnlineStatus
  seconds: number
  source?: string
  className?: string
  size?: 'xs' | 'sm'
}) {
  const base = cn('flex items-center gap-1.5 font-mono', size === 'xs' ? 'text-[10.5px]' : 'text-[11.5px]', className)

  switch (status) {
    case OnlineStatus.Verified:
      return (
        <span className={cn(base, 'text-signal-500/90')}>
          <ShieldCheck size={12} />
          Проверено GameRadar {formatSeconds(seconds)}
        </span>
      )
    case OnlineStatus.Live:
      return (
        <span className={cn(base, 'text-signal-500/70')}>
          <Radio size={11} />
          Сервер отвечает · {formatSeconds(seconds)}
        </span>
      )
    case OnlineStatus.OwnerReported:
      return <span className={cn(base, 'text-ink-500')}>{source ?? 'Данные предоставлены сервером'}</span>
    case OnlineStatus.Offline:
      return (
        <span className={cn(base, 'text-danger-400/80')}>Последняя удачная проверка — {formatSeconds(seconds)}</span>
      )
    case OnlineStatus.Anomaly:
      return <span className={cn(base, 'text-warn-400/85')}>Данные на перепроверке GameRadar</span>
    case OnlineStatus.Checking:
      return <span className={cn(base, 'text-ink-400')}>Идёт проверка онлайна…</span>
    default:
      return <span className={cn(base, 'text-ink-500')}>Проверка начнётся после запуска</span>
  }
}
