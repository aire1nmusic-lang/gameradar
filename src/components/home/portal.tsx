import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Game } from '@/models'
import { artSrc, worldArt } from '@/data/themeMedia'

/**
 * The passage from the hall into a world — a glass portal in the site's own language.
 *
 *   0 – 220 ms     the hall dims behind a glass scrim; the chosen card lifts with a lime rim;
 *   220 – 840      the card opens to the whole screen while its picture flows into the
 *                  world's own cover, and one glass sheen crosses it;
 *   860            the world page is mounted underneath, showing the same cover;
 *   860 – 1240     the overlay dissolves into the page.
 *
 * Rendering is a pure function of time (`render(ms)`); development builds expose it as
 * `window.__gsPortal` for scrubbing.
 */

export const PORTAL = { lift: 220, open: 620, navigate: 860, end: 1240 } as const

type Flight = { game: Game; rect: DOMRect }
type PortalApi = { flightId: string | null; enter: (game: Game, rect: DOMRect) => void; preload: (gameId: string) => void }

const PortalContext = createContext<PortalApi>({ flightId: null, enter: () => undefined, preload: () => undefined })
export const usePortalFlight = () => useContext(PortalContext)

export const cardSrc = (gameId: string, w: 480 | 960 | 1600) => `/media/hub/card-${gameId}-${w}.webp`

const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v))
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const easeOutCubic = (t: number) => 1 - (1 - t) ** 3
const easeInOutQuint = (t: number) => (t < 0.5 ? 16 * t ** 5 : 1 - (-2 * t + 2) ** 5 / 2)
const easeInOutSine = (t: number) => -(Math.cos(Math.PI * t) - 1) / 2

export const reducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

export function PortalProvider({ children }: { children: ReactNode }) {
  const [flight, setFlight] = useState<Flight | null>(null)
  const navigate = useNavigate()
  const preloaded = useRef(new Set<string>())

  const preload = useCallback((gameId: string) => {
    if (preloaded.current.has(gameId)) return
    preloaded.current.add(gameId)
    new Image().src = cardSrc(gameId, 1600)
  }, [])

  const enter = useCallback(
    (game: Game, rect: DOMRect) => {
      if (flight) return
      const to = `/${game.slug}`
      if (reducedMotion()) return navigate(to)
      preload(game.id)
      setFlight({ game, rect })
    },
    [flight, navigate, preload],
  )

  const api = useMemo(() => ({ flightId: flight?.game.id ?? null, enter, preload }), [flight, enter, preload])
  return (
    <PortalContext.Provider value={api}>
      {children}
      {flight && <PortalOverlay flight={flight} onDone={() => setFlight(null)} />}
    </PortalContext.Provider>
  )
}

/** The cover the world page opens with, so the portal lands on exactly the same picture. */
function worldCover(game: Game) {
  const narrow = window.innerWidth < 760
  if (game.id === 'lineage2') return narrow ? '/media/worlds/lineage-2/tower-v1-mobile-1080.webp' : '/media/worlds/lineage-2/tower-v1-1600.webp'
  const art = worldArt('hero', game.id)
  return art ? artSrc(art, narrow ? 960 : 1600) : cardSrc(game.id, 1600)
}

/* ── the overlay ─────────────────────────────────────────────────────────── */

