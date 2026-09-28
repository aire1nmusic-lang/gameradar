import { useEffect, useRef } from 'react'

/**
 * The teleport: a full-screen canvas drawn for `duration` ms.
 *
 *   0 – 0.38   charge: sparks in the world's colour are pulled from the whole
 *              screen into the chosen card along a tightening spiral;
 *   0.38       a shockwave ring leaves the card;
 *   0.38 – 0.9 warp: light streaks rush outwards from the card like stars at
 *              jump speed, faster and longer every frame;
 *   0.8 – 1    white flash that hands over to the world's colour.
 *
 * Additive blending ('lighter') makes overlapping sparks glow. Everything is
 * plain 2D canvas — a few hundred line segments a frame.
 */
export function TeleportFX({ x, y, color, duration, at }: { x: number; y: number; color: string; duration: number; /** development only: draw one still frame at this progress (0–1) */ at?: number }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const W = window.innerWidth
    const H = window.innerHeight
    canvas.width = W * dpr
    canvas.height = H * dpr
    ctx.scale(dpr, dpr)
    const reach = Math.hypot(Math.max(x, W - x), Math.max(y, H - y))

    // charge: sparks spiralling in
    const inward = Array.from({ length: 260 }, () => {
      const r = reach * (0.35 + Math.random() * 0.75)
      const a = Math.random() * Math.PI * 2
      return { r, a, spin: 0.018 + Math.random() * 0.03, pull: 0.035 + Math.random() * 0.05, size: 0.8 + Math.random() * 2, white: Math.random() < 0.3 }
    })
    // warp: streaks rushing out
    const outward = Array.from({ length: 340 }, () => ({
      a: Math.random() * Math.PI * 2,
      d: Math.random() * 40,
      v: 2 + Math.random() * 6,
      size: 0.5 + Math.random() * 1.6,
      white: Math.random() < 0.55,
    }))

    const start = performance.now()
    let frame = 0
    const draw = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      // a clean frame each time: the card growing underneath must stay visible; tails are drawn explicitly
      ctx.globalCompositeOperation = 'source-over'
      ctx.clearRect(0, 0, W, H)
      ctx.globalCompositeOperation = 'lighter'
      ctx.lineCap = 'round'

      if (t < 0.42) {
        const k = t / 0.38
        for (const p of inward) {
          p.a += p.spin * (1 + k * 3)
          p.r *= 1 - p.pull * (0.6 + k * 1.6)
          const nx = x + Math.cos(p.a) * p.r
          const ny = y + Math.sin(p.a) * p.r
          ctx.strokeStyle = p.white ? 'rgba(255,255,255,0.9)' : color
          ctx.lineWidth = p.size
          // tail: a stretch of the spiral just behind the spark
          const tr = p.r * (1 + 0.12 + k * 0.25)
          const ta = p.a - p.spin * (4 + k * 6)
          ctx.beginPath()
          ctx.moveTo(x + Math.cos(ta) * tr, y + Math.sin(ta) * tr)
          ctx.lineTo(nx, ny)
          ctx.stroke()
        }
        // the card's core gathering light
        const core = ctx.createRadialGradient(x, y, 0, x, y, 40 + k * 140)
        core.addColorStop(0, `rgba(255,255,255,${0.25 + k * 0.55})`)
        core.addColorStop(0.35, color)
        core.addColorStop(1, 'transparent')
        ctx.globalAlpha = 0.35 + k * 0.5
        ctx.fillStyle = core
        ctx.fillRect(0, 0, W, H)
        ctx.globalAlpha = 1
      }

      if (t >= 0.38) {
        const k = (t - 0.38) / 0.62
        // shockwave
        if (k < 0.45) {
          const ring = (k / 0.45) * reach * 1.1
          ctx.strokeStyle = `rgba(255,255,255,${0.7 * (1 - k / 0.45)})`
          ctx.lineWidth = 3 + 18 * (1 - k / 0.45)
          ctx.beginPath()
          ctx.arc(x, y, ring, 0, Math.PI * 2)
          ctx.stroke()
          ctx.strokeStyle = color
          ctx.lineWidth = 2 + 10 * (1 - k / 0.45)
          ctx.beginPath()
          ctx.arc(x, y, ring * 0.93, 0, Math.PI * 2)
          ctx.stroke()
        }
        // warp streaks
        const accel = 1 + k * 9
        for (const s of outward) {
          const before = s.d
          s.d += s.v * accel * 2.2
          const len = Math.min(s.d - before + 12 * accel, reach)
          const cx = Math.cos(s.a)
          const cy = Math.sin(s.a)
          ctx.strokeStyle = s.white ? `rgba(255,255,255,${0.35 + 0.6 * Math.min(1, s.d / 300)})` : color
          ctx.lineWidth = s.size * (1 + k * 1.5)
          ctx.beginPath()
          ctx.moveTo(x + cx * (s.d - len), y + cy * (s.d - len))
          ctx.lineTo(x + cx * s.d, y + cy * s.d)
          ctx.stroke()
          if (s.d > reach) { s.d = Math.random() * 30; s.a = Math.random() * Math.PI * 2 }
        }
      }

      // flash
      if (t > 0.8) {
        ctx.globalCompositeOperation = 'source-over'
        ctx.fillStyle = `rgba(255,255,255,${Math.min(0.85, (t - 0.8) / 0.2 * 0.85)})`
        ctx.fillRect(0, 0, W, H)
      }

      if (t < 1 && at === undefined) frame = requestAnimationFrame(draw)
    }
    if (at !== undefined) {
      // a still frame: replay the frames up to `at` synchronously
      for (let ms = 0; ms <= at * duration; ms += 16.7) draw(start + ms)
      return
    }
    frame = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frame)
  }, [x, y, color, duration, at])

  return <canvas ref={ref} aria-hidden className="pointer-events-none fixed inset-0 z-[72] h-screen w-screen" />
}
