import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  size = 'md',
  className,
}: {
  value: T
  onChange: (value: T) => void
  options: Array<{ value: T; label: ReactNode }>
  size?: 'sm' | 'md'
  className?: string
}) {
  return (
    <div
      className={cn(
        'inline-flex items-center gap-1 rounded-md border border-white/7 bg-white/[0.03] p-1',
        className,
      )}
    >
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={cn(
              'rounded-[6px] font-medium transition-all duration-200',
              size === 'sm' ? 'px-2.5 py-1 text-[12px]' : 'px-3 py-1.5 text-[13px]',
              active
                ? 'bg-white/10 text-ink-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]'
                : 'text-ink-400 hover:text-ink-100',
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

export function Checkbox({
  checked,
  onChange,
  label,
  hint,
  count,
  className,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: ReactNode
  hint?: string
  count?: number
  className?: string
}) {
  return (
    <label
      className={cn(
        'group flex cursor-pointer items-center gap-3 rounded-md px-2 py-[7px] transition-colors hover:bg-white/[0.04]',
        className,
      )}
    >
      <span
        className={cn(
          'grid h-[18px] w-[18px] shrink-0 place-items-center rounded-[5px] border transition-all duration-200',
          checked
            ? 'border-signal-400/60 bg-signal-500/25 text-signal-200'
            : 'border-white/14 bg-white/[0.03] text-transparent group-hover:border-white/26',
        )}
      >
        <Check size={12} strokeWidth={3} />
      </span>
      <input
        type="checkbox"
        className="sr-only"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13.5px] text-ink-100">{label}</span>
        {hint && <span className="block text-[12px] text-ink-400">{hint}</span>}
      </span>
      {count !== undefined && <span className="num shrink-0 text-[12px] text-ink-500">{count}</span>}
    </label>
  )
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: ReactNode
  description?: string
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 py-1">
      <span className="min-w-0">
        <span className="block text-[13.5px] text-ink-100">{label}</span>
        {description && <span className="mt-0.5 block text-[12px] text-ink-400">{description}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative mt-0.5 h-[22px] w-[38px] shrink-0 rounded-full border transition-colors duration-200',
          checked ? 'border-signal-400/50 bg-signal-500/35' : 'border-white/12 bg-white/6',
        )}
      >
        <span
          className={cn(
            'absolute top-[2px] h-[16px] w-[16px] rounded-full bg-white transition-transform duration-200',
            checked ? 'translate-x-[19px]' : 'translate-x-[2px]',
          )}
        />
      </button>
    </label>
  )
}

export function ChipToggle({
  active,
  onClick,
  children,
  accent,
  className,
}: {
  active?: boolean
  onClick?: () => void
  children: ReactNode
  accent?: string
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-2 rounded-full border px-3 py-[6px] text-[13px] transition-all duration-200',
        active
          ? 'border-white/22 bg-white/10 text-ink-50'
          : 'border-white/8 bg-white/[0.03] text-ink-300 hover:border-white/16 hover:text-ink-100',
        className,
      )}
    >
      {accent && <span className="h-1.5 w-1.5 rounded-full" style={{ background: accent }} />}
      {children}
    </button>
  )
}

export function Field({
  label,
  hint,
  required,
  children,
  className,
}: {
  label: string
  hint?: string
  required?: boolean
  children: ReactNode
  className?: string
}) {
  return (
    <label className={cn('block', className)}>
      <span className="mb-1.5 flex items-center gap-1 text-[13px] font-medium text-ink-200">
        {label}
        {required && <span className="text-signal-400">*</span>}
      </span>
      {children}
      {hint && <span className="mt-1.5 block text-[12px] text-ink-400">{hint}</span>}
    </label>
  )
}

const inputClasses =
  'w-full rounded-md border border-white/9 bg-ink-900/70 px-3.5 text-[14px] text-ink-50 placeholder:text-ink-500 transition-colors duration-200 hover:border-white/16 focus:border-signal-400/50 focus:outline-none focus:ring-2 focus:ring-signal-400/15'

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(inputClasses, 'h-11', className)} {...rest} />
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(inputClasses, 'min-h-[104px] py-3 leading-relaxed', className)} {...rest} />
}

export function Select({
  value,
  onChange,
  options,
  className,
}: {
  value: string
  onChange: (value: string) => void
  options: Array<{ value: string; label: string }>
  className?: string
}) {
  return (
    <div className={cn('relative', className)}>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={cn(inputClasses, 'h-11 appearance-none pr-9')}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value} className="bg-ink-900">
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-400" />
    </div>
  )
}

export function RangeSlider({
  value,
  onChange,
  min = 0,
  max = 3000,
  step = 50,
  label = 'Минимальный онлайн',
  formatValue,
}: {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  label?: string
  formatValue?: (value: number) => string
}) {
  const percent = ((value - min) / (max - min)) * 100
  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-[12.5px]">
        <span className="text-ink-400">{label}</span>
        <span className="num font-medium text-ink-100">{formatValue ? formatValue(value) : value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full outline-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-ink-950 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-[0_0_0_1px_rgba(255,255,255,0.2)]"
        style={{
          background: `linear-gradient(90deg, var(--color-signal-500) ${percent}%, rgba(255,255,255,0.08) ${percent}%)`,
        }}
      />
    </div>
  )
}
