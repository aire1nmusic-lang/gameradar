import { GsMark, GsWordmark } from './Logo'

export function LoadingScreen() {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-ink-950 overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        {Array.from({ length: 6 }).map((_, i) => (
          <span key={i} className={`absolute h-1.5 w-1.5 rounded-full bg-signal-400/60 blur-[1px] animate-float-${i + 1}`} />
        ))}
      </div>
      <div className="relative flex flex-col items-center animate-loader-enter">
        <GsMark height={120} live />
        <GsWordmark size={58} live className="mt-5" />
        <div className="mt-8 text-xs uppercase tracking-[0.2em] text-slate-400">Подготавливаем миры...</div>
      </div>
    </div>
  )
}
