import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, CornerDownLeft, Gamepad2, Search, Server, SlidersHorizontal, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { buildSuggestions, QUICK_SEARCHES, type Suggestion } from '@/services'
import { useAsync } from '@/hooks/data'
import { useLockBodyScroll } from '@/hooks/useUi'
import { useWorldNavigation } from '@/hooks/useWorldNavigation'

const ICONS = {
  game: <Gamepad2 size={15} />,
  server: <Server size={15} />,
  mode: <SlidersHorizontal size={15} />,
}

export function SearchOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const {game,scoped}=useWorldNavigation()
  const [query, setQuery] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [cursor, setCursor] = useState(-1)
  const surfaceRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()
  useLockBodyScroll(open)

  // Do not load suggestions while the overlay is closed or on every keystroke.
  useEffect(() => {
    if (!open) return
    const timer = window.setTimeout(() => setSearchQuery(query), 180)
    return () => window.clearTimeout(timer)
  }, [open, query])
  const { data, loading, error } = useAsync(
    () => open ? buildSuggestions(searchQuery, 7, game?.id) : Promise.resolve([]),
    [open, searchQuery, game?.id],
    false,
  )
  const pending = loading || query !== searchQuery
  const suggestions = pending ? [] : data ?? []

  useEffect(() => {
    if (open) {
      setQuery('')
      setSearchQuery('')
      setCursor(-1)
      const timer = window.setTimeout(() => inputRef.current?.focus(), 40)
      return () => window.clearTimeout(timer)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const previousFocus = document.activeElement as HTMLElement | null
    const trap = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); return }
      if (event.key !== 'Tab') return
      const controls = [...(surfaceRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]),input,a[href]') ?? [])].filter(el => el.getClientRects().length)
      const first = controls[0], last = controls.at(-1)
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
    document.addEventListener('keydown', trap)
    return () => { document.removeEventListener('keydown', trap); previousFocus?.focus({ preventScroll: true }) }
  }, [open, onClose])

  useEffect(() => {
    if (open && cursor >= 0) surfaceRef.current?.querySelector(`[data-search-index="${cursor}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [open, cursor])

  if (!open) return null

  const go = (to: string) => {
    onClose()
    navigate(to)
  }

  const allResults = () => {
    const url = new URL(scoped('/catalog'), window.location.origin)
    if (query.trim()) url.searchParams.set('q', query.trim())
    go(`${url.pathname}${url.search}`)
  }

  const submit = () => {
    const target = suggestions[cursor]
    if (target) return go(target.to)
    allResults()
  }

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Поиск серверов" className={`gs-search-overlay ${game?.id==='lineage2'?'gs-l2-search-sheet':''} fixed inset-0 z-[100] flex items-start justify-center sm:pt-[12vh]`}>
      <button aria-label="Закрыть" onClick={onClose} className="absolute inset-0 animate-fade bg-ink-1000/80 backdrop-blur-[5px]" />

      <div ref={surfaceRef} className="gs-search-surface surface-raised relative flex h-full w-full animate-pop flex-col overflow-hidden sm:h-auto sm:max-h-[70vh] sm:w-[620px] sm:rounded-xl">
        <div className="gs-search-intro"><div><h2>Найти сервер</h2><p>{game ? `${game.name} · название, версия или режим` : 'По всем играм · название, версия или режим'}</p></div><button type="button" onClick={onClose} aria-label="Закрыть поиск" className="gs-search-close"><X size={20} /></button></div>
        <div className="gs-search-input-row flex items-center gap-3 border-b border-white/7 px-4 py-3.5 sm:px-5">
          <Search size={18} className="shrink-0 text-ink-400" />
          <input
            ref={inputRef}
            type="search"
            role="combobox"
            aria-label="Название сервера, версия или режим"
            aria-autocomplete="list"
            aria-expanded={suggestions.length > 0}
            aria-controls="gs-search-options"
            aria-activedescendant={cursor >= 0 && suggestions[cursor] ? `gs-search-option-${cursor}` : undefined}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setCursor(-1)
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault()
                setCursor((c) => Math.max(0, Math.min(suggestions.length - 1, c + 1)))
              }
              if (event.key === 'ArrowUp') {
                event.preventDefault()
                setCursor((c) => Math.max(0, c - 1))
              }
              if (event.key === 'Enter') { event.preventDefault(); submit() }
              if (event.key === 'Escape') onClose()
            }}
            placeholder={game?`Найти сервер ${game.shortName}`:'Найти игру, сервер или режим'}
            className="min-w-0 flex-1 bg-transparent text-[16px] text-ink-50 placeholder:text-ink-500 focus:outline-none"
          />
          {query && <button type="button" onClick={() => { setQuery(''); setCursor(-1); inputRef.current?.focus() }} aria-label="Очистить запрос" className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-ink-400"><X size={17} /></button>}
        </div>

        <div className="gs-search-results min-h-0 flex-1 overflow-y-auto">
          {pending ? <p role="status" className="px-4 py-10 text-center text-[14px] text-ink-300">Ищем серверы…</p> : suggestions.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <p className="text-[14px] text-ink-200">{error ? 'Поиск сейчас недоступен' : `Ничего не найдено по запросу «${query}»`}</p>
              <p className="mt-1.5 text-[13px] text-ink-400">Попробуйте название игры, режим или регион</p>
              <button
                onClick={() => go(scoped('/catalog'))}
                className="mt-4 inline-flex items-center gap-1.5 text-[13px] text-signal-300 hover:text-signal-200"
              >
                Открыть каталог <ArrowRight size={14} />
              </button>
            </div>
          ) : (
            <SuggestionList items={suggestions} cursor={cursor} onHover={setCursor} onPick={go} />
          )}

          {query.trim() && <button type="button" className="gs-search-all" onClick={allResults}><span>Все результаты по запросу «{query.trim()}»</span><ArrowRight size={16} className="shrink-0" /></button>}
          {!query && (
            <div className="mt-2 border-t border-white/6 px-2.5 pt-3 pb-1">
              <div className="mb-2 text-[11px] tracking-[0.12em] text-ink-500 uppercase">Быстрый поиск</div>
              <div className="flex flex-wrap gap-2">
                {QUICK_SEARCHES.filter(item=>!game||item.to.includes(game.id)||item.to.startsWith(`/${game.slug}`)).map((item) => (
                  <button
                    key={item.label}
                    onClick={() => go(item.to)}
                    className="rounded-full border border-white/8 bg-white/[0.03] px-3 py-1.5 text-[12.5px] text-ink-300 transition-colors hover:border-white/16 hover:text-ink-50"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="hidden items-center gap-4 border-t border-white/6 px-5 py-2.5 font-mono text-[10.5px] text-ink-500 sm:flex">
          <span className="flex items-center gap-1.5">
            <Key>↑</Key>
            <Key>↓</Key> навигация
          </span>
          <span className="flex items-center gap-1.5">
            <Key>
              <CornerDownLeft size={10} />
            </Key>
            открыть
          </span>
          <span className="flex items-center gap-1.5">
            <Key>esc</Key> закрыть
          </span>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function Key({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded border border-white/10 bg-white/5 px-1 text-ink-300">
      {children}
    </kbd>
  )
}

export function SuggestionList({
  items,
  cursor,
  onHover,
  onPick,
}: {
  items: Suggestion[]
  cursor: number
  onHover: (index: number) => void
  onPick: (to: string) => void
}) {
  let lastKind = ''
  return (
    <div id="gs-search-options" role="listbox" aria-label="Результаты поиска">
      {items.map((item, index) => {
        const showHeader = item.kind !== lastKind
        lastKind = item.kind
        return (
          <div key={`${item.kind}-${item.label}`}>
            {showHeader && (
              <div className="px-2.5 pt-3 pb-1.5 text-[11px] tracking-[0.12em] text-ink-500 uppercase">
                {item.kind === 'game' ? 'Игры' : item.kind === 'server' ? 'Серверы' : 'Режимы'}
              </div>
            )}
            <button
              id={`gs-search-option-${index}`}
              role="option"
              aria-selected={cursor === index}
              data-search-index={index}
              onMouseEnter={() => onHover(index)}
              onClick={() => onPick(item.to)}
              className={cn(
                'gs-search-result flex w-full items-center gap-3 rounded-md px-2.5 py-2.5 text-left transition-colors',
                cursor === index ? 'bg-white/8' : 'hover:bg-white/5',
              )}
            >
              <span
                className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-white/8 bg-white/[0.03] text-ink-300"
                style={item.accent ? { color: item.accent } : undefined}
              >
                {ICONS[item.kind]}
              </span>
              <span className="min-w-0 flex-1">
                <span className="gs-search-result-title block truncate text-[14px] text-ink-50">{item.label}</span>
                <span className="gs-search-result-sub block truncate text-[12px] text-ink-400">{item.sub}</span>
              </span>
              <ArrowRight size={14} className={cn('shrink-0 text-ink-600', cursor === index && 'text-ink-300')} />
            </button>
          </div>
        )
      })}
    </div>
  )
}

