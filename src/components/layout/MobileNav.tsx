import { NavLink, useLocation } from 'react-router-dom'
import { Gamepad2, Heart, Home, LayoutList, Trophy } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useFavorites } from '@/hooks/useFavorites'
import { useWorldNavigation } from '@/hooks/useWorldNavigation'

/** The five places a player goes. Adding a server is an owner action and lives on /owners. */
const ITEMS = [
  { to: '/', label: 'Главная', icon: Home, end: true },
  { to: '/games', label: 'Игры', icon: Gamepad2, end: false },
  { to: '/catalog', label: 'Каталог', icon: LayoutList, end: false },
  { to: '/rating', label: 'Рейтинг', icon: Trophy, end: false },
  { to: '/favorites', label: 'Избранное', icon: Heart, end: false },
]

/** Routes whose own bottom bar replaces the navigation (a server profile has one CTA bar). */
const HIDDEN = [/^\/add-server/, /^\/server\//]

export function MobileNav() {
  const { favorites } = useFavorites()
  const location = useLocation()
  const {game,scoped}=useWorldNavigation()
  if (HIDDEN.some((pattern) => pattern.test(location.pathname))) return null

  return (
    <nav className="safe-bottom fixed inset-x-0 bottom-0 z-50 border-t border-white/[0.08] bg-ink-950/95 backdrop-blur-md md:hidden">
      <div className="mx-auto grid h-[56px] max-w-lg grid-cols-5 items-stretch">
        {ITEMS.map((item) => (
          <NavItem key={item.to} {...item} to={item.to==='/games'&&game?`/${game.slug}`:['/catalog','/rating','/favorites'].includes(item.to)?scoped(item.to):item.to}
            label={item.to==='/games'&&game?'Мой мир':item.to==='/'?'Зал миров':item.label} badge={item.to === '/favorites' ? favorites.length : 0} />
        ))}
      </div>
    </nav>
  )
}

function NavItem({ to, label, icon: Icon, end, badge }: { to: string; label: string; icon: typeof Home; end: boolean; badge: number }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn('relative flex flex-col items-center justify-center gap-1 text-[10.5px] transition-colors duration-150', isActive ? 'text-ink-50' : 'text-ink-400')
      }
    >
      {({ isActive }) => (
        <>
          <span className="relative">
            <Icon size={20} strokeWidth={isActive ? 2.2 : 1.8} />
            {badge > 0 && (
              <span className="num absolute -top-1.5 -right-2 grid h-[15px] min-w-[15px] place-items-center rounded-full bg-signal-500 px-1 text-[9px] font-semibold text-ink-950">
                {badge}
              </span>
            )}
          </span>
          {label}
          {isActive && <span className="absolute top-0 h-[2px] w-8 rounded-full bg-signal-400" />}
        </>
      )}
    </NavLink>
  )
}
