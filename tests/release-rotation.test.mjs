import { test } from 'node:test'
import assert from 'node:assert/strict'
import { rotateReleaseBackups, rotationPlan } from '../scripts/rotate-release-backups.mjs'

const archive = (sha, day) => ({ Key: `_deployment-backups/${sha.repeat(40)}/1-1/site-rollback.tar.gz`, LastModified: `2026-10-${day}T10:00:00Z`, Size: 90 })
const objects = [archive('a', 21), archive('b', 25), archive('c', 22), archive('d', 28), archive('e', 30),
  { Key: '_deployment-backups/notes.txt', LastModified: '2026-10-01T00:00:00Z', Size: 1 },
  { Key: 'index.html', LastModified: '2026-10-01T00:00:00Z', Size: 1 }]

test('only exact rollback archives older than the newest three are planned for removal', () => {
  assert.deepEqual(rotationPlan(objects, 3).map(o => o.Key[20]), ['a', 'c'])
  assert.deepEqual(rotationPlan(objects.slice(0, 3), 3), [], 'nothing below the keep count')
  assert.throws(() => rotationPlan(objects, 2), /at least 3/)
})

test('deletes exactly the planned keys and refuses a truncated listing', async () => {
  const calls = []
  const run = async (command, args) => { calls.push(args); return { stdout: args[1] === 'list-objects-v2' ? JSON.stringify({ Contents: objects }) : '' } }
  const removed = await rotateReleaseBackups({ bucket: 'b', endpoint: 'https://e', keep: 3, run })
  assert.deepEqual(removed.map(r => r.key[20]), ['a', 'c'])
  assert.deepEqual(calls.filter(a => a[1] === 'delete-object').map(a => a[a.indexOf('--key') + 1][20]), ['a', 'c'])
  const truncated = async () => ({ stdout: JSON.stringify({ Contents: objects, IsTruncated: true }) })
  await assert.rejects(rotateReleaseBackups({ bucket: 'b', endpoint: 'https://e', keep: 3, run: truncated }), /truncated/)
})
