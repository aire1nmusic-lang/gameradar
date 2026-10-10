import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatCompact, formatNumber, plural } from '@/lib/format'
import { useGames } from '@/hooks/data'
import type { Game } from '@/models'
import { cardSrc, reducedMotion, usePortalFlight } from './portal'

/**
 * The first screen: an empty cathedral hall with three glass cards floating in
 * it, one per game. The cards drift, lean towards the pointer and catch a
 * light sweep. Hovering one brings it forward and dims the others; choosing
 * it lifts the card off the wall and grows it over the whole screen, the hall
 * sinks back, and the game's world opens out of the card.
 *
 * Phones: the vertical hall and the cards in a swipeable row.
 */

const WORLDS = ['lineage2', 'minecraft', 'gtarp'] as const

const cardSrcSet = (gameId: string) => `${cardSrc(gameId, 480)} 480w, ${cardSrc(gameId, 960)} 960w`
const NAVE_SRCSET = [1280, 1920, 2560, 3840].map((w) => `/media/hub/nave-${w}.webp ${w}w`).join(', ')
const NAVE_PHONE_SRCSET = '/media/hub/nave-m-720.webp 720w, /media/hub/nave-m-1080.webp 1080w'

/** Cards lean towards the pointer: each card reads the pointer relative to its own centre. */
function useTilt(enabled: boolean) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const node = ref.current
    if (!enabled || !node || reducedMotion() || !window.matchMedia('(pointer: fine)').matches) return
    let frame = 0
    const move = (event: PointerEvent) => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const hall = node.getBoundingClientRect()
        node.style.setProperty('--gs-px', `${(((event.clientX - hall.left) / hall.width - 0.5) * -16).toFixed(1)}px`)
        node.style.setProperty('--gs-py', `${(((event.clientY - hall.top) / hall.height - 0.5) * -10).toFixed(1)}px`)
        for (const card of node.querySelectorAll<HTMLElement>('[data-tilt]')) {
          const r = card.getBoundingClientRect()
          const x = Math.max(-1, Math.min(1, (event.clientX - (r.left + r.width / 2)) / (hall.width / 2)))
          const y = Math.max(-1, Math.min(1, (event.clientY - (r.top + r.height / 2)) / (hall.height / 2)))
          card.style.setProperty('--gs-ry', `${(x * 9).toFixed(2)}deg`)
          card.style.setProperty('--gs-rx', `${(-y * 7).toFixed(2)}deg`)
        }
      })
    }
    const leave = () => {
      for (const card of node.querySelectorAll<HTMLElement>('[data-tilt]')) {
        card.style.setProperty('--gs-ry', '0deg')
        card.style.setProperty('--gs-rx', '0deg')
      }
    }
    node.addEventListener('pointermove', move)
    node.addEventListener('pointerleave', leave)
    return () => {
      node.removeEventListener('pointermove', move)
      node.removeEventListener('pointerleave', leave)
      cancelAnimationFrame(frame)
    }
  }, [enabled])
  return ref
}

