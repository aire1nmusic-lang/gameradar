import { NavLink, useLocation } from 'react-router-dom'
import { CalendarClock, Heart, Home, Plus, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useFavorites } from '@/hooks/useFavorites'

const ITEMS = [
  { to: '/', label: 'Главная', icon: Home, end: true },
  { to: '/catalog', label: 'Поиск', icon: Search, end: false },
  { to: '/openings', label: 'Открытия', icon: CalendarClock, end: false },
  { to: '/favorites', label: 'Избранное', icon: Heart, end: false },
]

export function MobileNav({ onSearch }: { onSearch: () => void }) {
  const { favorites } = useFavorites()
  const location = useLocation()
  const hidden = location.pathname.startsWith('/add-server')

  if (hidden) return null

  return (
    <nav className="safe-bottom fixed inset-x-0 bottom-0 z-50 glass border-t border-white/8 lg:hidden">
      <div className="relative mx-auto grid h-[58px] max-w-lg grid-cols-5 items-center px-1">
        {ITEMS.slice(0, 2).map((item) => (
          <NavItem key={item.to} {...item} badge={0} onSearch={item.to === '/catalog' ? onSearch : undefined} />
        ))}

        <div className="flex justify-center">
          <NavLink
            to="/add-server"
            aria-label="Добавить сервер"
            className="-mt-6 grid h-12 w-12 place-items-center rounded-full bg-white text-ink-950 shadow-[0_8px_24px_-8px_rgba(255,255,255,0.45)] transition-transform duration-200 active:scale-95"
          >
            <Plus size={22} strokeWidth={2.2} />
          </NavLink>
        </div>

        {ITEMS.slice(2).map((item) => (
          <NavItem key={item.to} {...item} badge={item.to === '/favorites' ? favorites.length : 0} />
        ))}
      </div>
    </nav>
  )
}

function NavItem({
  to,
  label,
  icon: Icon,
  end,
  badge,
  onSearch,
}: {
  to: string
  label: string
  icon: typeof Home
  end: boolean
  badge: number
  onSearch?: () => void
}) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={(event) => {
        if (onSearch) {
          event.preventDefault()
          onSearch()
        }
      }}
      className={({ isActive }) =>
        cn(
          'relative flex h-full flex-col items-center justify-center gap-1 text-[10.5px] transition-colors duration-200',
          isActive && !onSearch ? 'text-ink-50' : 'text-ink-400',
        )
      }
    >
      {({ isActive }) => (
        <>
          <span className="relative">
            <Icon size={19} strokeWidth={isActive && !onSearch ? 2.2 : 1.9} />
            {badge > 0 && (
              <span className="num absolute -top-1.5 -right-2 grid h-[15px] min-w-[15px] place-items-center rounded-full bg-signal-500 px-1 text-[9px] font-semibold text-ink-950">
                {badge}
              </span>
            )}
          </span>
          {label}
          {isActive && !onSearch && (
            <span className="absolute top-0 h-[2px] w-7 rounded-full bg-gradient-to-r from-transparent via-signal-400 to-transparent" />
          )}
        </>
      )}
    </NavLink>
  )
}
