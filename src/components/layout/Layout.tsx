import { FavoritesSync } from '@/hooks/useFavorites'
import { useAppearance } from '@/theme/appearance'
import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { VisualDemoBanner } from './VisualDemoBanner'
import { Header } from './Header'
import { Footer } from './Footer'
import { MobileNav } from './MobileNav'
import { LiveTicker } from './LiveTicker'
import { artSrc, worldArt } from '@/data/themeMedia'
import { DesignPanel } from './DesignPanel'
import { AuthModal } from './AuthModal'
import { SearchOverlay } from '@/components/search/SearchOverlay'
import { PortalProvider } from '@/components/home/portal'
import { WorldNavigationProvider, useWorldNavigation } from '@/hooks/useWorldNavigation'
import { WorldPageScope } from '@/components/world/WorldPageScope'
import './review-refinement.css'
import './world-glass-review.css'

export function Layout() {
  return <PortalProvider><WorldNavigationProvider><LayoutContent /></WorldNavigationProvider></PortalProvider>
}

function LayoutContent() {
  const [searchOpen, setSearchOpen] = useState(false)
  const [authOpen, setAuthOpen] = useState(false)
  const location = useLocation()
  const { colorMode } = useAppearance()
  const { game } = useWorldNavigation()
  // One world shell for every game (design preview): same layout as Lineage 2.
  const aether = !!game
  const hall = location.pathname === '/'

  useEffect(() => {
    if (!location.hash) window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
  }, [location.pathname, location.hash])

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const typing = target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)
      if ((event.key === 'k' && (event.metaKey || event.ctrlKey)) || (event.key === '/' && !typing)) {
        event.preventDefault()
        setSearchOpen(true)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  return (
        <div className={(aether ? `gs-l2-aether-layout ${colorMode === "light" ? "l2-light-shell" : ""} ` : "") + (location.pathname === "/account" ? "gs-account-layout relative flex min-h-screen flex-col" : "relative flex min-h-screen flex-col")}>
          <FavoritesSync/><BackgroundField />{game && !hall && <WorldBackdrop gameId={game.id} />}
          <Header onSearch={() => setSearchOpen(true)} onLogin={() => setAuthOpen(true)} bare={hall} />
          <main className={hall ? "gs-page-main relative flex-1" : "gs-page-main relative flex-1 pt-[60px]"}>
            <VisualDemoBanner/>{!hall && location.pathname !== "/account" && <LiveTicker/>}<WorldPageScope><Outlet /></WorldPageScope>
          </main>
          {!location.pathname.startsWith('/admin') && <Footer />}
          {!hall && <MobileNav />}
          <DesignPanel />
          <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />
          <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
        </div>
  )
}

/** Inner pages of a world carry the world art at the top, like the world page itself. */
function WorldBackdrop({ gameId }: { gameId: string }) {
  const art = worldArt('hero', gameId)
  if (!art) return null
  return <div aria-hidden className={gameId === "lineage2" ? "gs-world-backdrop gs-world-backdrop--elf-sunset" : "gs-world-backdrop"} style={{ backgroundImage: `url("${artSrc(art, 1600)}")`, backgroundPosition: art.focus.desktop }} />
}

function BackgroundField() {
  return (
    <div aria-hidden className="gs-bg-field pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 bg-ink-950" />
      <div
        className="absolute -top-[22rem] left-1/2 h-[46rem] w-[78rem] -translate-x-1/2 animate-drift rounded-full opacity-[0.16] blur-[120px]"
        style={{ background: 'radial-gradient(closest-side, var(--color-signal-500), transparent 70%)' }}
      />
      <div
        className="absolute top-[28rem] -left-40 h-[34rem] w-[34rem] rounded-full opacity-[0.10] blur-[130px]"
        style={{ background: 'radial-gradient(closest-side, var(--color-promo-500), transparent 70%)' }}
      />
      <div className="absolute inset-0 texture-grid opacity-[0.35] [mask-image:radial-gradient(ellipse_at_top,black,transparent_65%)]" />
    </div>
  )
}
