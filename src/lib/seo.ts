import { useEffect } from 'react'

/** The public origin every canonical URL points at, whatever host served the page. */
export const SITE_ORIGIN = 'https://gamescout.online'
const SITE_NAME = 'GameScout'
const DEFAULT_DESCRIPTION =
  'GameScout — независимый навигатор по игровым серверам: проверенный онлайн, рейтинги, открытия и рост проектов.'

export interface SeoInput {
  title?: string
  description?: string
  /** path without origin, e.g. "/server/hypixel"; canonical is built from it */
  path?: string
  /** private or thin pages: keep out of the index */
  noindex?: boolean
  /** schema.org objects, rendered as one JSON-LD script */
  jsonLd?: Record<string, unknown>[]
}

function meta(attr: 'name' | 'property', key: string, content: string) {
  let element = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`)
  if (!element) {
    element = document.createElement('meta')
    element.setAttribute(attr, key)
    document.head.appendChild(element)
  }
  element.content = content
}

function canonical(href: string | undefined) {
  let element = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')
  if (!href) {
    element?.remove()
    return
  }
  if (!element) {
    element = document.createElement('link')
    element.rel = 'canonical'
    document.head.appendChild(element)
  }
  element.href = href
}

function jsonLd(objects: Record<string, unknown>[] | undefined) {
  document.head.querySelector('script[data-seo="jsonld"]')?.remove()
  if (!objects?.length) return
  const script = document.createElement('script')
  script.type = 'application/ld+json'
  script.dataset.seo = 'jsonld'
  // "<" is escaped so a server name can never close the script element.
  script.textContent = JSON.stringify(objects.length === 1 ? objects[0] : objects).replace(/</g, '\\u003c')
  document.head.appendChild(script)
}

/**
 * Title, description, canonical, Open Graph and JSON-LD for a page.
 *
 * The build prerenders factual public snapshots. Client navigation updates
 * their metadata here after the live API has loaded.
 */
export function useSeo(input: SeoInput) {
  const { title, description, path, noindex } = input
  const ld = JSON.stringify(input.jsonLd ?? null)
  useEffect(() => {
    const fullTitle = title ? `${title} — ${SITE_NAME}` : `${SITE_NAME} — навигатор по игровым серверам`
    const text = (description ?? DEFAULT_DESCRIPTION).replace(/\s+/g, ' ').trim().slice(0, 300)
    const url = path ? SITE_ORIGIN + path : undefined
    document.title = fullTitle
    meta('name', 'description', text)
    meta('name', 'robots', noindex ? 'noindex, nofollow' : 'index, follow')
    meta('property', 'og:title', fullTitle)
    meta('property', 'og:description', text)
    meta('property', 'og:site_name', SITE_NAME)
    meta('property', 'og:type', 'website')
    meta('property', 'og:locale', 'ru_RU')
    if (url) meta('property', 'og:url', url)
    meta('name', 'twitter:card', 'summary')
    canonical(noindex ? undefined : url)
    jsonLd(JSON.parse(ld) ?? undefined)
  }, [title, description, path, noindex, ld])
}

export const breadcrumbs = (items: { name: string; path: string }[]) => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: items.map((item, index) => ({ '@type': 'ListItem', position: index + 1, name: item.name, item: SITE_ORIGIN + item.path })),
})
