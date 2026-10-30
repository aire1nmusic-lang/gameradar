import { ArrowRight, BarChart3, ShieldCheck } from 'lucide-react'
import { Container } from '@/components/layout/Container'
import { WorldArtSurface } from '@/components/media/WorldArt'
import { worldArt } from '@/data/themeMedia'
import { Button } from '@/components/ui/Button'
import { useAuth } from '@/hooks/useAuth'

/** The one owner block on the site: at the very end of the home page. */
export function OwnerBand() {
  const { privateCore, loading }=useAuth()
  if(loading)return null
  return (
    <section className="py-10 sm:py-12">
      <Container>
        <div className="surface relative overflow-hidden rounded-2xl px-6 py-8 sm:px-10 sm:py-10">
          <WorldArtSurface art={worldArt('stage')} scrim="stage" width={1600} sizes="100vw" />

          <div className="relative grid gap-6 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
            <div>
              <div className="mb-2 text-[11px] font-medium tracking-[0.14em] text-ink-400 uppercase">Владельцам серверов</div>
              <h2 className="text-[24px] leading-tight sm:text-[28px]">{privateCore?'Подтвердите права на свой сервер':'Добавьте сервер бесплатно'}</h2>
              <p className="mt-3 max-w-xl text-[14.5px] leading-relaxed text-ink-300">
                {privateCore?'Найдите свою карточку в каталоге. Приём заявок на управление откроется после подключения сервиса проверки прав.':'Размещение карточки бесплатно. Продвижение — отдельная необязательная возможность.'}
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Button to={privateCore?'/catalog':'/add-server'} variant="primary" size="lg" iconRight={<ArrowRight size={16} />}>
                  {privateCore?'Найти сервер':'Добавить сервер'}
                </Button>
                <Button to={privateCore?'/account':'/owners'} variant="outline" size="lg">
                  {privateCore?'Открыть аккаунт':'Это уже ваш сервер?'}
                </Button>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <Perk icon={<ShieldCheck size={15} className="text-signal-400" />} title="Подтверждение прав">
                Управление карточкой будет доступно после подтверждения прав на конкретный сервер.
              </Perk>
              <Perk icon={<BarChart3 size={15} className="text-ink-300" />} title={privateCore?'Правки карточки':'Статистика карточки'}>
                {privateCore?'Описание и характеристики публикуются после проверки; неполные показатели не выдумываются.':'Просмотры, переходы и позиция в каталоге по вашей игре'}
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
