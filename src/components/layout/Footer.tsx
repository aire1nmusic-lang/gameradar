import { Link } from 'react-router-dom'
import { Container } from './Container'
import { Logo } from './Logo'
import { GAMES } from '@/data/games'
import { useAuth } from '@/hooks/useAuth'

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
  const { privateCore, loading }=useAuth()
  const columns=loading?COLUMNS.filter(column=>column.title!=='Владельцам'):privateCore?COLUMNS.map(column=>column.title==='Владельцам'?{
    ...column,links:[
      {label:'Найти свой сервер',to:'/catalog'},
      {label:'Подтвердить права',to:'/account'},
      {label:'Возможности',to:'/owners'},
      {label:'Мои серверы',to:'/account'},
    ],
  }:column):COLUMNS
  return (
    <footer className="mt-10 border-t border-white/6 bg-ink-1000/60 pb-24 lg:pb-0">
      <Container className="py-12">
        <div className="grid gap-10 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
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
            <h4 className="mb-3.5 text-[13px] font-medium tracking-[0.08em] text-ink-500 uppercase">Игры</h4>
            <ul className="space-y-2.5">
              {GAMES.slice(0, 6).map((game) => (
                <li key={game.id}>
                  <Link
                    to={`/catalog?game=${game.id}`}
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
                    <Link to={link.to} className="text-[13.5px] text-ink-300 transition-colors hover:text-ink-50">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col gap-4 border-t border-white/6 pt-6 text-[12px] text-ink-500 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-2xl">
            Карточки серверов собраны из открытых источников — у каждой указаны источник и дата сверки. Онлайн
            со статусом VERIFIED измерен GameScout; остальные числа подписаны источником. Владелец может
            подтвердить сервер и управлять карточкой.
          </p>
          <div className="flex shrink-0 gap-5">
            <Link to="/terms" className="transition-colors hover:text-ink-300">Условия</Link>
            <Link to="/privacy" className="transition-colors hover:text-ink-300">Приватность</Link>
            <Link to="/copyright" className="transition-colors hover:text-ink-300">Правообладателям</Link>
            <span>© 2026 GameScout</span>
          </div>
        </div>
      </Container>
    </footer>
  )
}
