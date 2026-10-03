import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { WorldIcon } from '@/components/icons/WorldIcon'
import { cn } from '@/lib/utils'
import { formatCompact, formatNumber, plural } from '@/lib/format'
import { worldArt } from '@/data/themeMedia'
import type { Chronicle, Game } from '@/models'
import { Container } from '@/components/layout/Container'
import { WorldArtSurface } from '@/components/media/WorldArt'
import { ThemeAura, ThemeHorizon, ThemePattern, ThemedButton, ThemedHeading, useGameTheme } from '@/theme'

/**
 * The entry of a game world: its key art, its name, one line of numbers and
 * the search. Short on purpose — the servers start on the first screen.
 */
export function GameHero({
  game,
  chronicle,
  serversCount,
  playersOnline,
  openings = 0,
}: {
  game: Game
  chronicle?: Chronicle
  /** undefined while the list is still loading */
  serversCount?: number
  playersOnline: number
  openings?: number
}) {
  const theme = useGameTheme()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const art = worldArt('hero', game.id, chronicle?.id)

  const title = chronicle ? `${game.shortName} ${chronicle.label}` : game.name
  // A chronicle without its own tagline shows none — the game's line would read as a mistake here.
  const tagline = (chronicle ? chronicle.tagline : game.tagline)?.trim() || ''
  const facts = [
    playersOnline > 0 ? `${formatCompact(playersOnline)} онлайн` : null,
    serversCount === undefined ? null : `${formatNumber(serversCount)} ${plural(serversCount, ['сервер', 'сервера', 'серверов'])}`,
    openings > 0 ? `${openings} ${plural(openings, ['открытие', 'открытия', 'открытий'])}` : null,
  ].filter(Boolean)

  const submit = () => {
    const params = new URLSearchParams({ game: game.id })
    if (chronicle) params.set('version', chronicle.versions[0])
    if (query.trim()) params.set('q', query.trim())
    navigate(`/catalog?${params.toString()}`)
  }

  return (
    <section className={cn('gs-hero relative overflow-hidden', !art && 'gt-hero')}>
      {art ? (
        <WorldArtSurface art={art} scrim="poster" sizes="100vw" priority width={2560} />
      ) : (
        <>
          <ThemePattern />
          <ThemeAura className="-top-40 left-1/2 h-[30rem] w-[52rem] -translate-x-1/2 opacity-45" />
          <ThemeHorizon />
        </>
      )}
      {/* the list below must read on the art: fade the bottom into the page */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28" style={{ background: `linear-gradient(to top, ${theme.colors.bg}, transparent)` }} />
      {/* the left third of every master is quiet; this keeps text legible there on any crop */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-full sm:w-2/3" style={{ background: `linear-gradient(to right, color-mix(in oklab, ${theme.colors.bg} 78%, transparent), transparent)` }} />

      <Container className="relative flex min-h-[inherit] flex-col justify-end pt-4 pb-6 sm:pb-8 lg:pb-9">
        <nav className="mb-3 flex items-center gap-1.5 text-[12px]" style={{ color: theme.colors.textFaint }} aria-label="Хлебные крошки">
          <Link to="/" className="transition-colors hover:text-[var(--gt-text)]">
            Зал миров
          </Link>
          {chronicle && (
            <>
              <WorldIcon name="chevronRight" size={12} />
              <Link to={`/${game.slug}`} className="transition-colors hover:text-[var(--gt-text)]">
                {game.shortName}
              </Link>
            </>
          )}
        </nav>

        <ThemedHeading as="h1" size={44} className="gs-hero-title max-w-2xl">
          {title}
        </ThemedHeading>

        <p className="num mt-2 text-[14px]" style={{ color: theme.colors.textMuted }}>
          {facts.join(' · ')}
          {tagline ? <span className="hidden sm:inline">{facts.length > 0 ? ' · ' : ''}{tagline}</span> : null}
        </p>

        <div
          className="mt-4 flex max-w-lg items-center gap-2 rounded-xl border p-1.5 pl-3.5"
          style={{ borderColor: theme.colors.borderStrong, background: `color-mix(in oklab, ${theme.colors.bgDeep} 82%, transparent)` }}
        >
          <WorldIcon name="search" size={17} className="shrink-0" style={{ color: theme.colors.textFaint }} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && submit()}
            placeholder={`Найти сервер ${game.shortName}`}
            className="h-9 min-w-0 flex-1 bg-transparent text-[15px] focus:outline-none"
            style={{ color: theme.colors.text }}
          />
          <ThemedButton onClick={submit} size="sm" className="shrink-0">
            Найти
          </ThemedButton>
        </div>
      </Container>
    </section>
  )
}
