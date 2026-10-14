import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLockBodyScroll } from '@/hooks/useUi'

function useEscape(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])
}

/** Mobile-first bottom sheet. Used for filters, sorting and quick actions. */
export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
  maxHeight = '86vh',
  className,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
  maxHeight?: string
  className?: string
}) {
  useLockBodyScroll(open)
  useEscape(open, onClose)
  if (!open) return null

  return createPortal(
    <div className={cn("gs-sheet fixed inset-0 z-[90]",className)} role="dialog" aria-modal="true" aria-label={title}>
      <button
        aria-label="Закрыть"
        onClick={onClose}
        className="absolute inset-0 animate-fade bg-ink-1000/70 backdrop-blur-[3px]"
      />
      <div
        className="absolute inset-x-0 bottom-0 flex animate-sheet flex-col overflow-hidden rounded-t-2xl border-t border-white/10 bg-ink-900 shadow-[0_-20px_60px_-20px_rgba(0,0,0,0.9)]"
        style={{ maxHeight }}
      >
        <div className="flex items-center justify-between border-b border-white/6 px-5 pt-3 pb-3">
          <div className="absolute inset-x-0 top-2 mx-auto h-1 w-10 rounded-full bg-white/14" />
          <h3 className="mt-2 text-[16px]">{title}</h3>
          <button
            onClick={onClose}
            aria-label="Закрыть"
            className="mt-2 grid h-8 w-8 place-items-center rounded-md text-ink-300 transition-colors hover:bg-white/6 hover:text-ink-50"
          >
            <X size={17} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">{children}</div>
        {footer && <div className="safe-bottom border-t border-white/6 bg-ink-850/80 px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

/** Centred dialog for desktop flows (login, promote, verify ownership). */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  width = 'max-w-md',
}: {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children?: ReactNode
  footer?: ReactNode
  width?: string
}) {
  useLockBodyScroll(open)
  useEscape(open, onClose)
  if (!open) return null

  return createPortal(
    <div className="gs-ui-modal fixed inset-0 z-[95] flex items-end justify-center p-0 sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={title}>
      <button
        aria-label="Закрыть"
        onClick={onClose}
        className="absolute inset-0 animate-fade bg-ink-1000/75 backdrop-blur-[4px]"
      />
      <div
        className={cn(
          'gs-ui-modal-panel relative isolate flex w-full max-h-[calc(100dvh-12px)] animate-pop flex-col overflow-hidden rounded-t-2xl sm:rounded-xl',
          width,
        )}
        style={{
          // Must remain fully opaque even under the global glass theme.
          // This portal is a dialog, not an ambient glass card.
          background: '#191c24',
          backgroundImage: 'none',
          opacity: 1,
          border: '1px solid rgba(255,255,255,0.24)',
          boxShadow: '0 25px 70px rgba(0,0,0,0.85)',
        }}
      >
        <div className="flex items-start justify-between gap-6 border-b border-white/6 px-6 py-5">
          <div>
            <h3 className="text-[18px]">{title}</h3>
            {description && <p className="mt-1.5 text-[13.5px] text-ink-300">{description}</p>}
          </div>
          <button
            onClick={onClose}
            aria-label="Закрыть"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-ink-300 transition-colors hover:bg-white/6 hover:text-ink-50"
          >
            <X size={17} />
          </button>
        </div>
        {children && <div className="max-h-[60vh] overflow-y-auto px-6 py-5">{children}</div>}
        {footer && <div className="safe-bottom border-t border-white/6 bg-ink-850/60 px-6 py-4">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

