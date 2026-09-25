import { NavLink } from 'react-router-dom'
import { Search, UserRound } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Container } from './Container'
import { GamesMenu } from './GamesMenu'
import { Logo } from './Logo'

/**
 * Four places a player goes, and search in the middle. Owner links live in
 * the footer and the owner pages — they are not the site's navigation.
 */
const NAV = [
  { to: '/catalog', label: 'Каталог' },
  { to: '/rating', label: 'Рейтинг' },
  { to: '/openings', label: 'Открытия' },
]

export function Header({ onSearch, onLogin }: { onSearch: () => void; onLogin: () => void }) {
  return (
    <header className="sticky top-0 z-50 border-b border-white/[0.07] bg-ink-950/95 backdrop-blur-md">
      <Container className="flex h-[60px] items-center gap-2 md:gap-4">
        <Logo />

        <nav className="ml-1 hidden items-center gap-0.5 md:flex">
          <GamesMenu />
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'rounded-md px-3 py-2 text-[14px] transition-colors duration-150',
                  isActive ? 'bg-white/[0.07] text-ink-50' : 'text-ink-300 hover:bg-white/[0.05] hover:text-ink-50',
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <button
          onClick={onSearch}
          className="group ml-auto hidden h-10 w-[150px] items-center gap-2.5 overflow-hidden rounded-lg border border-white/[0.09] bg-white/[0.04] pr-2 pl-3 text-[13.5px] whitespace-nowrap text-ink-400 transition-colors hover:border-white/18 hover:bg-white/[0.06] hover:text-ink-100 md:flex lg:w-[300px]"
        >
          <Search size={15} className="shrink-0" />
          <span className="min-w-0 flex-1 truncate text-left">
            <span className="lg:hidden">Поиск</span>
            <span className="hidden lg:inline">Сервер, игра, режим…</span>
          </span>
          <kbd className="hidden rounded border border-white/10 bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-ink-500 lg:block">⌘K</kbd>
        </button>

        <button
          onClick={onSearch}
          aria-label="Поиск"
          className="ml-auto grid h-10 w-10 place-items-center rounded-md text-ink-200 transition-colors hover:bg-white/6 hover:text-ink-50 md:hidden"
        >
          <Search size={20} />
        </button>

        <button
          onClick={onLogin}
          className="hidden h-10 items-center gap-2 rounded-md border border-white/[0.09] px-3.5 text-[13.5px] text-ink-100 transition-colors hover:border-white/20 hover:bg-white/[0.05] md:inline-flex"
        >
          <UserRound size={15} />
          Войти
        </button>

        <button
          onClick={onLogin}
          aria-label="Войти"
          className="grid h-10 w-10 place-items-center rounded-md text-ink-200 transition-colors hover:bg-white/6 hover:text-ink-50 md:hidden"
        >
          <UserRound size={20} />
        </button>
      </Container>
    </header>
  )
}
