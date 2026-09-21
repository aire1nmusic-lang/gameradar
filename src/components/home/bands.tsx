import { ArrowRight, BarChart3, BadgeCheck, Radar, Repeat2, ShieldCheck } from 'lucide-react'
import { Container } from '@/components/layout/Container'
import { WorldArtSurface } from '@/components/media/WorldArt'
import { worldArt } from '@/data/themeMedia'
import { Button } from '@/components/ui/Button'
import { StatusBadge, STATUS_META } from '@/components/trust/status'
import type { OnlineStatus } from '@/models'
import { useTicker } from '@/hooks/useUi'
import { formatNumber } from '@/lib/format'

const STEPS = [
  {
    icon: <Radar size={17} />,
    title: 'Прямой запрос к серверу',
    body: 'GameRadar опрашивает сервер по игровому протоколу, через официальный API или через GameRadar Agent — без участия владельца.',
  },
  {
    icon: <Repeat2 size={17} />,
    title: 'Сверка с историей',
    body: 'Значение сравнивается с историей онлайна и поведением игроков. Резкие всплески помечаются как аномалия и не попадают в рейтинг.',
  },
  {
    icon: <BadgeCheck size={17} />,
    title: 'Публикация статуса',
    body: 'Игрок видит, откуда взято число и когда была последняя успешная проверка. Непроверенные данные честно помечаются.',
  },
]

const LEGEND: OnlineStatus[] = ['VERIFIED', 'OWNER_REPORTED', 'OFFLINE', 'ANOMALY']

export function TrustBand() {
  return (
    <section className="py-12 sm:py-16">
      <Container>
        <div className="grid gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14">
          <div>
            <div className="mb-3 flex items-center gap-2 text-[11px] font-medium tracking-[0.14em] text-signal-400 uppercase">
              <ShieldCheck size={13} />
              Verified Online
            </div>
            <h2 className="text-[26px] leading-tight sm:text-[32px]">
              Мы не верим цифрам на слово — мы их проверяем
            </h2>
            <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-ink-300">
              Главная проблема каталогов игровых серверов — онлайн, который никто не проверяет. GameRadar получает
              данные самостоятельно и всегда показывает их источник.
            </p>

            <div className="mt-8 space-y-5">
              {STEPS.map((step, index) => (
                <div key={step.title} className="flex gap-4">
                  <div className="relative flex flex-col items-center">
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-white/8 bg-white/[0.035] text-ink-200">
                      {step.icon}
                    </div>
                    {index < STEPS.length - 1 && <div className="mt-1 w-px flex-1 bg-gradient-to-b from-white/10 to-transparent" />}
                  </div>
                  <div className="pb-1">
                    <h3 className="text-[15px] font-medium text-ink-50">{step.title}</h3>
                    <p className="mt-1.5 max-w-lg text-[13.5px] leading-relaxed text-ink-400">{step.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <LiveCheckCard />

            <div className="surface rounded-xl p-5">
              <h3 className="mb-4 text-[14px] font-medium text-ink-100">Что означают статусы</h3>
              <div className="space-y-3">
                {LEGEND.map((status) => (
                  <div key={status} className="flex items-start gap-3">
                    <StatusBadge status={status} size="sm" className="mt-0.5 shrink-0" />
                    <p className="text-[13px] text-ink-400">{STATUS_META[status].caption}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </Container>
    </section>
  )
}

/** A card that visibly re-checks itself — the product promise, demonstrated. */
function LiveCheckCard() {
  const seconds = useTicker(3, 60)
  const progress = (seconds / 60) * 100

  return (
    <div className="surface-raised relative overflow-hidden rounded-xl p-5">
      <div
        className="pointer-events-none absolute -top-20 -right-16 h-52 w-52 rounded-full opacity-20 blur-[70px]"
        style={{ background: 'radial-gradient(closest-side, var(--color-signal-500), transparent)' }}
      />

      <div className="relative flex items-start justify-between gap-4">
        <div>
          <div className="text-[12.5px] text-ink-400">HolySky · Minecraft 1.21</div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="num font-display text-[34px] leading-none font-semibold text-ink-50">
              {formatNumber(1284)}
            </span>
            <span className="num text-[14px] text-ink-500">/ 3 000</span>
          </div>
        </div>
        <StatusBadge status="VERIFIED" />
      </div>

      <div className="relative mt-5 space-y-3 border-t border-white/6 pt-4 font-mono text-[11.5px]">
        <Row label="Источник" value="GameRadar Direct Query" />
        <Row label="Метод" value="Прямой игровой протокол" />
        <Row label="Последняя проверка" value={`${seconds} сек. назад`} accent />
        <Row label="Успешных проверок за 24 ч" value="99.8%" />
      </div>

      <div className="relative mt-4">
        <div className="h-[3px] overflow-hidden rounded-full bg-white/7">
          <div
            className="h-full rounded-full bg-signal-500/70 transition-[width] duration-1000 ease-linear"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="mt-2 flex items-center justify-between font-mono text-[10.5px] text-ink-500">
          <span>следующая проверка</span>
          <span className="num">через {60 - seconds} сек</span>
        </div>
      </div>
    </div>
  )
}

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-ink-500">{label}</span>
      <span className={accent ? 'text-signal-400' : 'text-ink-200'}>{value}</span>
    </div>
  )
}

export function OwnerBand() {
  return (
    <section className="py-12 sm:py-16">
      <Container>
        <div className="surface relative overflow-hidden rounded-2xl px-6 py-10 sm:px-10 sm:py-12">
          {/* shared key art — the platform's own world behind the owner pitch */}
          <WorldArtSurface art={worldArt('stage')} scrim="stage" width={1600} sizes="100vw" />
          <div className="absolute inset-0 texture-grid opacity-40 [mask-image:linear-gradient(to_right,black,transparent_70%)]" />
          <div
            className="pointer-events-none absolute -right-20 -bottom-24 h-72 w-72 rounded-full opacity-[0.18] blur-[90px]"
            style={{ background: 'radial-gradient(closest-side, var(--color-signal-500), transparent)' }}
          />

          <div className="relative grid gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
            <div>
              <div className="mb-3 text-[11px] font-medium tracking-[0.14em] text-ink-400 uppercase">
                Владельцам серверов
              </div>
              <h2 className="text-[26px] leading-tight sm:text-[32px]">Добавьте сервер бесплатно</h2>
              <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-ink-300">
                Размещение, статистика карточки и подключение Verified Online не стоят ничего. Платить нужно только за
                продвижение — и только если вы этого захотите.
              </p>

              <div className="mt-7 flex flex-wrap gap-3">
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
                Просмотры, переходы, CTR и позиция в каталоге по вашей игре
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
    <div className="rounded-xl border border-white/7 bg-ink-900/60 p-4 backdrop-blur-sm">
      <div className="flex items-center gap-2 text-[13.5px] font-medium text-ink-50">
        {icon}
        {title}
      </div>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-400">{children}</p>
    </div>
  )
}
