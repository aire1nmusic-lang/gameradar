import type { OnlineData } from '@/models'

const numberFormatter = new Intl.NumberFormat('ru-RU')

/** 1284 -> "1 284" */
export function formatNumber(value: number): string {
  return numberFormatter.format(Math.round(value))
}

/**
 * The player count as text, or "—" when there is no number to stand behind:
 * nothing measured yet, or the protocol answers without a count (Lineage 2).
 */
export function formatPlayers(online: Pick<OnlineData, 'status' | 'current' | 'playersKnown' | 'freshness'>): string {
  if (online.status === 'PENDING' || online.status === 'UNKNOWN' || online.playersKnown === false) return '—'
  // An old number is not "online now".
  return online.freshness === 'stale' ? '—' : formatNumber(online.current)
}

/**
 * Slot count as text, "—" when the server never told us or when the reported
 * limit is below the current count (2b2t answers max = 1): that is not a limit.
 */
export function formatSlots(online: Pick<OnlineData, 'max' | 'maxKnown'> & { current?: number }): string {
  if (online.maxKnown === false) return '—'
  if (online.current !== undefined && online.max < online.current) return '—'
  return formatNumber(online.max)
}

/** 184920 -> "185K" ; 1 240 000 -> "1,2M" */
export function formatCompact(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace('.', ',').replace(',0', '')}M`
  if (value >= 10_000) return `${Math.round(value / 1000)}K`
  if (value >= 1000) return `${(value / 1000).toFixed(1).replace('.', ',').replace(',0', '')}K`
  return formatNumber(value)
}

export function formatPercent(value: number, withSign = true): string {
  const rounded = Math.round(Math.abs(value))
  const sign = value > 0 ? '+' : value < 0 ? '−' : ''
  return `${withSign ? sign : ''}${rounded}%`
}

export function formatSeconds(seconds: number): string {
  if (seconds < 60) return `${seconds} сек. назад`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} ${plural(minutes, ['минуту', 'минуты', 'минут'])} назад`
  const hours = Math.round(minutes / 60)
  return `${hours} ${plural(hours, ['час', 'часа', 'часов'])} назад`
}

export function plural(count: number, forms: [string, string, string]): string {
  const n = Math.abs(count) % 100
  const n1 = n % 10
  if (n > 10 && n < 20) return forms[2]
  if (n1 > 1 && n1 < 5) return forms[1]
  if (n1 === 1) return forms[0]
  return forms[2]
}

const MONTHS = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
]

export function formatDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

export function formatTime(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** "3 года" / "8 месяцев" — how long a project has been running. */
export function formatAge(iso: string, now = Date.now()): string {
  const months = Math.max(1, Math.round((now - new Date(iso).getTime()) / (1000 * 60 * 60 * 24 * 30.4)))
  if (months < 12) return `${months} ${plural(months, ['месяц', 'месяца', 'месяцев'])}`
  const years = Math.floor(months / 12)
  return `${years} ${plural(years, ['год', 'года', 'лет'])}`
}

/** "сегодня в 20:00" / "завтра в 15:00" / "через 4 дня" */
export function formatLaunch(iso: string, now = Date.now()): string {
  const target = new Date(iso)
  const today = new Date(now)
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const diffDays = Math.round((startOfDay(target) - startOfDay(today)) / 86_400_000)
  const time = formatTime(iso)
  if (diffDays === 0) return `Сегодня в ${time}`
  if (diffDays === 1) return `Завтра в ${time}`
  if (diffDays < 0) return `${formatDate(iso)}`
  if (diffDays <= 6) return `Через ${diffDays} ${plural(diffDays, ['день', 'дня', 'дней'])}, ${time}`
  return `${formatDate(iso)}, ${time}`
}

/** "через 4 ч 20 мин" — countdown copy for launch cards. */
export function formatCountdown(iso: string, now = Date.now()): string {
  const diff = new Date(iso).getTime() - now
  if (diff <= 0) return 'Уже открыт'
  const hours = Math.floor(diff / 3_600_000)
  const minutes = Math.floor((diff % 3_600_000) / 60_000)
  if (hours >= 24) {
    const days = Math.floor(hours / 24)
    return `через ${days} ${plural(days, ['день', 'дня', 'дней'])}`
  }
  if (hours === 0) return `через ${minutes} мин`
  return `через ${hours} ч ${minutes} мин`
}

export function formatRelativeDays(iso: string, now = Date.now()): string {
  // Calendar days, not 24-hour blocks: "вчера" must mean the previous date.
  const day = (time: number) => { const d = new Date(time); return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) }
  const diff = Math.round((day(now) - day(new Date(iso).getTime())) / 86_400_000)
  if (diff <= 0) return 'сегодня'
  if (diff === 1) return 'вчера'
  if (diff < 31) return `${diff} ${plural(diff, ['день', 'дня', 'дней'])} назад`
  return formatDate(iso)
}

export function formatRating(value: number): string {
  return value.toFixed(1).replace('.', ',')
}
