import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatCompact, formatNumber, plural } from '@/lib/format'
import { QUICK_SEARCHES } from '@/services'
import { useGames, usePlatformStats } from '@/hooks/data'
import { themeForGame } from '@/data/themes'
import type { Game } from '@/models'
import { HeroSearch } from './Hero'

/**
 * The first screen: an empty cathedral hall with three glass cards floating in
 * it, one per game. The cards drift, lean towards the pointer and catch a
 * light sweep. Hovering one brings it forward and dims the others; choosing
 * it lifts the card off the wall and grows it over the whole screen, the hall
 * sinks back, and the game's world opens out of the card.
 *
 * Phones: the vertical hall and the cards in a swipeable row.
 */

const WORLDS = ['lineage2', 'gtarp', 'minecraft'] as const

const cardSrc = (gameId: string, w: 480 | 960 | 1600) => `/media/hub/card-${gameId}-${w}.webp`
const cardSrcSet = (gameId: string) => `${cardSrc(gameId, 480)} 480w, ${cardSrc(gameId, 960)} 960w`
const NAVE_SRCSET = [1280, 1920, 2560, 3840].map((w) => `/media/hub/nave-${w}.webp ${w}w`).join(', ')
const NAVE_PHONE_SRCSET = '/media/hub/nave-m-720.webp 720w, /media/hub/nave-m-1080.webp 1080w'

/** How long the card takes to fill the screen before the world page takes over. */
const FLIGHT_MS = 850

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

type Flight = { game: Game; rect: DOMRect; color: string }

function usePortal() {
  const navigate = useNavigate()
  const [flight, setFlight] = useState<Flight | null>(null)
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(timer.current), [])

  const enter = (game: Game) => (event: React.MouseEvent<HTMLElement>) => {
    // new tab, middle click and friends keep the ordinary link behaviour
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return
    event.preventDefault()
    if (flight) return
    const to = `/${game.slug}`
    if (reducedMotion()) return navigate(to, { state: { portal: true } })
    const frame = event.currentTarget.querySelector('[data-card-image]') ?? event.currentTarget
    setFlight({ game, rect: frame.getBoundingClientRect(), color: themeForGame(game.id).colors.bg })
    timer.current = window.setTimeout(() => navigate(to, { state: { portal: true } }), FLIGHT_MS)
  }
  return { flight, enter }
}

/** Cards lean towards the pointer: each card reads the pointer relative to its own centre. */
function useTilt() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const node = ref.current
    if (!node || reducedMotion() || !window.matchMedia('(pointer: fine)').matches) return
    let frame = 0
    const move = (event: PointerEvent) => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const hall = node.getBoundingClientRect()
        node.style.setProperty('--gs-px', `${(((event.clientX - hall.left) / hall.width - 0.5) * -16).toFixed(1)}px`)
        node.style.setProperty('--gs-py', `${(((event.clientY - hall.top) / hall.height - 0.5) * -10).toFixed(1)}px`)
        for (const card of node.querySelectorAll<HTMLElement>('[data-tilt]')) {
          const r = card.getBoundingClientRect()
          const x = Math.max(-1, Math.min(1, (event.clientX - (r.left + r.width / 2)) / (hall.width / 2)))
          const y = Math.max(-1, Math.min(1, (event.clientY - (r.top + r.height / 2)) / (hall.height / 2)))
          card.style.setProperty('--gs-ry', `${(x * 9).toFixed(2)}deg`)
          card.style.setProperty('--gs-rx', `${(-y * 7).toFixed(2)}deg`)
        }
      })
    }
    const leave = () => {
      for (const card of node.querySelectorAll<HTMLElement>('[data-tilt]')) {
        card.style.setProperty('--gs-ry', '0deg')
        card.style.setProperty('--gs-rx', '0deg')
      }
    }
    node.addEventListener('pointermove', move)
    node.addEventListener('pointerleave', leave)
    return () => {
      node.removeEventListener('pointermove', move)
      node.removeEventListener('pointerleave', leave)
      cancelAnimationFrame(frame)
    }
  }, [])
  return ref
}

