import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ChevronDown, Palette } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatCompact, formatNumber, plural } from '@/lib/format'
import { GAMES } from '@/data/games'
import { useWorldNavigation } from '@/hooks/useWorldNavigation'

/**
 * Worlds menu. Lists every themed game world and its chronicles, which is how
 * players actually navigate the platform once games have their own identity.
 */
export function GamesMenu() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const location = useLocation()
  const {game:current}=useWorldNavigation()

  useEffect(() => setOpen(false), [location.pathname,location.search])

  useEffect(() => {
    if (!open) return
    const onClick = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false)
    window.addEventListener('mousedown', onClick)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onClick)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const active = GAMES.some((game) => location.pathname === `/${game.slug}` || location.pathname.startsWith(`/${game.slug}/`))

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label={current?`Сменить мир: ${current.shortName}`:'Выбрать мир'}
        className={cn(
          'flex min-h-11 items-center gap-1 rounded-md px-3 py-2 text-[13.5px] transition-colors duration-200',
          active || open ? 'text-ink-50' : 'text-ink-300 hover:text-ink-50',
        )}
      >
        <span className="max-w-24 truncate sm:max-w-none">{current?current.shortName:'Миры'}</span>
        <ChevronDown size={13} className={cn('transition-transform duration-200', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="surface-raised absolute top-[calc(100%+10px)] left-0 z-50 max-h-[70svh] w-[min(400px,calc(100vw-100px))] animate-pop overflow-y-auto rounded-2xl p-3">
          <p className="px-2 pb-2 text-xs text-ink-400">Сменить мир</p>
          <div className="grid gap-1">
            {GAMES.filter(g=>['lineage2','minecraft','gtarp'].includes(g.id)).map((game) => (
              <div key={game.id} className="rounded-lg p-2 transition-colors hover:bg-white/5">
                <Link to={`/${game.slug}`} className="flex items-center gap-2.5">
                  <span
                    className="h-8 w-1.5 shrink-0 rounded-full"
                    style={{ background: `linear-gradient(${game.from}, ${game.to})` }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-medium text-ink-50">{game.shortName}</span>
                    <span className="num block text-[11.5px] text-ink-400">
                      {game.playersOnline > 0
                        ? `${formatCompact(game.playersOnline)} онлайн`
                        : `${formatNumber(game.serversCount)} ${plural(game.serversCount, ['сервер', 'сервера', 'серверов'])}`}
                    </span>
                  </span>
                </Link>

                {game.chronicles.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1 pl-4">
                    {game.chronicles.map((chronicle) => (
                      <Link
                        key={chronicle.id}
                        to={`/${game.slug}/${chronicle.slug}`}
                        className="inline-flex items-center gap-1 rounded border border-white/7 px-1.5 py-0.5 text-[11px] text-ink-400 transition-colors hover:border-white/18 hover:text-ink-100"
                      >
                        {chronicle.label}
                        {chronicle.themeId && <Palette size={9} className="opacity-70" />}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          <Link
            to="/"
            className="mt-2 flex items-center justify-between rounded-lg border border-white/7 px-3 py-2.5 text-[13px] text-ink-300 transition-colors hover:border-white/16 hover:text-ink-50"
          >
            Вернуться в зал миров
            <span className="font-mono text-[10.5px] text-ink-500">{GAMES.length}</span>
          </Link>
        </div>
      )}
    </div>
  )
}
