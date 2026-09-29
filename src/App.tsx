import { Route, Routes } from 'react-router-dom'
import { Layout } from '@/components/layout/Layout'
import Home from '@/pages/Home'
import Games from '@/pages/Games'
import Catalog from '@/pages/Catalog'
import ServerProfile from '@/pages/ServerProfile'
import Openings from '@/pages/Openings'
import RatingPage from '@/pages/RatingPage'
import Favorites from '@/pages/Favorites'
import Owners from '@/pages/Owners'
import AddServer from '@/pages/AddServer'
import Dashboard from '@/pages/Dashboard'
import Boost from '@/pages/Boost'
import UiStates from '@/pages/UiStates'
import NotFound from '@/pages/NotFound'
import GameWorld from '@/pages/GameWorld'
import Account from '@/pages/Account'
import Admin from '@/pages/Admin'
import { Privacy, Terms } from '@/pages/Legal'
import Copyright from '@/pages/Copyright'
import Design from '@/pages/Design'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="games" element={<Games />} />
        <Route path="catalog" element={<Catalog />} />
        <Route path="server/:slug" element={<ServerProfile />} />
        <Route path="openings" element={<Openings />} />
        <Route path="rating" element={<RatingPage />} />
        <Route path="favorites" element={<Favorites />} />
        <Route path="owners" element={<Owners />} />
        <Route path="add-server" element={<AddServer />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="account" element={<Account />} />
        <Route path="admin" element={<Admin />} />
        <Route path="copyright" element={<Copyright />} />
        <Route path="privacy" element={<Privacy />} />
        <Route path="terms" element={<Terms />} />
        <Route path="boost" element={<Boost />} />
        <Route path="states" element={<UiStates />} />
        <Route path="design" element={<Design />} />

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
