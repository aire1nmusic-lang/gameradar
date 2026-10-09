import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const exec = promisify(execFile)
const execute = (command, args) => exec(command, args, { timeout: 180000, maxBuffer: 1024 * 1024 })
const digest = result => {
  const value = result.stdout.trim().split(/\s+/)[0]
  if (!/^[a-f0-9]{64}$/.test(value)) throw new Error('Invalid archive checksum')
  return value
}

// Required before publication: a durable archive plus an independently downloaded checksum match.
// Credentials stay in the subprocess environment and never appear in arguments or logs.
export async function persistReleaseBackup({ temp, bucket, endpoint, sha, runId, attempt = '1', run = execute }) {
  if (!temp || !bucket || !endpoint || !/^[a-f0-9]{40}$/.test(sha) || !/^\d+$/.test(runId) || !/^\d+$/.test(attempt)) {
    throw new Error('Missing or invalid release backup configuration')
  }
  const archive = join(temp, 'site-rollback.tar.gz')
  const downloaded = join(temp, 'site-rollback-verified.tar.gz')
  const key = `_deployment-backups/${sha}/${runId}-${attempt}/site-rollback.tar.gz`
  await run('tar', ['-czf', archive, '-C', join(temp, 'site-rollback'), '.'])
  const checksum = digest(await run('sha256sum', [archive]))
  await run('aws', ['s3', 'cp', archive, `s3://${bucket}/${key}`, '--endpoint-url', endpoint,
    '--acl', 'private', '--content-type', 'application/gzip', '--cache-control', 'private,no-store',
    '--metadata', `sha256=${checksum}`, '--only-show-errors'])
  await run('aws', ['s3', 'cp', `s3://${bucket}/${key}`, downloaded, '--endpoint-url', endpoint, '--only-show-errors'])
  if (digest(await run('sha256sum', [downloaded])) !== checksum) throw new Error('Persisted rollback archive checksum mismatch')
  return { key, checksum }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  persistReleaseBackup({
    temp: process.env.RUNNER_TEMP, bucket: process.env.YC_BUCKET, endpoint: process.env.YC_S3_ENDPOINT,
    sha: process.env.GITHUB_SHA, runId: process.env.GITHUB_RUN_ID, attempt: process.env.GITHUB_RUN_ATTEMPT,
  }).then(({key, checksum}) => console.log('Durable rollback backup verified:', key, checksum))
    .catch(error => { console.error(error.message); process.exitCode = 1 })
}
