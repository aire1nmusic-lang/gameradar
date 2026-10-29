/**
 * Live sitemap from D1: every published card — imported or added by owners —
 * plus the static sections and every game/chronicle world.
 *
 * Served at /api/v1/sitemap.xml and, once the zone routes it to the Worker,
 * at /sitemap.xml (the static build-time file is the fallback until then).
 */
import type { Row } from './store.ts'

const ORIGIN = 'https://gamescout.online'
const SECTIONS = ['/', '/catalog', '/games', '/openings', '/rating', '/owners', '/about']

const escape = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export function sitemapXml(games: Row[], chronicles: Row[], servers: Row[]): string {
  const urls: { loc: string; lastmod?: string; priority: string }[] = [
    ...SECTIONS.map(path => ({ loc: path, priority: path === '/' ? '1.0' : '0.7' })),
    ...games.filter(game => game.servers_count > 0).map(game => ({ loc: `/${game.slug}`, priority: '0.8' })),
    ...chronicles
      .filter(chronicle => chronicle.servers_count > 0)
      .map(chronicle => ({ loc: `/${games.find(game => game.id === chronicle.game_id)?.slug}/${chronicle.slug}`, priority: '0.6' }))
      .filter(url => !url.loc.startsWith('/undefined')),
    ...servers.map(server => ({ loc: `/server/${server.slug}`, lastmod: String(server.updated_at ?? '').slice(0, 10), priority: '0.6' })),
  ]
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.map(url => `  <url><loc>${escape(ORIGIN + url.loc)}</loc>${url.lastmod ? `<lastmod>${url.lastmod}</lastmod>` : ''}<priority>${url.priority}</priority></url>`),
    '</urlset>',
    '',
  ].join('\n')
}
