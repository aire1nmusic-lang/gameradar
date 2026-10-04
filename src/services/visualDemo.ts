import type { GameServer } from '@/models'
/** Browser-only presentation samples. Never passed to votes, Coins or projection writes. */
export function visualDemo(servers:GameServer[]):GameServer[]{return servers.map(server=>{
 let seed=2166136261
 for(const char of server.id)seed=Math.imul(seed^char.charCodeAt(0),16777619)>>>0
 const decorated=seed%4!==0
 const hue=seed%360
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><rect width="80" height="80" rx="16" fill="hsl(${hue} 50% 22%)"/><path d="M40 9 65 24v24L40 71 15 48V24Z" fill="none" stroke="hsl(${hue} 85% 70%)" stroke-width="3"/><path d="m40 21 7 13 14 3-10 10 2 15-13-7-13 7 2-15-10-10 14-3Z" fill="hsl(${hue} 85% 75%)"/></svg>`
 return {...server,votes:decorated?10+seed%490:server.votes,support:decorated?{coins:5+seed%195,participants:1+seed%29}:server.support,logoUrl:decorated&&seed%3!==0?'data:image/svg+xml,'+encodeURIComponent(svg):server.logoUrl}
})}
