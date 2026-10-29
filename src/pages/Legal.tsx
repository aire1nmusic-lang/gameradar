import { Link } from 'react-router-dom'
import { useSeo } from '@/lib/seo'
import legal from '@/data/legal.json'
import about from '@/data/about.json'

type Section = { heading: string; paragraphs?: string[]; list?: string[] }
type Doc = { path: string; title: string; description: string; sections: Section[]; links?: { label: string; to: string }[] }

function LegalDocument({ doc, dated = `Редакция от ${legal.updated}` }: { doc: Doc; dated?: string }) {
  useSeo({ title: doc.title, description: doc.description, path: doc.path })
  const { operator } = legal
  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-10">
      <h1 className="text-3xl font-semibold">{doc.title}</h1>
      <p className="text-sm text-ink-400">{dated}</p>
      {doc.sections.map((section) => (
        <section key={section.heading} className="space-y-3">
          <h2 className="text-xl font-medium">{section.heading}</h2>
          {section.paragraphs?.map((text) => <p key={text} className="text-ink-300">{text}</p>)}
          {section.list && (
            <ul className="list-disc space-y-2 pl-5 text-ink-300">
              {section.list.map((item) => <li key={item}>{item}</li>)}
            </ul>
          )}
        </section>
      ))}
      {doc.links && (
        <p className="flex flex-wrap gap-x-5">
          {doc.links.map((link) => <Link key={link.to} className="inline-flex min-h-11 items-center text-signal-400 underline" to={link.to}>{link.label}</Link>)}
        </p>
      )}
      <section className="space-y-2 border-t border-white/8 pt-6">
        <h2 className="text-xl font-medium">Оператор и контакты</h2>
        {operator.name && <p className="text-ink-300">Оператор: {operator.name}{operator.inn ? `, ИНН ${operator.inn}` : ''}</p>}
        {operator.address && <p className="text-ink-300">Адрес: {operator.address}</p>}
        <p className="text-ink-300">Вопросы по данным и претензии: <a className="text-signal-400 underline" href={`mailto:${operator.contactEmail}`}>{operator.contactEmail}</a></p>
        <p className="text-sm text-ink-400">
          <Link className="underline" to="/privacy">Политика</Link> · <Link className="underline" to="/terms">Соглашение</Link> · <Link className="underline" to="/copyright">Правообладателям</Link>
        </p>
      </section>
    </main>
  )
}

export function Privacy() { return <LegalDocument doc={legal.privacy} /> }
export function Terms() { return <LegalDocument doc={legal.terms} /> }
export function About() { return <LegalDocument doc={about} dated={`Обновлено ${about.updated}`} /> }
