import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'

export function SectionHeader({
  eyebrow,
  title,
  description,
  action,
  actionTo,
  className,
  right,
}: {
  eyebrow?: ReactNode
  title: string
  description?: string
  action?: string
  actionTo?: string
  className?: string
  right?: ReactNode
}) {
  return (
    <div className={cn('mb-6 flex items-end justify-between gap-6', className)}>
      <div className="min-w-0">
        {eyebrow && (
          <div className="mb-2 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.14em] text-ink-400">
            {eyebrow}
          </div>
        )}
        <h2 className="text-[22px] leading-tight sm:text-[26px]">{title}</h2>
        {description && <p className="mt-1.5 max-w-2xl text-[14px] text-ink-300">{description}</p>}
      </div>

      <div className="flex shrink-0 items-center gap-3">
        {right}
        {action && actionTo && (
          <Link
            to={actionTo}
            className="group inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-[13px] text-ink-300 transition-colors hover:text-ink-50"
          >
            {action}
            <ArrowRight size={14} className="transition-transform duration-200 group-hover:translate-x-0.5" />
          </Link>
        )}
      </div>
    </div>
  )
}
