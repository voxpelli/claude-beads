/**
 * check-tasks-smoke.mjs — CLI smoke test for the flat-YAML substrate tooling.
 *
 * The unit tests (check-ready-walker / check-tasks-validator) exercise the pure
 * functions with inline data and never touch disk. This test closes that gap: it
 * spawns the real `diarie/lib/ready.js` and `diarie/lib/validate.js` entries
 * against a committed fixture (diarie/test/fixtures/.diarie/tasks/), via the
 * `TASKS_ROOT` env seam, so the file-IO path (resolveRoot, loadTasks, YAML parse,
 * flag dispatch, exit codes) actually runs in CI.
 *
 * `run()` keeps stdout and stderr SEPARATE, deliberately. The tracker's
 * absent-store defect survived for so long precisely because its only complaint
 * went to stderr while stdout carried a well-formed, fictional empty backlog — and
 * ten call sites pipe stderr to /dev/null. A test that concatenates the two streams
 * cannot tell the difference, and so cannot catch a regression of that bug.
 */

import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { env, exit } from 'node:process'
import { fileURLToPath } from 'node:url'
import {
  mkdirSync, mkdtempSync, rmSync, writeFileSync,
} from 'node:fs'

import { TRACKER_DIR } from 'diarie/schema'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const FIXTURES = join(ROOT, 'diarie', 'test', 'fixtures')

/** The real CLI, invoked exactly as every consumer invokes it. */
const CLI = 'diarie/cli.js'
const READY = ['ready']
const VALIDATE = ['validate']
const STATS = ['stats']

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
 * Run a substrate entry with a given TASKS_ROOT.
 *
 * `out` is stdout ONLY and `err` is stderr ONLY — never merge them (see header).
 * `both` is offered for the assertions that genuinely don't care which stream a
 * human-readable message landed on.
 *
 * @param {string[]} command  the subcommand (e.g. ['ready'])
 * @param {string[]} args
 * @param {string} tasksRoot
 * @returns {{ code: number, out: string, err: string, both: string }}
 */
function run (command, args, tasksRoot) {
  const r = spawnSync('node', [join(ROOT, CLI), ...command, ...args], {
    cwd: ROOT,
    env: { ...env, TASKS_ROOT: tasksRoot },
    encoding: 'utf8',
  })
  const out = r.stdout ?? ''
  const err = r.stderr ?? ''
  return { code: r.status ?? 1, out, err, both: out + err }
}

console.log('ready-walker CLI (against test/fixtures)')

{
  const { both: out, code } = run(READY, [], FIXTURES)
  assert('default: exit 0', code === 0)
  assert('default: shows the ready cross-file/no-dep tasks', /beta\/T-2/.test(out) && /beta\/T-1/.test(out) && /alpha\/T-2/.test(out))
  assert('default: omits the blocked task (alpha/T-3)', !/alpha\/T-3 /.test(out))
}
{
  const { both: out, code } = run(READY, ['--json'], FIXTURES)
  const data = JSON.parse(out)
  assert('--json: exit 0 + parses', code === 0 && Array.isArray(data.ready))
  assert('--json: ready includes beta/T-2', data.ready.some((/** @type {any} */ t) => t.id === 'beta/T-2'))
  assert('--json: provenance fields stripped', !out.includes('_slug') && !out.includes('_file'))
}
{
  const { both: out, code } = run(STATS, [], FIXTURES)
  assert('stats: exit 0 + counts all 9 tasks (6 task + doc/decision/milestone)', code === 0 && /total 9/.test(out))
}
{
  const { both: out, code } = run(READY, ['--json'], FIXTURES)
  const data = JSON.parse(out)
  assert(
    'default ready set never includes the doc/decision/milestone fixtures (type gate, decision vp-beads-etm)',
    code === 0 && !data.ready.some((/** @type {any} */ t) => ['alpha/D-1', 'alpha/M-1', 'beta/DEC-1'].includes(t.id))
  )
}
{
  const { both: out, code } = run(READY, ['--blocked'], FIXTURES)
  assert('--blocked: exit 0 + shows the genuinely blocked task', code === 0 && /alpha\/T-3/.test(out))
  assert(
    '--blocked: never includes the doc/decision/milestone fixtures either (type gate applies to all three buckets)',
    !['alpha/D-1', 'alpha/M-1', 'beta/DEC-1'].some(id => out.includes(id))
  )
}
{
  const { both: out, code } = run(STATS, ['--stale', '--days', '30'], FIXTURES)
  assert('stats --stale: flags the old in_progress task', code === 0 && /alpha\/T-4/.test(out))
}
{
  const { both: out, code } = run(READY, ['--filter', 'in_progress'], FIXTURES)
  assert('--filter in_progress: shows alpha/T-4', code === 0 && /alpha\/T-4/.test(out))
}
{
  const { code } = run(READY, ['--filter', 'bogus'], FIXTURES)
  assert('--filter <invalid>: exits 1', code === 1)
}
{
  const { code } = run(STATS, ['--days', 'abc'], FIXTURES)
  assert('--days <non-numeric>: exits 1', code === 1)
}

console.log('validate-tasks CLI (against test/fixtures)')

{
  const { both: out, code } = run(VALIDATE, [], FIXTURES)
  assert('clean fixtures: exit 0 + "passed (2 file(s))"', code === 0 && /passed \(2 file\(s\)\)/.test(out))
}
{
  const { both: out, code } = run(VALIDATE, ['--json'], FIXTURES)
  assert('--json clean: exit 0 + {clean:true}', code === 0 && JSON.parse(out).clean === true)
}
console.log('\nthe absent-vs-empty distinction (the defect this contract exists to kill)')

