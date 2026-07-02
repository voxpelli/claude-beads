/**
 * check-tasks-smoke.mjs — CLI smoke test for the flat-YAML substrate tooling.
 *
 * The unit tests (check-ready-walker / check-tasks-validator) exercise the pure
 * functions with inline data and never touch disk. This test closes that gap: it
 * spawns the real `ready-walker.mjs` and `validate-tasks.mjs` CLIs against a
 * committed fixture (test/fixtures/backlog/tasks/), via the `TASKS_ROOT` env
 * seam, so the file-IO path (loadTasks, YAML parse, flag dispatch, exit codes)
 * actually runs in CI. Mirrors the spawn-based check-hooks.mjs pattern.
 */

import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { env, exit } from 'node:process'
import { fileURLToPath } from 'node:url'
import {
  mkdirSync, mkdtempSync, rmSync, writeFileSync,
} from 'node:fs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const FIXTURES = join(ROOT, 'test', 'fixtures')

let passed = 0
let failed = 0

/**
 * @param {string} name
 * @param {boolean} cond
 */
function assert (name, cond) {
  if (cond) { passed++; console.log(`  ✓ ${name}`) } else { failed++; console.error(`  ✗ ${name}`) }
}

/**
 * Run a substrate CLI with a given TASKS_ROOT; return { code, out }.
 *
 * @param {string} script   path relative to repo root (e.g. 'scripts/ready-walker.mjs')
 * @param {string[]} args
 * @param {string} tasksRoot
 * @returns {{ code: number, out: string }}
 */
function run (script, args, tasksRoot) {
  const r = spawnSync('node', [join(ROOT, script), ...args], {
    cwd: ROOT,
    env: { ...env, TASKS_ROOT: tasksRoot },
    encoding: 'utf8',
  })
  return { code: r.status ?? 1, out: (r.stdout ?? '') + (r.stderr ?? '') }
}

console.log('ready-walker CLI (against test/fixtures)')

{
  const { code, out } = run('scripts/ready-walker.mjs', [], FIXTURES)
  assert('default: exit 0', code === 0)
  assert('default: shows the ready cross-file/no-dep tasks', /beta\/T-2/.test(out) && /beta\/T-1/.test(out) && /alpha\/T-2/.test(out))
  assert('default: omits the blocked task (alpha/T-3)', !/alpha\/T-3 /.test(out))
}
{
  const { code, out } = run('scripts/ready-walker.mjs', ['--format', 'json'], FIXTURES)
  const data = JSON.parse(out)
  assert('--format json: exit 0 + parses', code === 0 && Array.isArray(data.ready))
  assert('--format json: ready includes beta/T-2', data.ready.some((/** @type {any} */ t) => t.id === 'beta/T-2'))
  assert('--format json: provenance fields stripped', !out.includes('_slug') && !out.includes('_file'))
}
{
  const { code, out } = run('scripts/ready-walker.mjs', ['--stats'], FIXTURES)
  assert('--stats: exit 0 + counts all 9 tasks (6 task + doc/decision/milestone)', code === 0 && /total 9/.test(out))
}
{
  const { code, out } = run('scripts/ready-walker.mjs', ['--format', 'json'], FIXTURES)
  const data = JSON.parse(out)
  assert(
    'default ready set never includes the doc/decision/milestone fixtures (type gate, decision vp-beads-etm)',
    code === 0 && !data.ready.some((/** @type {any} */ t) => ['alpha/D-1', 'alpha/M-1', 'beta/DEC-1'].includes(t.id))
  )
}
{
  const { code, out } = run('scripts/ready-walker.mjs', ['--blocked'], FIXTURES)
  assert('--blocked: exit 0 + shows the genuinely blocked task', code === 0 && /alpha\/T-3/.test(out))
  assert(
    '--blocked: never includes the doc/decision/milestone fixtures either (type gate applies to all three buckets)',
    !['alpha/D-1', 'alpha/M-1', 'beta/DEC-1'].some(id => out.includes(id))
  )
}
{
  const { code, out } = run('scripts/ready-walker.mjs', ['--stale', '--days', '30'], FIXTURES)
  assert('--stale: flags the old in_progress task', code === 0 && /alpha\/T-4/.test(out))
}
{
  const { code, out } = run('scripts/ready-walker.mjs', ['--filter', 'in_progress'], FIXTURES)
  assert('--filter in_progress: shows alpha/T-4', code === 0 && /alpha\/T-4/.test(out))
}
{
  const { code } = run('scripts/ready-walker.mjs', ['--filter', 'bogus'], FIXTURES)
  assert('--filter <invalid>: exits 1', code === 1)
}
{
  const { code } = run('scripts/ready-walker.mjs', ['--stats', '--days', 'abc'], FIXTURES)
  assert('--days <non-numeric>: exits 1', code === 1)
}

console.log('validate-tasks CLI (against test/fixtures)')

{
  const { code, out } = run('validate-tasks.mjs', [], FIXTURES)
  assert('clean fixtures: exit 0 + "passed (2 file(s))"', code === 0 && /passed \(2 file\(s\)\)/.test(out))
}
{
  const { code, out } = run('validate-tasks.mjs', ['--json'], FIXTURES)
  assert('--json clean: exit 0 + {clean:true}', code === 0 && JSON.parse(out).clean === true)
}
{
  const { code, out } = run('validate-tasks.mjs', [], join(tmpdir(), 'vp-beads-nonexistent-xyz'))
  assert('no substrate: exit 0 + skips', code === 0 && /skipping/.test(out))
}

console.log('validate-tasks CLI (error paths, via tmpdir)')

{
  const dir = mkdtempSync(join(tmpdir(), 'vp-tasks-'))
  try {
    mkdirSync(join(dir, 'backlog', 'tasks'), { recursive: true })
    writeFileSync(join(dir, 'backlog', 'tasks', 'tasks-x.yml'), 'tasks: [ : : not yaml')
    const { code, out } = run('validate-tasks.mjs', [], dir)
    assert('malformed YAML: exits 1 with a clear message', code === 1 && /invalid YAML/.test(out))
  } finally { rmSync(dir, { recursive: true, force: true }) }
}
{
  const dir = mkdtempSync(join(tmpdir(), 'vp-tasks-'))
  try {
    mkdirSync(join(dir, 'backlog', 'tasks'), { recursive: true })
    writeFileSync(join(dir, 'backlog', 'tasks', 'tasks-x.yml'), 'tasks:\n  - id: T-1\n    title: a\n    status: pending\n    type: task\n  - id: T-1\n    title: b\n    status: pending\n    type: task\n')
    const { code, out } = run('validate-tasks.mjs', [], dir)
    assert('duplicate id: exits 1 with "duplicate id"', code === 1 && /duplicate id/.test(out))
  } finally { rmSync(dir, { recursive: true, force: true }) }
}

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`)
if (failed > 0) exit(1)
