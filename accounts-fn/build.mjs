import { build } from 'esbuild'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

/**
 * Builds the deployable function package into accounts-fn/dist:
 *   index.js        one CommonJS bundle (hono, shared crypto/mail code); entrypoint `index.handler`
 *   package.json    only `ydb-sdk`, which the platform installs when the function version is created
 * Creates no cloud resource and uploads nothing.  Run: node accounts-fn/build.mjs
 */
const out = new URL('./dist/', import.meta.url)
await rm(out, { recursive: true, force: true })
await mkdir(out, { recursive: true })
await build({ entryPoints: [fileURLToPath(new URL('./handler.mjs', import.meta.url))],
  outfile: fileURLToPath(new URL('./index.js', out)), bundle: true, platform: 'node', target: 'node22', format: 'cjs',
  external: ['ydb-sdk'], legalComments: 'none', logLevel: 'info' })
const manifest = JSON.parse(await readFile(new URL('./package.json', import.meta.url), 'utf8'))
await writeFile(new URL('./package.json', out), JSON.stringify({ name: manifest.name, private: true, version: manifest.version,
  dependencies: { 'ydb-sdk': manifest.dependencies['ydb-sdk'] } }, null, 2) + '\n')
console.log('built accounts-fn/dist (entrypoint index.handler)')
