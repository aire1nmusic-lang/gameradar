import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, CornerDownLeft, Gamepad2, Search, Server, SlidersHorizontal, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { buildSuggestions, QUICK_SEARCHES, type Suggestion } from '@/services'
import { useAsync } from '@/hooks/data'
import { useLockBodyScroll } from '@/hooks/useUi'

const ICONS = {
  game: <Gamepad2 size={15} />,
  server: <Server size={15} />,
  mode: <SlidersHorizontal size={15} />,
}

export function SearchOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()
  useLockBodyScroll(open)

  const { data: suggestions = [] } = useAsync(() => buildSuggestions(query), [query], true)

  useEffect(() => {
    if (open) {
      setQuery('')
      setCursor(0)
      const timer = window.setTimeout(() => inputRef.current?.focus(), 40)
      return () => window.clearTimeout(timer)
    }
  }, [open])

  if (!open) return null

  const go = (to: string) => {
    onClose()
    navigate(to)
  }

  const submit = () => {
    const target = suggestions[cursor]
    if (target) return go(target.to)
    go(`/catalog?q=${encodeURIComponent(query)}`)
  }

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-start justify-center sm:pt-[12vh]">
      <button aria-label="Закрыть" onClick={onClose} className="absolute inset-0 animate-fade bg-ink-1000/80 backdrop-blur-[5px]" />

      <div className="surface-raised relative flex h-full w-full animate-pop flex-col overflow-hidden sm:h-auto sm:max-h-[70vh] sm:w-[620px] sm:rounded-xl">
        <div className="flex items-center gap-3 border-b border-white/7 px-4 py-3.5 sm:px-5">
          <Search size={18} className="shrink-0 text-ink-400" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setCursor(0)
            }}
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
              if (event.key === 'Escape') onClose()
            }}
            placeholder="Найти игру, сервер или режим"
            className="min-w-0 flex-1 bg-transparent text-[16px] text-ink-50 placeholder:text-ink-500 focus:outline-none"
          />
          <button
            onClick={onClose}
            aria-label="Закрыть"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-ink-400 transition-colors hover:bg-white/6 hover:text-ink-50"
          >
            <X size={17} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2 sm:px-2.5">
          {suggestions.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <p className="text-[14px] text-ink-200">Ничего не найдено по запросу «{query}»</p>
              <p className="mt-1.5 text-[13px] text-ink-400">Попробуйте название игры, режим или регион</p>
              <button
                onClick={() => go('/catalog')}
                className="mt-4 inline-flex items-center gap-1.5 text-[13px] text-signal-300 hover:text-signal-200"
              >
                Открыть каталог <ArrowRight size={14} />
              </button>
            </div>
          ) : (
            <SuggestionList items={suggestions} cursor={cursor} onHover={setCursor} onPick={go} />
          )}

          {!query && (
            <div className="mt-2 border-t border-white/6 px-2.5 pt-3 pb-1">
              <div className="mb-2 text-[11px] tracking-[0.12em] text-ink-500 uppercase">Быстрый поиск</div>
              <div className="flex flex-wrap gap-2">
                {QUICK_SEARCHES.map((item) => (
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
    <div>
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
              onMouseEnter={() => onHover(index)}
              onClick={() => onPick(item.to)}
              className={cn(
                'flex w-full items-center gap-3 rounded-md px-2.5 py-2.5 text-left transition-colors',
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
                <span className="block truncate text-[14px] text-ink-50">{item.label}</span>
                <span className="block truncate text-[12px] text-ink-400">{item.sub}</span>
              </span>
              <ArrowRight size={14} className={cn('shrink-0 text-ink-600', cursor === index && 'text-ink-300')} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
