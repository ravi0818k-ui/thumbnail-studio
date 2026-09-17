/**
 * Runs the Python unit tests if a desktop CPython with numpy is available, and
 * skips cleanly if not — the browser build never needs local Python, so a
 * missing interpreter must not fail the suite.
 */
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const TESTS = ['test_enhance.py', 'test_score.py'].map((name) => path.join(ROOT, 'scripts', name))

for (const interpreter of ['python', 'python3', 'py']) {
  const probe = spawnSync(interpreter, ['-c', 'import numpy'], { encoding: 'utf8' })
  if (probe.status === 0) {
    // Every suite runs even if an earlier one fails, so one broken module does
    // not hide the state of the others.
    let failed = 0
    for (const test of TESTS) {
      const result = spawnSync(interpreter, [test], { stdio: 'inherit' })
      if ((result.status ?? 1) !== 0) failed++
    }
    process.exit(failed === 0 ? 0 : 1)
  }
}

console.log('\npython: skipped (no local CPython with numpy — browser builds do not need one)')
console.log('        `npm run verify:python` runs the same module inside Pyodide instead.')
