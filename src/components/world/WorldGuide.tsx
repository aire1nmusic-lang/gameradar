import { Link } from 'react-router-dom'
import type { Chronicle, Game } from '@/models'
import { Container } from '@/components/layout/Container'
import guides from '@/data/worldGuides.json'

type GameGuide = { name: string; title: string; description: string; heading: string; intro: string; faq: string[][] }
type ChronicleGuide = { label: string; title: string; intro: string }
const GAMES = guides.games as Record<string, GameGuide>
const CHRONICLES = guides.chronicles as Record<string, ChronicleGuide>

// Same wording as the prerendered pages (scripts/public-pages.mjs).
const chronicleDescription = (meta: ChronicleGuide) => `${meta.intro} Рейты, дата открытия и онлайн с указанием источника.`
function serverCount(count: number) {
  const last = count % 10, tens = count % 100
  const word = last === 1 && tens !== 11 ? 'сервер' : last >= 2 && last <= 4 && (tens < 12 || tens > 14) ? 'сервера' : 'серверов'
  return `В каталоге ${count} ${word}.`
}

/** Search-facing title, description and FAQ of a game world or one of its chronicles. */
export function worldSeo(game: Game, chronicle?: Chronicle) {
  const guide = GAMES[game.id]
  const meta = chronicle && CHRONICLES[`${game.slug}/${chronicle.slug}`]
  if (chronicle) return { title: meta?.title ?? `Серверы ${game.name} ${chronicle.label}`, description: meta ? chronicleDescription(meta) : `Серверы ${game.name}: ${chronicle.label}.`, faq: [] as string[][] }
  return { title: guide?.title ?? `Серверы ${game.name}`, description: guide?.description ?? `Серверы ${game.name} в каталоге GameScout.`, faq: guide?.faq ?? [] }
}

export function faqJsonLd(faq: string[][]) {
  return { '@context': 'https://schema.org', '@type': 'FAQPage',
    mainEntity: faq.map(([name, text]) => ({ '@type': 'Question', name, acceptedAnswer: { '@type': 'Answer', text } })) }
}

/**
 * A short, optional explanation under the server list: what the world is, links to its chronicles
 * and the questions people search for. Collapsed like the footer FAQ so the list stays the first thing.
 */
export function WorldGuide({ game, chronicle, count }: { game: Game; chronicle?: Chronicle; count: number | null }) {
  const guide = GAMES[game.id]
  if (!guide) return null
  const meta = chronicle && CHRONICLES[`${game.slug}/${chronicle.slug}`]
  const heading = chronicle ? `О серверах ${game.name} ${meta?.label ?? chronicle.label}` : guide.heading
  const intro = chronicle ? meta?.intro : guide.intro
  const chronicles = [...game.chronicles, ...(game.id === 'lineage2' && !game.chronicles.some(c => c.slug === 'other') ? [{ slug: 'other', label: 'Другие хроники' }] : [])]
    .filter(c => c.slug !== chronicle?.slug)
    .map(c => ({ to: `/${game.slug}/${c.slug}`, label: CHRONICLES[`${game.slug}/${c.slug}`]?.label ?? c.label }))
  const faq = chronicle ? [] : guide.faq
  // Positioned like the world layer above it, so its fixed key art does not paint over the guide.
  return <Container className="relative">
    <details className="gs-footer-faq gs-world-guide rounded-2xl bg-black/55 px-4 backdrop-blur-sm sm:px-6">
      <summary><h2 className="text-[13px] font-medium">{heading}</h2><span>{faq.length ? 'Как выбрать сервер' : 'Коротко о разделе'}</span></summary>
      <div className="gs-faq-questions">
        {intro && <p>{intro}{count != null && ` ${serverCount(count)}`}</p>}
        <p className="flex flex-wrap gap-x-4">
          {chronicle && <Link className="inline-flex min-h-11 items-center underline" to={`/${game.slug}`}>Все серверы {game.name}</Link>}
          {chronicles.map(c => <Link key={c.to} className="inline-flex min-h-11 items-center underline" to={c.to}>{c.label}</Link>)}
          <Link className="inline-flex min-h-11 items-center underline" to="/about">Как проверяется онлайн</Link>
        </p>
        {faq.map(([question, answer]) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}
      </div>
    </details>
  </Container>
}
