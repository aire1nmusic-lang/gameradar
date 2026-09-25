import { ArrowRight, BarChart3, ShieldCheck } from 'lucide-react'
import { Container } from '@/components/layout/Container'
import { WorldArtSurface } from '@/components/media/WorldArt'
import { worldArt } from '@/data/themeMedia'
import { Button } from '@/components/ui/Button'

/** The one owner block on the site: at the very end of the home page. */
export function OwnerBand() {
  return (
    <section className="py-10 sm:py-12">
      <Container>
        <div className="surface relative overflow-hidden rounded-2xl px-6 py-8 sm:px-10 sm:py-10">
          <WorldArtSurface art={worldArt('stage')} scrim="stage" width={1600} sizes="100vw" />

          <div className="relative grid gap-6 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
            <div>
              <div className="mb-2 text-[11px] font-medium tracking-[0.14em] text-ink-400 uppercase">Владельцам серверов</div>
              <h2 className="text-[24px] leading-tight sm:text-[28px]">Добавьте сервер бесплатно</h2>
              <p className="mt-3 max-w-xl text-[14.5px] leading-relaxed text-ink-300">
                Размещение, статистика карточки и проверка онлайна не стоят ничего. Платить нужно только за продвижение — и только если вы этого захотите.
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Button to="/add-server" variant="primary" size="lg" iconRight={<ArrowRight size={16} />}>
                  Добавить сервер
                </Button>
                <Button to="/owners" variant="outline" size="lg">
                  Это уже ваш сервер?
                </Button>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <Perk icon={<ShieldCheck size={15} className="text-signal-400" />} title="Verified Online">
                Подтвердите владение и подключите независимую проверку онлайна
              </Perk>
              <Perk icon={<BarChart3 size={15} className="text-ink-300" />} title="Статистика карточки">
                Просмотры, переходы и позиция в каталоге по вашей игре
              </Perk>
            </div>
          </div>
        </div>
      </Container>
    </section>
  )
}

function Perk({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/7 bg-ink-900/70 p-4">
      <div className="flex items-center gap-2 text-[13.5px] font-medium text-ink-50">
        {icon}
        {title}
      </div>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-400">{children}</p>
    </div>
  )
}
