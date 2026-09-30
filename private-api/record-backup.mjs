import {productionConfig} from './production-config.mjs'
import {postgresStore} from './db.mjs'
import {recordBackupUpload} from './operations.mjs'

// Local-only CLI, never a public HTTP endpoint or an AI capability.
const bytes=Number(process.argv[2])
if(!Number.isSafeInteger(bytes)||bytes<=0)throw new Error('verified_backup_bytes_required')
const cfg=await productionConfig(),db=postgresStore(cfg.connectionString,cfg.ca)
try {await recordBackupUpload(db,bytes);console.log('backup_upload_heartbeat_recorded')}
finally {await db.close()}