export function WorldHall() {
  const { data: stats } = usePlatformStats()
  const { data: games = [] } = useGames()
  const byId = Object.fromEntries(games.map((game) => [game.id, game])) as Record<string, Game | undefined>
  const worlds = WORLDS.map((id) => byId[id]).filter((game): game is Game => !!game)
  const [hover, setHover] = useState<string | null>(null)
  const { flight, enter } = usePortal()
  const tilt = useTilt()
  const players = stats?.playersOnline ?? 0

  return (
    <section className="relative isolate overflow-hidden">
      {/* ── wide screens ─────────────────────────────────────────────── */}
      <div ref={tilt} className="relative hidden h-[max(640px,calc(100svh-60px))] lg:block">
        {/* the hall: breathes, follows the pointer, sinks back when a card is chosen */}
        <div
          aria-hidden
          className="absolute inset-0"
          style={{ transform: flight ? 'scale(1.12)' : 'none', filter: flight ? 'brightness(0.45) blur(3px)' : undefined, transition: `transform ${FLIGHT_MS}ms cubic-bezier(0.5,0,0.2,1), filter ${FLIGHT_MS}ms ease` }}
        >
          <div className="absolute -inset-5 transition-transform duration-700 ease-out" style={{ transform: 'translate3d(var(--gs-px, 0px), var(--gs-py, 0px), 0)' }}>
            <img src="/media/hub/nave-1920.webp" srcSet={NAVE_SRCSET} sizes="100vw" alt="" className="gs-hall-drift absolute inset-0 h-full w-full object-cover" fetchPriority="high" decoding="async" />
          </div>
          <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-ink-950/75 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 h-[38%] bg-gradient-to-t from-ink-950 via-ink-950/60 to-transparent" />
        </div>

        {/* the three cards, turned towards the centre like panels in the hall */}
        <div className="absolute inset-x-0 top-[9%] flex justify-center gap-[3.2vw]" style={{ perspective: '1600px' }}>
          {worlds.map((game, index) => {
            const side = index === 0 ? 1 : index === worlds.length - 1 ? -1 : 0
            return (
              <WorldCard
                key={game.id}
                game={game}
                side={side}
                index={index}
                active={hover === game.id}
                dimmed={(hover !== null && hover !== game.id) || (flight !== null && flight.game.id !== game.id)}
                hidden={flight?.game.id === game.id}
                onEnter={enter(game)}
                onHover={(on) => setHover((current) => (on ? game.id : current === game.id ? null : current))}
              />
            )
          })}
        </div>

        <div className="absolute inset-x-0 bottom-[4.5%] flex justify-center px-6" style={{ opacity: flight ? 0 : 1, transition: 'opacity 300ms' }}>
          <GlassConsole players={players} />
        </div>
      </div>

      {/* ── phones and tablets ───────────────────────────────────────── */}
      <div className="relative lg:hidden">
        <div aria-hidden className="absolute inset-0 -z-10">
          <img src="/media/hub/nave-m-720.webp" srcSet={NAVE_PHONE_SRCSET} sizes="100vw" alt="" className="gs-hall-drift h-full max-h-[1000px] w-full object-cover object-top" fetchPriority="high" decoding="async" />
          <div className="absolute inset-0 bg-gradient-to-b from-ink-950/30 via-ink-950/35 to-ink-950" />
        </div>
        <div className="pt-8 pb-8">
          <div className="gs-snap-row flex snap-x snap-mandatory gap-4 overflow-x-auto px-[19vw] pt-2 pb-6 sm:px-[30vw]" style={{ perspective: '1200px' }}>
            {worlds.map((game, index) => (
              <div key={game.id} className="w-[62vw] max-w-[300px] shrink-0 snap-center sm:w-[40vw]">
                <WorldCard game={game} side={0} index={index} active={false} dimmed={false} hidden={flight?.game.id === game.id} onEnter={enter(game)} onHover={() => undefined} compact />
              </div>
            ))}
          </div>
          <div className="px-4 sm:px-7">
            <GlassConsole players={players} />
          </div>
        </div>
      </div>

      {flight && <CardBloom flight={flight} />}
    </section>
  )
}

/**
 * One glass card. The outer element floats and takes the pointer tilt; the
 * inner one carries the pose in the hall (side cards face the centre) and the
 * hover push forward, so the three motions never fight over one transform.
 */
