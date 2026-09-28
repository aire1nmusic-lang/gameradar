import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatCompact, formatNumber, plural } from '@/lib/format'
import { QUICK_SEARCHES } from '@/services'
import { useGames, usePlatformStats } from '@/hooks/data'
import { worldArt } from '@/data/themeMedia'
import { themeForGame } from '@/data/themes'
import { WorldArtSurface } from '@/components/media/WorldArt'
import type { Game } from '@/models'
import { HeroSearch } from './Hero'

/**
 * The first screen: a hall between worlds (one piece of key art, 21:9) whose
 * three gates are the three games.
 *
 * At rest the hall breathes and follows the mouse a little. Hovering a gate
 * dims the rest of the hall and wakes a slow vortex inside that gate.
 * Choosing it spins the vortex up, flies the camera through the gate with a
 * slight roll, streaks the edges and fills the screen with the world's
 * colour; the world page then opens out of that colour.
 *
 * Gate geometry is in percent of the picture, so the picture keeps its own
 * aspect ratio on wide screens. Phones get the centre of the hall as a
 * backdrop and the gates as glass portals that open to full screen.
 */

type Gate = { gameId: string; box: { left: number; top: number; width: number; height: number }; plateY: number }

/** Where each gate is in public/media/hub/hall-*.webp (3840×1646). */
const GATES: Gate[] = [
  { gameId: 'lineage2', box: { left: 6.5, top: 0, width: 19, height: 58 }, plateY: 50 },
  { gameId: 'gtarp', box: { left: 42, top: 4, width: 16, height: 54 }, plateY: 50 },
  { gameId: 'minecraft', box: { left: 74.5, top: 0, width: 18.5, height: 58 }, plateY: 50 },
]
const centre = (gate: Gate) => ({ x: gate.box.left + gate.box.width / 2, y: gate.box.top + gate.box.height * 0.5 })

const HALL_SRCSET = [1280, 1920, 2560, 3840].map((w) => `/media/hub/hall-${w}.webp ${w}w`).join(', ')
const HALL_PHONE_SRCSET = '/media/hub/hall-m-720.webp 720w, /media/hub/hall-m-1080.webp 1080w'
/** How long the flight lasts before the world page takes over. */
const FLIGHT_MS = 900

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

type Flight = { gameId: string; color: string; accent: string; rect?: DOMRect }

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
    setFlight({ gameId: game.id, color: themeForGame(game.id).colors.bg, accent: game.accent, rect: event.currentTarget.getBoundingClientRect() })
    timer.current = window.setTimeout(() => navigate(to, { state: { portal: true } }), FLIGHT_MS)
  }
  return { flight, enter }
}

/** The hall follows the pointer by a few pixels: depth without a 3D engine. */
function useParallax() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const node = ref.current
    if (!node || reducedMotion() || !window.matchMedia('(pointer: fine)').matches) return
    let frame = 0
    const move = (event: PointerEvent) => {
      const rect = node.getBoundingClientRect()
      const x = (event.clientX - rect.left) / rect.width - 0.5
      const y = (event.clientY - rect.top) / rect.height - 0.5
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        node.style.setProperty('--gs-px', `${(-x * 18).toFixed(1)}px`)
        node.style.setProperty('--gs-py', `${(-y * 10).toFixed(1)}px`)
      })
    }
    node.addEventListener('pointermove', move)
    return () => { node.removeEventListener('pointermove', move); cancelAnimationFrame(frame) }
  }, [])
  return ref
}

