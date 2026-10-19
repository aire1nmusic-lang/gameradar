import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, cp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { restoreReleaseBackup } from '../scripts/restore-release-backup.mjs'

async function fixture(runTest) {
  const temp = await mkdtemp(join(tmpdir(), 'release-restore-'))
  try {
    await mkdir(join(temp, 'site-rollback/page'), { recursive: true })
    await writeFile(join(temp, 'site-rollback/index.html'), 'old-build')
    await writeFile(join(temp, 'site-rollback/page/index.html'), 'old-route')
    await runTest(temp)
  } finally { await rm(temp, { recursive: true, force: true }) }
}
test('rollback forces copy rather than timestamp-based sync, then checks every saved byte', () => fixture(async temp => {
  const calls = []
  const result = await restoreReleaseBackup({ temp, bucket: 'site-test', endpoint: 'https://storage.invalid', run: async (command, args) => {
    calls.push(args)
    assert.equal(command, 'aws'); assert.deepEqual(args.slice(0, 2), ['s3', 'cp']); assert.ok(args.includes('--recursive'))
    if (args[2].startsWith('s3://')) await cp(join(temp, 'site-rollback'), args[3], { recursive: true })
  } })
  assert.equal(calls.length, 2); assert.equal(result.filesVerified, 2)
  assert.equal(result.additionalPathsDeleted, false)
  assert.ok(calls[1].includes('_deployment-backups/*'))
}))
test('successful storage exit with stale same-size bytes is rejected', () => fixture(async temp => {
  await assert.rejects(restoreReleaseBackup({ temp, bucket: 'site-test', endpoint: 'https://storage.invalid', run: async (_, args) => {
    if (args[2].startsWith('s3://')) {
      await cp(join(temp, 'site-rollback'), args[3], { recursive: true })
      await writeFile(join(args[3], 'page/index.html'), 'new-route')
    }
  } }), /Rollback byte mismatch: page\/index.html/)
}))
test('partial upload failure is not reported as a verified rollback', () => fixture(async temp => {
  let calls = 0
  await assert.rejects(restoreReleaseBackup({ temp, bucket: 'site-test', endpoint: 'https://storage.invalid', run: async () => {
    calls++; throw new Error('Storage interrupted')
  } }), /Storage interrupted/)
  assert.equal(calls, 1)
}))
