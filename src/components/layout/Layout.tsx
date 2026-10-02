import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Header } from './Header'
import { Footer } from './Footer'
import { MobileNav } from './MobileNav'
import { DesignPanel } from './DesignPanel'
import { AuthModal } from './AuthModal'
import { SearchOverlay } from '@/components/search/SearchOverlay'
import { PortalProvider } from '@/components/home/portal'
import { WorldNavigationProvider } from '@/hooks/useWorldNavigation'

export function Layout() {
  const [searchOpen, setSearchOpen] = useState(false)
  const [authOpen, setAuthOpen] = useState(false)
  const location = useLocation()
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
    <PortalProvider>
    <WorldNavigationProvider>
    <div className="relative flex min-h-screen flex-col">
      <BackgroundField />
      <Header onSearch={() => setSearchOpen(true)} onLogin={() => setAuthOpen(true)} bare={hall} />
      <main className="relative flex-1">
        <Outlet />
      </main>
      {/* The hall is only a doorway: no footer or tab bar, everything else lives inside the worlds. */}
      {!hall && !location.pathname.startsWith('/admin') && <Footer />}
      {!hall && <MobileNav />}
      <DesignPanel />
      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />
      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
    </div>
    </WorldNavigationProvider>
    </PortalProvider>
  )
}

/** Very subtle ambient field so large dark surfaces never look flat. */
function BackgroundField() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 bg-ink-950" />
      <div
        className="absolute -top-[22rem] left-1/2 h-[46rem] w-[78rem] -translate-x-1/2 animate-drift rounded-full opacity-[0.16] blur-[120px]"
        style={{
          background: 'radial-gradient(closest-side, var(--color-signal-500), transparent 70%)',
        }}
      />
      <div
        className="absolute top-[28rem] -left-40 h-[34rem] w-[34rem] rounded-full opacity-[0.10] blur-[130px]"
        style={{ background: 'radial-gradient(closest-side, var(--color-promo-500), transparent 70%)' }}
      />
      <div className="absolute inset-0 texture-grid opacity-[0.35] [mask-image:radial-gradient(ellipse_at_top,black,transparent_65%)]" />
    </div>
  )
}
