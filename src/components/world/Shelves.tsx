import { useRef, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Heart, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatCountdown, formatDate, formatPlayers, formatSeconds, plural } from '@/lib/format'
import { chronicleOfVersion, getGame } from '@/data/games'
import { serverArt } from '@/data/themeMedia'
import { useFavorites } from '@/hooks/useFavorites'
import type { GameServer } from '@/models'
import { WorldArtSurface } from '@/components/media/WorldArt'
import { ServerLogo } from '@/components/ui/ServerLogo'
import { TrendChip } from '@/components/ui/Badge'
import { LiveDot } from '@/components/trust/status'
import { ThemedEyebrow, ThemedHeading, useGameTheme } from '@/theme'

/** A horizontal shelf: swipe on a phone, arrows on a desktop. */
export function ShelfRail({ eyebrow, title, hint, action, children }: {
  eyebrow: ReactNode
  title: string
  hint?: string
  action?: ReactNode
  children: ReactNode
}) {
  const theme = useGameTheme()
  const rail = useRef<HTMLDivElement>(null)
  const scroll = (direction: 1 | -1) => rail.current?.scrollBy({ left: direction * Math.round((rail.current.clientWidth || 600) * 0.8), behavior: 'smooth' })
  return (
    <section className="mt-9 first:mt-6">
      <div className="mb-3.5 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <ThemedEyebrow className="mb-1.5">{eyebrow}</ThemedEyebrow>
          <ThemedHeading size={22}>{title}</ThemedHeading>
          {hint && <p className="mt-1 text-[13px]" style={{ color: theme.colors.textMuted }}>{hint}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {action}
          <span className="hidden gap-1.5 lg:flex">
            {([-1, 1] as const).map((direction) => (
              <button
                key={direction}
                type="button"
                aria-label={direction === 1 ? 'Дальше' : 'Назад'}
                onClick={() => scroll(direction)}
                className="grid h-8 w-8 place-items-center rounded-full border transition-colors hover:bg-white/10"
                style={{ borderColor: theme.colors.border, color: theme.colors.textMuted }}
              >
                {direction === 1 ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
              </button>
            ))}
          </span>
        </div>
      </div>
      <div ref={rail} className="rail -mx-5 scroll-pl-5 px-5 sm:mx-0 sm:scroll-pl-0 sm:px-0" style={{ scrollSnapType: 'x mandatory', gap: 12 }}>
        {children}
      </div>
    </section>
  )
}

const MEDAL: Record<number, { bg: string; ring: string; text: string }> = {
  1: { bg: 'linear-gradient(145deg,#ffe08a,#e0a82e 55%,#b9791a)', ring: 'rgba(255,214,102,.55)', text: '#3b2503' },
  2: { bg: 'linear-gradient(145deg,#f3f5f8,#b8c0cc 55%,#8c96a5)', ring: 'rgba(214,222,235,.5)', text: '#222a35' },
  3: { bg: 'linear-gradient(145deg,#f1c19a,#cd7f44 55%,#955224)', ring: 'rgba(222,150,96,.5)', text: '#3a1c07' },
}

export function RankMedal({ rank, className }: { rank: number; className?: string }) {
  const medal = MEDAL[rank]
  return (
    <span
      className={cn('num grid h-8 w-8 place-items-center rounded-full font-display text-[14px] font-bold', !medal && 'border border-white/20 bg-black/45 text-white/85 backdrop-blur', className)}
      style={medal ? { background: medal.bg, color: medal.text, boxShadow: `0 0 0 2px ${medal.ring}, 0 6px 14px -6px rgba(0,0,0,.8)` } : undefined}
    >
      {rank}
    </span>
  )
}

export type ShelfMetric = 'online' | 'opening' | 'support'

/** One card of a shelf: the world's art as the cover, the number that decides — big. */
export function ShelfCard({ server, rank, metric, fluid }: { server: GameServer; rank?: number; metric: ShelfMetric; fluid?: boolean }) {
  const game = getGame(server.gameId)
  const chronicle = chronicleOfVersion(server.gameId, server.version)
  const art = serverArt(server)
  const { has, toggle } = useFavorites()
  const favorite = has(server.slug)
  const { status, change24h } = server.online
  const measured = server.online.playersKnown === true && server.online.freshness === 'fresh'
  const source = status === 'VERIFIED' ? 'GameScout' : server.online.source || (server.online.sourceTier === 'OFFICIAL' ? 'сайт проекта' : 'источник проекта')
  const facts = [chronicle?.label ?? server.version, server.rates ? `x${String(server.rates).replace(/^x/i, '')}` : server.modes.slice(0, 2).join(' · ')].filter(Boolean).join(' · ')
  const support = server.support?.coins ?? 0
  return (
    <Link
      to={`/server/${server.slug}`}
      className={cn('group relative isolate flex h-[248px] shrink-0 snap-start flex-col justify-between overflow-hidden rounded-2xl border border-white/10 p-3.5 shadow-[0_18px_40px_-22px_rgba(0,0,0,.9)] transition-all duration-300 hover:-translate-y-1 hover:border-white/25', fluid ? 'w-full' : 'w-[78vw] max-w-[300px] sm:w-[272px]')}
      style={{ background: 'var(--color-ink-900)' }}
    >
      <WorldArtSurface art={art} scrim="none" sizes="300px" width={800} zoom />
      <span aria-hidden className="absolute inset-0 -z-0" style={{ background: 'linear-gradient(to top, rgba(6,8,12,.96) 0%, rgba(6,8,12,.82) 38%, rgba(6,8,12,.18) 70%, rgba(6,8,12,.35) 100%)' }} />

      <div className="relative flex items-start justify-between">
        {rank ? <RankMedal rank={rank} /> : <span />}
        <button
          type="button"
          aria-label={favorite ? 'Убрать из избранного' : 'В избранное'}
          onClick={(event) => { event.preventDefault(); event.stopPropagation(); toggle(server.slug) }}
          className={cn('grid h-8 w-8 place-items-center rounded-full border border-white/15 bg-black/40 text-white/70 backdrop-blur transition-colors hover:text-white', favorite && 'text-danger-400')}
        >
          <Heart size={14} fill={favorite ? 'currentColor' : 'none'} />
        </button>
      </div>

      <div className="relative">
        <div className="flex items-center gap-2.5">
          <ServerLogo name={server.name} hue={server.hue} gameId={server.gameId} src={server.logoUrl} size="sm" />
          <div className="min-w-0">
            <div className="truncate text-[16px] leading-tight font-semibold text-white">{server.name}</div>
            <div className="mt-0.5 truncate text-[12px] text-white/65">{[game.shortName, facts].filter(Boolean).join(' · ')}</div>
          </div>
        </div>

        <div className="mt-3 flex items-end justify-between gap-3 border-t border-white/10 pt-2.5">
          {metric === 'opening' && server.launch ? (
            <>
              <div>
                <div className="num font-display text-[21px] leading-none font-semibold whitespace-nowrap" style={{ color: 'var(--color-promo-200, #f6d77a)' }}>{formatCountdown(server.launch.at)}</div>
                <div className="mt-1 text-[11px] text-white/60">до открытия · {formatDate(server.launch.at)}</div>
              </div>
              <span className="rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[11px] text-white/85">Скоро</span>
            </>
          ) : metric === 'support' ? (
            <>
              <div>
                <div className="num font-display text-[24px] leading-none font-semibold text-white">{support > 0 ? support : server.votes}</div>
                <div className="mt-1 flex items-center gap-1 text-[11px] text-white/60">
                  <Users size={11} />
                  {support > 0 ? `${server.support?.participants ?? 0} ${plural(server.support?.participants ?? 0, ['участник', 'участника', 'участников'])}` : 'голосов игроков'}
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="min-w-0">
                <div className={cn('num font-display text-[26px] leading-none font-semibold', measured ? 'text-white' : 'text-white/55')}>
                  {measured ? formatPlayers(server.online) : 'нет данных'}
                </div>
                <div className="mt-1.5 flex min-w-0 items-center gap-1.5 text-[11px] text-white/60">
                  <LiveDot status={status} className="shrink-0" />
                  <span className="truncate">{measured ? `онлайн · ${source} · ${formatSeconds(server.online.observedAgoSec ?? server.online.checkedAgoSec)}` : 'онлайн не указан'}</span>
                </div>
              </div>
              {measured && server.online.checksPerDay > 0 && Math.abs(change24h) >= 1 && <TrendChip value={change24h} />}
            </>
          )}
        </div>
      </div>
    </Link>
  )
}

/** Shown instead of a shelf that has nothing real to put on it yet — never invented numbers. */
export function ShelfNote({ title, text }: { title: string; text: string }) {
  const theme = useGameTheme()
  return (
    <div className="flex min-h-[110px] w-full flex-col justify-center rounded-2xl border border-dashed px-5 py-4" style={{ borderColor: theme.colors.border }}>
      <div className="text-[15px] font-medium" style={{ color: theme.colors.text }}>{title}</div>
      <p className="mt-1 max-w-xl text-[13px]" style={{ color: theme.colors.textMuted }}>{text}</p>
    </div>
  )
}

/** The last card of a shelf: where the rest of the list is. */
export function ShelfMore({ count, label, href }: { count: number; label: string; href: string }) {
  const theme = useGameTheme()
  return (
    <a
      href={href}
      className="group flex h-[248px] w-[150px] shrink-0 snap-start flex-col items-center justify-center gap-2 rounded-2xl border border-dashed px-4 text-center transition-colors hover:bg-white/5"
      style={{ borderColor: theme.colors.border, color: theme.colors.textMuted }}
    >
      <span className="num font-display text-[28px] font-semibold" style={{ color: theme.colors.text }}>+{count}</span>
      <span className="text-[12.5px] leading-snug">{label}</span>
      <ChevronRight size={18} className="transition-transform group-hover:translate-x-0.5" />
    </a>
  )
}
