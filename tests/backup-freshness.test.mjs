import test from 'node:test'
import assert from 'node:assert/strict'
import {backupFreshness,auditPrivateBackups} from '../scripts/audit-private-backups.mjs'
const now=Date.parse('2026-10-20T12:00:00Z')
const row=(date,key='private-postgres/2026/10/20/gamescout-20261020T031701Z.dump.gpg')=>({key,size:'1234',last_modified:date,owner:{id:'must-not-leak'}})
test('recent object, stale copy and missing backup remain distinct from verified cron or restore',()=>{
  const recent=backupFreshness([row('2026-10-20T03:17:01Z')],{now})
  assert.equal(recent.status,'recent_object');assert.equal(recent.cronVerified,false);assert.equal(recent.restoreVerified,false)
  assert.ok(!JSON.stringify(recent).includes('must-not-leak'))
  assert.equal(backupFreshness([row('2026-10-07T03:17:01Z')],{now}).status,'stale')
  assert.equal(backupFreshness([],{now}).status,'unknown')
  assert.equal(backupFreshness([row('2026-10-21T03:17:01Z')],{now}).status,'unknown')
  assert.equal(backupFreshness([row('invalid'),row('2026-10-20T03:17:01Z','private-postgres/raw-user-email.txt')],{now}).status,'unknown')
})
test('audit follows every page before selecting the most recent backup',async()=>{
  const seen=[]
  const report=await auditPrivateBackups(async cursor=>{seen.push(cursor);return cursor?{contents:[row('2026-10-20T03:17:01Z')]}:
    {contents:[row('2026-10-07T03:17:01Z')],is_truncated:true,next_continuation_token:'next'}},{now})
  assert.deepEqual(seen,[undefined,'next']);assert.equal(report.objectsAnalyzed,2);assert.equal(report.status,'recent_object')
})
test('incomplete or repeating storage pagination cannot report a healthy backup',async()=>{
  await assert.rejects(auditPrivateBackups(async()=>({contents:[],is_truncated:true})),/incomplete_backup_listing/)
  await assert.rejects(auditPrivateBackups(async()=>({contents:[],next_continuation_token:'same'})),/repeated_backup_listing_cursor/)
})
