import { fetchPublishedCatalog } from '../scripts/reconcile-public-html.mjs'

// Browser fixtures come only from fresh anonymous public reads, never an error body.
export async function readPublicGames(fetchImpl=fetch) {
  let response
  for(let attempt=0;attempt<2;attempt++) {
    try { response=await fetchImpl(new URL('/api/v1/games', process.env.PUBLIC_API_ORIGIN || 'https://gamescout.online/').href,{signal:AbortSignal.timeout(30000),headers:{Accept:'application/json','Cache-Control':'no-cache'}}) }
    catch(error) { if(attempt===1)throw error;continue }
    if(attempt===0&&[502,503,504].includes(response.status)){await response.body?.cancel().catch(()=>{});continue}
    break
  }
  if(!response.ok)throw new Error(`Public games API returned HTTP ${response.status}`)
  const games=await response.json()
  if(!Array.isArray(games)||!games.length)throw new Error('Invalid public games fixture')
  return games
}
export async function readPublicCatalog(fetchImpl=fetch) {
  const items=await fetchPublishedCatalog(process.env.PUBLIC_API_ORIGIN || 'https://gamescout.online/',fetchImpl)
  return {items,total:items.length}
}
