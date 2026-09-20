import { useMemo } from 'react'
import { cn, rng } from '@/lib/utils'
import { useGameTheme } from '@/theme'
import type { ShotKind } from '@/data/media'

/**
 * Procedural "screenshot".
 *
 * Every card art and every gallery shot in the prototype is generated from a
 * seed and the active theme — so each game world looks like itself, nothing
 * has to be licensed, and no generated image is passed off as a real capture.
 */

function ridge(seed: number, steps: number, base: number, amplitude: number, blocky: boolean): string {
  const random = rng(seed)
  const points: Array<[number, number]> = []
  for (let i = 0; i <= steps; i++) {
    const x = (i / steps) * 400
    const y = base - (random() - 0.35) * amplitude
    points.push([x, y])
  }
  let d = `M0 225 L0 ${points[0][1].toFixed(1)}`
  points.forEach(([x, y], index) => {
    if (index === 0) return
    const [px, py] = points[index - 1]
    if (blocky) {
      d += ` L${x.toFixed(1)} ${py.toFixed(1)} L${x.toFixed(1)} ${y.toFixed(1)}`
    } else {
      const cx = (px + x) / 2
      d += ` Q${cx.toFixed(1)} ${py.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)}`
    }
  })
  return `${d} L400 225 Z`
}

export function ProceduralShot({
  seed,
  kind = 'landscape',
  className,
  detail = true,
}: {
  seed: number
  kind?: ShotKind
  className?: string
  detail?: boolean
}) {
  const theme = useGameTheme()
  const blocky = theme.decor.pattern === 'voxel'

  const art = useMemo(() => {
    const random = rng(seed)
    return {
      sunX: 60 + random() * 280,
      sunY: 40 + random() * 40,
      sunR: 16 + random() * 16,
      far: ridge(seed + 1, blocky ? 10 : 7, 150, 60, blocky),
      mid: ridge(seed + 2, blocky ? 12 : 8, 178, 46, blocky),
      near: ridge(seed + 3, blocky ? 14 : 9, 205, 32, blocky),
      streaks: Array.from({ length: 5 }, (_, i) => ({
        x: 30 + random() * 340,
        y: 30 + random() * 120,
        len: 20 + random() * 60,
        rot: -30 - random() * 30,
        key: i,
      })),
      windows: Array.from({ length: 9 }, (_, i) => ({
        x: 40 + (i % 3) * 120 + random() * 12,
        y: 60 + Math.floor(i / 3) * 48,
        w: 46 + random() * 26,
        h: 30 + random() * 12,
        key: i,
      })),
      markers: Array.from({ length: 4 }, (_, i) => ({
        x: 60 + random() * 280,
        y: 50 + random() * 130,
        key: i,
      })),
    }
  }, [seed, blocky])

  const { colors } = theme
  const gid = `shot-${seed.toString(36)}`

  return (
    <svg
      viewBox="0 0 400 225"
      preserveAspectRatio="xMidYMid slice"
      className={cn('block h-full w-full', className)}
      aria-hidden
    >
      <defs>
        <linearGradient id={`${gid}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={colors.primary} stopOpacity="0.38" />
          <stop offset="45%" stopColor={colors.secondary} stopOpacity="0.16" />
          <stop offset="100%" stopColor={colors.bgDeep} stopOpacity="1" />
        </linearGradient>
        <radialGradient id={`${gid}-sun`}>
          <stop offset="0%" stopColor={colors.accent} stopOpacity="0.95" />
          <stop offset="60%" stopColor={colors.primary} stopOpacity="0.45" />
          <stop offset="100%" stopColor={colors.primary} stopOpacity="0" />
        </radialGradient>
      </defs>

      <rect width="400" height="225" fill={colors.bgDeep} />
      <rect width="400" height="225" fill={`url(#${gid}-sky)`} />

      {kind !== 'interior' && (
        <circle cx={art.sunX} cy={art.sunY} r={art.sunR * 2.4} fill={`url(#${gid}-sun)`} />
      )}

      {kind === 'map' ? (
        <g>
          <g opacity="0.35" stroke={colors.primary} strokeWidth="0.6">
            {Array.from({ length: 9 }, (_, i) => (
              <line key={`v${i}`} x1={i * 50} y1="0" x2={i * 50} y2="225" />
            ))}
            {Array.from({ length: 6 }, (_, i) => (
              <line key={`h${i}`} x1="0" y1={i * 45} x2="400" y2={i * 45} />
            ))}
          </g>
          <path
            d="M40 190 Q120 140 170 150 T290 90 T370 60"
            fill="none"
            stroke={colors.accent}
            strokeWidth="2"
            strokeDasharray="6 5"
            opacity="0.8"
          />
          {art.markers.map((marker) => (
            <g key={marker.key}>
              <circle cx={marker.x} cy={marker.y} r="4" fill={colors.primary} opacity="0.9" />
              <circle cx={marker.x} cy={marker.y} r="9" fill="none" stroke={colors.primary} strokeWidth="1" opacity="0.5" />
            </g>
          ))}
        </g>
      ) : kind === 'interior' ? (
        <g>
          <rect width="400" height="225" fill={colors.bg} opacity="0.55" />
          {art.windows.map((window) => (
            <g key={window.key}>
              <rect
                x={window.x}
                y={window.y}
                width={window.w}
                height={window.h}
                rx={blocky ? 0 : 4}
                fill={colors.primary}
                opacity="0.18"
              />
              <rect
                x={window.x}
                y={window.y}
                width={window.w}
                height={window.h}
                rx={blocky ? 0 : 4}
                fill="none"
                stroke={colors.primary}
                strokeWidth="1"
                opacity="0.45"
              />
            </g>
          ))}
          <rect x="0" y="186" width="400" height="39" fill={colors.bgDeep} opacity="0.9" />
        </g>
      ) : (
        <g>
          <path d={art.far} fill={colors.secondary} opacity="0.3" />
          <path d={art.mid} fill={colors.bg} opacity="0.85" />
          <path d={art.mid} fill="none" stroke={colors.primary} strokeWidth="0.8" opacity="0.35" />
          <path d={art.near} fill={colors.bgDeep} opacity="0.96" />
        </g>
      )}

      {kind === 'combat' && detail && (
        <g stroke={colors.accent} strokeWidth="1.6" strokeLinecap="round" opacity="0.7">
          {art.streaks.map((streak) => (
            <line
              key={streak.key}
              x1={streak.x}
              y1={streak.y}
              x2={streak.x + Math.cos((streak.rot * Math.PI) / 180) * streak.len}
              y2={streak.y + Math.sin((streak.rot * Math.PI) / 180) * streak.len}
            />
          ))}
        </g>
      )}

      {detail && blocky && (
        <g opacity="0.28" fill={colors.primary}>
          {Array.from({ length: 12 }, (_, i) => (
            <rect key={i} x={(i * 37) % 390} y={200 - (i % 4) * 9} width="9" height="9" />
          ))}
        </g>
      )}

      <rect width="400" height="225" fill="url(#none)" />
      <rect width="400" height="225" fill={colors.bgDeep} opacity="0.12" />
    </svg>
  )
}