export function WorldHall() {
  const [desktop, setDesktop] = useState(() => typeof window === 'undefined' || window.matchMedia('(min-width: 1024px)').matches)
  useEffect(() => {
    const query = window.matchMedia('(min-width: 1024px)')
    const update = () => setDesktop(query.matches)
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  const { data: games = [] } = useGames()
  const byId = Object.fromEntries(games.map((game) => [game.id, game])) as Record<string, Game | undefined>
  const worlds = WORLDS.map((id) => byId[id]).filter((game): game is Game => !!game)
  const [hover, setHover] = useState<string | null>(null)
  const { flightId, enter, preload } = usePortalFlight()
  const tilt = useTilt(desktop)
  const mobileRow=useRef<HTMLDivElement>(null),mobileIndex=useRef(1)
  const mobileWorlds=['lineage2','minecraft','gtarp'].map(id=>byId[id]).filter((game):game is Game=>!!game)
  const [selectedWorld,setSelectedWorld]=useState('minecraft')
  useLayoutEffect(()=>{
    const row=mobileRow.current
    if(!row||mobileWorlds.length!==3)return
    const center=()=>{
      if(!row.clientWidth)return
      const card=row.children[mobileIndex.current] as HTMLElement|undefined
      if(card)row.scrollLeft=card.offsetLeft-row.offsetLeft-(row.clientWidth-card.clientWidth)/2
    }
    center()
    const observer=new ResizeObserver(center);observer.observe(row)
    return()=>observer.disconnect()
  },[mobileWorlds.length,desktop])
  const scrollWorlds=()=>{
    const row=mobileRow.current;if(!row?.clientWidth)return
    const center=row.scrollLeft+row.clientWidth/2
    const cards=[...row.children] as HTMLElement[]
    const nearest=cards.reduce((best,card,index)=>Math.abs(card.offsetLeft-row.offsetLeft+card.clientWidth/2-center)<Math.abs(cards[best].offsetLeft-row.offsetLeft+cards[best].clientWidth/2-center)?index:best,0)
    mobileIndex.current=nearest;setSelectedWorld(mobileWorlds[nearest]?.id??'minecraft')
  }

  const go = (event: React.MouseEvent<HTMLElement>, game: Game) => {
    // new tab, middle click and friends keep the ordinary link behaviour
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0 || reducedMotion()) return
    event.preventDefault()
    const frame = event.currentTarget.querySelector('[data-card-image]') ?? event.currentTarget
    enter(game, frame.getBoundingClientRect())
  }

  return (
    <section className="gs-home-hall relative isolate overflow-hidden">

      {/* ── wide screens ─────────────────────────────────────────────── */}
      {desktop && <div ref={tilt} className="relative hidden h-[max(640px,100svh)] lg:block">
        {/* the hall: breathes, follows the pointer, sinks back when a card is chosen */}
        <div
          aria-hidden
          className="absolute inset-0"
          style={{ transform: flightId ? 'scale(1.07)' : 'none', transition: 'transform 1300ms cubic-bezier(0.5, 0, 0.2, 1)' }}
        >
          <div className="absolute -inset-5 transition-transform duration-700 ease-out" style={{ transform: 'translate3d(var(--gs-px, 0px), var(--gs-py, 0px), 0)' }}>
            <img data-boot-visual src="/media/hub/nave-1920.webp" srcSet={NAVE_SRCSET} sizes="100vw" alt="" className="gs-hall-drift absolute inset-0 h-full w-full object-cover" fetchPriority="high" decoding="async" />
          </div>
          <div className="absolute inset-x-0 top-0 h-28 gs-hall-shade-top bg-gradient-to-b from-[#08090d]/75 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 h-[38%] gs-hall-shade-bottom bg-gradient-to-t from-[#08090d] via-[#08090d]/60 to-transparent" />
        </div>

        {/* the three cards, turned towards the centre like panels in the hall */}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-10 px-6 pt-20 pb-10">
          <HallIntro/>
          <div className="flex items-center justify-center gap-[3.2vw]" style={{perspective:'1600px'}}>
          {worlds.map((game, index) => {
            const side = index === 0 ? 1 : index === worlds.length - 1 ? -1 : 0
            return (
              <WorldCard
                key={game.id}
                game={game}
                side={side}
                index={index}
                active={hover === game.id}
                dimmed={(hover !== null && hover !== game.id) || (flightId !== null && flightId !== game.id)}
                hidden={flightId === game.id}
                onEnter={(event) => go(event, game)}
                onHover={(on) => { if (on) preload(game.id); setHover((current) => (on ? game.id : current === game.id ? null : current)) }}
              />
            )
          })}
          </div>
        </div>

      </div>}

      {/* ── phones and tablets ───────────────────────────────────────── */}
      {!desktop && <div className="relative flex min-h-[100svh] flex-col justify-start lg:hidden">
        <div aria-hidden className="absolute inset-0 -z-10">
          <img data-boot-visual src="/media/hub/nave-m-720.webp" srcSet={NAVE_PHONE_SRCSET} sizes="100vw" alt=""  className="gs-hall-drift h-full w-full object-cover object-center" fetchPriority="high" decoding="async" />
          <div className="gs-hall-shade-mobile absolute inset-0 bg-gradient-to-b from-[#08090d]/30 via-[#08090d]/35 to-[#08090d]" />
        </div>
        <div className="gs-hall-phone-content pt-24 pb-6">
          <HallIntro/>
          <div ref={mobileRow} onScroll={scrollWorlds} className="gs-snap-row gs-mobile-worlds flex snap-x snap-mandatory gap-4 overflow-x-auto pt-6 pb-6" style={{ perspective: '1200px' }}>
            {mobileWorlds.map((game, index) => (
              <div key={game.id} className="gs-mobile-world-card shrink-0 snap-center">
                <WorldCard game={game} side={0} index={index} active={false} dimmed={false} hidden={flightId === game.id} onEnter={(event) => go(event, game)} onHover={(on) => on && preload(game.id)} compact />
              </div>
            ))}
          </div>
          <div className="flex justify-center gap-1" aria-label="Выбор мира">{mobileWorlds.map((game,index)=><button key={game.id} type="button" aria-label={`Показать ${game.shortName}`} aria-pressed={selectedWorld===game.id} className="grid h-11 w-11 place-items-center" onClick={()=>{const row=mobileRow.current,card=row?.children[index] as HTMLElement|undefined;if(row&&card){mobileIndex.current=index;row.scrollTo({left:card.offsetLeft-row.offsetLeft-(row.clientWidth-card.clientWidth)/2,behavior:reducedMotion()?'auto':'smooth'})}}}><span className={cn('h-1.5 rounded-full transition-all',selectedWorld===game.id?'w-6 bg-white':'w-1.5 bg-white/35')}/></button>)}</div>
          <p className="text-center text-xs text-white/70">Листай, чтобы выбрать другой мир</p>
        </div>
      </div>}

    </section>
  )
}

function HallIntro() {
  return <div className="gs-hall-intro relative z-10 mx-auto max-w-3xl px-6 text-center [text-shadow:0_2px_22px_rgba(0,0,0,0.65)]">
    <h1 className="text-[clamp(28px,3.4vw,52px)] font-semibold leading-[1.12] tracking-tight text-white">Найди мир,<br className="sm:hidden"/> в котором останешься</h1>
    <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-white/80 sm:text-base">Игровые серверы, новые открытия и сообщества — выбирай, где играть.</p>
  </div>
}

/**
 * One glass card. The outer element floats and takes the pointer tilt; the
 * inner one carries the pose in the hall (side cards face the centre) and the
 * hover push forward, so the three motions never fight over one transform.
 */
function WorldCard({
  game,
  side,
  index,
  active,
  dimmed,
  hidden,
  onEnter,
  onHover,
  compact,
}: {
  game: Game
  side: number
  index: number
  active: boolean
  dimmed: boolean
  hidden: boolean
  onEnter: (event: React.MouseEvent<HTMLElement>) => void
  onHover: (on: boolean) => void
  compact?: boolean
}) {
  const pose = `rotateY(${side * 16}deg) translateZ(${active ? 34 : dimmed ? -40 : 0}px) scale(${active ? 1.02 : 1})`
  return (
    <Link
      to={`/${game.slug}`}
      onClick={onEnter}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      onTouchStart={() => onHover(true)}
      onFocus={() => onHover(true)}
      onBlur={() => onHover(false)}
      aria-label={`Открыть мир ${game.name}`}
      className={cn('group block outline-none', compact ? 'gs-mobile-card w-full' : 'w-[clamp(210px,17.5vw,340px)]')}
      style={{ transformStyle: 'preserve-3d' }}
    >
      <div className="gs-float" style={{ animationDelay: `${index * -2.1}s`, transformStyle: 'preserve-3d' }}>
        <div
          data-tilt
          style={{
            transform: 'rotateX(var(--gs-rx, 0deg)) rotateY(var(--gs-ry, 0deg))',
            transition: 'transform 500ms cubic-bezier(0.22,1,0.36,1)',
            transformStyle: 'preserve-3d',
          }}
        >
          <div
            className="transition-[transform,filter,opacity] duration-500 ease-out"
            style={{
              transform: pose,
              filter: dimmed ? 'brightness(0.55) saturate(0.8)' : 'none',
              opacity: hidden ? 0 : 1,
              transformStyle: 'preserve-3d',
            }}
          >
            <div
              className="gs-glass-card relative rounded-[22px] p-[9px]"
              style={{ boxShadow: active ? `0 0 0 1px color-mix(in oklab, ${game.accent} 60%, transparent), 0 30px 90px -20px color-mix(in oklab, ${game.accent} 70%, transparent), 0 40px 80px -30px rgb(0 0 0 / 0.9)` : undefined }}
            >
              <div data-card-image className="relative aspect-[2/3] overflow-hidden rounded-[14px]">
                <img
                  data-boot-visual
                  loading="eager"
                  src={cardSrc(game.id, 480)}
                  srcSet={cardSrcSet(game.id)}
                  sizes={compact ? 'min(62vw, 300px, 40svh)' : '480px'}
                  alt={`${game.name}`}
                  className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.06]"
                  decoding="async"
                />
                <div className="gs-sheen absolute inset-0" style={{ animationDelay: `${index * 1.3}s` }} />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent p-4 pt-14">
                  <div className="text-[19px] leading-tight font-semibold text-white">{game.shortName}</div>
                  <div className="num mt-1 flex items-center gap-2 text-[12px] text-white/75">
                    {formatNumber(game.serversCount)} {plural(game.serversCount, ['сервер', 'сервера', 'серверов'])}
                    {game.playersOnline > 0 && (
                      <span className="flex items-center gap-1">
                        <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-signal-400" />
                        {formatCompact(game.playersOnline)}
                      </span>
                    )}
                  </div>
                  <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/10 px-3 py-1 text-[12px] font-medium text-white backdrop-blur-sm transition-colors group-hover:bg-white/20">
                    Войти в мир <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Link>
  )
}