export function WorldHall() {
  const { data: stats } = usePlatformStats()
  const { data: games = [] } = useGames()
  const byId = Object.fromEntries(games.map((game) => [game.id, game])) as Record<string, Game | undefined>
  const [hover, setHover] = useState<string | null>(null)
  const { flight, enter } = usePortal()
  const parallax = useParallax()
  const players = stats?.playersOnline ?? 0

  const target = flight ? GATES.find((gate) => gate.gameId === flight.gameId) : undefined
  const origin = target ? centre(target) : { x: 50, y: 40 }

  return (
    <section className="relative isolate overflow-hidden">
      {/* ── wide screens: the hall itself is the menu ─────────────────── */}
      <div ref={parallax} className="relative hidden aspect-[21/9] w-full lg:block">
        <div
          className="absolute inset-0 will-change-transform"
          style={{
            transformOrigin: `${origin.x}% ${origin.y}%`,
            transform: flight ? 'scale(4.2) rotate(-7deg)' : 'none',
            filter: flight ? 'brightness(1.4) saturate(1.25)' : undefined,
            transition: `transform ${FLIGHT_MS}ms cubic-bezier(0.64, 0, 0.78, 0), filter ${FLIGHT_MS}ms ease-in`,
          }}
        >
          <div className="absolute -inset-4 transition-transform duration-700 ease-out" style={{ transform: 'translate3d(var(--gs-px, 0px), var(--gs-py, 0px), 0)' }}>
            <img
              src="/media/hub/hall-1920.webp"
              srcSet={HALL_SRCSET}
              sizes="100vw"
              alt="Зал миров GameScout: врата в Lineage 2, GTA RP и Minecraft"
              className="gs-hall-drift absolute inset-0 h-full w-full object-cover"
              fetchPriority="high"
              decoding="async"
            />
            {/* zoom blur while flying: two ghosts of the picture pulled towards the viewer */}
            {flight && (
              <>
                <img src="/media/hub/hall-1920.webp" alt="" aria-hidden className="gs-ghost absolute inset-0 h-full w-full object-cover" style={{ transformOrigin: `${origin.x}% ${origin.y}%`, ['--gs-ghost-scale' as string]: 1.12, opacity: 0.35 }} />
                <img src="/media/hub/hall-1920.webp" alt="" aria-hidden className="gs-ghost absolute inset-0 h-full w-full object-cover" style={{ transformOrigin: `${origin.x}% ${origin.y}%`, ['--gs-ghost-scale' as string]: 1.28, opacity: 0.2 }} />
              </>
            )}
          </div>

          {/* each gate: a spotlight that dims the rest, and a vortex inside the arch */}
          {GATES.map((gate) => {
            const game = byId[gate.gameId]
            const c = centre(gate)
            const flying = flight?.gameId === gate.gameId
            const lit = (hover === gate.gameId && !flight) || flying
            return (
              <div key={gate.gameId} aria-hidden className="pointer-events-none absolute inset-0">
                <div
                  className="absolute inset-0 transition-opacity duration-500"
                  style={{
                    opacity: hover === gate.gameId && !flight ? 1 : 0,
                    background: `radial-gradient(ellipse ${gate.box.width * 0.85}% ${gate.box.height * 0.95}% at ${c.x}% ${c.y}%, transparent 55%, rgba(4,5,9,0.62) 100%)`,
                  }}
                />
                <div
                  className="absolute aspect-square -translate-x-1/2 -translate-y-1/2 transition-[opacity,scale] duration-700"
                  style={{
                    left: `${c.x}%`,
                    top: `${c.y}%`,
                    width: `${gate.box.width * 1.05}%`,
                    opacity: flying ? 1 : lit ? 0.75 : 0,
                    scale: flying ? '1.6' : lit ? '1' : '0.7',
                  }}
                >
                  <div className={cn('gs-vortex absolute inset-0', flying && 'gs-vortex-fast')} style={{ ['--gs-vortex' as string]: game?.accent ?? '#8ab4ff' }} />
                </div>
              </div>
            )
          })}

          {/* speed lines around the gate we fly into */}
          {flight && (
            <div aria-hidden className="gs-streaks pointer-events-none absolute aspect-square -translate-x-1/2 -translate-y-1/2" style={{ left: `${origin.x}%`, top: `${origin.y}%`, width: '140%' }} />
          )}

          {/* top and bottom fades so the header and the page below grow out of the picture */}
          <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-ink-950/70 to-transparent" />
          <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-[34%] bg-gradient-to-t from-ink-950 via-ink-950/55 to-transparent" />
        </div>

        {GATES.map((gate) => {
          const game = byId[gate.gameId]
          if (!game) return null
          return (
            <Link
              key={gate.gameId}
              to={`/${game.slug}`}
              onClick={enter(game)}
              onMouseEnter={() => setHover(gate.gameId)}
              onMouseLeave={() => setHover((current) => (current === gate.gameId ? null : current))}
              onFocus={() => setHover(gate.gameId)}
              onBlur={() => setHover(null)}
              aria-label={`Открыть мир ${game.name}`}
              className="group absolute rounded-t-[999px] outline-none"
              style={{ left: `${gate.box.left}%`, top: `${gate.box.top}%`, width: `${gate.box.width}%`, height: `${gate.box.height}%`, opacity: flight ? 0 : 1, transition: 'opacity 250ms' }}
            >
              <GatePlate game={game} active={hover === gate.gameId} style={{ top: `${((gate.plateY - gate.box.top) / gate.box.height) * 100}%` }} />
            </Link>
          )
        })}

        <div className="absolute inset-x-0 bottom-[5%] flex justify-center px-6" style={{ opacity: flight ? 0 : 1, transition: 'opacity 250ms' }}>
          <GlassConsole players={players} />
        </div>
      </div>

      {/* ── phones and tablets: the centre of the hall and glass portals ── */}
      <div className="relative lg:hidden">
        <div aria-hidden className="absolute inset-0 -z-10">
          <img src="/media/hub/hall-m-720.webp" srcSet={HALL_PHONE_SRCSET} sizes="100vw" alt="" className="gs-hall-drift h-full max-h-[900px] w-full object-cover object-top" fetchPriority="high" decoding="async" />
          <div className="absolute inset-0 bg-gradient-to-b from-ink-950/40 via-ink-950/55 to-ink-950" />
        </div>
        <div className="px-4 pt-[34vh] pb-8 sm:px-7">
          <GlassConsole players={players} />
          <div className="mx-auto mt-4 grid max-w-xl gap-3 sm:grid-cols-3 sm:gap-3 md:max-w-3xl">
            {GATES.map((gate) => {
              const game = byId[gate.gameId]
              return game ? <GlassPortal key={game.id} game={game} onEnter={enter(game)} /> : null
            })}
          </div>
        </div>
      </div>

      {/* phones: the tapped portal opens to full screen */}
      {flight?.rect && <PortalBloom flight={flight} game={byId[flight.gameId]} />}

      {/* the colour of the world we are falling into, so the next page grows out of it */}
      {flight && <div aria-hidden className="gs-veil pointer-events-none fixed inset-0 z-[70]" style={{ background: flight.color }} />}
    </section>
  )
}

