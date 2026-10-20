import { useId, useRef, type MouseEvent } from 'react'
import { Link } from 'react-router-dom'
import { Check, ChevronRight } from 'lucide-react'
import type { Chronicle, Game } from '@/models'
import { artSrc, worldArt } from '@/data/themeMedia'
import './inline-chronicle-picker.css'

/** Variant A: an in-flow disclosure; the server shelves move below the open grid. */
export function InlineChroniclePicker({ game, chronicle }: { game: Game; chronicle?: Chronicle }) {
  const details = useRef<HTMLDetailsElement>(null)
  const summary = useRef<HTMLElement>(null)
  const gridId = useId()
  const choices = [{ id: 'all', slug: '', label: 'Все' }, ...game.chronicles]
  const close = () => {
    if (!details.current?.open) return
    details.current.open = false
    summary.current?.focus({ preventScroll: true })
  }
  const choose = (event: MouseEvent<HTMLAnchorElement>) => {
    // Preserve normal new-tab/window link behaviour.
    if (event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) close()
  }
  return (
    <details ref={details} className="chronicle-picker gs-inline-picker" onKeyDown={event => {
      if (event.key === 'Escape' && details.current?.open) {
        event.preventDefault()
        event.stopPropagation()
        close()
      }
    }}>
      <summary ref={summary} className="gs-inline-summary" aria-controls={gridId}>
        <span className="gs-inline-heading"><span className="gs-inline-kicker">Хроники</span><span className="gs-inline-title">Выбери свою эпоху</span></span>
        <span className="gs-inline-current">{chronicle?.label ?? 'Все'}</span>
        <ChevronRight className="gs-inline-chevron" size={18} aria-hidden="true" />
      </summary>
      <nav id={gridId} className="gs-inline-grid" aria-label="Выбрать хроники">
        {choices.map(choice => {
          const active = choice.id === (chronicle?.id ?? 'all')
          const thumbnail = worldArt('hero', game.id, choice.id === 'all' ? undefined : choice.id)
          return <Link key={choice.id} to={`/${game.slug}${choice.slug ? '/' + choice.slug : ''}`} className="gs-inline-tile" aria-current={active ? 'page' : undefined} onClick={choose}>
            {thumbnail && <img src={artSrc(thumbnail, 400)} alt="" width={400} height={170} decoding="async" />}
            <span className="gs-inline-caption">{choice.label}</span>
            {active && <Check className="gs-inline-check" size={18} aria-hidden="true" />}
          </Link>
        })}
      </nav>
    </details>
  )
}
