import { pathToFileURL } from 'node:url'
import { postgresStore } from './db.mjs'
import { runMaintenance } from './maintenance.mjs'
import { productionConfig } from './production-config.mjs'

/** Run from a private scheduler with the same secrets and verified PostgreSQL CA as the API. */
export async function maintenanceOnce(env=process.env,store=postgresStore) {
  const loaded=await productionConfig(env)
  if(!loaded.config.mailKey||!loaded.config.rateKey)throw new Error('private_runtime_keys_required')
  const db=store(loaded.connectionString,loaded.ca)
  try { return await runMaintenance(db,loaded.config,{projectionAlertSeconds:loaded.projectionAlertSeconds}) }
  finally { await db.close() }
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  const result=await maintenanceOnce()
  console.log(JSON.stringify({ok:true,processed:result}))
}