function WorldCard({
  game,
  side,
  index,
  active,
  dimmed,
  hidden,
  onEnter,
  onHover,
  compact,
}: {
  game: Game
  side: number
  index: number
  active: boolean
  dimmed: boolean
  hidden: boolean
  onEnter: (event: React.MouseEvent<HTMLElement>) => void
  onHover: (on: boolean) => void
  compact?: boolean
}) {
  const pose = `rotateY(${side * 16}deg) translateZ(${active ? 34 : dimmed ? -40 : 0}px) scale(${active ? 1.02 : 1})`
  return (
    <Link
      to={`/${game.slug}`}
      onClick={onEnter}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      onFocus={() => onHover(true)}
      onBlur={() => onHover(false)}
      aria-label={`Открыть мир ${game.name}`}
      className={cn('group block outline-none', compact ? 'w-full' : 'w-[clamp(190px,15.5vw,300px)]')}
      style={{ transformStyle: 'preserve-3d' }}
    >
      <div className="gs-float" style={{ animationDelay: `${index * -2.1}s`, transformStyle: 'preserve-3d' }}>
        <div
          data-tilt
          style={{
            transform: 'rotateX(var(--gs-rx, 0deg)) rotateY(var(--gs-ry, 0deg))',
            transition: 'transform 500ms cubic-bezier(0.22,1,0.36,1)',
            transformStyle: 'preserve-3d',
          }}
        >
          <div
            className="transition-[transform,filter,opacity] duration-500 ease-out"
            style={{
              transform: pose,
              filter: dimmed ? 'brightness(0.55) saturate(0.8)' : 'none',
              opacity: hidden ? 0 : 1,
              transformStyle: 'preserve-3d',
            }}
          >
            <div
              className="gs-glass-card relative rounded-[22px] p-[9px]"
              style={{ boxShadow: active ? `0 0 0 1px color-mix(in oklab, ${game.accent} 60%, transparent), 0 30px 90px -20px color-mix(in oklab, ${game.accent} 70%, transparent), 0 40px 80px -30px rgb(0 0 0 / 0.9)` : undefined }}
            >
              <div data-card-image className="relative aspect-[2/3] overflow-hidden rounded-[14px]">
                <img
                  src={cardSrc(game.id, 480)}
                  srcSet={cardSrcSet(game.id)}
                  sizes={compact ? '62vw' : '(min-width: 1024px) 480px, 62vw'}
                  alt={`${game.name}`}
                  className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.06]"
                  decoding="async"
                />
                <div className="gs-sheen absolute inset-0" style={{ animationDelay: `${index * 1.3}s` }} />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent p-4 pt-14">
                  <div className="text-[19px] leading-tight font-semibold text-white">{game.shortName}</div>
                  <div className="num mt-1 flex items-center gap-2 text-[12px] text-white/75">
                    {formatNumber(game.serversCount)} {plural(game.serversCount, ['сервер', 'сервера', 'серверов'])}
                    {game.playersOnline > 0 && (
                      <span className="flex items-center gap-1">
                        <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-signal-400" />
                        {formatCompact(game.playersOnline)}
                      </span>
                    )}
                  </div>
                  <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/10 px-3 py-1 text-[12px] font-medium text-white backdrop-blur-sm transition-colors group-hover:bg-white/20">
                    Войти в мир <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Link>
  )
}

/** The chosen card lifts off and grows over the whole screen, then its world takes over. */
function CardBloom({ flight }: { flight: Flight }) {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    let inner = 0
    const outer = requestAnimationFrame(() => { inner = requestAnimationFrame(() => setOpen(true)) })
    return () => { cancelAnimationFrame(outer); cancelAnimationFrame(inner) }
  }, [])
  const { rect, game, color } = flight
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[70]">
      <div
        className="absolute overflow-hidden"
        style={{
          top: open ? 0 : rect.top,
          left: open ? 0 : rect.left,
          width: open ? '100vw' : rect.width,
          height: open ? '100dvh' : rect.height,
          borderRadius: open ? 0 : 14,
          boxShadow: `0 0 120px 20px color-mix(in oklab, ${game.accent} 45%, transparent)`,
          transition: `all ${FLIGHT_MS - 150}ms cubic-bezier(0.76, 0, 0.24, 1)`,
        }}
      >
        <img
          src={cardSrc(game.id, 1600)}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          style={{ transform: open ? 'scale(1.25)' : 'scale(1)', transition: `transform ${FLIGHT_MS + 200}ms cubic-bezier(0.5,0,0.2,1)` }}
        />
      </div>
      {/* the world's colour at the very end, so the world page grows out of it */}
      <div className="gs-veil absolute inset-0" style={{ background: color }} />
    </div>
  )
}

/** The central glass console: one line, search, shortcuts. */
function GlassConsole({ players }: { players: number }) {
  return (
    <div className="gs-glass relative z-20 mx-auto w-full max-w-[620px] rounded-3xl px-5 pt-5 pb-4 text-center sm:px-7">
      {players > 0 && (
        <div className="mb-2 inline-flex items-center gap-2 text-[12.5px] text-white/70">
          <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-signal-400" />
          <span className="num">{formatNumber(players)} игроков на серверах прямо сейчас</span>
        </div>
      )}
      <h1 className="text-[26px] leading-[1.1] font-semibold text-white sm:text-[34px]">Выбери свой мир</h1>
      <HeroSearch className="mt-4" />
      <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
        {QUICK_SEARCHES.map((item) => (
          <Link
            key={item.label}
            to={item.to}
            className="rounded-full border border-white/12 bg-white/[0.05] px-3 py-1 text-[12.5px] text-white/75 transition-colors hover:border-white/25 hover:text-white"
          >
            {item.label}
          </Link>
        ))}
      </div>
    </div>
  )
}
