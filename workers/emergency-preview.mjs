/**
 * Public-only emergency preview, NOT a replacement for private GameScout services.
 * Bound to existing Cloudflare API Worker, never exposes admin, auth, votes or writes.
 */
const publicPaths = new Set(['/api/v1/games','/api/v1/servers','/api/v1/rating','/api/v1/support/ranking'])
const serverDetail = /^\/api\/v1\/servers\/[a-z0-9-]+(?:\/online-history)?$/
// Temporary workers.dev mirror is noindex. The canonical domain must remain indexable if an explicitly approved cutover occurs.
export default {
  async fetch(request,env) {
    const url = new URL(request.url)
    const commonHeaders = url.hostname.endsWith('.workers.dev')
      ? {'X-Robots-Tag':'noindex, nofollow','X-Content-Type-Options':'nosniff'}
      : {'X-Content-Type-Options':'nosniff'}
    const path=url.pathname
    if(request.method !== 'GET' && request.method !== 'HEAD')return new Response('Read-only preview',{status:405,headers:commonHeaders})
    if(path.startsWith('/api/')) {
      if(request.method !== 'GET'||!(publicPaths.has(path)||serverDetail.test(path)))return Response.json({error:'Not available on temporary public preview'},{status:404,headers:commonHeaders})
      const target = new URL(path+url.search,'https://gamescout.online')
      try {
        const upstream=await env.GAME_API.fetch(new Request(target,{method:'GET',headers:{Accept:'application/json'}}))
        const headers=new Headers(upstream.headers)
        for(const [key,value] of Object.entries(commonHeaders)) headers.set(key,value)
        headers.set('Cache-Control','no-store')
        return new Response(upstream.body,{status:upstream.status,headers})
      }catch {
        return Response.json({error:'Public API temporarily unavailable'},{status:503,headers:commonHeaders})
      }
    }
    // Serve the actual prerendered route, never the homepage as a missing-page fallback.
    const assetUrl = new URL(url)
    if (!path.split('/').pop()?.includes('.')) {
      assetUrl.pathname = path.endsWith('/') ? `${path}index.html` : `${path}/index.html`
    }
    const response=await env.ASSETS.fetch(new Request(assetUrl, request))
    const status = path === '/404.html' ? 404 : response.status
    const headers=new Headers(response.headers)
    for(const [key,value] of Object.entries(commonHeaders))headers.set(key,value)
    if (status === 404) {
      headers.set('X-Robots-Tag','noindex, nofollow')
      headers.set('Cache-Control','no-store')
    } else if (headers.get('Content-Type')?.includes('text/html')) {
      headers.set('Cache-Control','no-cache')
    }
    return new Response(response.body,{status,headers})
  }
}
