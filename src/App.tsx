import { lazy, Suspense, type ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from '@/components/layout/Layout'
import Home from '@/pages/Home'
const Games = lazy(() => import('@/pages/Games'))
// Route code is split: a page evaluates only its own code; the rest is fetched in the background once the page is idle.
const loadCatalog = () => import('@/pages/Catalog')
const loadServer = () => import('@/pages/ServerProfile')
const loadOpenings = () => import('@/pages/Openings')
const loadRating = () => import('@/pages/RatingPage')
const loadFavorites = () => import('@/pages/Favorites')
const loadWorld = () => import('@/pages/GameWorld')
const loadAccount = () => import('@/pages/Account')
const Catalog = lazy(loadCatalog)
const ServerProfile = lazy(loadServer)
const Openings = lazy(loadOpenings)
const RatingPage = lazy(loadRating)
const Favorites = lazy(loadFavorites)
const Owners = lazy(() => import('@/pages/Owners'))
const AddServer = lazy(() => import('@/pages/AddServer'))
const Dashboard = lazy(() => import('@/pages/Dashboard'))
const Boost = lazy(() => import('@/pages/Boost'))
const UiStates = lazy(() => import('@/pages/UiStates'))
import NotFound from '@/pages/NotFound'
const GameWorld = lazy(loadWorld)
const Account = lazy(loadAccount)

if (typeof window !== 'undefined') {
  const prefetch = () => { for (const load of [loadWorld, loadCatalog, loadServer, loadRating, loadOpenings, loadFavorites, loadAccount]) void load().catch(() => undefined) }
  const idle = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback
  window.addEventListener('load', () => { if (idle) idle(prefetch, { timeout: 4000 }); else setTimeout(prefetch, 2500) }, { once: true })
}
const Privacy = lazy(() => import('@/pages/Legal').then(page => ({default:page.Privacy})))
const Terms = lazy(() => import('@/pages/Legal').then(page => ({default:page.Terms})))
const About = lazy(() => import('@/pages/Legal').then(page => ({default:page.About})))
const Copyright = lazy(() => import('@/pages/Copyright'))
const Design = lazy(() => import('@/pages/Design'))

/** Split main pages: a quiet placeholder of page height while their code arrives (usually already prefetched). */
function RoutePage({ children }: { children: ReactNode }) {
  return <Suspense fallback={<div aria-busy="true" className="min-h-[70vh]" />}>{children}</Suspense>
}

function DeferredPage({ children }: { children: ReactNode }) {
  return <Suspense fallback={<div role="status" className="mx-auto max-w-6xl px-5 py-12 text-ink-400">Загрузка…</div>}>{children}</Suspense>
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="games" element={<DeferredPage><Games /></DeferredPage>} />
        <Route path="catalog" element={<RoutePage><Catalog /></RoutePage>} />
        <Route path="server/:slug" element={<RoutePage><ServerProfile /></RoutePage>} />
        <Route path="openings" element={<RoutePage><Openings /></RoutePage>} />
        <Route path="rating" element={<RoutePage><RatingPage /></RoutePage>} />
        <Route path="favorites" element={<RoutePage><Favorites /></RoutePage>} />
        <Route path="owners" element={<DeferredPage><Owners /></DeferredPage>} />
        <Route path="add-server" element={<DeferredPage><AddServer /></DeferredPage>} />
        <Route path="dashboard" element={<DeferredPage><Dashboard /></DeferredPage>} />
        <Route path="account" element={<RoutePage><Account /></RoutePage>} />
        <Route path="admin" element={<Navigate to="/account" replace />} />
        <Route path="copyright" element={<DeferredPage><Copyright /></DeferredPage>} />
        <Route path="privacy" element={<DeferredPage><Privacy /></DeferredPage>} />
        <Route path="terms" element={<DeferredPage><Terms /></DeferredPage>} />
        <Route path="about" element={<DeferredPage><About /></DeferredPage>} />
        <Route path="boost" element={<DeferredPage><Boost /></DeferredPage>} />
        <Route path="states" element={<DeferredPage><UiStates /></DeferredPage>} />
        <Route path="design" element={<DeferredPage><Design /></DeferredPage>} />

        {/*
          Themed game worlds. React Router ranks static segments above dynamic
          ones, so every route above still wins over /:gameSlug.
        */}
        <Route path=":gameSlug" element={<RoutePage><GameWorld /></RoutePage>} />
        <Route path=":gameSlug/:chronicleSlug" element={<RoutePage><GameWorld /></RoutePage>} />

        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}

