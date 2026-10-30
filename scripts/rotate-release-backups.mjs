import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { pathToFileURL } from 'node:url'

const exec = promisify(execFile)
const execute = (command, args) => exec(command, args, { timeout: 180000, maxBuffer: 16 * 1024 * 1024 })
const ARCHIVE = /^_deployment-backups\/[a-f0-9]{40}\/\d+-\d+\/site-rollback\.tar\.gz$/

/** The archives that would be removed: every complete rollback archive older than the newest `keep`. */
export function rotationPlan(objects, keep) {
  if (!Number.isInteger(keep) || keep < 3) throw new Error('Keep at least 3 rollback archives')
  const archives = objects.filter(object => ARCHIVE.test(object.Key))
    .sort((a, b) => String(a.LastModified).localeCompare(String(b.LastModified)) || a.Key.localeCompare(b.Key))
  return archives.slice(0, Math.max(0, archives.length - keep))
}

// Runs before a new archive is persisted, so the bucket has room for it: keeps the newest `keep` archives
// (the live release and the ones before it) and deletes only older objects whose key matches the exact
// archive pattern. Off unless the owner sets ROLLBACK_ARCHIVES_KEEP; credentials stay in the environment.
export async function rotateReleaseBackups({ bucket, endpoint, keep, run = execute }) {
  if (!bucket || !endpoint) throw new Error('Missing storage configuration')
  const listed = JSON.parse((await run('aws', ['s3api', 'list-objects-v2', '--bucket', bucket, '--prefix', '_deployment-backups/',
    '--endpoint-url', endpoint, '--output', 'json'])).stdout || '{}')
  if (listed.IsTruncated) throw new Error('Archive listing is truncated; refusing to rotate')
  const remove = rotationPlan(listed.Contents ?? [], keep)
  for (const object of remove) {
    if (!ARCHIVE.test(object.Key)) throw new Error('Unexpected key')
    await run('aws', ['s3api', 'delete-object', '--bucket', bucket, '--key', object.Key, '--endpoint-url', endpoint])
  }
  return remove.map(object => ({ key: object.Key, bytes: object.Size }))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const keep = Number(process.env.ROLLBACK_ARCHIVES_KEEP)
  if (!process.env.ROLLBACK_ARCHIVES_KEEP) console.log('Rollback archive rotation is off (ROLLBACK_ARCHIVES_KEEP is not set).')
  else rotateReleaseBackups({ bucket: process.env.YC_BUCKET, endpoint: process.env.YC_S3_ENDPOINT, keep })
    .then(removed => console.log(`Rollback archives kept: ${keep}; removed ${removed.length}:`, JSON.stringify(removed)))
    .catch(error => { console.error(error.message); process.exitCode = 1 })
}
