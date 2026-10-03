import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { GAMES } from '@/data/games'
import { useServer } from '@/hooks/data'
import type { Game } from '@/models'

const WorldContext=createContext<{game?:Game;loading:boolean}>({loading:false})
const LAST_WORLD_KEY='gs.lastWorld'

export function WorldNavigationProvider({children}:{children:ReactNode}) {
  const location=useLocation()
  const slug=location.pathname.startsWith('/server/')?location.pathname.split('/')[2]:undefined
  const {data:server}=useServer(slug)
  const queryGame=new URLSearchParams(location.search).get('game')

  const explicitGame=GAMES.find(g=>g.id===(slug?server?.gameId:queryGame)
    ||location.pathname===`/${g.slug}`||location.pathname.startsWith(`/${g.slug}/`))

  // Utility pages are parts of the same world shell. Keep the last explicit
  // world so Profile/Admin/Favorites do not suddenly fall back to a generic skin.
  const rememberedId=useMemo(()=>{
    if(explicitGame)return explicitGame.id
    try{return localStorage.getItem(LAST_WORLD_KEY)??undefined}catch{return undefined}
  },[explicitGame?.id,location.pathname,location.search])
  const game=explicitGame??GAMES.find(g=>g.id===rememberedId)

  useEffect(()=>{
    if(!explicitGame)return
    try{localStorage.setItem(LAST_WORLD_KEY,explicitGame.id)}catch{/* optional */}
  },[explicitGame?.id])

  return <WorldContext.Provider value={{game,loading:!!slug&&!server}}>{children}</WorldContext.Provider>
}
export function useWorldNavigation() {
  const {game,loading}=useContext(WorldContext)
  const scoped=(path:string)=>game?`${path}?game=${encodeURIComponent(game.id)}`:path
  return {game,loading,scoped}
}
