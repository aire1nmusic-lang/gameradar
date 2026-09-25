import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, Search, ShieldCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatNumber } from '@/lib/format'
import { buildSuggestions, QUICK_SEARCHES } from '@/services'
import { useAsync, useGames, usePlatformStats } from '@/hooks/data'
import { Container } from '@/components/layout/Container'
import { SuggestionList } from '@/components/search/SearchOverlay'
import { GameTile } from './GameTile'

/**
 * The first screen: one line, search, and the six worlds. A player who
 * knows their game is one click away; one who doesn't has a search box.
 */
export function Hero() {
  const { data: stats } = usePlatformStats()
  const { data: games } = useGames()
  const players = stats?.playersOnline ?? 0

  return (
    <section className="relative overflow-hidden pt-8 pb-8 sm:pt-12 lg:pt-14 lg:pb-10">
      <Container className="relative">
        <div className="mx-auto max-w-2xl text-center">
          {players > 0 && (
            <div className="mb-4 inline-flex items-center gap-2 text-[12.5px] text-ink-300">
              <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-signal-400" />
              <span className="num">{formatNumber(players)} игроков онлайн прямо сейчас</span>
              <span className="hidden text-ink-600 sm:inline">·</span>
              <Link to="/owners#verified" className="hidden items-center gap-1 text-ink-400 transition-colors hover:text-ink-100 sm:inline-flex">
                <ShieldCheck size={12} className="text-signal-400" />
                онлайн проверяем сами
              </Link>
            </div>
          )}

          <h1 className="text-[28px] leading-[1.08] font-semibold text-ink-50 sm:text-[38px] lg:text-[44px]">Найди свой сервер</h1>

          <HeroSearch />

          <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
            {QUICK_SEARCHES.map((item) => (
              <Link
                key={item.label}
                to={item.to}
                className="rounded-full border border-white/8 bg-white/[0.03] px-3 py-1 text-[12.5px] text-ink-300 transition-colors hover:border-white/18 hover:text-ink-50"
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>

        <div className="mt-8 grid grid-cols-2 gap-3 sm:gap-4 lg:mt-10 lg:grid-cols-3">
          {(games ?? []).slice(0, 6).map((game) => (
            <GameTile key={game.id} game={game} />
          ))}
        </div>
        <div className="mt-3 text-right">
          <Link to="/games" className="inline-flex items-center gap-1.5 text-[13px] text-ink-400 transition-colors hover:text-ink-50">
            Все игры <ArrowRight size={13} />
          </Link>
        </div>
      </Container>
    </section>
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
    <div ref={wrapRef} className="relative z-20 mx-auto mt-5 max-w-xl">
      <div
        className={cn(
          'group flex items-center gap-2 rounded-xl border bg-ink-900 p-1.5 pl-4 transition-colors duration-200',
          open ? 'border-white/22' : 'border-white/12',
        )}
      >
        <Search size={18} className="shrink-0 text-ink-400 transition-colors group-focus-within:text-ink-200" />
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
          placeholder="Сервер, игра или режим"
          className="h-10 min-w-0 flex-1 bg-transparent text-[15px] text-ink-50 placeholder:text-ink-500 focus:outline-none"
        />
        <button
          onClick={submit}
          className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg bg-white px-4 text-[14px] font-medium text-ink-950 transition-colors hover:bg-ink-100"
        >
          Найти
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
