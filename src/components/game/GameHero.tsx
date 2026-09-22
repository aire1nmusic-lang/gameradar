import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronRight, Search, ShieldCheck, Trophy } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatCompact, formatNumber } from '@/lib/format'
import { isShowcase, worldArt } from '@/data/themeMedia'
import type { Chronicle, Game } from '@/models'
import { Container } from '@/components/layout/Container'
import { WorldArtSurface } from '@/components/media/WorldArt'
import {
  ThemeAura,
  ThemeHorizon,
  ThemeParticles,
  ThemePattern,
  ThemedButton,
  ThemedEyebrow,
  ThemedHeading,
  useGameTheme,
} from '@/theme'

/**
 * The entry point of a game world: banner, identity, live numbers and the
 * one action that matters — find a server.
 */
export function GameHero({
  game,
  chronicle,
  serversCount,
  playersOnline,
  verifiedShare,
}: {
  game: Game
  chronicle?: Chronicle
  serversCount: number
  playersOnline: number
  verifiedShare: number
}) {
  const theme = useGameTheme()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const art = worldArt('hero', game.id, chronicle?.id)
  // Showcase worlds put the key art at the centre of the first screen.
  const showcase = !!art && isShowcase(game.id)

  const title = chronicle ? `${game.shortName} ${chronicle.label}` : game.name
  const subtitle = chronicle?.tagline ?? game.tagline

  const submit = () => {
    const params = new URLSearchParams({ game: game.id })
    if (chronicle) params.set('version', chronicle.versions[0])
    if (query.trim()) params.set('q', query.trim())
    navigate(`/catalog?${params.toString()}`)
  }

  return (
    <section
      className={cn(
        'relative overflow-hidden',
        showcase
          ? 'min-h-[560px] sm:min-h-[620px] lg:min-h-[max(620px,70vh)]'
          : art
            ? 'min-h-[440px] sm:min-h-[520px] lg:min-h-[600px]'
            : 'gt-hero',
      )}
    >
      {art ? (
        <>
          {/* key art of the world — the first thing a player sees */}
          <WorldArtSurface art={art} scrim={showcase ? 'poster' : 'hero'} sizes="100vw" priority width={showcase ? 2560 : 1600} />
          <ThemePattern opacity={showcase ? 0.03 : 0.05} />
          <ThemeParticles />
        </>
      ) : (
        <>
          <ThemePattern />
          <ThemeAura className="-top-40 left-1/2 h-[30rem] w-[52rem] -translate-x-1/2 opacity-45" />
          <ThemeParticles />
          <ThemeHorizon />
        </>
      )}

      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-40"
        style={{ background: `linear-gradient(to top, ${theme.colors.bg}, transparent)` }}
      />

      <Container className="relative flex min-h-[inherit] flex-col justify-end pt-8 pb-12 sm:pt-12 sm:pb-16 lg:pt-20 lg:pb-20">
        <nav
          className="mb-6 flex items-center gap-1.5 text-[12px]"
          style={{ color: theme.colors.textFaint }}
          aria-label="Хлебные крошки"
        >
          <Link to="/" className="transition-colors hover:text-[var(--gt-text)]">
            GameScout
          </Link>
          <ChevronRight size={12} />
          <Link to="/games" className="transition-colors hover:text-[var(--gt-text)]">
            Игры
          </Link>
          <ChevronRight size={12} />
          {chronicle ? (
            <>
              <Link to={`/${game.slug}`} className="transition-colors hover:text-[var(--gt-text)]">
                {game.shortName}
              </Link>
              <ChevronRight size={12} />
              <span style={{ color: theme.colors.textMuted }}>{chronicle.label}</span>
            </>
          ) : (
            <span style={{ color: theme.colors.textMuted }}>{game.shortName}</span>
          )}
        </nav>

        <div className="grid gap-10 lg:grid-cols-[1.25fr_0.75fr] lg:items-end">
          <div>
            <ThemedEyebrow className="mb-4">{theme.mood}</ThemedEyebrow>

            <ThemedHeading as="h1" size={58} className="max-w-2xl">
              {title}
            </ThemedHeading>

            <p className="mt-4 max-w-xl text-[15px] leading-relaxed sm:text-[17px]" style={{ color: theme.colors.textMuted }}>
              {subtitle ? `${subtitle}. ` : ''}Найди свой сервер по проверенному онлайну, а не по обещаниям.
            </p>

            <div className="mt-7 flex max-w-xl items-center gap-2 rounded-xl border p-2 pl-4 backdrop-blur-md"
              style={{ borderColor: theme.colors.border, background: `color-mix(in oklab, ${theme.colors.bgDeep} 72%, transparent)` }}
            >
              <Search size={18} className="shrink-0" style={{ color: theme.colors.textFaint }} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => event.key === 'Enter' && submit()}
                placeholder={`Найти сервер ${game.shortName}`}
                className="h-10 min-w-0 flex-1 bg-transparent text-[15px] focus:outline-none"
                style={{ color: theme.colors.text }}
              />
              <ThemedButton onClick={submit} size="md" className="shrink-0">
                Найти
              </ThemedButton>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <ThemedButton to="#rating" variant="outline" size="sm" icon={<Trophy size={13} />}>
                Рейтинг серверов
              </ThemedButton>
              <ThemedButton to="/boost" variant="ghost" size="sm">
                Продвинуть свой сервер
              </ThemedButton>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-px overflow-hidden rounded-xl border lg:grid-cols-1"
            style={{ borderColor: theme.colors.border, background: theme.colors.border }}
          >
            <Stat label="серверов" value={formatNumber(serversCount)} />
            <Stat label="игроков онлайн" value={formatCompact(playersOnline)} live />
            <Stat
              label="с проверенным онлайном"
              value={`${Math.round(verifiedShare * 100)}%`}
              icon={<ShieldCheck size={13} className="text-signal-400" />}
            />
          </div>
        </div>
      </Container>
    </section>
  )
}

function Stat({
  label,
  value,
  live,
  icon,
}: {
  label: string
  value: string
  live?: boolean
  icon?: React.ReactNode
}) {
  const theme = useGameTheme()
  return (
    <div
      className="px-4 py-4 backdrop-blur-sm sm:px-5"
      style={{ background: `color-mix(in oklab, ${theme.colors.bgDeep} 78%, transparent)` }}
    >
      <div className="flex items-center gap-2">
        {live && <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-signal-400" />}
        {icon}
        <span className="num gt-display text-[20px] lg:text-[26px]">{value}</span>
      </div>
      <div className="mt-1 text-[11.5px] lg:text-[12.5px]" style={{ color: theme.colors.textFaint }}>
        {label}
      </div>
    </div>
  )
}
