import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, Radar, Search, ShieldCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatNumber } from '@/lib/format'
import { buildSuggestions, QUICK_SEARCHES } from '@/services'
import { useAsync, usePlatformStats } from '@/hooks/data'
import { useCountUp } from '@/hooks/useUi'
import { Container } from '@/components/layout/Container'
import { SuggestionList } from '@/components/search/SearchOverlay'

export function Hero() {
  const { data: stats } = usePlatformStats()
  const players = useCountUp(stats?.playersOnline ?? 0, 1400)

  return (
    <section className="relative overflow-hidden pt-10 pb-12 sm:pt-16 lg:pt-20 lg:pb-16">
      <RadarField />

      <Container className="relative">
        <div className="mx-auto max-w-3xl text-center">
          <div className="mb-6 inline-flex items-center gap-2.5 rounded-full border border-white/8 bg-white/[0.035] py-1.5 pr-4 pl-2.5 text-[12.5px] text-ink-200 backdrop-blur-sm">
            <span className="flex items-center gap-1.5 rounded-full bg-signal-500/12 px-2 py-0.5 text-signal-300">
              <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-signal-400" />
              live
            </span>
            <span className="num">{formatNumber(players)} игроков на серверах прямо сейчас</span>
          </div>

          <h1 className="text-gradient text-[34px] leading-[1.06] font-semibold sm:text-[50px] lg:text-[58px]">
            Найди свой следующий игровой мир
          </h1>

          <p className="mx-auto mt-5 max-w-xl text-[15px] leading-relaxed text-ink-300 sm:text-[17px]">
            Игровые серверы, реальные данные онлайна, рейтинги и новые открытия в одном месте.
          </p>

          <HeroSearch />

          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            {QUICK_SEARCHES.map((item) => (
              <Link
                key={item.label}
                to={item.to}
                className="rounded-full border border-white/8 bg-white/[0.03] px-3 py-1.5 text-[12.5px] text-ink-300 backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-white/18 hover:text-ink-50"
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>

        <div className="mx-auto mt-12 grid max-w-3xl grid-cols-1 gap-px overflow-hidden rounded-xl border border-white/7 bg-white/6 sm:grid-cols-3">
          <TrustStat
            icon={<ShieldCheck size={15} className="text-signal-400" />}
            value={formatNumber(stats?.verifiedServers ?? 0)}
            label="серверов с проверенным онлайном"
          />
          <TrustStat
            icon={<Radar size={15} className="text-ink-300" />}
            value={formatNumber(stats?.measuredServers ?? 0)}
            label="серверов со свежим онлайном"
          />
          <TrustStat
            icon={<Search size={15} className="text-ink-300" />}
            value={formatNumber(stats?.servers ?? 0)}
            label="серверов в каталоге"
          />
        </div>
      </Container>
    </section>
  )
}

function TrustStat({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <div className="bg-ink-950/60 px-5 py-4 text-center backdrop-blur-sm sm:text-left">
      <div className="flex items-center justify-center gap-2 sm:justify-start">
        {icon}
        <span className="num text-[15px] font-medium text-ink-50">{value}</span>
      </div>
      <div className="mt-1 text-[12.5px] text-ink-400">{label}</div>
    </div>
  )
}

function HeroSearch() {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [cursor, setCursor] = useState(0)
  const navigate = useNavigate()
  const wrapRef = useRef<HTMLDivElement>(null)

  const { data: suggestions = [] } = useAsync(() => buildSuggestions(query, 6), [query], true)

  const go = (to: string) => {
    setOpen(false)
    navigate(to)
  }

  const submit = () => {
    const target = suggestions[cursor]
    if (query.trim() && target) return go(target.to)
    go(`/catalog${query.trim() ? `?q=${encodeURIComponent(query)}` : ''}`)
  }

  return (
    <div ref={wrapRef} className="relative z-20 mx-auto mt-8 max-w-2xl">
      <div
        className={cn(
          'group flex items-center gap-2 rounded-xl border bg-ink-900/85 p-2 pl-4 backdrop-blur-xl transition-all duration-300',
          open ? 'border-white/20 shadow-[0_20px_60px_-24px_rgba(0,0,0,0.9)]' : 'border-white/10',
        )}
      >
        <Search size={19} className="shrink-0 text-ink-400 transition-colors group-focus-within:text-ink-200" />
        <input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setCursor(0)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 140)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              setCursor((c) => Math.min(suggestions.length - 1, c + 1))
            }
            if (event.key === 'ArrowUp') {
              event.preventDefault()
              setCursor((c) => Math.max(0, c - 1))
            }
            if (event.key === 'Enter') submit()
            if (event.key === 'Escape') setOpen(false)
          }}
          placeholder="Найти игру, сервер или режим"
          className="h-11 min-w-0 flex-1 bg-transparent text-[15px] text-ink-50 placeholder:text-ink-500 focus:outline-none sm:text-[16px]"
        />
        <button
          onClick={submit}
          className="inline-flex h-11 shrink-0 items-center gap-2 rounded-lg bg-white px-4 text-[14px] font-medium text-ink-950 transition-colors hover:bg-ink-100 sm:px-5"
        >
          Найти
          <ArrowRight size={15} className="hidden sm:block" />
        </button>
      </div>

      {open && suggestions.length > 0 && (
        <div className="surface-raised absolute inset-x-0 top-[calc(100%+8px)] z-30 animate-pop overflow-hidden rounded-xl p-2 text-left">
          <SuggestionList items={suggestions} cursor={cursor} onHover={setCursor} onPick={go} />
        </div>
      )}
    </div>
  )
}

/** Radar rings behind the headline — the product metaphor, kept quiet. */
function RadarField() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-32 flex justify-center">
      <div className="relative h-[760px] w-[760px] opacity-[0.55] [mask-image:radial-gradient(circle_at_center,black_10%,transparent_62%)] sm:h-[980px] sm:w-[980px]">
        <svg viewBox="0 0 400 400" className="absolute inset-0 h-full w-full">
          {[60, 110, 160, 196].map((r) => (
            <circle key={r} cx="200" cy="200" r={r} fill="none" stroke="rgba(255,255,255,0.055)" strokeWidth="1" />
          ))}
          <line x1="200" y1="4" x2="200" y2="396" stroke="rgba(255,255,255,0.035)" />
          <line x1="4" y1="200" x2="396" y2="200" stroke="rgba(255,255,255,0.035)" />
          <circle cx="286" cy="148" r="2.5" fill="var(--color-signal-400)" opacity="0.7" />
          <circle cx="132" cy="252" r="2" fill="var(--color-signal-400)" opacity="0.45" />
          <circle cx="238" cy="276" r="1.8" fill="var(--color-promo-400)" opacity="0.5" />
        </svg>
        <div
          className="absolute inset-0 animate-sweep rounded-full"
          style={{
            background:
              'conic-gradient(from 0deg, transparent 0deg, transparent 300deg, color-mix(in oklab, var(--color-signal-400) 16%, transparent) 356deg, transparent 360deg)',
          }}
        />
      </div>
    </div>
  )
}
