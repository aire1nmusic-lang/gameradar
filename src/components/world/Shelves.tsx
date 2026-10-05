import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { useGameTheme } from '@/theme'

export { RankMedal } from '@/components/ui/RankMedal'

/**
 * One panel of the "where to play" strip — a short ranked list, no pictures:
 * top by online, openings that are about to happen, players' choice.
 */
export function RankPanel({ icon, title, hint, to, toLabel = 'Все', className, plainMobile = false, children }: {
  icon?: ReactNode
  title: string
  hint?: string
  to?: string
  toLabel?: string
  className?: string
  plainMobile?: boolean
  children: ReactNode
}) {
  const theme = useGameTheme()
  return (
    <section className={cn('gs-panel flex min-w-0 flex-col p-3 sm:p-4', plainMobile && 'gs-panel-mobile-plain', className)}>
      <header className="mb-2.5 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          {icon && <span className="gs-shelf-icon grid h-8 w-8 shrink-0 place-items-center rounded-lg" style={{ background: theme.colors.primarySoft, color: theme.colors.primary }}>{icon}</span>}
          <div className="min-w-0">
            <h3 className="gs-panel-title truncate text-[15px] leading-5 font-semibold" style={{ color: theme.colors.text }}>{title}</h3>
            {hint && <p className="truncate text-[11.5px] leading-4" style={{ color: theme.colors.textMuted }}>{hint}</p>}
          </div>
        </div>
        {to && (
          <Link to={to} className="inline-flex min-h-11 shrink-0 items-center gap-1 text-[12.5px] transition-colors hover:text-white" style={{ color: theme.colors.textMuted }}>
            {toLabel} <ArrowRight size={13} />
          </Link>
        )}
      </header>
      <div className="flex-1 space-y-2">{children}</div>
    </section>
  )
}

/** Shown instead of a list that has nothing real to put on it yet — never invented numbers. */
export function ShelfNote({ title, text }: { title: string; text: string }) {
  const theme = useGameTheme()
  return (
    <div className="flex min-h-[96px] flex-col justify-center rounded-xl border border-dashed px-4 py-3" style={{ borderColor: theme.colors.border }}>
      <div className="text-[14px] font-medium" style={{ color: theme.colors.text }}>{title}</div>
      <p className="mt-1 text-[12.5px] leading-snug" style={{ color: theme.colors.textMuted }}>{text}</p>
    </div>
  )
}
