/**
 * Builds public/sitemap.xml from the import dataset before every production
 * build: static sections, one page per game and chronicle world, and every
 * confirmed imported server. Owner-submitted cards join once the sitemap is
 * served from the API (see README).
 */
import { writeFileSync } from 'node:fs'
import { ORIGIN, publicPages } from './public-pages.mjs'

// Keep the sitemap equal to the URLs that actually receive route-specific HTML.
// Thin dynamic routes such as /rating and /openings join after factual SSR exists.
const urls = publicPages().map(page => ({ loc: page.path, lastmod: page.lastmod, priority: page.path === '/' ? '1.0' : page.path.startsWith('/server/') ? '0.6' : '0.7' }))

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
