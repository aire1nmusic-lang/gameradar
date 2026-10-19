import { test } from 'node:test'
import assert from 'node:assert/strict'
import { persistReleaseBackup } from '../scripts/persist-release-backup.mjs'
const config = { temp: '/tmp/release', bucket: 'site-test', endpoint: 'https://storage.invalid', sha: 'a'.repeat(40), runId: '123', attempt: '2' }
const checksum = 'b'.repeat(64)
function fake({ corrupt = false, uploadError = false } = {}) {
  const calls = []
  let hashes = 0
  return { calls, run: async (command, args) => {
    calls.push({ command, args })
    if (command === 'sha256sum') return { stdout: (corrupt && ++hashes === 2 ? 'c'.repeat(64) : checksum) + '  archive\n' }
    if (uploadError && command === 'aws' && args[0] === 's3' && args[1] === 'cp' && !args[2].startsWith('s3://')) throw new Error('Storage unavailable')
    return { stdout: '' }
  } }
}
test('publication backup is archived privately and downloaded before verification succeeds', async () => {
  const transport = fake()
  const result = await persistReleaseBackup({ ...config, run: transport.run })
  assert.equal(result.checksum, checksum)
  assert.equal(result.key, '_deployment-backups/' + config.sha + '/123-2/site-rollback.tar.gz')
  assert.deepEqual(transport.calls.map(c => c.command), ['tar', 'sha256sum', 'aws', 'aws', 'sha256sum'])
  const upload = transport.calls[2].args
  assert.equal(upload[upload.indexOf('--acl') + 1], 'private')
  assert.equal(upload[upload.indexOf('--metadata') + 1], 'sha256=' + checksum)
  assert.equal(transport.calls[3].args[2], upload[3])
  assert.equal(transport.calls[4].args[0], transport.calls[3].args[3])
})
test('a corrupted downloaded archive blocks publication', async () => {
  const transport = fake({ corrupt: true })
  await assert.rejects(persistReleaseBackup({ ...config, run: transport.run }), /checksum mismatch/)
})
test('upload failure blocks publication without pretending a backup exists', async () => {
  const transport = fake({ uploadError: true })
  await assert.rejects(persistReleaseBackup({ ...config, run: transport.run }), /Storage unavailable/)
  assert.equal(transport.calls.length, 3)
})
test('invalid identity is rejected before any archive or storage mutation', async () => {
  const transport = fake()
  await assert.rejects(persistReleaseBackup({ ...config, runId: '../other', run: transport.run }), /configuration/)
  assert.equal(transport.calls.length, 0)
})
