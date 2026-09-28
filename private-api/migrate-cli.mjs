import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { migrate, migrationPlan, postgresStore } from './db.mjs'

export function requireApprovedPlan(plan,expectedHash,backupReference) {
  if(!/^[a-f0-9]{64}$/.test(expectedHash??'') || expectedHash!==plan.pendingHash) throw new Error('expected_migration_hash_required_or_changed')
  if(typeof backupReference!=='string' || backupReference.trim().length<10) throw new Error('verified_backup_reference_required')
  if(!plan.pending.length) throw new Error('no_pending_migrations')
}

async function main() {
  const args=process.argv.slice(2)
  const applying=args.includes('--apply')
  if((applying&&args.includes('--plan'))||args.some(arg=>!['--apply','--plan'].includes(arg)&&!arg.startsWith('--expect-sha256=')))
    throw new Error('use --plan or --apply --expect-sha256=<plan hash>')
  const expected=args.find(arg=>arg.startsWith('--expect-sha256='))?.split('=')[1]
  if(!process.env.DATABASE_URL || (!process.env.PG_CA_FILE && !process.env.PG_CA_PEM))
    throw new Error('DATABASE_URL and PG_CA_FILE or PG_CA_PEM required')
  const ca=process.env.PG_CA_PEM??await readFile(process.env.PG_CA_FILE,'utf8')
  const db=postgresStore(process.env.DATABASE_URL,ca)
  try {
    const plan=await migrationPlan(db)
    console.log(JSON.stringify({applied:plan.applied,pending:plan.pending,pendingHash:plan.pendingHash},null,2))
    if(!applying) return
    requireApprovedPlan(plan,expected,process.env.MIGRATION_BACKUP_REFERENCE)
    await migrate(db,{expectedPendingHash:expected})
    const after=await migrationPlan(db)
    if(after.pending.length) throw new Error('migrations_remain_pending')
    console.log(`Applied ${plan.pending.length} private migration(s); backup reference retained by operator.`)
  } finally { await db.close() }
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) await main()
