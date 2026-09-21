import { useState } from 'react'
import { ChevronLeft, ChevronRight, Film, ImageIcon, Play, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { mediaFor } from '@/data/media'
import type { GameServer } from '@/models'
import { ProceduralShot } from '@/components/art/ProceduralShot'
import { WorldArtSurface } from '@/components/media/WorldArt'
import { serverArt } from '@/data/themeMedia'
import { ThemedBadge, useGameTheme } from '@/theme'
import { Notice } from '@/components/ui/feedback'
import { Modal } from '@/components/ui/overlays'

/**
 * Screenshots and video for a server.
 *
 * The prototype has no real captures, so every frame is generated from the
 * server seed in the colours of its world — and the gallery says so.
 */
export function ServerMedia({ server }: { server: GameServer }) {
  const theme = useGameTheme()
  const media = mediaFor(server)
  const cover = serverArt(server)
  const [lightbox, setLightbox] = useState<number | null>(null)
  const [videoOpen, setVideoOpen] = useState(false)

  const shot = lightbox !== null ? media.shots[lightbox] : null

  return (
    <section
      className="rounded-xl border p-5 sm:p-6"
      style={{ borderColor: theme.colors.border, background: theme.colors.surface }}
    >
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h2 className="gt-display text-[18px]">Скриншоты и видео</h2>
        <ThemedBadge icon={<ImageIcon size={11} />}>
          {media.shots.length} кадров{media.video ? ' · 1 видео' : ''}
        </ThemedBadge>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr]">
        {media.video && (
          <button
            onClick={() => setVideoOpen(true)}
            className="group relative aspect-video overflow-hidden rounded-lg border text-left"
            style={{ borderColor: theme.colors.border }}
          >
            <WorldArtSurface
              art={cover}
              fallback={<ProceduralShot seed={media.video.seed} kind="combat" />}
              scrim="card"
              zoom
              width={800}
              sizes="(min-width: 1024px) 520px, 100vw"
            />

            <span className="absolute inset-0 grid place-items-center">
              <span
                className="grid h-14 w-14 place-items-center rounded-full backdrop-blur-sm transition-transform duration-200 group-hover:scale-110"
                style={{ background: theme.colors.primary, color: theme.colors.bgDeep }}
              >
                <Play size={22} fill="currentColor" />
              </span>
            </span>

            <span className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-4">
              <span className="min-w-0">
                <span className="block truncate text-[14px] font-medium" style={{ color: theme.colors.text }}>
                  {media.video.title}
                </span>
                <span className="mt-0.5 block text-[12px]" style={{ color: theme.colors.textFaint }}>
                  {media.video.author}
                </span>
              </span>
              <span
                className="num shrink-0 rounded px-1.5 py-0.5 font-mono text-[11px]"
                style={{ background: `color-mix(in oklab, ${theme.colors.bgDeep} 75%, transparent)`, color: theme.colors.textMuted }}
              >
                {media.video.durationLabel}
              </span>
            </span>
          </button>
        )}

        <div className={cn('grid gap-3', media.video ? 'grid-cols-2' : 'grid-cols-2 lg:grid-cols-4')}>
          {media.shots.map((item, index) => (
            <button
              key={item.id}
              onClick={() => setLightbox(index)}
              className="group relative aspect-video overflow-hidden rounded-lg border"
              style={{ borderColor: theme.colors.border }}
            >
              <div className="absolute inset-0 transition-transform duration-500 group-hover:scale-110">
                <ProceduralShot seed={item.seed} kind={item.kind} />
              </div>
              <div
                className="absolute inset-x-0 bottom-0 px-2.5 py-2 text-[11.5px]"
                style={{
                  background: `linear-gradient(to top, ${theme.colors.bgDeep}, transparent)`,
                  color: theme.colors.textMuted,
                }}
              >
                {item.caption}
              </div>
            </button>
          ))}
        </div>
      </div>

      <p className="mt-4 text-[12px]" style={{ color: theme.colors.textFaint }}>
        Изображения сгенерированы для прототипа в оформлении мира игры и не являются реальными снимками сервера.
      </p>

      {/* lightbox */}
      {shot && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <button
            aria-label="Закрыть"
            onClick={() => setLightbox(null)}
            className="absolute inset-0 animate-fade bg-ink-1000/85 backdrop-blur-sm"
          />
          <div className="relative w-full max-w-4xl animate-pop">
            <div className="overflow-hidden rounded-xl border" style={{ borderColor: theme.colors.borderStrong }}>
              <div className="aspect-video">
                <ProceduralShot seed={shot.seed} kind={shot.kind} />
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between gap-4">
              <div>
                <div className="text-[15px]" style={{ color: theme.colors.text }}>
                  {shot.caption}
                </div>
                <div className="font-mono text-[11.5px]" style={{ color: theme.colors.textFaint }}>
                  {server.name} · {lightbox! + 1} / {media.shots.length}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <NavButton
                  label="Предыдущий"
                  onClick={() => setLightbox((lightbox! - 1 + media.shots.length) % media.shots.length)}
                >
                  <ChevronLeft size={18} />
                </NavButton>
                <NavButton label="Следующий" onClick={() => setLightbox((lightbox! + 1) % media.shots.length)}>
                  <ChevronRight size={18} />
                </NavButton>
                <NavButton label="Закрыть" onClick={() => setLightbox(null)}>
                  <X size={18} />
                </NavButton>
              </div>
            </div>
          </div>
        </div>
      )}

      <Modal
        open={videoOpen}
        onClose={() => setVideoOpen(false)}
        title={media.video?.title ?? 'Видео'}
        description={`${server.name} · ${media.video?.durationLabel ?? ''}`}
        width="max-w-lg"
      >
        <div className="mb-4 aspect-video overflow-hidden rounded-lg">
          <ProceduralShot seed={media.video?.seed ?? 1} kind="landscape" />
        </div>
        <Notice tone="info" title="Видео не подключено">
          В прототипе нет видеохостинга. В продукте здесь будет плеер с роликом владельца сервера или записью
          трансляции открытия.
        </Notice>
      </Modal>
    </section>
  )
}

function NavButton({
  children,
  label,
  onClick,
}: {
  children: React.ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="grid h-10 w-10 place-items-center rounded-md border border-white/12 bg-white/5 text-ink-100 transition-colors hover:border-white/25 hover:bg-white/10"
    >
      {children}
    </button>
  )
}

/** Small media teaser used in the sidebar of compact layouts. */
export function MediaTeaser({ server }: { server: GameServer }) {
  const media = mediaFor(server)
  const theme = useGameTheme()
  return (
    <div className="flex gap-2">
      {media.shots.slice(0, 3).map((shot) => (
        <div
          key={shot.id}
          className="relative h-14 flex-1 overflow-hidden rounded-md border"
          style={{ borderColor: theme.colors.border }}
        >
          <ProceduralShot seed={shot.seed} kind={shot.kind} detail={false} />
        </div>
      ))}
      {media.video && (
        <div
          className="grid h-14 w-14 shrink-0 place-items-center rounded-md border"
          style={{ borderColor: theme.colors.border, color: theme.colors.textFaint }}
        >
          <Film size={16} />
        </div>
      )}
    </div>
  )
}
