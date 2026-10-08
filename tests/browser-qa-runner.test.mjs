import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runJobs, browserJobs } from '../scripts/run-browser-qa.mjs'

test('all suites remain required; bounded real children preserve failure and live target', async () => {
  assert.equal(browserJobs.length, 9)
  assert.equal(new Set(browserJobs.map(job => job.file)).size, 9)
  assert.equal(new Set(browserJobs.map(job => job.liveVariable)).size, 9)
  const logs = []
  let active = 0, maximum = 0
  const output = line => {
    logs.push(line)
    if (line.endsWith('START')) maximum = Math.max(maximum, ++active)
    if (/\] (?:PASS|FAIL) \d+s$/.test(line)) active--
  }
  const jobs = [0, 1, 2].map(index => ({ name: `child-${index}`, liveVariable: 'QA_TARGET', args: ['-e', `console.log(process.env.QA_TARGET);setTimeout(()=>process.exit(${index === 1 ? 7 : 0}),50)`] }))
  const results = await runJobs(jobs, { live: 'https://example.invalid', output })
  assert.equal(maximum, 2)
  assert.equal(active, 0)
  assert.equal(results.length, 3)
  assert.equal(results.find(result => result.name === 'child-1').code, 7)
  assert.equal(logs.filter(line => line.endsWith('https://example.invalid')).length, 3)
})
