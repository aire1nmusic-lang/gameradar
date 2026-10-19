import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { readdir, readFile, mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'

const execute = (command, args) => promisify(execFile)(command, args, { timeout: 180000, maxBuffer: 1024 * 1024 })
async function filesAt(directory, prefix = '') {
  const files = []
  for (const entry of await readdir(join(directory, prefix), { withFileTypes: true })) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name
    assert.ok(!entry.isSymbolicLink(), 'Rollback must not follow symlinks')
    if (entry.isDirectory()) files.push(...await filesAt(directory, path))
    else if (entry.isFile()) files.push(path)
  }
  return files
}
const digest = bytes => createHash('sha256').update(bytes).digest('hex')

// `sync` skips older same-size local files on upload. A rollback must force every
// saved byte back, then independently download and compare all saved files.
export async function restoreReleaseBackup({ temp, bucket, endpoint, run = execute }) {
  assert.ok(temp && /^[a-z0-9][a-z0-9.-]+$/.test(bucket || '') && /^https:\/\//.test(endpoint || ''), 'Invalid rollback configuration')
  const source = join(temp, 'site-rollback'), files = await filesAt(source)
  assert.ok(files.includes('index.html'), 'Rollback index missing')
  assert.ok(!files.some(path => /^(assets|_deployment-backups)\//.test(path)), 'Unexpected immutable assets or archives in rollback')
  const expected = new Map(await Promise.all(files.map(async path => [path, digest(await readFile(join(source, path)))])))
  const verified = await mkdtemp(join(temp, 'rollback-readback-'))
  try {
    await run('aws', ['s3', 'cp', source + '/', `s3://${bucket}/`, '--recursive', '--endpoint-url', endpoint,
      '--cache-control', 'no-cache, no-store, must-revalidate', '--only-show-errors'])
    await run('aws', ['s3', 'cp', `s3://${bucket}/`, verified + '/', '--recursive', '--endpoint-url', endpoint,
      '--exclude', 'assets/*', '--exclude', '_deployment-backups/*', '--only-show-errors'])
    for (const [path, hash] of expected) assert.equal(digest(await readFile(join(verified, path))), hash, `Rollback byte mismatch: ${path}`)
    return { filesVerified: expected.size, indexSha256: expected.get('index.html'), additionalPathsDeleted: false }
  } finally { await rm(verified, { recursive: true, force: true }) }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  restoreReleaseBackup({ temp: process.env.RUNNER_TEMP, bucket: process.env.YC_BUCKET, endpoint: process.env.YC_S3_ENDPOINT })
    .then(result => console.log('Rollback bytes independently verified:', JSON.stringify(result)))
    .catch(error => { console.error(error.message); process.exitCode = 1 })
}
