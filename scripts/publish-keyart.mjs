/**
 * Publishes the AI key-art masters as responsive WebP.
 *
 *   node scripts/publish-keyart.mjs <masters dir>
 *
 * Reads 16:9 PNG masters (any size ≥ 3840 px wide) named as in MASTERS and
 * writes public/media/worlds/<world>/<name>-<width>.webp at
 * 400/800/1600/2560/3840 px — the layout src/data/themeMedia.ts expects.
 * Masters are never modified; keep them outside the repo (Постеры/ is ignored).
 */
import { existsSync, mkdirSync, statSync } from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

if (!process.argv[2]) throw new Error('Usage: node scripts/publish-keyart.mjs <masters dir>')
const SOURCE = path.resolve(process.argv[2])
const OUT = path.resolve('public/media/worlds')
const WIDTHS = [400, 800, 1600, 2560, 3840]

/** master file → published base name */
const MASTERS = [
  ['l2-master.png', 'lineage-2/master'],
  ['l2-interlude-master.png', 'lineage-2/interlude'],
  ['l2-highfive.png', 'lineage-2/high-five'],
  ['l2-classic-master.png', 'lineage-2/classic'],
  ['l2-essence-master.png', 'lineage-2/essence'],
  ['mc-master.png', 'minecraft/master'],
  ['mc-anarchy-master.png', 'minecraft/anarchy'],
  ['mc-skyblock-master.png', 'minecraft/skyblock'],
  ['mc-minigames-master.png', 'minecraft/minigames'],
  ['gta-master.png', 'gta-rp/master'],
  ['rust-master.png', 'rust/master'],
  ['cs2-master.png', 'cs2/master'],
]

let total = 0
for (const [source, base] of MASTERS) {
  const file = path.join(SOURCE, source)
  if (!existsSync(file)) throw new Error(`Missing master: ${file}`)
  mkdirSync(path.dirname(path.join(OUT, base)), { recursive: true })
  const sizes = []
  for (const width of WIDTHS) {
    const target = path.join(OUT, `${base}-${width}.webp`)
    await sharp(file)
      .resize({ width, height: Math.round((width * 9) / 16), fit: 'cover', position: 'centre' })
      .webp({ quality: width >= 2560 ? 78 : width >= 1600 ? 80 : 74, effort: 6, smartSubsample: true })
      .toFile(target)
    const size = statSync(target).size
    total += size
    sizes.push(`${width}:${Math.round(size / 1024)}K`)
  }
  console.log(`${base}  ${sizes.join('  ')}`)
}
console.log(`total ${(total / 1024 / 1024).toFixed(1)} MB`)