function PortalOverlay({ flight, onDone }: { flight: Flight; onDone: () => void }) {
  const { game, rect } = flight
  const navigate = useNavigate()
  const root = useRef<HTMLDivElement>(null)
  const scrim = useRef<HTMLDivElement>(null)
  const frame = useRef<HTMLDivElement>(null)
  const card = useRef<HTMLImageElement>(null)
  const cover = useRef<HTMLImageElement>(null)
  const sheen = useRef<HTMLDivElement>(null)
  const rim = useRef<HTMLDivElement>(null)
  const navigated = useRef(false)
  const coverSrc = useMemo(() => worldCover(game), [game])

  useEffect(() => {
    const W = window.innerWidth
    const H = window.innerHeight

    const render = (ms: number) => {
      const c = easeOutCubic(clamp(ms / PORTAL.lift))
      const p = easeInOutQuint(clamp((ms - PORTAL.lift) / PORTAL.open))
      const swap = easeInOutSine(clamp((ms - PORTAL.lift - PORTAL.open * 0.3) / (PORTAL.open * 0.6)))
      const out = easeInOutSine(clamp((ms - PORTAL.navigate) / (PORTAL.end - PORTAL.navigate)))

      if (ms >= PORTAL.navigate && !navigated.current) {
        navigated.current = true
        navigate(`/${game.slug}`, { state: { portal: true } })
      }

      const f = frame.current!.style
      f.top = `${lerp(rect.top, 0, p)}px`
      f.left = `${lerp(rect.left, 0, p)}px`
      f.width = `${lerp(rect.width, W, p)}px`
      f.height = `${lerp(rect.height, H, p)}px`
      f.borderRadius = `${lerp(18, 0, p)}px`
      f.transform = `scale(${1 + 0.035 * c * (1 - p)})`
      f.boxShadow = `0 0 ${Math.round(46 * c * (1 - p))}px color-mix(in oklab, var(--lb-lime, #c6ff52) ${Math.round(45 * (1 - p))}%, transparent)`

      card.current!.style.opacity = String(1 - swap)
      card.current!.style.transform = `scale(${1 + 0.08 * p})`
      cover.current!.style.opacity = String(swap)
      cover.current!.style.transform = `scale(${1.1 - 0.1 * p})`
      // the world page sits its cover under a dark glass: land on the same brightness
      cover.current!.style.filter = `brightness(${1 - 0.28 * p})`

      const sh = sheen.current!.style
      sh.transform = `translateX(${lerp(-130, 130, p)}%) skewX(-18deg)`
      sh.opacity = String(0.55 * Math.sin(Math.PI * p))

      rim.current!.style.opacity = String(c * (1 - p))
      scrim.current!.style.opacity = String(c)
      root.current!.style.opacity = String(1 - out)
      if (ms >= PORTAL.end) onDone()
    }

    if (import.meta.env.DEV) (window as unknown as { __gsPortal?: (ms: number) => void }).__gsPortal = render
    render(0)
    const start = performance.now()
    let raf = 0
    const loop = (now: number) => {
      render(now - start)
      if (now - start < PORTAL.end) raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      if (import.meta.env.DEV) delete (window as unknown as { __gsPortal?: unknown }).__gsPortal
    }
    // the flight is fixed for the lifetime of the overlay
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div ref={root} aria-hidden className="pointer-events-auto fixed inset-0 z-[70] select-none">
      <div ref={scrim} className="absolute inset-0 bg-[rgba(8,10,14,0.62)] opacity-0 will-change-[opacity]" />
      <div ref={frame} className="absolute overflow-hidden [contain:strict] will-change-[top,left,width,height,transform]" style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }}>
        <img ref={cover} src={coverSrc} alt="" className="absolute inset-0 h-full w-full object-cover object-[50%_20%] opacity-0 will-change-[opacity,transform]" />
        <img ref={card} src={cardSrc(game.id, 1600)} alt="" className="absolute inset-0 h-full w-full object-cover will-change-[opacity,transform]" />
        <div ref={sheen} className="pointer-events-none absolute inset-y-0 left-1/4 w-1/2 opacity-0 [background:linear-gradient(90deg,transparent,rgba(255,255,255,0.22)_45%,rgba(214,255,125,0.18)_55%,transparent)]" />
        <div ref={rim} className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-0 shadow-[inset_0_0_0_1.5px_var(--lb-lime,#c6ff52),inset_0_0_30px_rgba(198,255,82,0.18)]" />
      </div>
    </div>
  )
}
