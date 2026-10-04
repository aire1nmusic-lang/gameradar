import { Link, NavLink, useLocation } from 'react-router-dom'
import { WorldIcon } from '@/components/icons/WorldIcon'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import { Container } from './Container'
import { GamesMenu } from './GamesMenu'
import { Logo } from './Logo'
import { useWorldNavigation } from '@/hooks/useWorldNavigation'
import { useAppearance } from '@/theme/appearance'

/**
 * Four places a player goes, and search in the middle. Owner links live in
 * the footer and the owner pages — they are not the site's navigation.
 */
const NAV = [
  { to: '/', label: 'Главная' },
  { to: '/catalog', label: 'Каталог' },
  { to: '/rating', label: 'Рейтинг' },
  { to: '/openings', label: 'Открытия' },
]

/** `bare`: over the hall of worlds — transparent, only the logo and the account. */
export function Header({ onSearch, onLogin, bare }: { onSearch: () => void; onLogin: () => void; bare?: boolean }) {
  const auth=useAuth()
  const {pathname}=useLocation()
  const {colorMode,toggleColorMode}=useAppearance()
  const {game,scoped}=useWorldNavigation()
  const worldArt=['/lineage-2','/minecraft','/gta-rp'].some(path=>pathname===path||pathname.startsWith(path+'/'))
  const overArt=bare||pathname==='/account'||pathname.startsWith('/admin')||['/lineage-2','/minecraft','/gta-rp'].some(path=>pathname===path||pathname.startsWith(path+'/'))
  const accountLabel=auth.user?.displayName || 'Аккаунт'
  const accountClassBase='hidden h-11 max-w-44 items-center gap-2 rounded-md border border-white/[0.09] px-3.5 text-[13.5px] text-ink-100 transition-colors hover:border-white/20 hover:bg-white/[0.05] lg:inline-flex'
  // Over the hall the account button is a pane of glass like the cards.
  const accountClass=bare?accountClassBase+' gs-glass border-white/20 text-white':accountClassBase
  const mobileAccountClassBase='grid h-11 w-11 place-items-center rounded-md text-ink-200 transition-colors hover:bg-white/6 hover:text-ink-50 lg:hidden'
  const mobileAccountClass=bare?mobileAccountClassBase+' gs-glass ml-auto text-white':mobileAccountClassBase
  return (
    <header className={`gs-site-header ${overArt?'gs-header-over-art':''} ${bare?'gs-hall-header':''} ${worldArt?'gs-header-world-art':''} absolute inset-x-0 top-0 z-50`}>
      <Container className="flex h-[60px] items-center gap-2 md:gap-4">
        <Logo className={!bare?'max-xl:[&_.gs-wordmark]:hidden':undefined} />
        {!bare&&<div className="lg:hidden"><GamesMenu /></div>}

        {!bare && <nav className="ml-1 hidden items-center gap-0.5 lg:flex">
          <GamesMenu />
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to === '/' ? (game ? `/${game.slug}` : '/') : scoped(item.to)} end={item.to === '/'}
              className={({ isActive }) =>
                cn(
                  'inline-flex min-h-11 items-center rounded-md px-2 py-2 text-[13px] transition-colors duration-150',
                  isActive ? 'bg-white/[0.07] text-ink-50' : 'text-ink-300 hover:bg-white/[0.05] hover:text-ink-50',
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>}
        {bare && <span className="ml-auto" />}

        {!bare && <button
          onClick={onSearch}
          className="group ml-auto hidden h-11 w-[150px] items-center gap-2.5 overflow-hidden rounded-lg border border-white/[0.09] bg-white/[0.04] pr-2 pl-3 text-[13.5px] whitespace-nowrap text-ink-400 transition-colors hover:border-white/18 hover:bg-white/[0.06] hover:text-ink-100 md:flex lg:w-[180px] xl:w-[240px]"
        >
          <WorldIcon name="search" size={16} className="shrink-0" />
          <span className="min-w-0 flex-1 truncate text-left">
            <span className="lg:hidden">Поиск</span>
            <span className="hidden lg:inline">{game?`Поиск в ${game.shortName}`:'Сервер, игра, режим…'}</span>
          </span>
          <kbd className="hidden rounded border border-white/10 bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-ink-500 lg:block">⌘K</kbd>
        </button>}

        <button
          type="button"
          onClick={toggleColorMode}
          aria-label={colorMode === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему'}
          title={colorMode === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
          className="gs-theme-toggle ml-auto grid h-11 w-11 shrink-0 place-items-center rounded-full border border-white/[0.10] bg-white/[0.035] text-ink-200 backdrop-blur-md transition-all hover:border-white/20 hover:bg-white/[0.07] hover:text-ink-50 active:scale-95 md:ml-0"
        >
          {colorMode === 'dark' ? <WorldIcon name="sun" size={20} /> : <WorldIcon name="moon" size={20} />}
        </button>

        {auth.privateCore ? <Link to={scoped('/account')} aria-label={`Аккаунт: ${accountLabel}`} className={accountClass}>
          <WorldIcon name="profile" size={16} className="shrink-0" /><span className="truncate">{accountLabel}</span>
        </Link> : <button
          onClick={onLogin}
          className={accountClass}
        >
          <WorldIcon name="profile" size={16} />
          {auth.user?.displayName || 'Войти'}
        </button>}

        {auth.privateCore ? <Link to={scoped('/account')} aria-label={`Аккаунт: ${accountLabel}`} className={mobileAccountClass}>
          <WorldIcon name="profile" size={21} />
        </Link> : <button
          onClick={onLogin}
          aria-label={auth.user?`Аккаунт: ${auth.user.displayName}`:'Войти'}
          className={mobileAccountClass}
        >
          <WorldIcon name="profile" size={21} />
        </button>}
      </Container>
    </header>
  )
}
