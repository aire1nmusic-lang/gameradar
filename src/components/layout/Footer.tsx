import { Link, useLocation } from 'react-router-dom'
import { Container } from './Container'
import { Logo } from './Logo'
import { GAMES } from '@/data/games'
import { useAuth } from '@/hooks/useAuth'
import { useWorldNavigation } from '@/hooks/useWorldNavigation'

const COLUMNS = [
  {
    title: 'Платформа',
    links: [
      { label: 'Каталог серверов', to: '/catalog' },
      { label: 'Открытия', to: '/openings' },
      { label: 'Рейтинг', to: '/rating' },
      { label: 'Избранное', to: '/favorites' },
    ],
  },
  {
    title: 'Владельцам',
    links: [
      { label: 'Добавить сервер', to: '/add-server' },
      { label: 'Возможности', to: '/owners' },
      { label: 'Verified Online', to: '/owners#verified' },
      { label: 'Продвижение', to: '/owners#promo' },
      { label: 'Кабинет владельца', to: '/dashboard' },
    ],
  },
]

export function Footer() {
  const {pathname}=useLocation()
  const compactPrivate=pathname==='/account'||pathname.startsWith('/admin')
  const { privateCore, loading }=useAuth()
  const {game:world,loading:worldPending,scoped}=useWorldNavigation()
  const columns=loading?COLUMNS.filter(column=>column.title!=='Владельцам'):privateCore?COLUMNS.map(column=>column.title==='Владельцам'?{
    ...column,links:[
      {label:'Найти свой сервер',to:'/catalog'},
      {label:'Подтвердить права',to:'/account'},
      {label:'Возможности',to:'/owners'},
      {label:'Мои серверы',to:'/account'},
    ],
  }:column):COLUMNS
  return (
    <footer className="gs-site-footer mt-6 border-t border-white/6 bg-ink-1000/60 pb-20 lg:mt-10 lg:pb-0">
      <Container className={compactPrivate?'py-3 lg:py-12':'py-3 lg:py-12'}>
        <div className="hidden gap-6 lg:grid lg:grid-cols-[1.4fr_1fr_1fr_1fr] lg:gap-10">
          <div>
            <Logo />
            <p className="mt-4 max-w-xs text-[13.5px] leading-relaxed text-ink-400">
              Независимый навигатор по игровым серверам. Мы проверяем онлайн сами, чтобы вы выбирали по фактам, а не по
              обещаниям.
            </p>
            <div className="mt-5 flex items-center gap-2 rounded-lg border border-white/7 bg-white/[0.02] px-3 py-2 text-[12px] text-ink-400">
              <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-signal-400" />
              У каждого онлайна указан источник и время проверки
            </div>
          </div>

          <div>
            <h4 className="mb-3.5 text-[13px] font-medium tracking-[0.08em] text-ink-500 uppercase">{world?'Ваш мир':'Миры'}</h4>
            <ul className="space-y-2.5">
              {(worldPending?[]:world?[world]:GAMES.slice(0, 3)).map((game) => (
                <li key={game.id}>
                  <Link
                    to={`/${game.slug}`}
                    className="text-[13.5px] text-ink-300 transition-colors hover:text-ink-50"
                  >
                    {game.shortName}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {columns.map((column) => (
            <div key={column.title}>
              <h4 className="mb-3.5 text-[13px] font-medium tracking-[0.08em] text-ink-500 uppercase">
                {column.title}
              </h4>
              <ul className="space-y-2.5">
                {column.links.map((link) => (
                  <li key={link.label}>
                    <Link to={['/catalog','/rating','/openings','/favorites'].includes(link.to)?scoped(link.to):link.to} className="text-[13.5px] text-ink-300 transition-colors hover:text-ink-50">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className={`${compactPrivate?'lg:mt-12':'lg:mt-12'} flex flex-col gap-2 border-white/6 text-[11px] text-ink-500 lg:border-t lg:pt-6 lg:text-[12px] sm:flex-row sm:items-center sm:justify-between`}>
          <p className="hidden max-w-2xl lg:block">
            Карточки серверов собраны из открытых источников — у каждой указаны источник и дата сверки. Онлайн
            со статусом VERIFIED измерен GameScout; остальные числа подписаны источником. Владелец может
            подтвердить сервер и управлять карточкой.
          </p>
          <div className="flex min-w-0 flex-wrap gap-x-5 gap-y-2 sm:shrink-0">
            <Link to="/terms" className="transition-colors hover:text-ink-300">Условия</Link>
            <Link to="/privacy" className="transition-colors hover:text-ink-300">Приватность</Link>
            <Link to="/copyright" className="hidden transition-colors hover:text-ink-300 sm:inline">Правообладателям</Link>
            <span>© 2026 GameScout</span>
          </div>
        </div>
      </Container>
    </footer>
  )
}