/** Phones: the tapped portal card grows from its place to the whole screen, vortex spinning. */
function PortalBloom({ flight, game }: { flight: Flight; game?: Game }) {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const frame = requestAnimationFrame(() => requestAnimationFrame(() => setOpen(true)))
    return () => cancelAnimationFrame(frame)
  }, [])
  const rect = flight.rect!
  const art = game ? worldArt('hero', game.id) : undefined
  // Only on narrow screens: on wide ones the hall itself flies.
  return (
    <div
      aria-hidden
      className="fixed z-[65] overflow-hidden lg:hidden"
      style={{
        top: open ? 0 : rect.top,
        left: open ? 0 : rect.left,
        width: open ? '100vw' : rect.width,
        height: open ? '100dvh' : rect.height,
        borderRadius: open ? 0 : 24,
        transition: 'all 700ms cubic-bezier(0.7, 0, 0.3, 1)',
        background: game ? `linear-gradient(135deg, ${game.from}, ${game.to})` : flight.color,
      }}
    >
      <div className="absolute inset-0" style={{ transform: open ? 'scale(1.5) rotate(-6deg)' : 'none', transition: 'transform 900ms cubic-bezier(0.64, 0, 0.78, 0)' }}>
        {art && <WorldArtSurface art={art} scrim="tile" width={1200} sizes="100vw" priority />}
      </div>
      <div className="absolute top-1/2 left-1/2 aspect-square w-[130vmax] -translate-x-1/2 -translate-y-1/2">
        <div className="gs-vortex gs-vortex-fast absolute inset-0" style={{ ['--gs-vortex' as string]: flight.accent }} />
      </div>
    </div>
  )
}

