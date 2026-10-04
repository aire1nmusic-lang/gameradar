import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { worldArt } from '@/data/themeMedia'
import type { Chronicle, Game } from '@/models'
import { WorldArtSurface } from '@/components/media/WorldArt'
export function ChronicleTiles({game, chronicles, counts, className}: {
 game:Game; chronicles:Chronicle[]; counts:Record<string,{servers:number;online:number}>; className?:string
}) {
 const shown=game.id==='lineage2'?chronicles:chronicles.filter(c=>counts[c.id]?.servers)
 return <div className={cn('gs-chronicle-tiles',className)}>{shown.map(c=><Link key={c.id} to={`/${game.slug}/${c.slug}`} className="gs-chronicle-tile">
 <WorldArtSurface art={worldArt('card',game.id,c.id)} scrim="none" sizes="(min-width: 1024px) 220px, 160px" width={400}/>
 <span className="gs-chronicle-caption"><strong>{c.label}</strong><small>{counts[c.id]?.servers??0} серверов</small></span>
 </Link>)}</div>
}
