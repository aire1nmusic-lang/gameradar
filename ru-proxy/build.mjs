/**
 * Assembles the Vercel deploy folder of the mirror from an existing SPA build.
 *
 *   npm run build && node ru-proxy/build.mjs [--noindex] [--out ru-proxy/.deploy]
 *
 * --noindex keeps a test host out of search engines (robots.txt + X-Robots-Tag);
 * leave it off only when the mirror serves the canonical domain.
 */
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const outArg = process.argv.indexOf('--out')
const out = path.resolve(outArg > 0 ? process.argv[outArg + 1] : path.join(here, '.deploy'))
const noindex = process.argv.includes('--noindex')
const dist = path.resolve(here, '..', 'dist')
if (!existsSync(path.join(dist, 'index.html'))) throw new Error('Run npm run build first: dist/index.html is missing')

// Everything but the Vercel project link (.vercel) is rebuilt from scratch.
mkdirSync(out, { recursive: true })
for (const entry of readdirSync(out)) if (entry !== '.vercel') rmSync(path.join(out, entry), { recursive: true, force: true })
cpSync(dist, path.join(out, 'public'), { recursive: true })
for (const file of ['middleware.js', 'handler.mjs']) cpSync(path.join(here, file), path.join(out, file))
writeFileSync(path.join(out, 'package.json'), JSON.stringify({ private: true, type: 'module' }, null, 2) + '\n')

const vercel = JSON.parse(readFileSync(path.join(here, 'vercel.json'), 'utf8'))
if (noindex) {
  vercel.headers[0].headers.push({ key: 'X-Robots-Tag', value: 'noindex, nofollow' })
  writeFileSync(path.join(out, 'public', 'robots.txt'), 'User-agent: *\nDisallow: /\n')
  rmSync(path.join(out, 'public', 'sitemap.xml'), { force: true })
}
writeFileSync(path.join(out, 'vercel.json'), JSON.stringify(vercel, null, 2) + '\n')
console.log(`Mirror deploy folder: ${out}${noindex ? ' (noindex)' : ''}`)
