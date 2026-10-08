import { lazy, Suspense, type ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from '@/components/layout/Layout'
import Home from '@/pages/Home'
const Games = lazy(() => import('@/pages/Games'))
import Catalog from '@/pages/Catalog'
import ServerProfile from '@/pages/ServerProfile'
import Openings from '@/pages/Openings'
import RatingPage from '@/pages/RatingPage'
import Favorites from '@/pages/Favorites'
const Owners = lazy(() => import('@/pages/Owners'))
const AddServer = lazy(() => import('@/pages/AddServer'))
const Dashboard = lazy(() => import('@/pages/Dashboard'))
const Boost = lazy(() => import('@/pages/Boost'))
const UiStates = lazy(() => import('@/pages/UiStates'))
import NotFound from '@/pages/NotFound'
import GameWorld from '@/pages/GameWorld'
import Account from '@/pages/Account'
const Privacy = lazy(() => import('@/pages/Legal').then(page => ({default:page.Privacy})))
const Terms = lazy(() => import('@/pages/Legal').then(page => ({default:page.Terms})))
const Copyright = lazy(() => import('@/pages/Copyright'))
const Design = lazy(() => import('@/pages/Design'))

function DeferredPage({ children }: { children: ReactNode }) {
  return <Suspense fallback={<div role="status" className="mx-auto max-w-6xl px-5 py-12 text-ink-400">Загрузка…</div>}>{children}</Suspense>
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="games" element={<DeferredPage><Games /></DeferredPage>} />
        <Route path="catalog" element={<Catalog />} />
        <Route path="server/:slug" element={<ServerProfile />} />
        <Route path="openings" element={<Openings />} />
        <Route path="rating" element={<RatingPage />} />
        <Route path="favorites" element={<Favorites />} />
        <Route path="owners" element={<DeferredPage><Owners /></DeferredPage>} />
        <Route path="add-server" element={<DeferredPage><AddServer /></DeferredPage>} />
        <Route path="dashboard" element={<DeferredPage><Dashboard /></DeferredPage>} />
        <Route path="account" element={<Account />} />
        <Route path="admin" element={<Navigate to="/account" replace />} />
        <Route path="copyright" element={<DeferredPage><Copyright /></DeferredPage>} />
        <Route path="privacy" element={<DeferredPage><Privacy /></DeferredPage>} />
        <Route path="terms" element={<DeferredPage><Terms /></DeferredPage>} />
        <Route path="boost" element={<DeferredPage><Boost /></DeferredPage>} />
        <Route path="states" element={<DeferredPage><UiStates /></DeferredPage>} />
        <Route path="design" element={<DeferredPage><Design /></DeferredPage>} />

        {/*
          Themed game worlds. React Router ranks static segments above dynamic
          ones, so every route above still wins over /:gameSlug.
        */}
        <Route path=":gameSlug" element={<GameWorld />} />
        <Route path=":gameSlug/:chronicleSlug" element={<GameWorld />} />

        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}

