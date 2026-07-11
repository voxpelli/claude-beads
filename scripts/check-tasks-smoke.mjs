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
/**
 * The container/epic cases live in their OWN store. Folding them into FIXTURES would
 * have shifted that suite's green count assertions ("total 9", "2 file(s)"), and
 * rewriting a passing assertion to accommodate your own change is how a regression
 * gets waved through. New behaviour, new fixture; the old guarantees stay untouched.
 */
const EPICS = join(ROOT, 'diarie', 'test', 'fixtures-epics')

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
 * @param {Record<string, string>} [extraEnv]
 * @returns {{ code: number, out: string, err: string, both: string }}
 */
function run (command, args, tasksRoot, extraEnv = {}) {
  // An EMPTY tasksRoot means "do not set the env seam" — exercise the real walk-up from cwd,
  // which is the only path the plugin-store guard can fire on (an explicit root is allowed:
  // that is how you develop vp-beads itself).
  const seam = tasksRoot ? { TASKS_ROOT: tasksRoot } : {}
  const r = spawnSync('node', [join(ROOT, CLI), ...command, ...args], {
    cwd: ROOT,
    env: { ...env, ...seam, ...extraEnv },
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

console.log('\ncontainers: an epic is not workable (vp-beads-epc) — THROUGH loadTasks')

// These MUST run through the real file-load path, not inline task arrays. The bug was
// never in the ready rule; it was in the ID-SPACE. `loadTasks` globalized `id` and
// `deps` to `slug/id` but handed `parent` back raw, so `parent` could never match any
// `id` and every parent lookup silently found nothing. A unit test writes both by hand,
// in one consistent id-space, and therefore CANNOT SEE THAT BUG — it would pass against
// a tracker that still offers every epic as ready. Only a real store on disk can.
{
  const { code, out } = run(READY, ['--json'], EPICS)
  const j = JSON.parse(out)
  /**
   * @param {string} id
   * @returns {boolean}
   */
  const inReady = (id) => j.ready.some((/** @type {any} */ t) => t.id === id)
  /**
   * @param {string} id
   * @returns {any}
   */
  const blockedRow = (id) => j.blocked.find((/** @type {any} */ t) => t.id === id)
  /**
   * @param {string} id
   * @returns {any}
   */
  const attnRow = (id) => j.needsAttention.find((/** @type {any} */ t) => t.id === id)

  assert('exit 0', code === 0)

  // The STRUCTURAL predicate, alone: open children, no epic label.
  assert('plain parent with an open child is NOT ready', !inReady('alpha/P-OPEN'))
  assert('...it is blocked, and says which children contain the work',
    blockedRow('alpha/P-OPEN')?.children?.includes('alpha/C-OPEN') === true)
  assert('...and the CHILD is ready (you work the children, not the container)', inReady('alpha/C-OPEN'))

  // The DECLARATIVE predicate, alone. This is the assertion the live store cannot make:
  // vp-beads-l9i is epic-labelled AND has open children, so a structural-only fix makes
  // it vanish from `ready` anyway and this criterion would pass UNIMPLEMENTED.
  assert('epic label with NO open children is NOT ready (label predicate, isolated)', !inReady('alpha/E-EMPTY'))
  assert('...it surfaces in needsAttention rather than vanishing', /no open children/.test(attnRow('alpha/E-EMPTY')?.reason ?? ''))

  // Both at once — the vp-beads-l9i shape. Containment wins and names its children.
  //
  // E-OPEN has TWO children on purpose: one bare (alpha/C-EPIC) and one qualified
  // (beta/C-CROSS). Mutation-testing showed why that matters — with the namespacing
  // reverted, E-OPEN STILL comes back blocked, because the qualified child resolves
  // without it. So "is it blocked?" is green for the wrong reason. The assertion that
  // actually isolates the regression is the BARE child, which is also the only shape
  // the live store uses.
  assert('epic WITH open children is BLOCKED (not merely absent from ready)', blockedRow('alpha/E-OPEN') !== undefined)
  assert('...and its BARE-parent child is counted (the shape the live store uses)',
    blockedRow('alpha/E-OPEN')?.children?.includes('alpha/C-EPIC') === true)
  assert('...blocked by its children, not by "blockers" (deps mean something else)',
    blockedRow('alpha/E-OPEN')?.blockers.length === 0 && (blockedRow('alpha/E-OPEN')?.children?.length ?? 0) === 2)

  // A cross-file parent is written slug-qualified, so it resolves WITHOUT the namespacing
  // fix and cannot guard it (mutation-tested). What it guards is idempotency: nsId must
  // pass `alpha/E-OPEN` through, not double-prefix it to `beta/alpha/E-OPEN`.
  assert('an already-qualified cross-file parent resolves (nsId is idempotent)',
    blockedRow('alpha/E-OPEN')?.children?.includes('beta/C-CROSS') === true)

  // The CONVERSE — guards a fix that over-excludes every parent forever.
  assert('parent whose children are ALL completed is STILL ready', inReady('alpha/P-DONE'))
  assert('a childless task is unaffected', inReady('alpha/PLAIN'))
}

// The dependency-cycle hint fires on "0 ready, but things are blocked" — which now has
// an innocent cause it never had before: a container blocked purely by its own open
// children. Suppressing that requires the hint to count DEP-blocked rows only.
//
// It needs its OWN store, and the reason is the whole point. Asserting `hint === undefined`
// against the fixtures-epics store above is GREEN NO MATTER WHAT, because that store always
// has ready tasks — so `ambiguous` is false for an unrelated reason and the assertion never
// exercises the filter. Mutation-tested: strip the filter and that version still passes.
// A test can only catch this where `ready` is genuinely EMPTY.
{
  const dir = mkdtempSync(join(tmpdir(), 'diarie-hint-'))
  try {
    mkdirSync(join(dir, TRACKER_DIR, 'tasks'), { recursive: true })
    // E is a container with one open child. C is in_progress: OPEN (so it blocks E) but
    // NOT pending (so it is not ready). Net: ready = [], blocked = [E], zero dep-blockers.
    writeFileSync(join(dir, TRACKER_DIR, 'tasks', 'tasks-x.yml'),
      'tasks:\n' +
      '  - id: E\n    title: container\n    status: pending\n    type: task\n    labels: [epic]\n' +
      '  - id: C\n    title: its open child\n    status: in_progress\n    type: task\n    parent: E\n')
    const { out } = run(READY, ['--json'], dir)
    const j = JSON.parse(out)
    assert('container-only backlog: 0 ready, 1 blocked',
      j.ready.length === 0 && j.blocked.length === 1)

    // THIS ASSERTION WAS INVERTED, DELIBERATELY, ON EVIDENCE — read before "fixing" it back.
    //
    // It used to demand NO hint here, on the theory that an all-container backlog is "a
    // healthy tree whose leaves are all done". That theory is false: a container only
    // reaches `blocked` when it has an ACTIVE child. If its leaves were done it would be
    // READY. So 0-ready-plus-containers means every open child is claimed — or the graph
    // has a cycle, which is precisely what the dep case already warns about.
    //
    // The cost of the old belief was concrete: `--strict` exited 0 on a parent cycle, i.e.
    // reported a permanently dead backlog as a finished one. Changing a green assertion is
    // normally how a regression gets waved through; this one is changed because it encoded
    // a claim that was disproved, and the disproof is above.
    assert('...and it DOES warn: 0 ready with work outstanding is never just "nothing to do"',
      typeof j.hint === 'string')
  } finally { rmSync(dir, { recursive: true, force: true }) }
}
{
  const dir = mkdtempSync(join(tmpdir(), 'diarie-hint2-'))
  try {
    mkdirSync(join(dir, TRACKER_DIR, 'tasks'), { recursive: true })
    // The CONVERSE, and it is what stops the filter from over-suppressing: a GENUINE
    // dep-block with nothing ready must still warn. T-2 waits on T-1; T-1 is claimed.
    writeFileSync(join(dir, TRACKER_DIR, 'tasks', 'tasks-x.yml'),
      'tasks:\n' +
      '  - id: T-1\n    title: claimed blocker\n    status: in_progress\n    type: task\n' +
      '  - id: T-2\n    title: waits on T-1\n    status: pending\n    type: task\n    deps: [T-1]\n')
    const { out } = run(READY, ['--json'], dir)
    const j = JSON.parse(out)
    assert('a REAL dep-block with 0 ready still warns (the filter must not suppress this)',
      j.ready.length === 0 && j.blocked.length === 1 && j.hint !== undefined)
  } finally { rmSync(dir, { recursive: true, force: true }) }
}
{
  const { code } = run(VALIDATE, [], EPICS)
  assert('the container fixtures are themselves a valid store', code === 0)
}

console.log('\nthe plugin must never serve its OWN backlog to a consumer')

// Proven against a real installed plugin by an adversarial review: `.diarie/` is COMMITTED,
// so a marketplace install ships vp-beads' 28 tasks into every consumer's plugin cache. The
// CLI resolves a store by walking UP from cwd — so a cwd anywhere inside that cache finds
// the wrong store, succeeds, and hands a stranger our backlog as their own. Exit 0, no
// warning. A confident, plausible, entirely wrong answer.
//
// `--root` prevents it and the hooks always pass it — but an audit found 71 documented skill
// invocations, none of which did. A defense that needs every future sentence to remember is
// not a defense, so it lives in the CLI.
{
  // No TASKS_ROOT: the walk-up from cwd (= the plugin) is exactly the consumer's accident.
  const { code, err } = run(READY, [], '', { CLAUDE_PLUGIN_ROOT: ROOT })
  assert('refuses to serve the plugin\'s own store when cwd lands inside the plugin', code !== 0)
  assert('...and says exactly why, naming --root', /refusing to serve the PLUGIN/.test(err) && /--root/.test(err))
}
{
  // The consumer's real path: run the plugin's CLI, but pointed at THEIR project.
  const dir = mkdtempSync(join(tmpdir(), 'diarie-consumer-'))
  try {
    mkdirSync(join(dir, TRACKER_DIR, 'tasks'), { recursive: true })
    writeFileSync(join(dir, TRACKER_DIR, 'tasks', 'tasks-mine.yml'),
      'tasks:\n  - id: MINE-1\n    title: the consumer own task\n    status: pending\n    type: task\n')
    const { code, out } = run(READY, ['--json', '--root', dir], ROOT, { CLAUDE_PLUGIN_ROOT: ROOT })
    const j = JSON.parse(out)
    assert('an explicit --root still works from inside the plugin (the hooks path)',
      code === 0 && j.ready.length === 1 && j.ready[0].id === 'mine/MINE-1')
  } finally { rmSync(dir, { recursive: true, force: true }) }
}

console.log('\nthe loader REPORTS every field it rejects (a guard that drops is not a guard that reports)')

// Mutation-proven gap: replacing the `type` or `labels` guard with an unguarded assignment
// left all 118 tests green. The centrepiece of the store rewrite had ZERO coverage, and it
// was hiding two live bugs — a scalar `labels:` re-armed vp-beads-epc, and a typo'd `type:`
// erased a row from every partition while its parent was told to close itself.
{
  const dir = mkdtempSync(join(tmpdir(), 'diarie-reject-'))
  try {
    mkdirSync(join(dir, TRACKER_DIR, 'tasks'), { recursive: true })
    writeFileSync(join(dir, TRACKER_DIR, 'tasks', 'tasks-x.yml'),
      'tasks:\n' +
      // `labels: epic` as a SCALAR — an ordinary YAML slip, and writing a task IS a hand-edit.
      '  - id: E\n    title: epic, labels written as a scalar\n    status: pending\n    type: task\n    labels: epic\n' +
      '  - id: C\n    title: its open child\n    status: pending\n    type: task\n    parent: E\n' +
      // `type: bug` — a bd fossil; framings live in `labels` now.
      '  - id: B\n    title: type is a bd framing, not a type\n    status: pending\n    type: bug\n' +
      '  - id: P\n    title: priority not in the enum\n    status: pending\n    type: task\n    priority: urgent\n')

    const { err, out } = run(READY, ['--json'], dir)
    const j = JSON.parse(out)

    assert('a scalar `labels:` is REPORTED, not silently dropped', /invalid labels/.test(err))
    assert('...and it says WHY it matters (a lost `epic` label re-arms the container bug)', /epic/.test(err))
    assert('an invalid `type:` is REPORTED', /invalid type/.test(err))
    assert('an invalid `priority:` is REPORTED', /invalid priority/.test(err))

    // The row with a broken type must not simply VANISH — it counts toward `total`, so it
    // has to appear in an answer. Silently absent from every partition is the whole bug.
    assert('a row with an invalid `type` surfaces in needsAttention rather than vanishing',
      j.needsAttention.some((/** @type {any} */ t) => t.id === 'x/B' && /type/.test(t.reason)))
  } finally { rmSync(dir, { recursive: true, force: true }) }
}

console.log('\nthe --blocked TEXT rendering (the default human output — JSON-only tests miss it)')

{
  const { code, out } = run(READY, ['--blocked'], EPICS)
  assert('--blocked: a container names WHICH children hold it', code === 0 &&
    /alpha\/E-OPEN.*← contains 2 open:/.test(out))
  assert('--blocked: a container is never mislabelled "blocked by" (that phrase means DEPS)',
    !/alpha\/E-OPEN.*← blocked by/.test(out))
}

console.log('\ndriving cli() IN-PROCESS (no spawn-based test can catch this)')

// peowly-commands takes `args`, not `argv`. main.js passed `argv`, which is not in its
// options type, so it was SILENTLY IGNORED and the parser fell back to `process.argv`.
// Every other test spawns `node cli.js …`, where process.argv HAPPENS to equal the
// intended args — so the whole suite stayed green against a cli() that ignored its only
// parameter. Here process.argv is `[node, check-tasks-smoke.mjs]`, nothing like the args
// below: if the parameter is ever ignored again, this is the only test that can tell.
//
// Its failure mode is an ABORT, not a red assertion: with `args` ignored, peowly parses an
// empty argv, finds no command, prints help and calls process.exit(). The suite dies here
// with a non-zero code — which still fails `npm run check`, correctly — so this block is
// kept LAST-ish on purpose. Do not "fix" the abort by catching it; the exit IS the signal.
{
  // By path, not by package subpath: `lib/main.js` is deliberately NOT in diarie's
  // `exports` map (only `.` and `./schema` are public). The CLI entry is internal.
  const { cli } = await import(new URL('../diarie/lib/main.js', import.meta.url).href)
  {
    let captured = ''
    const realWrite = process.stdout.write.bind(process.stdout)
    // @ts-expect-error — deliberately monkey-patching stdout for the duration of one call
    process.stdout.write = (chunk) => { captured += chunk; return true }
    try { await cli(['ready', '--json', '--root', FIXTURES]) } finally { process.stdout.write = realWrite }
    let parsed
    try { parsed = JSON.parse(captured) } catch { /* left undefined */ }
    assert('cli(argv) parses ITS OWN argv, not process.argv',
      Array.isArray(parsed?.ready) && parsed.ready.some((/** @type {any} */ t) => t.id === 'beta/T-2'))
  }
}

console.log('\nvalidate-tasks CLI (against test/fixtures)')

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
