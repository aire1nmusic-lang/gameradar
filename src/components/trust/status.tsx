import type { ReactNode } from 'react'
import { AlertTriangle, CalendarClock, CircleHelp, Globe, Loader2, PowerOff, Radio, ShieldCheck, Upload } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatSeconds } from '@/lib/format'
import { OnlineStatus, type OnlineData } from '@/models'

/** Public feature switch: enable only when an operational online verifier exists. */
export const ONLINE_VERIFICATION_AVAILABLE = false

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
    label: 'Проверено GameScout',
    short: 'Verified',
    icon: <ShieldCheck size={12} strokeWidth={2.4} />,
    pill: 'border-signal-500/28 bg-signal-500/10',
    text: 'text-signal-300',
    dot: 'bg-signal-400',
    caption: 'Онлайн получен и проверен GameScout',
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
    label: 'По данным владельца',
    short: 'От владельца',
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
    caption: 'GameScout не получает ответ от сервера',
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
  [OnlineStatus.External]: {
    label: 'Внешний мониторинг',
    short: 'Внешний',
    icon: <Globe size={12} strokeWidth={2.4} />,
    pill: 'border-white/10 bg-white/[0.04]',
    text: 'text-ink-200',
    dot: 'bg-ink-300',
    caption: 'Онлайн по данным стороннего мониторинга — GameScout его не проверял',
  },
  [OnlineStatus.Unknown]: {
    label: 'ОНЛАЙН НЕИЗВЕСТЕН',
    short: 'Неизвестно',
    icon: <CircleHelp size={12} strokeWidth={2.4} />,
    pill: 'border-white/10 bg-white/[0.03]',
    text: 'text-ink-400',
    dot: 'bg-ink-500',
    caption: 'Достоверные данные об онлайне пока недоступны',
  },
}

/** A stale number never wears the live colour: the dot turns amber and stops pulsing. */
export function LiveDot({ status, stale, className }: { status: OnlineStatus; stale?: boolean; className?: string }) {
  const meta = STATUS_META[status]
  return (
    <span
      className={cn(
        'inline-block h-[6px] w-[6px] rounded-full',
        stale ? 'bg-warn-400/80' : meta.dot,
        !stale && (status === OnlineStatus.Verified || status === OnlineStatus.Live) && 'animate-pulse-dot',
        className,
      )}
    />
  )
}

/**
 * PENDING covers two different situations, and a player must be able to tell
 * them apart: a card that announced an opening date, and a card whose online
 * simply has not been measured yet. Only the first one is "opens soon".
 */
function pendingCopy(launching: boolean | undefined): { label: string; caption: string } | undefined {
  if (launching !== false) return undefined
  return { label: 'ОНЛАЙН НЕ ИЗМЕРЯЛСЯ', caption: 'GameScout ещё не выполнял проверку этого сервера' }
}

export function StatusBadge({
  status,
  size = 'md',
  withDot = true,
  launching,
  className,
}: {
  status: OnlineStatus
  size?: 'sm' | 'md' | 'lg'
  withDot?: boolean
  /** false when the card has no announced opening date */
  launching?: boolean
  className?: string
}) {
  const displayStatus = !ONLINE_VERIFICATION_AVAILABLE && [OnlineStatus.Verified,OnlineStatus.Live,OnlineStatus.Checking].includes(status) ? OnlineStatus.Unknown : status
  const meta = STATUS_META[displayStatus]
  const pending = displayStatus === OnlineStatus.Pending ? pendingCopy(launching) : undefined
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border font-semibold uppercase tracking-[0.09em]',
        size === 'sm' ? 'px-2 py-[3px] text-[9.5px]' : size === 'lg' ? 'px-3 py-1.5 text-[11px]' : 'px-2.5 py-1 text-[10px]',
        meta.pill,
        meta.text,
        className,
      )}
      title={pending?.caption ?? meta.caption}
    >
      {withDot && displayStatus === OnlineStatus.Verified ? <LiveDot status={displayStatus} /> : meta.icon}
      {pending?.label ?? meta.label}
    </span>
  )
}

/**
 * "Проверено GameScout 42 сек. назад" — the line that carries the whole promise.
 *
 * Pass `online` to get the full story: whose number it is and how old it is.
 * A number from a project or a monitor always names its source; a stale one
 * says so instead of passing for current.
 */
export function VerifiedLine({
  online,
  status: statusProp,
  seconds: secondsProp,
  source: sourceProp,
  launching,
  className,
  size = 'sm',
}: {
  online?: OnlineData
  status?: OnlineStatus
  seconds?: number
  /** false when the card has no announced opening date */
  launching?: boolean
  source?: string
  className?: string
  size?: 'xs' | 'sm'
}) {
  const status = online?.status ?? statusProp ?? OnlineStatus.Pending
  if (!ONLINE_VERIFICATION_AVAILABLE && [OnlineStatus.Verified,OnlineStatus.Live,OnlineStatus.Checking].includes(status)) return null
  const seconds = online ? (online.observedAgoSec ?? online.checkedAgoSec) : (secondsProp ?? 0)
  const source = online?.source ?? sourceProp
  const base = cn('flex items-center gap-1.5 font-mono', size === 'xs' ? 'text-[10.5px]' : 'text-[11.5px]', className)

  if (online?.freshness === 'stale' && status !== OnlineStatus.Offline) {
    return <span className={cn(base, 'text-warn-400/85')}>Данные устарели · обновлено {formatSeconds(seconds)}</span>
  }

  switch (status) {
    case OnlineStatus.Verified:
      return (
        <span className={cn(base, 'text-signal-500/90')}>
          <ShieldCheck size={12} />
          Проверено GameScout {formatSeconds(seconds)}
        </span>
      )
    case OnlineStatus.Live:
      return (
        <span className={cn(base, 'text-signal-500/70')}>
          <Radio size={11} />
          Сервер отвечает · {formatSeconds(seconds)}
        </span>
      )
    case OnlineStatus.External:
      return (
        <span className={cn(base, 'text-ink-400')} title={online?.sourceUrl}>
          По данным {source} · обновлено {formatSeconds(seconds)}
        </span>
      )
    case OnlineStatus.OwnerReported:
      return online?.sourceTier === 'OFFICIAL' ? (
        <span className={cn(base, 'text-ink-400')} title={online.sourceUrl}>
          По данным сайта проекта · обновлено {formatSeconds(seconds)}
        </span>
      ) : (
        <span className={cn(base, 'text-ink-500')}>{source ?? 'Данные предоставлены сервером'}</span>
      )
    case OnlineStatus.Offline:
      return (
        <span className={cn(base, 'text-danger-400/80')}>
          {online?.sourceTier && online.sourceTier !== 'DIRECT' ? `По данным ${source} сервер не отвечает` : `Последняя удачная проверка — ${formatSeconds(seconds)}`}
        </span>
      )
    case OnlineStatus.Anomaly:
      return <span className={cn(base, 'text-warn-400/85')}>Данные на перепроверке GameScout</span>
    case OnlineStatus.Checking:
      return <span className={cn(base, 'text-ink-400')}>Идёт проверка онлайна…</span>
    case OnlineStatus.Unknown:
      return online?.source === 'Нет источника' ? (
        <span className={cn(base, 'text-ink-500')}>Источник онлайна не подключён</span>
      ) : (
        <span className={cn(base, 'text-ink-500')}>Источники онлайна не ответили · {formatSeconds(seconds)}</span>
      )
    default:
      return (
        <span className={cn(base, 'text-ink-500')}>
          {launching === false ? 'Онлайн ещё не измерялся' : 'Проверка начнётся после запуска'}
        </span>
      )
  }
}
