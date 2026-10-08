import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { pathToFileURL } from 'node:url'

// Separate HTTP ports and output directories; at most two Chromium suites share a runner.
export const browserJobs = [
  ['review', 'tests/l2-review-browser.mjs', 'REVIEW_QA_BASE_URL'],
  ['aether', 'tests/aether-browser.mjs', 'AETHER_QA_BASE_URL'],
  ['journey', 'tests/l2-journey-browser.mjs', 'L2_JOURNEY_QA_BASE_URL'],
  ['favorites', 'tests/favorites-browser.mjs', 'FAVORITES_QA_BASE_URL'],
  ['loader', 'tests/loader-browser.mjs', 'LOADER_BASE_URL'],
  ['account', 'tests/account-browser.mjs', 'ACCOUNT_QA_BASE_URL'],
  ['discovery', 'tests/discovery-browser.mjs', 'DISCOVERY_QA_BASE_URL'],
  ['controls', 'tests/visual-control-browser.mjs', 'CONTROL_QA_BASE_URL'],
  ['studio', 'tests/support-studio-browser.mjs', 'STUDIO_QA_BASE_URL'],
].map(([name, file, liveVariable]) => ({ name, file, liveVariable }))

export async function runJobs(jobs, { live, concurrency = 2, output = console.log } = {}) {
  let next = 0
  const results = []
  const worker = async () => {
    while (next < jobs.length) {
      const job = jobs[next++]
      const started = performance.now()
      const env = { ...process.env, ...(live ? { [job.liveVariable]: live } : {}) }
      output(`[${job.name}] START`)
      const code = await new Promise(resolve => {
        const child = spawn(process.execPath, job.args ?? [job.file], { env, stdio: ['ignore', 'pipe', 'pipe'] })
        for (const stream of [child.stdout, child.stderr]) createInterface({ input: stream }).on('line', line => output(`[${job.name}] ${line}`))
        child.once('error', error => { output(`[${job.name}] ${error.message}`); resolve(1) })
        child.once('close', code => resolve(code ?? 1))
      })
      results.push({ name: job.name, code })
      output(`[${job.name}] ${code === 0 ? 'PASS' : 'FAIL'} ${Math.round((performance.now() - started) / 1000)}s`)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, worker))
  return results
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const live = process.argv[2] === '--live' ? process.argv[3] : undefined
  if (process.argv[2] && !live) throw new Error('Usage: node scripts/run-browser-qa.mjs [--live SITE_ORIGIN]')
  const results = await runJobs(browserJobs, { live })
  if (results.length !== browserJobs.length || results.some(result => result.code !== 0)) process.exitCode = 1
}
