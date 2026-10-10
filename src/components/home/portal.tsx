import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Game } from '@/models'

/**
 * The passage from the hall into a world.
 *
 * One clock drives everything, so the pieces stay locked together:
 *
 *   0 – 420 ms    the hall darkens and softens behind a glass scrim; light dust
 *                 drifts into the chosen card, which warms up;
 *   420 – 1240    the card opens to the whole screen on a long ease, its picture
 *                 settling in the frame; a thin anamorphic lens flare crosses the
 *                 middle and a soft bloom of the world's colour swells behind;
 *   1240          the world page is mounted underneath while the picture holds;
 *   1500 – 2350   the picture dissolves into the world page.
 *
 * No rings, no streaks, no flash: light, depth and one long move.
 * Rendering is a pure function of time (`render(ms)`), which the loop calls each
 * frame and which development builds expose as `window.__gsPortal` for scrubbing.
 */

export const PORTAL = { charge: 420, open: 820, navigate: 1240, hold: 1500, end: 2350 } as const

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

/* ── the light ───────────────────────────────────────────────────────────── */

/** A soft round glow, pre-rendered once and stamped many times. */
function glowSprite(inner: string, outer: string, size = 64) {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  grad.addColorStop(0, inner)
  grad.addColorStop(0.25, outer)
  grad.addColorStop(1, 'rgba(0,0,0,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, size, size)
  return c
}

type Mote = { a0: number; r0: number; swirl: number; size: number; delay: number; white: boolean }
type Spark = { angle: number; speed: number; size: number; life: number; white: boolean }

function createLight(canvas: HTMLCanvasElement, x: number, y: number, color: string, small: boolean) {
  const dpr = Math.min(small ? 1.5 : 2, window.devicePixelRatio || 1)
  const W = window.innerWidth
  const H = window.innerHeight
  canvas.width = Math.round(W * dpr)
  canvas.height = Math.round(H * dpr)
  const ctx = canvas.getContext('2d')!
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  const reach = Math.hypot(Math.max(x, W - x), Math.max(y, H - y))
  const tint = glowSprite('rgba(255,255,255,1)', color)
  const white = glowSprite('rgba(255,255,255,1)', 'rgba(255,255,255,0.55)')

  const rnd = (() => {
    let s = 0x9e3779b9
    return () => ((s = (Math.imul(s ^ (s >>> 15), 2246822507) + 0x6d2b79f5) >>> 0) / 4294967296)
  })()
  const motes: Mote[] = Array.from({ length: small ? 110 : 260 }, () => ({
    a0: rnd() * Math.PI * 2,
    r0: reach * (0.18 + rnd() * 0.7),
    swirl: (rnd() > 0.5 ? 1 : -1) * (0.5 + rnd() * 1.1),
    size: 5 + rnd() * 15,
    delay: rnd() * 0.3,
    white: rnd() < 0.35,
  }))
  const sparks: Spark[] = Array.from({ length: small ? 60 : 150 }, () => ({
    angle: rnd() * Math.PI * 2,
    speed: 180 + rnd() * 760,
    size: 4 + rnd() * 11,
    life: 650 + rnd() * 700,
    white: rnd() < 0.45,
  }))

  function draw(ms: number) {
    ctx.clearRect(0, 0, W, H)
    if (ms > PORTAL.navigate + 600) return
    ctx.globalCompositeOperation = 'lighter'

    // bloom of the world's colour swelling from the card
    const bp = clamp((ms - PORTAL.charge * 0.7) / 900)
    if (bp > 0) {
      const strength = Math.sin(Math.PI * bp) ** 1.4
      const radius = 160 + reach * 0.85 * easeOutCubic(bp)
      const g = ctx.createRadialGradient(x, y, 0, x, y, radius)
      g.addColorStop(0, `rgba(255,255,255,${0.42 * strength})`)
      g.addColorStop(0.25, color)
      g.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.globalAlpha = 0.5 * strength
      ctx.fillStyle = g
      ctx.fillRect(0, 0, W, H)
      ctx.globalAlpha = 1
    }

    // dust drifting into the card
    if (ms < PORTAL.charge + 160) {
      for (const m of motes) {
        const q = clamp((ms / PORTAL.charge - m.delay) / (1 - m.delay))
        if (q <= 0) continue
        const e = q ** 2.3
        const r = m.r0 * (1 - e)
        const a = m.a0 + m.swirl * e
        const fade = Math.min(1, q * 5) * (1 - clamp((q - 0.86) / 0.14))
        const size = m.size * (1 - 0.55 * e)
        ctx.globalAlpha = 0.85 * fade
        ctx.drawImage(m.white ? white : tint, x + Math.cos(a) * r - size / 2, y + Math.sin(a) * r - size / 2, size, size)
      }
      ctx.globalAlpha = 1
    }

    // a low breath of sparks as the card opens
    const t0 = PORTAL.charge
    if (ms > t0) {
      for (const s of sparks) {
        const tau = ms - t0
        if (tau > s.life) continue
        const T = 380
        const dist = (s.speed * T * (1 - Math.exp(-tau / T))) / 1000
        const fade = (1 - tau / s.life) ** 1.6
        ctx.globalAlpha = 0.9 * fade
        const size = s.size * (0.6 + 0.4 * fade)
        ctx.drawImage(s.white ? white : tint, x + Math.cos(s.angle) * dist - size / 2, y + Math.sin(s.angle) * dist - size / 2, size, size)
      }
      ctx.globalAlpha = 1
    }

    // anamorphic lens flare: a thin horizontal line of light through the card
    const fp = clamp((ms - PORTAL.charge * 0.85) / 720)
    if (fp > 0 && fp < 1) {
      const f = Math.sin(Math.PI * fp) ** 1.6
      const len = W * 0.5 * (0.2 + 0.8 * easeOutCubic(fp))
      const line = ctx.createLinearGradient(x - len, 0, x + len, 0)
      line.addColorStop(0, 'rgba(255,255,255,0)')
      line.addColorStop(0.5, `rgba(255,255,255,${0.8 * f})`)
      line.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = line
      ctx.fillRect(x - len, y - 1.2, len * 2, 2.4)
      const halo = ctx.createLinearGradient(x - len, 0, x + len, 0)
      halo.addColorStop(0, 'rgba(0,0,0,0)')
      halo.addColorStop(0.5, color)
      halo.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.globalAlpha = 0.18 * f
      ctx.fillStyle = halo
      ctx.fillRect(x - len, y - 16 * f, len * 2, 32 * f)
      ctx.globalAlpha = 1
    }
    ctx.globalCompositeOperation = 'source-over'
  }
  return { draw }
}

/* ── the overlay ─────────────────────────────────────────────────────────── */

function PortalOverlay({ flight, onDone }: { flight: Flight; onDone: () => void }) {
  const { game, rect } = flight
  const navigate = useNavigate()
  const root = useRef<HTMLDivElement>(null)
  const scrim = useRef<HTMLDivElement>(null)
  const frame = useRef<HTMLDivElement>(null)
  const image = useRef<HTMLImageElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const rim = useRef<HTMLDivElement>(null)
  const navigated = useRef(false)

  useEffect(() => {
    const light = createLight(canvas.current!, rect.left + rect.width / 2, rect.top + rect.height / 2, game.accent, window.innerWidth < 900)
    const W = window.innerWidth
    const H = window.innerHeight

    const render = (ms: number) => {
      // charge: 0 → 1 over the first phase, then stays
      const c = easeInOutSine(clamp(ms / PORTAL.charge))
      // opening: the long move
      const p = easeInOutQuint(clamp((ms - PORTAL.charge) / PORTAL.open))
      const out = ms > PORTAL.hold ? easeInOutSine(clamp((ms - PORTAL.hold) / (PORTAL.end - PORTAL.hold))) : 0

      if (ms >= PORTAL.navigate && !navigated.current) {
        navigated.current = true
        navigate(`/${game.slug}`, { state: { portal: true } })
      }

      const f = frame.current!.style
      f.top = `${lerp(rect.top, 0, p)}px`
      f.left = `${lerp(rect.left, 0, p)}px`
      f.width = `${lerp(rect.width, W, p)}px`
      f.height = `${lerp(rect.height, H, p)}px`
      f.borderRadius = `${lerp(14, 0, p)}px`
      f.boxShadow = `0 0 ${lerp(30, 140, c)}px ${lerp(0, 24, c)}px color-mix(in oklab, ${game.accent} ${Math.round(55 * (1 - p))}%, transparent)`

      const i = image.current!.style
      i.transform = `scale(${1 + 0.16 * p})`
      i.filter = `brightness(${1 + 0.16 * c - 0.08 * p}) saturate(${1 + 0.1 * c})`

      // a fine rim of light that thins out as the card becomes the screen
      rim.current!.style.opacity = String(0.9 * (1 - p))

      // The blur is fixed and only its opacity moves: re-blurring the page every frame stalled phones.
      scrim.current!.style.opacity = String(c)

      root.current!.style.opacity = String(1 - out)
      light.draw(ms)
      if (ms >= PORTAL.end) onDone()
    }

    if (import.meta.env.DEV) (window as unknown as { __gsPortal?: (ms: number) => void }).__gsPortal = render
    render(0)
    const start = performance.now()
    let raf = 0
    const loop = (now: number) => {
      // development only: `window.__gsFreeze = true` hands the clock to `window.__gsPortal(ms)`
      if (!(import.meta.env.DEV && (window as unknown as { __gsFreeze?: boolean }).__gsFreeze)) render(now - start)
      if (now - start < PORTAL.end || (import.meta.env.DEV && (window as unknown as { __gsFreeze?: boolean }).__gsFreeze)) raf = requestAnimationFrame(loop)
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
      <div ref={scrim} className="absolute inset-0 bg-[rgba(3,4,8,0.5)] opacity-0 backdrop-blur-[9px] will-change-[opacity]" />
      <div ref={frame} className="absolute overflow-hidden [contain:strict] will-change-[top,left,width,height]" style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }}>
        <img ref={image} src={cardSrc(game.id, 1600)} alt="" className="absolute inset-0 h-full w-full object-cover will-change-transform" />
        <div ref={rim} className="pointer-events-none absolute inset-0 rounded-[inherit] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.55),inset_0_0_38px_rgba(255,255,255,0.14)]" />
      </div>
      <canvas ref={canvas} className="pointer-events-none absolute inset-0 h-full w-full" />
    </div>
  )
}
