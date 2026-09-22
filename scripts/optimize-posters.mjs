/**
 * Builds web versions of the key-art posters.
 *
 *   node scripts/optimize-posters.mjs <source dir>   (the folder with Lineage/, Майнкрафт/, GTA/)
 *
 * Reads the 3840×2160 PNG masters (never modified) and writes 16:9 WebP at
 * 400/800/1600/2560 px into public/media/worlds/<world>/<name>-<width>.webp —
 * the layout src/data/themeMedia.ts expects. Mobile crops are done in CSS
 * (object-position per art), so there is one aspect ratio only.
 *
 * Uses sharp, which ships with wrangler/miniflare in node_modules.
 */
import { existsSync, mkdirSync, statSync } from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

if (!process.argv[2]) throw new Error('Usage: node scripts/optimize-posters.mjs <source dir>')
const SOURCE = path.resolve(process.argv[2])
const OUT = path.resolve('public/media/worlds')
const WIDTHS = [400, 800, 1600, 2560]

/** master file → published base name. Only unambiguous file names are listed. */
const POSTERS = [
  ['Lineage/Lineage_II_Interlude_4K_3840x2160.png', 'lineage-2/interlude-poster'],
  ['Lineage/Lineage_II_Essence_4K_3840x2160.png', 'lineage-2/essence-poster'],
  ['Lineage/Lineage_II_Classic_Battle_4K_3840x2160.png', 'lineage-2/classic-poster'],
  ['Lineage/Lineage_II_Gracia_Final_4K_3840x2160_v2.png', 'lineage-2/gracia-final-poster'],
  ['Майнкрафт/Minecraft_Survival_4K_3840x2160.png', 'minecraft/survival-poster'],
  ['Майнкрафт/Minecraft_Anarchy_4K_3840x2160.png', 'minecraft/anarchy-poster'],
  ['Майнкрафт/Minecraft_SkyBlock_4K_3840x2160.png', 'minecraft/skyblock-poster'],
  ['Майнкрафт/Minecraft_Prison_4K_3840x2160.png', 'minecraft/prison-poster'],
  ['Майнкрафт/Minecraft_Minigames_4K_3840x2160.png', 'minecraft/minigames-poster'],
  ['Майнкрафт/Minecraft_Modded_RPG_4K_3840x2160.png', 'minecraft/modded-rpg-poster'],
  ['GTA/GameScout_GTA_Roleplay_4K_3840x2160.png', 'gta-rp/roleplay-poster'],
  ['GTA/GameScout_GTA_Freeroam_4K_3840x2160.png', 'gta-rp/freeroam-poster'],
  ['GTA/GameScout_GTA_PVP_4K_3840x2160.png', 'gta-rp/pvp-poster'],
  ['GTA/GameScout_GTA_Drift_Racing_4K_3840x2160.png', 'gta-rp/drift-racing-poster'],
  ['GTA/GameScout_GTA_Gang_Crime_4K_3840x2160.png', 'gta-rp/gang-crime-poster'],
]

let before = 0
let after = 0
for (const [source, base] of POSTERS) {
  const file = path.join(SOURCE, source)
  if (!existsSync(file)) throw new Error(`Missing master: ${file}`)
  before += statSync(file).size
  mkdirSync(path.dirname(path.join(OUT, base)), { recursive: true })
  const sizes = []
  for (const width of WIDTHS) {
    const target = path.join(OUT, `${base}-${width}.webp`)
    // Large widths keep more detail; small ones are thumbnails behind a scrim.
    await sharp(file)
      .resize({ width, height: Math.round((width * 9) / 16), fit: 'cover' })
      .webp({ quality: width >= 1600 ? 80 : 74, effort: 6, smartSubsample: true })
      .toFile(target)
    const size = statSync(target).size
    after += size
    sizes.push(`${width}:${Math.round(size / 1024)}K`)
  }
  console.log(`${base.padEnd(32)} ${sizes.join('  ')}`)
}
console.log(`\nmasters ${(before / 1048576).toFixed(1)} MB → web ${(after / 1048576).toFixed(1)} MB (all widths)`)
