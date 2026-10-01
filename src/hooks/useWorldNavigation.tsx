import { createContext, useContext, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { GAMES } from '@/data/games'
import { useServer } from '@/hooks/data'
import type { Game } from '@/models'

const WorldContext=createContext<{game?:Game;loading:boolean}>({loading:false})
export function WorldNavigationProvider({children}:{children:ReactNode}) {
  const location=useLocation()
  const slug=location.pathname.startsWith('/server/')?location.pathname.split('/')[2]:undefined
  const {data:server}=useServer(slug)
  const queryGame=new URLSearchParams(location.search).get('game')
  const game=GAMES.find(g=>g.id===(slug?server?.gameId:queryGame)
    ||location.pathname===`/${g.slug}`||location.pathname.startsWith(`/${g.slug}/`))
  return <WorldContext.Provider value={{game,loading:!!slug&&!server}}>{children}</WorldContext.Provider>
}
export function useWorldNavigation() {
  const {game,loading}=useContext(WorldContext)
  const scoped=(path:string)=>game?`${path}?game=${encodeURIComponent(game.id)}`:path
  return {game,loading,scoped}
}
