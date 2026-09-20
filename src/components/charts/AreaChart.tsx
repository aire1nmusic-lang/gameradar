import { useId, useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { formatCompact, formatNumber } from '@/lib/format'
import type { ChartRange } from '@/data/types'

const W = 1000

function buildPath(values: number[], height: number, max: number) {
  if (values.length < 2) return { line: '', area: '' }
  const step = W / (values.length - 1)
  const y = (v: number) => height - (v / max) * (height - 6) - 3
  let line = `M 0 ${y(values[0])}`
  for (let i = 1; i < values.length; i++) {
    const x = i * step
    const px = (i - 1) * step
    const cx = px + step / 2
    line += ` C ${cx} ${y(values[i - 1])}, ${cx} ${y(values[i])}, ${x} ${y(values[i])}`
  }
  const area = `${line} L ${W} ${height} L 0 ${height} Z`
  return { line, area }
}

function labelsFor(range: ChartRange, count: number): string[] {
  const now = new Date()
  const out: string[] = []
  const ticks = 5
  for (let i = 0; i < ticks; i++) {
    const ratio = i / (ticks - 1)
    const idxFromEnd = (1 - ratio) * (count - 1)
    if (range === '24h') {
      const d = new Date(now.getTime() - idxFromEnd * 30 * 60_000)
      out.push(`${String(d.getHours()).padStart(2, '0')}:00`)
    } else if (range === '7d') {
      const d = new Date(now.getTime() - idxFromEnd * 3 * 3_600_000)
      out.push(['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'][d.getDay()])
    } else {
      const d = new Date(now.getTime() - idxFromEnd * 12 * 3_600_000)
      out.push(`${d.getDate()}.${String(d.getMonth() + 1).padStart(2, '0')}`)
    }
  }
  return out
}

function pointLabel(range: ChartRange, index: number, count: number): string {
  const now = Date.now()
  const stepMs = range === '24h' ? 30 * 60_000 : range === '7d' ? 3 * 3_600_000 : 12 * 3_600_000
  const d = new Date(now - (count - 1 - index) * stepMs)
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  if (range === '24h') return time
  const date = `${d.getDate()}.${String(d.getMonth() + 1).padStart(2, '0')}`
  return range === '7d' ? `${date}, ${time}` : date
}

export function AreaChart({
  data,
  range,
  height = 220,
  accent = 'var(--color-signal-400)',
  className,
}: {
  data: number[]
  range: ChartRange
  height?: number
  accent?: string
  className?: string
}) {
  const uid = useId().replace(/:/g, '')
  const [hover, setHover] = useState<number | null>(null)

  const max = useMemo(() => Math.max(1, ...data) * 1.12, [data])
  const { line, area } = useMemo(() => buildPath(data, height, max), [data, height, max])
  const labels = useMemo(() => labelsFor(range, data.length), [range, data.length])

  if (data.length < 2) return null

  const step = W / (data.length - 1)
  const hoverX = hover !== null ? (hover * step) / W : 0
  const hoverY = hover !== null ? 1 - data[hover] / max : 0

  return (
    <div className={cn('select-none', className)}>
      <div
        className="relative"
        style={{ height }}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect()
          const ratio = (event.clientX - rect.left) / rect.width
          setHover(Math.max(0, Math.min(data.length - 1, Math.round(ratio * (data.length - 1)))))
        }}
        onTouchMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect()
          const ratio = (event.touches[0].clientX - rect.left) / rect.width
          setHover(Math.max(0, Math.min(data.length - 1, Math.round(ratio * (data.length - 1)))))
        }}
      >
        {/* grid */}
        <div className="pointer-events-none absolute inset-0 flex flex-col justify-between">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="h-px flex-1 bg-white/[0.045]" />
              <span className="num w-10 text-right text-[10.5px] text-ink-500">
                {formatCompact(Math.round((max * (3 - i)) / 3))}
              </span>
            </div>
          ))}
        </div>

        <svg
          viewBox={`0 0 ${W} ${height}`}
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full pr-14"
          aria-hidden
        >
          <defs>
            <linearGradient id={`fill-${uid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={accent} stopOpacity="0.32" />
              <stop offset="55%" stopColor={accent} stopOpacity="0.08" />
              <stop offset="100%" stopColor={accent} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={area} fill={`url(#fill-${uid})`} />
          <path
            d={line}
            fill="none"
            stroke={accent}
            strokeWidth="2"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        {hover !== null && (
          <div className="pointer-events-none absolute inset-0 pr-14">
            <div
              className="absolute top-0 bottom-0 w-px bg-white/14"
              style={{ left: `${hoverX * 100}%` }}
            />
            <div
              className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-ink-950"
              style={{ left: `${hoverX * 100}%`, top: `${hoverY * 100}%`, background: accent }}
            />
            <div
              className="surface-raised absolute -translate-x-1/2 -translate-y-[calc(100%+14px)] rounded-md px-2.5 py-1.5 text-center whitespace-nowrap"
              style={{
                left: `${Math.min(88, Math.max(12, hoverX * 100))}%`,
                top: `${hoverY * 100}%`,
              }}
            >
              <div className="num text-[13px] font-medium text-ink-50">{formatNumber(data[hover])}</div>
              <div className="font-mono text-[10px] text-ink-400">{pointLabel(range, hover, data.length)}</div>
            </div>
          </div>
        )}
      </div>

      <div className="mt-2 flex justify-between pr-14 font-mono text-[10.5px] text-ink-500">
        {labels.map((label, i) => (
          <span key={i}>{i === labels.length - 1 && range === '24h' ? 'сейчас' : label}</span>
        ))}
      </div>
    </div>
  )
}

