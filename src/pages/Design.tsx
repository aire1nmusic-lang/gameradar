import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight } from 'lucide-react'
import { useSeo } from '@/lib/seo'
import { useServers } from '@/hooks/data'
import { Container } from '@/components/layout/Container'
import { AppearanceControls } from '@/components/layout/DesignPanel'
import { useAppearance } from '@/theme/appearance'

/**
 * The owner's variant board. Opening it once turns on the floating "Вид"
 * panel in this browser, so every page can be checked with any combination.
 * Not linked from the site and not indexed.
 */
export default function Design() {
  const { setDesignerMode } = useAppearance()
  const { data: top } = useServers({ sort: 'online', limit: 1 })
  useSeo({ title: 'Варианты оформления', path: '/design', noindex: true })
  useEffect(() => setDesignerMode(true), [setDesignerMode])

  const profile = top?.[0]
  const pages = [
    { to: '/', label: 'Главная' },
    { to: '/lineage-2', label: 'Lineage 2' },
    { to: '/lineage-2/high-five', label: 'High Five' },
    { to: '/minecraft', label: 'Minecraft' },
    { to: '/gta-rp', label: 'GTA RP' },
    { to: '/catalog', label: 'Каталог' },
    { to: '/rating', label: 'Рейтинг' },
    { to: '/openings', label: 'Открытия' },
    ...(profile ? [{ to: `/server/${profile.slug}`, label: `Профиль: ${profile.name}` }] : []),
  ]

  return (
    <Container className="py-10 sm:py-14">
      <div className="max-w-2xl">
        <h1 className="text-[28px] sm:text-[36px]">Варианты оформления</h1>
        <p className="mt-3 text-[15px] text-ink-300">
          Переключайте варианты и открывайте страницы: панель «Вид» теперь есть на каждой странице в этом браузере, слева внизу.
          Выбор видите только вы. Когда определитесь, напишите, какие варианты оставить, — они станут видом по умолчанию для всех.
        </p>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,420px)_1fr]">
        <div className="rounded-xl border border-white/8 bg-white/[0.02] p-5">
          <AppearanceControls />
        </div>
        <div>
          <div className="mb-3 text-[12px] font-medium tracking-[0.04em] text-ink-300 uppercase">Где смотреть</div>
          <div className="grid gap-2 sm:grid-cols-2">
            {pages.map((page) => (
              <Link
                key={page.to}
                to={page.to}
                className="group flex items-center justify-between rounded-lg border border-white/8 bg-white/[0.02] px-4 py-3 text-[14px] text-ink-100 transition-colors hover:border-white/18 hover:bg-white/[0.04]"
              >
                <span className="truncate">{page.label}</span>
                <ArrowUpRight size={15} className="shrink-0 text-ink-500 group-hover:text-ink-100" />
              </Link>
            ))}
          </div>
          <ul className="mt-6 space-y-2 text-[13.5px] text-ink-400">
            <li><b className="font-medium text-ink-200">Фон и тема</b> меняет и нейтральные страницы, и миры игр: их фон смешивается с тем же оттенком.</li>
            <li><b className="font-medium text-ink-200">Шапка</b> влияет на страницы игр и плитки игр на главной.</li>
            <li><b className="font-medium text-ink-200">Анимации</b> работают в Chrome, Яндекс Браузере, Edge и Safari; в Firefox страница просто статична.</li>
            <li><b className="font-medium text-ink-200">Иконки</b> — только для серверов без своего логотипа. Загруженный логотип всегда важнее.</li>
          </ul>
        </div>
      </div>
    </Container>
  )
}
