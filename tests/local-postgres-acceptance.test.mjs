import test from 'node:test'
import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
test('disposable PostgreSQL CLI requires explicit opt-in before Docker or production credentials are touched',()=>{
  const result=spawnSync(process.execPath,['scripts/local-postgres-acceptance.mjs'],{encoding:'utf8',timeout:10000,
    env:{...process.env,PRIVATE_LOCAL_POSTGRES_REHEARSAL:'0',DATABASE_URL:'never-connect.invalid',PG_CA_PEM:'never-read'}})
  assert.equal(result.status,1)
  assert.match(result.stderr,/Explicit PRIVATE_LOCAL_POSTGRES_REHEARSAL=1 required/)
  assert.doesNotMatch(result.stderr,/never-connect|never-read|Docker|ECONN/)
})