export function Sparkline({
  data,
  width = 72,
  height = 22,
  accent = 'var(--color-signal-400)',
  className,
}: {
  data: number[]
  width?: number
  height?: number
  accent?: string
  className?: string
}) {
  const uid = useId().replace(/:/g, '')
  if (data.length < 2) return <div style={{ width, height }} className={className} />
  const max = Math.max(...data) || 1
  const min = Math.min(...data)
  const span = Math.max(1, max - min)
  const step = width / (data.length - 1)
  const y = (v: number) => height - 2 - ((v - min) / span) * (height - 4)
  let d = `M 0 ${y(data[0])}`
  data.forEach((v, i) => {
    if (i === 0) return
    d += ` L ${i * step} ${y(v)}`
  })

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={className} aria-hidden>
      <defs>
        <linearGradient id={`spark-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={accent} stopOpacity="0.28" />
          <stop offset="100%" stopColor={accent} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${d} L ${width} ${height} L 0 ${height} Z`} fill={`url(#spark-${uid})`} />
      <path d={d} fill="none" stroke={accent} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function BarSeries({
  data,
  height = 120,
  accent = 'var(--color-ink-200)',
  highlightLast = true,
  className,
}: {
  data: number[]
  height?: number
  accent?: string
  highlightLast?: boolean
  className?: string
}) {
  const [hover, setHover] = useState<number | null>(null)
  const max = Math.max(...data, 1)
  return (
    <div className={cn('relative flex items-end gap-[3px]', className)} style={{ height }}>
      {data.map((value, i) => {
        const isLast = highlightLast && i === data.length - 1
        const active = hover === i
        return (
          <div
            key={i}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            className="group relative flex-1 cursor-default rounded-t-[3px] transition-colors duration-150"
            style={{
              height: `${Math.max(4, (value / max) * 100)}%`,
              background: active || isLast ? accent : 'rgba(255,255,255,0.10)',
            }}
          >
            {active && (
              <div className="surface-raised pointer-events-none absolute bottom-[calc(100%+8px)] left-1/2 z-10 -translate-x-1/2 rounded-md px-2 py-1 whitespace-nowrap">
                <span className="num text-[12px] text-ink-50">{formatNumber(value)}</span>
                <span className="ml-1 text-[10.5px] text-ink-400">
                  {i === data.length - 1 ? 'сегодня' : `${data.length - 1 - i} дн. назад`}
                </span>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
