import { NavLink, useLocation } from 'react-router-dom'
import { WorldIcon, type WorldIconName } from '@/components/icons/WorldIcon'
import { cn } from '@/lib/utils'
import { useFavorites } from '@/hooks/useFavorites'
import { useWorldNavigation } from '@/hooks/useWorldNavigation'

/** Four primary mobile destinations: simple enough to hit with one hand. */
const ITEMS:{to:string;label:string;icon:WorldIconName;end:boolean}[] = [
  { to: '/', label: 'Главная', icon: 'home', end: true },
  { to: '/catalog', label: 'Серверы', icon: 'servers', end: false },
  { to: '/rating', label: 'Рейтинг', icon: 'vote', end: false },
  { to: '/openings', label: 'Открытия', icon: 'opening', end: false },
  { to: '/account', label: 'Профиль', icon: 'profile', end: false },
]

/** Routes whose own bottom bar replaces the navigation (a server profile has one CTA bar). */
const HIDDEN = [/^\/add-server/, /^\/server\//]

export function MobileNav() {
  const { favorites } = useFavorites()
  const location = useLocation()
  const {game,scoped}=useWorldNavigation()
  if (HIDDEN.some((pattern) => pattern.test(location.pathname))) return null

  return (
    <nav className="gs-mobile-nav safe-bottom fixed inset-x-0 bottom-0 z-50 lg:hidden">
      <div className="mx-auto grid h-[58px] max-w-2xl grid-cols-5 items-stretch">
        {ITEMS.map((item) => (
          <NavItem
            key={item.to}
            {...item}
            to={item.to==='/'&&game ? `/${game.slug}` : ['/catalog','/rating','/openings','/account'].includes(item.to) ? scoped(item.to) : item.to}
            badge={item.to === '/favorites' ? favorites.length : 0}
          />
        ))}
      </div>
    </nav>
  )
}

function NavItem({ to, label, icon, end, badge }: { to: string; label: string; icon: WorldIconName; end: boolean; badge: number }) {
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
            <WorldIcon name={icon} size={21} strokeWidth={isActive ? 2.1 : 1.7} />
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
