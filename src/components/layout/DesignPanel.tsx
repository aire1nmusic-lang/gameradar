import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Paintbrush, RotateCcw, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Segmented } from '@/components/ui/controls'
import { APPEARANCE_OPTIONS, useAppearance, type Appearance } from '@/theme/appearance'

const GROUPS: Array<{ key: keyof Appearance; title: string }> = [
  { key: 'surface', title: 'Фон и тема' },
  { key: 'hero', title: 'Шапка страниц игр' },
  { key: 'motion', title: 'Анимации прокрутки' },
  { key: 'icons', title: 'Иконки серверов без логотипа' },
  { key: 'logo', title: 'Логотип' },
]

/** Every variant switch, with the current option explained under it. */
export function AppearanceControls({ className }: { className?: string }) {
  const { appearance, set } = useAppearance()
  return (
    <div className={cn('space-y-4', className)}>
      {GROUPS.map(({ key, title }) => {
        const options = APPEARANCE_OPTIONS[key]
        const current = options.find((option) => option.value === appearance[key])
        return (
          <div key={key}>
            <div className="mb-1.5 text-[12px] font-medium tracking-[0.04em] text-ink-300 uppercase">{title}</div>
            <Segmented
              size="sm"
              value={appearance[key] as string}
              onChange={(value) => set(key, value as never)}
              options={options.map((option) => ({ value: option.value as string, label: option.label }))}
              className="flex-wrap"
            />
            <div className="mt-1 text-[12px] text-ink-400">{current?.hint}</div>
          </div>
        )
      })}
    </div>
  )
}

/**
 * The owner's variant switcher, floating over every page once /design has
 * been opened in this browser. Visitors never see it.
 */
export function DesignPanel() {
  const { designer, setDesignerMode, reset } = useAppearance()
  const [open, setOpen] = useState(false)
  if (!designer) return null

  return (
    <div className="fixed bottom-[76px] left-3 z-[60] md:bottom-4 md:left-4">
      {open ? (
        <div className="w-[min(340px,calc(100vw-24px))] rounded-xl border border-white/12 bg-ink-900/97 p-4 shadow-2xl backdrop-blur-md">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="text-[14px] font-semibold text-ink-50">Вид сайта</div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Свернуть" className="grid h-8 w-8 place-items-center rounded-md text-ink-300 hover:bg-white/8 hover:text-ink-50">
              <X size={16} />
            </button>
          </div>
          <div className="max-h-[60vh] overflow-y-auto pr-1">
            <AppearanceControls />
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-white/8 pt-3 text-[12.5px]">
            <button type="button" onClick={reset} className="inline-flex items-center gap-1.5 rounded-md border border-white/10 px-2.5 py-1.5 text-ink-200 hover:border-white/20">
              <RotateCcw size={13} /> Как у всех
            </button>
            <Link to="/design" className="rounded-md px-2.5 py-1.5 text-ink-300 hover:text-ink-50">Все варианты</Link>
            <button type="button" onClick={() => setDesignerMode(false)} className="ml-auto rounded-md px-2.5 py-1.5 text-ink-400 hover:text-ink-100">
              Убрать панель
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex h-11 items-center gap-2 rounded-full border border-white/14 bg-ink-900/95 px-4 text-[13.5px] font-medium text-ink-50 shadow-xl backdrop-blur-md hover:border-white/25"
        >
          <Paintbrush size={15} /> Вид
        </button>
      )}
    </div>
  )
}
