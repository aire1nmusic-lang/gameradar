// Explicit, isolated PostgreSQL rehearsal. Never writes to the configured source database.
import {randomBytes} from 'node:crypto'
import {migrate,postgresStore} from './db.mjs'
import {productionConfig} from './production-config.mjs'
import {rehearseCoreScenarios} from './rehearsal-scenarios.mjs'

if(process.env.PRIVATE_REHEARSAL!=='1')throw new Error('explicit_private_rehearsal_required')
const loaded=await productionConfig(),source=new URL(loaded.connectionString)
const name=`gamescout_e2e_${Date.now()}_${randomBytes(4).toString('hex')}`
if(!/^gamescout_e2e_\d+_[a-f0-9]{8}$/.test(name))throw new Error('unsafe_rehearsal_name')
const control=postgresStore(source.toString(),loaded.ca)
let db,created=false
try {
  // CREATE DATABASE cannot be inside a transaction. The random, verified name is identifier-only.
  await control.query(`CREATE DATABASE "${name}"`);created=true
  source.pathname='/'+name
  db=postgresStore(source.toString(),loaded.ca)
  await migrate(db)
  console.log(JSON.stringify({scope:'isolated-postgresql',...await rehearseCoreScenarios(db)}))
} finally {
  try {if(db)await db.close()}
  finally {
    try {if(created){await control.query(`DROP DATABASE "${name}"`);console.log('isolated_database_removed')}}
    finally {await control.close()}
  }
}
