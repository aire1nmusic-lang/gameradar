/**
 * Imports the curated real-server dataset (import/*.json) into D1.
 *
 *   npm run import:check                          validate the dataset, touch nothing
 *   npm run import:servers                        local D1 (.wrangler/state)
 *   npm run import:servers -- --hide-demo         …and hide DEMO cards (they stay in the DB)
 *   npm run import:servers -- --remote --config <wrangler.toml> --yes
 *                                                 production D1; without --yes only the plan is printed
 *
 * Other flags: --persist-to <dir>, --dry-run (write SQL + plan only),
 * --games lineage2,minecraft,gtarp (limit this run to named games),
 * --include-likely (also import records confirmed by a single source),
 * --archive-missing (archive imported cards no longer in the dataset),
 * --show-demo (undo --hide-demo).
 *
 * Repeat runs are safe: the SQL is a set of upserts keyed by the record key.
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { DatasetError, importSql, loadDataset, serverId } from './import/dataset.mjs'

const args = process.argv.slice(2)
const flag = name => args.includes(name)
const option = name => {
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : undefined
}
const coreGames = new Set(['lineage2', 'minecraft', 'gtarp', 'rust', 'cs2', 'dayz'])
const gameOption = option('--games')
if (flag('--games') && (!gameOption || gameOption.startsWith('--'))) throw new Error('--games requires a comma-separated list')
const selectedGames = gameOption ? new Set(gameOption.split(',').map(value => value.trim()).filter(Boolean)) : null
if (selectedGames && (!selectedGames.size || [...selectedGames].some(game => !coreGames.has(game))))
  throw new Error('--games contains an unknown game')

let records
try {
  records = loadDataset()
} catch (error) {
  if (error instanceof DatasetError) {
    console.error('Dataset invalid: ' + error.message)
    process.exit(1)
  }
  throw error
}

const byGame = game => records.filter(record => record.game === game)
const summary = list => `${list.filter(r => r.confidence === 'confirmed').length} confirmed, ${list.filter(r => r.confidence === 'likely').length} likely, ${list.filter(r => r.endpoint).length} with direct endpoint, ${list.filter(r => r.onlineSources.length).length} with online sources`
console.log(`Dataset OK: ${records.length} records`)
for (const game of ['lineage2', 'minecraft', 'gtarp', 'rust', 'cs2', 'dayz']) console.log(`  ${game.padEnd(10)} ${summary(byGame(game))}`)
if (flag('--check')) process.exit(0)

const remote = flag('--remote')
const config = option('--config')
const persistTo = path.resolve(option('--persist-to') ?? '.wrangler/state')
const target = remote ? ['--remote', ...(config ? ['--config', config] : [])] : ['--local', '--persist-to', persistTo, ...(config ? ['--config', config] : [])]

function wrangler(extra, { capture = false } = {}) {
  const run = spawnSync(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'd1', 'execute', 'gamescout', ...target, ...extra], {
    encoding: 'utf8',
    windowsHide: true,
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
  })
  if (run.error) throw run.error
  if (run.status !== 0) {
    if (capture) console.error(run.stderr || run.stdout)
    process.exit(run.status ?? 1)
  }
  return run.stdout
}

function query(sql) {
  const out = wrangler(['--json', '--command', sql], { capture: true })
  const parsed = JSON.parse(out.slice(out.indexOf('[')))
  return parsed.flatMap(result => result.results ?? [])
}

const eligible = selectedGames ? records.filter(record => selectedGames.has(record.game)) : records
const importable = eligible.filter(record => record.confidence === 'confirmed' || flag('--include-likely'))
const existing = query('SELECT s.id, s.slug, s.game_id, s.import_key, s.is_demo, s.moderation, s.owner_id, COALESCE(p.claimed,0) AS projected_claimed FROM servers s LEFT JOIN public_server_projection p ON p.server_id=s.id')
const chronicles = query('SELECT id, game_id FROM chronicles')
const games = new Set(query('SELECT id FROM games').map(row => row.id))
for (const game of new Set(importable.map(record => record.game))) {
  if (!games.has(game)) {
    console.error(`Game ${game} is missing in this database — run migrations and the games seed first.`)
    process.exit(1)
  }
}

const wanted = new Set(importable.map(serverId))
const missing = existing.filter(row => row.import_key && (!selectedGames || selectedGames.has(row.game_id))
  && !wanted.has(row.id) && !row.owner_id && !row.projected_claimed && row.moderation === 'PUBLISHED')
const { sql, plan } = importSql(importable, {
  existing,
  chronicles,
  hideDemo: flag('--hide-demo'),
  showDemo: flag('--show-demo'),
  archive: flag('--archive-missing') ? missing.map(row => row.id) : [],
})

const stamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')
const outDir = path.resolve('output/import')
mkdirSync(outDir, { recursive: true })
const sqlFile = path.join(outDir, `import-${remote ? 'remote' : 'local'}-${stamp}.sql`)
writeFileSync(sqlFile, sql)
writeFileSync(sqlFile.replace(/\.sql$/, '.plan.json'), JSON.stringify(plan, null, 2))

const inserts = plan.filter(item => item.action === 'insert').length
console.log(`\nTarget: ${remote ? 'REMOTE (production) D1' : 'local D1 ' + persistTo}`)
console.log(`Games: ${selectedGames ? [...selectedGames].join(', ') : 'all dataset games'}`)
console.log(`Plan: ${plan.length} records — ${inserts} new, ${plan.length - inserts} existing (updated only if a fact changed)`)
console.log(`Skipped (confidence: likely — use --include-likely): ${eligible.length - importable.length}`)
if (missing.length) console.log(`Imported cards no longer in the dataset: ${missing.map(row => row.id).join(', ')}${flag('--archive-missing') ? ' — archiving' : ' — kept (use --archive-missing)'}`)
const demo = existing.filter(row => row.is_demo)
if (demo.length) console.log(`DEMO cards: ${demo.length} (${demo.filter(row => row.moderation === 'PUBLISHED').length} published)${flag('--hide-demo') ? ' — hiding' : ''}${flag('--show-demo') ? ' — showing' : ''}`)
console.log(`SQL: ${sqlFile}`)

if (flag('--dry-run')) process.exit(0)
if (remote && !flag('--yes')) {
  console.log('\nRemote import not executed: re-run with --yes after reviewing the plan.')
  process.exit(0)
}

wrangler(['--file', sqlFile], { capture: true })
const after = query(`SELECT COUNT(*) AS imported, SUM(moderation='PUBLISHED') AS published FROM servers WHERE import_key IS NOT NULL`)[0]
const demoAfter = query(`SELECT SUM(moderation='PUBLISHED') AS published, COUNT(*) AS total FROM servers WHERE is_demo=1`)[0]
console.log(`\nDone. Imported cards in DB: ${after.imported} (${after.published} published). DEMO cards: ${demoAfter.total ?? 0} (${demoAfter.published ?? 0} published).`)
