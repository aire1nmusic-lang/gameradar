import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { Plus, Search, UserRound } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Container } from './Container'
import { Logo } from './Logo'
import { Button } from '@/components/ui/Button'

const NAV = [
  { to: '/games', label: 'Игры' },
  { to: '/catalog', label: 'Серверы' },
  { to: '/openings', label: 'Открытия' },
  { to: '/rating', label: 'Рейтинг' },
  { to: '/owners', label: 'Для владельцев' },
]

export function Header({ onSearch, onLogin }: { onSearch: () => void; onLogin: () => void }) {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 8)
    handler()
    window.addEventListener('scroll', handler, { passive: true })
    return () => window.removeEventListener('scroll', handler)
  }, [])

  return (
    <header
      className={cn(
        'sticky top-0 z-50 transition-colors duration-300',
        scrolled ? 'glass border-b border-white/7' : 'border-b border-transparent',
      )}
    >
      <Container className="flex h-14 items-center gap-3 lg:h-16 lg:gap-6 xl:gap-8">
        <Logo />

        <nav className="hidden items-center gap-0.5 lg:flex">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'relative rounded-md px-2.5 py-2 text-[13.5px] transition-colors duration-200 xl:px-3',
                  isActive ? 'text-ink-50' : 'text-ink-300 hover:text-ink-50',
                )
              }
            >
              {({ isActive }) => (
                <>
                  {item.label}
                  <span
                    className={cn(
                      'absolute inset-x-2.5 -bottom-[7px] h-px origin-center bg-gradient-to-r from-transparent via-signal-400/70 to-transparent transition-transform duration-300',
                      isActive ? 'scale-x-100' : 'scale-x-0',
                    )}
                  />
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={onSearch}
            className="group hidden h-9 items-center gap-2 rounded-md border border-white/8 bg-white/[0.03] pr-2 pl-3 text-[13px] text-ink-400 transition-colors hover:border-white/16 hover:text-ink-100 xl:flex"
          >
            <Search size={14} />
            <span className="w-28 text-left">Поиск…</span>
            <kbd className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-ink-500">
              ⌘K
            </kbd>
          </button>

          <button
            onClick={onSearch}
            aria-label="Поиск"
            className="grid h-9 w-9 place-items-center rounded-md text-ink-300 transition-colors hover:bg-white/6 hover:text-ink-50 xl:hidden"
          >
            <Search size={18} />
          </button>

          <button
            onClick={onLogin}
            className="hidden h-9 items-center gap-2 rounded-md px-3 text-[13.5px] text-ink-200 transition-colors hover:bg-white/6 hover:text-ink-50 sm:inline-flex"
          >
            Войти
          </button>

          <button
            onClick={onLogin}
            aria-label="Войти"
            className="grid h-9 w-9 place-items-center rounded-md text-ink-300 transition-colors hover:bg-white/6 hover:text-ink-50 sm:hidden"
          >
            <UserRound size={18} />
          </button>

          <span className="hidden lg:block">
            <Button to="/add-server" variant="primary" size="md" icon={<Plus size={15} />}>
              Добавить сервер
            </Button>
          </span>
        </div>
      </Container>
    </header>
  )
}