/** The glass name plate under a gate. */
function GatePlate({ game, active, style }: { game: Game; active: boolean; style?: CSSProperties }) {
  return (
    <span
      className={cn(
        'gs-glass absolute left-1/2 flex w-max max-w-[92%] -translate-x-1/2 -translate-y-1/2 items-center gap-3 rounded-2xl px-4 py-2.5 transition-all duration-300',
        active ? 'scale-[1.04]' : 'scale-100',
      )}
      style={{ ...style, boxShadow: active ? `0 0 0 1px color-mix(in oklab, ${game.accent} 55%, transparent), 0 18px 60px -12px color-mix(in oklab, ${game.accent} 60%, transparent)` : undefined }}
    >
      <span className="flex flex-col text-left">
        <span className="text-[15px] leading-tight font-semibold text-white xl:text-[17px]">{game.shortName}</span>
        <span className="num mt-0.5 flex items-center gap-2 text-[11.5px] text-white/70">
          {formatNumber(game.serversCount)} {plural(game.serversCount, ['сервер', 'сервера', 'серверов'])}
          {game.playersOnline > 0 && (
            <span className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-signal-400" />
              {formatCompact(game.playersOnline)}
            </span>
          )}
        </span>
      </span>
      <ArrowRight size={16} className={cn('text-white/80 transition-transform duration-300', active && 'translate-x-0.5')} />
    </span>
  )
}

/** The central glass console: one line, search, shortcuts. */
function GlassConsole({ players }: { players: number }) {
  return (
    <div className="gs-glass relative z-20 w-full max-w-[620px] rounded-3xl px-5 pt-5 pb-4 text-center sm:px-7">
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

/** A world as a glass-framed portal (phones and tablets). */
function GlassPortal({ game, onEnter }: { game: Game; onEnter: (event: React.MouseEvent<HTMLElement>) => void }) {
  const art = worldArt('hero', game.id)
  return (
    <Link to={`/${game.slug}`} onClick={onEnter} className="gs-glass group relative block overflow-hidden rounded-3xl p-1.5">
      <div className="relative h-[132px] overflow-hidden rounded-[20px] sm:h-[150px]" style={{ background: `linear-gradient(135deg, ${game.from}, ${game.to})` }}>
        {art && <WorldArtSurface art={art} scrim="tile" zoom width={800} sizes="(min-width: 640px) 33vw, 100vw" priority />}
        {/* a faint vortex keeps each portal alive */}
        <div aria-hidden className="pointer-events-none absolute top-1/2 right-[-18%] aspect-square w-[70%] -translate-y-1/2 opacity-40">
          <div className="gs-vortex absolute inset-0" style={{ ['--gs-vortex' as string]: game.accent }} />
        </div>
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-3.5">
          <div>
            <div className="text-[17px] font-semibold text-white">{game.shortName}</div>
            <div className="num text-[12px] text-white/70">
              {formatNumber(game.serversCount)} {plural(game.serversCount, ['сервер', 'сервера', 'серверов'])}
              {game.playersOnline > 0 && ` · ${formatCompact(game.playersOnline)} онлайн`}
            </div>
          </div>
          <span className="gs-glass flex h-9 w-9 items-center justify-center rounded-full">
            <ArrowRight size={16} className="text-white" />
          </span>
        </div>
      </div>
    </Link>
  )
}
