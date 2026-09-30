import { pathToFileURL } from 'node:url'
import { postgresStore } from './db.mjs'
import { runMaintenance } from './maintenance.mjs'
import { productionConfig } from './production-config.mjs'
import { outboxHealth } from './outbox.mjs'

/** Diagnostic booleans only: never log the endpoint or signing secret. */
export function projectionConfiguration(config) {
  let endpointValid=false
  try {
    const url=new URL(config.publicProjection)
    endpointValid=url.protocol==='https:'&&url.hostname!==''&&!url.hostname.endsWith('.invalid')
      &&url.pathname==='/api/internal/public-projection'&&!url.username&&!url.password&&!url.search&&!url.hash
  } catch {}
  return {endpointValid,secretPresent:typeof config.projectionSecret==='string'&&config.projectionSecret.length>=32}
}

/** Run from a private scheduler with the same secrets and verified PostgreSQL CA as the API. */
export async function maintenanceOnce(env=process.env,store=postgresStore) {
  const loaded=await productionConfig(env)
  if(!loaded.config.mailKey||!loaded.config.rateKey)throw new Error('private_runtime_keys_required')
  const db=store(loaded.connectionString,loaded.ca)
  try {
    const attempted=await runMaintenance(db,loaded.config,{projectionAlertSeconds:loaded.projectionAlertSeconds})
    const health=await outboxHealth(db)
    return {...attempted,projection:{pending:health.pending,oldestSeconds:health.oldest_seconds,
      maxAttempts:health.max_attempts,...projectionConfiguration(loaded.config)}}
  }
  finally { await db.close() }
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  const result=await maintenanceOnce()
  console.log(JSON.stringify({ok:true,attempted:{mail:result.mail,public:result.public,nickname:result.nickname,
    copyright:result.copyright,telegram:result.telegram},projection:result.projection}))
}
