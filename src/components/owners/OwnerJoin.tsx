import { useRootClass } from '@/hooks/useRootClass'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowRight, BadgeCheck, LayoutDashboard, Search } from 'lucide-react'
import { getGame } from '@/data/games'
import { artSrc, worldArt } from '@/data/themeMedia'

const STEPS = [
  { icon: Search, title: 'Найди свой сервер', text: 'Каталог уже собран из открытых источников. Открой карточку своего проекта.' },
  { icon: BadgeCheck, title: 'Подтверди права', text: 'Подай заявку на владение: код на сайте или в DNS — и карточка станет твоей.' },
  { icon: LayoutDashboard, title: 'Управляй карточкой', text: 'Описание и факты о сервере можно будет редактировать через личный кабинет после подтверждения прав.' },
]

/** «Твой сервер в GameScout»: how an owner gets a card today (new cards are not accepted yet). */
export function OwnerJoin() {
  useRootClass('gs-body-owner-join')
  const [params] = useSearchParams()
  const game = getGame(params.get('game') ?? 'lineage2')
  const art = worldArt('hero', game?.id)
  const catalog = `/catalog${game ? `?game=${game.id}` : ''}`
  return (
    <div className="gs-owner-join gs-container mx-auto w-full">
      <section className="gs-owner-hero" style={art ? { backgroundImage: `url("${artSrc(art, 1600)}")` } : undefined}>
        <div className="gs-owner-hero-copy">
          <span className="gs-owner-kicker">Владельцам · {game?.name ?? 'GameScout'}</span>
          <h1>Твой сервер в GameScout</h1>
          <p>Игроки уже ищут серверы в каталоге. Подтверди права на свой проект — и управляй тем, как его видят.</p>
          <div className="gs-owner-actions">
            <Link to={catalog} className="gs-owner-primary">Найти свой сервер<ArrowRight size={18} /></Link>
            <Link to={`/account?game=${game.id}`} className="gs-owner-secondary">Мои серверы и заявки</Link>
          </div>
        </div>
      </section>
      <ol className="gs-owner-steps">
        {STEPS.map(({ icon: Icon, title, text }, index) => (
          <li key={title} className="gs-owner-step">
            <span className="gs-owner-step-icon"><Icon size={20} /></span>
            <span className="gs-owner-step-num">Шаг {index + 1}</span>
            <strong>{title}</strong>
            <p>{text}</p>
          </li>
        ))}
      </ol>
      <p className="gs-owner-note">Приём заявок на новые карточки скоро откроется. {game.id==='lineage2'?'Новые серверы Lineage 2 появляются в каталоге автоматически — три раза в день, после проверки по двум независимым источникам.':'Пока можно найти существующую карточку проекта и подтвердить права на неё.'}</p>
    </div>
  )
}
