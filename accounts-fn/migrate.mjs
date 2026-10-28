import { Driver, getCredentialsFromEnv } from 'ydb-sdk'
import { statements } from './schema.mjs'

/**
 * Creates the accounts tables in an EXISTING YDB database. Never run by the function and never automatic:
 *   YDB_ENDPOINT=grpcs://ydb.serverless.yandexcloud.net:2135 YDB_DATABASE=/ru-central1/<cloud>/<db> \
 *   YDB_ACCESS_TOKEN_CREDENTIALS=<short-lived IAM token> node accounts-fn/migrate.mjs --apply
 * (local test database: YDB_ENDPOINT=grpc://localhost:2136 YDB_DATABASE=/local YDB_ANONYMOUS_CREDENTIALS=1)
 * Without --apply it only prints the statements. Existing tables are left untouched; nothing is dropped or altered.
 */
const apply = process.argv.includes('--apply')
if (!apply) {
  for (const [name, yql] of statements) console.log(`-- ${name}\n${yql};\n`)
  console.log('Dry run: pass --apply to execute against YDB_ENDPOINT/YDB_DATABASE.')
  process.exit(0)
}
const { YDB_ENDPOINT: endpoint, YDB_DATABASE: database } = process.env
if (!endpoint || !database) throw new Error('YDB_ENDPOINT_and_YDB_DATABASE_required')
const driver = new Driver({ connectionString: `${endpoint}?database=${encodeURIComponent(database)}`, authService: getCredentialsFromEnv() })
if (!await driver.ready(15_000)) throw new Error('ydb_driver_not_ready')
try {
  for (const [name, yql] of statements) {
    try {
      await driver.queryClient.do({ fn: async session => { const result = await session.execute({ text: yql }); await result.opFinished } })
      console.log('created', name)
    } catch (error) {
      if (/already exists|path exist|ALREADY_EXISTS/i.test(String(error?.message ?? error))) console.log('exists ', name)
      else throw error
    }
  }
} finally { await driver.destroy() }