// An ABSENT store is an ERROR. This assertion used to read `exit 0 + skips` — it
// PINNED the bug. If it ever goes red again, do NOT "repair" it by restoring
// exit-0-on-absent-store: that reinstates a tracker which, when it cannot find its
// store, prints an empty backlog to stdout and its only complaint to a stderr that
// ten call sites discard.
{
  const nowhere = join(tmpdir(), 'vp-beads-nonexistent-xyz')
  const { code, err, out } = run(READY, ['--json'], nowhere)
  let parsed
  try { parsed = JSON.parse(out) } catch { /* stays undefined */ }
  assert('ready, absent store: exits NON-ZERO', code !== 0)
  assert('ready, absent store: ENOSTORE on STDOUT (never stderr — that stream is discarded)',
    parsed?.code === 'ENOSTORE' && !err.includes('ENOSTORE'))
  assert('ready, absent store: does NOT emit a fictional empty backlog', parsed?.ready === undefined)
}
{
  const nowhere = join(tmpdir(), 'vp-beads-nonexistent-xyz')
  const { code, out } = run(VALIDATE, ['--json'], nowhere)
  let parsed
  try { parsed = JSON.parse(out) } catch { /* stays undefined */ }
  assert('validate, absent store: exits NON-ZERO with ENOSTORE', code !== 0 && parsed?.code === 'ENOSTORE')
  assert('validate, absent store: never claims to be clean', parsed?.clean !== true)
  assert('validate: the `skipped` flag is GONE (it only existed to paper over exit-0-on-absent)',
    parsed?.skipped === undefined)
}

// ...and the CONVERSE. An EMPTY store is a perfectly legitimate, clean, exit-0
// answer. Absent and empty must never look alike again — in EITHER direction.
{
  const dir = mkdtempSync(join(tmpdir(), 'vp-empty-'))
  try {
    mkdirSync(join(dir, TRACKER_DIR, 'tasks'), { recursive: true })
    const ready = run(READY, ['--json'], dir)
    const valid = run(VALIDATE, ['--json'], dir)
    assert('ready, EMPTY-but-present store: exit 0 + an empty backlog',
      ready.code === 0 && JSON.parse(ready.out).ready.length === 0)
    assert('validate, EMPTY-but-present store: exit 0 + clean',
      valid.code === 0 && JSON.parse(valid.out).clean === true)
  } finally { rmSync(dir, { recursive: true, force: true }) }
}

console.log('\nvalidate-tasks CLI (error paths, via tmpdir)')

{
  const dir = mkdtempSync(join(tmpdir(), 'vp-tasks-'))
  try {
    mkdirSync(join(dir, TRACKER_DIR, 'tasks'), { recursive: true })
    writeFileSync(join(dir, TRACKER_DIR, 'tasks', 'tasks-x.yml'), 'tasks: [ : : not yaml')
    const { both: out, code } = run(VALIDATE, [], dir)
    // Exit 2, not 1. The CLI distinguishes "you got it wrong" (1: bad flag, no store)
    // from "it ran and the answer is no" (2: your store is invalid). A CI script can
    // now tell a misconfigured diarie from a broken backlog.
    assert('malformed YAML: exits 2 (ResultError) with a clear message', code === 2 && /invalid YAML/.test(out))
  } finally { rmSync(dir, { recursive: true, force: true }) }
}
{
  // `--json` MUST always emit JSON. The YAML-parse catch used to write to stderr and exit,
  // bypassing the --json branch entirely — so an unparseable store produced NO stdout, and
  // every consumer that reads stdout (both hooks) saw empty output and concluded there was
  // nothing to report. That is on the single commonest hand-edit mistake there is.
  const dir = mkdtempSync(join(tmpdir(), 'vp-tasks-'))
  try {
    mkdirSync(join(dir, TRACKER_DIR, 'tasks'), { recursive: true })
    writeFileSync(join(dir, TRACKER_DIR, 'tasks', 'tasks-x.yml'), 'tasks:\n  - id: T-1\n    title: "unclosed\n')
    const { both: out, code } = run(VALIDATE, ['--json'], dir)
    let parsed
    try { parsed = JSON.parse(out) } catch { /* stays undefined */ }
    assert('--json on UNPARSEABLE yaml still emits JSON (the contract) with the error',
      code === 2 && parsed?.clean === false && /invalid YAML/.test(String(parsed?.errors ?? '')))
  } finally { rmSync(dir, { recursive: true, force: true }) }
}
{
  const dir = mkdtempSync(join(tmpdir(), 'vp-tasks-'))
  try {
    mkdirSync(join(dir, TRACKER_DIR, 'tasks'), { recursive: true })
    writeFileSync(join(dir, TRACKER_DIR, 'tasks', 'tasks-x.yml'), 'tasks:\n  - id: T-1\n    title: a\n    status: pending\n    type: task\n  - id: T-1\n    title: b\n    status: pending\n    type: task\n')
    const { both: out, code } = run(VALIDATE, [], dir)
    assert('duplicate id: exits 2 with "duplicate id"', code === 2 && /duplicate id/.test(out))
  } finally { rmSync(dir, { recursive: true, force: true }) }
}

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`)
if (failed > 0) exit(1)
