/**
 * Builds public/sitemap.xml from the import dataset before every production
 * build: static sections, one page per game and chronicle world, and every
 * confirmed imported server. Owner-submitted cards join once the sitemap is
 * served from the API (see README).
 */
import { writeFileSync } from 'node:fs'
import { importSql, loadDataset } from './import/dataset.mjs'

const ORIGIN = 'https://gamescout.online'
const GAME_SLUG = { lineage2: 'lineage-2', minecraft: 'minecraft', gtarp: 'gta-rp', rust: 'rust', cs2: 'cs2', dayz: 'dayz' }
const WORLDS = ['lineage-2/interlude', 'lineage-2/high-five', 'lineage-2/essence', 'lineage-2/classic']

const records = loadDataset().filter(record => record.confidence === 'confirmed')
const { plan } = importSql(records)
const today = new Date().toISOString().slice(0, 10)
const byKey = new Map(records.map(record => [record.key, record]))

const urls = [
  { loc: '/', priority: '1.0' },
  ...['catalog', 'games', 'openings', 'rating', 'owners'].map(path => ({ loc: '/' + path, priority: '0.7' })),
  ...[...new Set(records.map(record => GAME_SLUG[record.game]))].map(slug => ({ loc: '/' + slug, priority: '0.8' })),
  ...WORLDS.map(path => ({ loc: '/' + path, priority: '0.6' })),
  ...plan.map(item => ({ loc: '/server/' + item.slug, priority: '0.6', lastmod: byKey.get(item.key)?.checkedAt?.slice(0, 10) ?? today })),
]

const escape = value => value.replace(/&/g, '&amp;').replace(/</g, '&lt;')
const xml = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...urls.map(url => `  <url><loc>${escape(ORIGIN + url.loc)}</loc>${url.lastmod ? `<lastmod>${url.lastmod}</lastmod>` : ''}<priority>${url.priority}</priority></url>`),
  '</urlset>',
  '',
].join('\n')
writeFileSync('public/sitemap.xml', xml)
console.log(`sitemap.xml: ${urls.length} URLs`)
