/**
 * Uploads the mirror's static build to the Object Storage bucket, one object
 * per file with explicit "/"-separated keys (yc's --recursive writes "\" keys
 * on Windows). Hashed /assets/* are immutable; everything else revalidates.
 *
 *   node ru-proxy/yandex/upload.mjs --bucket gamescout-ru-site [--dir ru-proxy/.deploy/public] [--prefix staging]
 * --prefix puts the build under a key prefix (a staging gateway serves it from there).
 * Env: YC — path to the yc binary (default: ~/yandex-cloud/bin/yc[.exe]).
 */
import { spawnSync } from 'node:child_process'
import { readdirSync, statSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const arg = (name, fallback) => {
  const at = process.argv.indexOf('--' + name)
  return at > 0 ? process.argv[at + 1] : fallback
}
const bucket = arg('bucket')
if (!bucket) throw new Error('--bucket is required')
const dir = path.resolve(arg('dir', 'ru-proxy/.deploy/public'))
const prefix = (arg('prefix', '') || '').replace(/^\/+|\/+$/g, '')
const yc = process.env.YC ?? path.join(os.homedir(), 'yandex-cloud', 'bin', process.platform === 'win32' ? 'yc.exe' : 'yc')

function files(root, prefix = '') {
  return readdirSync(root).flatMap(name => {
    const full = path.join(root, name)
    const key = prefix ? `${prefix}/${name}` : name
    return statSync(full).isDirectory() ? files(full, key) : [{ full, key }]
  })
}

const list = files(dir, prefix)
let done = 0
for (const { full, key } of list) {
  const path = key.replace(prefix ? prefix + '/' : '', '')
  // Hashed bundles never change. Art is named by width, not by content, so it
  // may change on a release: one day fresh, a week stale-while-revalidate.
  // API Gateway answers conditional requests with a full 200, so max-age=0
  // would re-download every picture on every visit.
  const cache = path.startsWith('assets/')
    ? 'public, max-age=31536000, immutable'
    : path.startsWith('media/')
      ? 'public, max-age=86400, stale-while-revalidate=604800'
      : 'public, max-age=0, must-revalidate'
  const run = spawnSync(yc, ['storage', 's3', 'cp', full, `s3://${bucket}/${key}`, '--cache-control', cache, '--only-show-errors'], { encoding: 'utf8', windowsHide: true })
  if (run.status !== 0) throw new Error(`upload of ${key} failed: ${run.stderr || run.stdout}`)
  done++
}
console.log(`Uploaded ${done} objects to ${bucket}`)
