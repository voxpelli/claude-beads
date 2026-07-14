/**
 * CLI smoke test — the file-IO path, end to end.
 *
 * The unit tests (ready.spec.js / validate.spec.js) exercise the pure functions with
 * inline data and never touch disk. This test closes that gap: it spawns the real
 * `cli.js` against committed fixtures (test/fixtures/, test/fixtures-epics/) via the
 * `TASKS_ROOT` env seam, so resolveRoot, loadTasks, the YAML parse, flag dispatch and
 * the exit codes actually run in CI.
 *
 * `run()` keeps stdout and stderr SEPARATE, deliberately. The tracker's absent-store
 * defect survived for so long precisely because its only complaint went to stderr while
 * stdout carried a well-formed, fictional empty backlog — and ten call sites pipe stderr
 * to /dev/null. A test that concatenates the two streams cannot tell the difference, and
 * so cannot catch a regression of that bug.
 */

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { env } from 'node:process'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync,
} from 'node:fs'

import { TRACKER_DIR } from 'diarie/schema'

/** The package root — `test/`'s parent. */
const PKG = fileURLToPath(new URL('..', import.meta.url))
const FIXTURES = join(PKG, 'test', 'fixtures')
/**
 * The container/epic cases live in their OWN store. Folding them into FIXTURES would
 * have shifted that suite's green count assertions ("total 9", "2 file(s)"), and
 * rewriting a passing assertion to accommodate your own change is how a regression
 * gets waved through. New behaviour, new fixture; the old guarantees stay untouched.
 */
const EPICS = join(PKG, 'test', 'fixtures-epics')

/** The real CLI, invoked exactly as every consumer invokes it. */
const CLI = join(PKG, 'cli.js')
const READY = ['ready']
const VALIDATE = ['validate']
const STATS = ['stats']

/**
 * A temp dir that cleans itself up when the test ends.
 *
 * @param {import('node:test').TestContext} t
 * @param {string} prefix
 * @returns {string}
 */
function tmpDir (t, prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  return dir
}

/**
 * Create a `.diarie/tasks/tasks-<slug>.yml` store under `dir`.
 *
 * @param {string} dir
 * @param {string} slug
 * @param {string} [body]  full YAML; omit for an empty-but-present store
 * @returns {string} dir
 */
function seedStore (dir, slug, body) {
  mkdirSync(join(dir, TRACKER_DIR, 'tasks'), { recursive: true })
  if (body !== undefined) writeFileSync(join(dir, TRACKER_DIR, 'tasks', `tasks-${slug}.yml`), body)
  return dir
}

/**
 * A store whose one row has a malformed REQUIRED field. `validate` calls this broken.
 *
 * @param {import('node:test').TestContext} t
 * @returns {string}
 */
function brokenRow (t) {
  return seedStore(tmpDir(t, 'diarie-warn-'), 'a',
    'tasks:\n  - id: T-1\n    title: malformed required status\n    status: open\n    type: task\n')
}

/**
 * A store whose JSON payload comfortably exceeds the 64 KB pipe buffer, plus one dropped row.
 *
 * @param {import('node:test').TestContext} t
 * @returns {string}
 */
function bigStore (t) {
  const rows = Array.from({ length: 400 }, (_, i) =>
    `  - id: T-${i}\n    title: task ${i} with a reasonably long title to bulk out the payload\n    status: pending\n    type: task\n`
  ).join('')
  // `in-progress` (hyphen) is rejected by the loader — the row is dropped, so --strict exits 2.
  return seedStore(tmpDir(t, 'diarie-big-'), 'a',
    `tasks:\n${rows}  - id: BAD\n    title: dropped\n    status: in-progress\n    type: task\n`)
}

/**
 * A healthy file holding a live claim, beside a file that does not parse.
 *
 * @param {import('node:test').TestContext} t
 * @returns {string}
 */
function halfBroken (t) {
  const dir = seedStore(tmpDir(t, 'diarie-badyaml-'), 'a',
    'tasks:\n  - id: T-2\n    title: THE LIVE CLAIM\n    status: in_progress\n    type: task\n')
  writeFileSync(join(dir, TRACKER_DIR, 'tasks', 'tasks-b.yml'), 'tasks:\n  - id: X\n    title: "unterminated\n')
  return dir
}

/**
 * Run the CLI with a given TASKS_ROOT.
 *
 * `out` is stdout ONLY and `err` is stderr ONLY — never merge them (see header).
 * `both` is offered for the assertions that genuinely don't care which stream a
 * human-readable message landed on.
 *
 * @param {string[]} command  the subcommand (e.g. ['ready'])
 * @param {string[]} args
 * @param {string} tasksRoot  empty string = do NOT set the seam; exercise the walk-up from cwd
 * @param {object} [options]
 * @param {Record<string, string>} [options.extraEnv]
 * @param {string} [options.cwd]
 * @returns {{ code: number, out: string, err: string, both: string }}
 */
function run (command, args, tasksRoot, { cwd = PKG, extraEnv = {} } = {}) {
  const seam = tasksRoot ? { TASKS_ROOT: tasksRoot } : {}
  const r = spawnSync('node', [CLI, ...command, ...args], {
    cwd,
    env: { ...env, ...seam, ...extraEnv },
    encoding: 'utf8',
  })
  const out = r.stdout ?? ''
  const err = r.stderr ?? ''
  return { code: r.status ?? 1, out, err, both: out + err }
}

describe('ready CLI (against test/fixtures)', () => {
  it('default: exit 0', () => {
    assert.equal(run(READY, [], FIXTURES).code, 0)
  })

  it('default: shows the ready cross-file/no-dep tasks', () => {
    const { both: out } = run(READY, [], FIXTURES)
    assert.ok(/beta\/T-2/.test(out) && /beta\/T-1/.test(out) && /alpha\/T-2/.test(out))
  })

  it('default: omits the blocked task (alpha/T-3)', () => {
    assert.ok(!/alpha\/T-3 /.test(run(READY, [], FIXTURES).both))
  })

  it('--json: exit 0 + parses', () => {
    const { both: out, code } = run(READY, ['--json'], FIXTURES)
    assert.ok(code === 0 && Array.isArray(JSON.parse(out).ready))
  })

  it('--json: ready includes beta/T-2', () => {
    const data = JSON.parse(run(READY, ['--json'], FIXTURES).both)
    assert.ok(data.ready.some((/** @type {{ id: string }} */ t) => t.id === 'beta/T-2'))
  })

  it('--json: provenance fields stripped', () => {
    const { both: out } = run(READY, ['--json'], FIXTURES)
    assert.ok(!out.includes('_slug') && !out.includes('_file'))
  })

  it('stats: exit 0 + counts all 9 tasks (6 task + doc/decision/milestone)', () => {
    const { both: out, code } = run(STATS, [], FIXTURES)
    assert.ok(code === 0 && /total 9/.test(out))
  })

  it('default ready set never includes the doc/decision/milestone fixtures (type gate, decision vp-beads-etm)', () => {
    const { both: out, code } = run(READY, ['--json'], FIXTURES)
    const data = JSON.parse(out)
    assert.ok(code === 0 && !data.ready.some((/** @type {{ id: string }} */ t) => ['alpha/D-1', 'alpha/M-1', 'beta/DEC-1'].includes(t.id)))
  })

  it('--blocked: exit 0 + shows the genuinely blocked task', () => {
    const { both: out, code } = run(READY, ['--blocked'], FIXTURES)
    assert.ok(code === 0 && /alpha\/T-3/.test(out))
  })

  it('--blocked: never includes the doc/decision/milestone fixtures either (type gate applies to all three buckets)', () => {
    const { both: out } = run(READY, ['--blocked'], FIXTURES)
    assert.ok(!['alpha/D-1', 'alpha/M-1', 'beta/DEC-1'].some(id => out.includes(id)))
  })

  it('stats --stale: flags the old in_progress task', () => {
    const { both: out, code } = run(STATS, ['--stale', '--days', '30'], FIXTURES)
    assert.ok(code === 0 && /alpha\/T-4/.test(out))
  })

  it('--filter in_progress: shows alpha/T-4', () => {
    const { both: out, code } = run(READY, ['--filter', 'in_progress'], FIXTURES)
    assert.ok(code === 0 && /alpha\/T-4/.test(out))
  })

  // THESE TWO ASSERTED ONLY `code === 1`, AND THAT IS HOW THE BUG GOT THROUGH.
  //
  // cli.js's "genuinely unexpected: a bug, not a user mistake" branch ALSO exits 1. So a clean
  // InputError and an uncaught TypeError are indistinguishable by exit code alone — and when the
  // catch block in main.js started crashing on these exact inputs, both tests stayed green while
  // the CLI answered `Cannot read properties of undefined` and, under --json, wrote NOTHING to
  // stdout. 194 of 194 passing, over three broken paths.
  //
  // An exit code says a command failed. It cannot say whether it failed for the reason you meant.
  // Assert the SENTENCE.

  it('--filter <invalid>: exits 1 AND says which values are legal', () => {
    const { code, err } = run(READY, ['--filter', 'bogus'], FIXTURES)
    assert.equal(code, 1)
    assert.match(err, /--filter must be one of:/)
    assert.doesNotMatch(err, /unexpected error/)
  })

  it('--days <non-numeric>: exits 1 AND names the constraint', () => {
    const { code, err } = run(STATS, ['--days', 'abc'], FIXTURES)
    assert.equal(code, 1)
    assert.match(err, /--days must be a non-negative number/)
    assert.doesNotMatch(err, /unexpected error/)
  })
})

// These MUST run through the real file-load path, not inline task arrays. The bug was
// never in the ready rule; it was in the ID-SPACE. `loadTasks` globalized `id` and
// `deps` to `slug/id` but handed `parent` back raw, so `parent` could never match any
// `id` and every parent lookup silently found nothing. A unit test writes both by hand,
// in one consistent id-space, and therefore CANNOT SEE THAT BUG — it would pass against
// a tracker that still offers every epic as ready. Only a real store on disk can.
describe('containers: an epic is not workable (vp-beads-epc) — THROUGH loadTasks', () => {
  const { code, out } = run(READY, ['--json'], EPICS)
  const j = JSON.parse(out)
  /**
   * @param {string} id
   * @returns {boolean}
   */
  const inReady = (id) => j.ready.some((/** @type {{ id: string }} */ t) => t.id === id)
  /**
   * @param {string} id
   * @returns {{ id: string, blockers: string[], children?: string[] } | undefined}
   */
  const blockedRow = (id) => j.blocked.find((/** @type {{ id: string }} */ t) => t.id === id)
  /**
   * @param {string} id
   * @returns {{ id: string, reason: string } | undefined}
   */
  const attnRow = (id) => j.needsAttention.find((/** @type {{ id: string }} */ t) => t.id === id)

  it('exit 0', () => {
    assert.equal(code, 0)
  })

  // The STRUCTURAL predicate, alone: open children, no epic label.
  it('plain parent with an open child is NOT ready', () => {
    assert.ok(!inReady('alpha/P-OPEN'))
  })

  it('...it is blocked, and says which children contain the work', () => {
    assert.equal(blockedRow('alpha/P-OPEN')?.children?.includes('alpha/C-OPEN'), true)
  })

  it('...and the CHILD is ready (you work the children, not the container)', () => {
    assert.ok(inReady('alpha/C-OPEN'))
  })

  // The DECLARATIVE predicate, alone. This is the assertion the live store cannot make:
  // vp-beads-l9i is epic-labelled AND has open children, so a structural-only fix makes
  // it vanish from `ready` anyway and this criterion would pass UNIMPLEMENTED.
  it('epic label with NO open children is NOT ready (label predicate, isolated)', () => {
    assert.ok(!inReady('alpha/E-EMPTY'))
  })

  it('...it surfaces in needsAttention rather than vanishing', () => {
    assert.ok(/no open children/.test(attnRow('alpha/E-EMPTY')?.reason ?? ''))
  })

  // Both at once — the vp-beads-l9i shape. Containment wins and names its children.
  //
  // E-OPEN has TWO children on purpose: one bare (alpha/C-EPIC) and one qualified
  // (beta/C-CROSS). Mutation-testing showed why that matters — with the namespacing
  // reverted, E-OPEN STILL comes back blocked, because the qualified child resolves
  // without it. So "is it blocked?" is green for the wrong reason. The assertion that
  // actually isolates the regression is the BARE child, which is also the only shape
  // the live store uses.
  it('epic WITH open children is BLOCKED (not merely absent from ready)', () => {
    assert.notEqual(blockedRow('alpha/E-OPEN'), undefined)
  })

  it('...and its BARE-parent child is counted (the shape the live store uses)', () => {
    assert.equal(blockedRow('alpha/E-OPEN')?.children?.includes('alpha/C-EPIC'), true)
  })

  it('...blocked by its children, not by "blockers" (deps mean something else)', () => {
    assert.ok(blockedRow('alpha/E-OPEN')?.blockers.length === 0 && (blockedRow('alpha/E-OPEN')?.children?.length ?? 0) === 2)
  })

  // A cross-file parent is written slug-qualified, so it resolves WITHOUT the namespacing
  // fix and cannot guard it (mutation-tested). What it guards is idempotency: nsId must
  // pass `alpha/E-OPEN` through, not double-prefix it to `beta/alpha/E-OPEN`.
  it('an already-qualified cross-file parent resolves (nsId is idempotent)', () => {
    assert.equal(blockedRow('alpha/E-OPEN')?.children?.includes('beta/C-CROSS'), true)
  })

  // The CONVERSE — guards a fix that over-excludes every parent forever.
  it('parent whose children are ALL completed is STILL ready', () => {
    assert.ok(inReady('alpha/P-DONE'))
  })

  it('a childless task is unaffected', () => {
    assert.ok(inReady('alpha/PLAIN'))
  })

  // The dependency-cycle hint fires on "0 ready, but things are blocked" — which now has
  // an innocent cause it never had before: a container blocked purely by its own open
  // children. Suppressing that requires the hint to count DEP-blocked rows only.
  //
  // It needs its OWN store, and the reason is the whole point. Asserting `hint === undefined`
  // against the fixtures-epics store above is GREEN NO MATTER WHAT, because that store always
  // has ready tasks — so `ambiguous` is false for an unrelated reason and the assertion never
  // exercises the filter. Mutation-tested: strip the filter and that version still passes.
  // A test can only catch this where `ready` is genuinely EMPTY.
  it('container-only backlog: 0 ready, 1 blocked', (t) => {
    // E is a container with one open child. C is in_progress: OPEN (so it blocks E) but
    // NOT pending (so it is not ready). Net: ready = [], blocked = [E], zero dep-blockers.
    const dir = seedStore(tmpDir(t, 'diarie-hint-'), 'x',
      'tasks:\n' +
      '  - id: E\n    title: container\n    status: pending\n    type: task\n    labels: [epic]\n' +
      '  - id: C\n    title: its open child\n    status: in_progress\n    type: task\n    parent: E\n')
    const j = JSON.parse(run(READY, ['--json'], dir).out)
    assert.ok(j.ready.length === 0 && j.blocked.length === 1)
  })

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
  it('...and it DOES warn: 0 ready with work outstanding is never just "nothing to do"', (t) => {
    const dir = seedStore(tmpDir(t, 'diarie-hint-'), 'x',
      'tasks:\n' +
      '  - id: E\n    title: container\n    status: pending\n    type: task\n    labels: [epic]\n' +
      '  - id: C\n    title: its open child\n    status: in_progress\n    type: task\n    parent: E\n')
    const j = JSON.parse(run(READY, ['--json'], dir).out)
    assert.equal(typeof j.hint, 'string')
  })

  it('a REAL dep-block with 0 ready still warns (the filter must not suppress this)', (t) => {
    // The CONVERSE, and it is what stops the filter from over-suppressing: a GENUINE
    // dep-block with nothing ready must still warn. T-2 waits on T-1; T-1 is claimed.
    const dir = seedStore(tmpDir(t, 'diarie-hint2-'), 'x',
      'tasks:\n' +
      '  - id: T-1\n    title: claimed blocker\n    status: in_progress\n    type: task\n' +
      '  - id: T-2\n    title: waits on T-1\n    status: pending\n    type: task\n    deps: [T-1]\n')
    const j = JSON.parse(run(READY, ['--json'], dir).out)
    assert.ok(j.ready.length === 0 && j.blocked.length === 1 && j.hint !== undefined)
  })

  it('the container fixtures are themselves a valid store', () => {
    assert.equal(run(VALIDATE, [], EPICS).code, 0)
  })
})

// Proven against a real installed plugin by an adversarial review: a plugin's `.diarie/` is
// COMMITTED, so a marketplace install ships its tasks into every consumer's plugin cache. The
// CLI resolves a store by walking UP from cwd — so a cwd anywhere inside that cache finds the
// wrong store, succeeds, and hands a stranger someone else's backlog as their own. Exit 0, no
// warning. A confident, plausible, entirely wrong answer.
//
// `--root` prevents it and the hooks always pass it — but an audit found 71 documented skill
// invocations, none of which did. A defense that needs every future sentence to remember is
// not a defense, so it lives in the CLI.
//
// The fake plugin is a TMPDIR, not this repo: the guard's contract is purely "is the resolved
// store inside CLAUDE_PLUGIN_ROOT", so a tmpdir tests it exactly — and, unlike a real repo
// path, /tmp IS symlinked on macOS, which is the case the guard realpaths BOTH sides to
// handle. Pointing at the repo root would leave that branch untested.
/**
 * A tmpdir standing in as an installed plugin, carrying its own committed store.
 *
 * @param {import('node:test').TestContext} t
 * @returns {string}
 */
const fakePlugin = (t) => seedStore(tmpDir(t, 'diarie-plugin-'), 'theirs',
  'tasks:\n  - id: PLUG-1\n    title: the plugin own task\n    status: pending\n    type: task\n')

describe('the CLI must never serve a PLUGIN\'s own backlog to a consumer', () => {
  it('refuses to serve the plugin\'s own store when cwd lands inside the plugin', (t) => {
    const plugin = fakePlugin(t)
    // No TASKS_ROOT: the walk-up from cwd (= the plugin) is exactly the consumer's accident.
    const { code } = run(READY, [], '', { extraEnv: { CLAUDE_PLUGIN_ROOT: plugin }, cwd: plugin })
    assert.notEqual(code, 0)
  })

  it('...and says exactly why, naming --root', (t) => {
    const plugin = fakePlugin(t)
    const { err } = run(READY, [], '', { extraEnv: { CLAUDE_PLUGIN_ROOT: plugin }, cwd: plugin })
    assert.ok(/refusing to serve the PLUGIN/.test(err) && /--root/.test(err))
  })

  it('an explicit --root still works from inside the plugin (the hooks path)', (t) => {
    const plugin = fakePlugin(t)
    // The consumer's real path: run the plugin's CLI, but pointed at THEIR project.
    const mine = seedStore(tmpDir(t, 'diarie-consumer-'), 'mine',
      'tasks:\n  - id: MINE-1\n    title: the consumer own task\n    status: pending\n    type: task\n')
    const { code, out } = run(READY, ['--json', '--root', mine], plugin, { extraEnv: { CLAUDE_PLUGIN_ROOT: plugin }, cwd: plugin })
    const j = JSON.parse(out)
    assert.ok(code === 0 && j.ready.length === 1 && j.ready[0].id === 'mine/MINE-1')
  })
})

// Mutation-proven gap: replacing the `type` or `labels` guard with an unguarded assignment
// left all 118 tests green. The centrepiece of the store rewrite had ZERO coverage, and it
// was hiding two live bugs — a scalar `labels:` re-armed vp-beads-epc, and a typo'd `type:`
// erased a row from every partition while its parent was told to close itself.
describe('the loader REPORTS every field it rejects (a guard that drops is not a guard that reports)', () => {
  const BAD =
    'tasks:\n' +
    // `labels: epic` as a SCALAR — an ordinary YAML slip, and writing a task IS a hand-edit.
    '  - id: E\n    title: epic, labels written as a scalar\n    status: pending\n    type: task\n    labels: epic\n' +
    '  - id: C\n    title: its open child\n    status: pending\n    type: task\n    parent: E\n' +
    // `type: bug` — a bd fossil; framings live in `labels` now.
    '  - id: B\n    title: type is a bd framing, not a type\n    status: pending\n    type: bug\n' +
    '  - id: P\n    title: priority not in the enum\n    status: pending\n    type: task\n    priority: urgent\n'

  it('a scalar `labels:` is REPORTED, not silently dropped', (t) => {
    const { err } = run(READY, ['--json'], seedStore(tmpDir(t, 'diarie-reject-'), 'x', BAD))
    assert.ok(/invalid labels/.test(err))
  })

  it('...and it says WHY it matters (a lost `epic` label re-arms the container bug)', (t) => {
    const { err } = run(READY, ['--json'], seedStore(tmpDir(t, 'diarie-reject-'), 'x', BAD))
    assert.ok(/epic/.test(err))
  })

  it('an invalid `type:` is REPORTED', (t) => {
    const { err } = run(READY, ['--json'], seedStore(tmpDir(t, 'diarie-reject-'), 'x', BAD))
    assert.ok(/invalid type/.test(err))
  })

  it('an invalid `priority:` is REPORTED', (t) => {
    const { err } = run(READY, ['--json'], seedStore(tmpDir(t, 'diarie-reject-'), 'x', BAD))
    assert.ok(/invalid priority/.test(err))
  })

  it('a row with an invalid `type` surfaces in needsAttention rather than vanishing', (t) => {
    // The row with a broken type must not simply VANISH — it counts toward `total`, so it
    // has to appear in an answer. Silently absent from every partition is the whole bug.
    const { out } = run(READY, ['--json'], seedStore(tmpDir(t, 'diarie-reject-'), 'x', BAD))
    const j = JSON.parse(out)
    assert.ok(j.needsAttention.some((/** @type {{ id: string, reason: string }} */ t2) => t2.id === 'x/B' && /type/.test(t2.reason)))
  })
})

describe('the --blocked TEXT rendering (the default human output — JSON-only tests miss it)', () => {
  it('--blocked: a container names WHICH children hold it', () => {
    const { code, out } = run(READY, ['--blocked'], EPICS)
    assert.ok(code === 0 && /alpha\/E-OPEN.*← contains 2 open:/.test(out))
  })

  it('--blocked: a container is never mislabelled "blocked by" (that phrase means DEPS)', () => {
    const { out } = run(READY, ['--blocked'], EPICS)
    assert.ok(!/alpha\/E-OPEN.*← blocked by/.test(out))
  })
})

// peowly-commands takes `args`, not `argv`. main.js passed `argv`, which is not in its
// options type, so it was SILENTLY IGNORED and the parser fell back to `process.argv`.
// Every OTHER test here spawns `node cli.js …`, where process.argv HAPPENS to equal the
// intended args — so the whole suite stayed green against a cli() that ignored its only
// parameter.
//
// So this test must drive cli() with args that process.argv does NOT carry. It does that
// in a child process (`node -e`), where process.argv is `[node]` and the args reach cli()
// ONLY through its parameter: if the parameter is ignored again, peowly finds no command,
// prints help, and stdout is not the JSON asserted below.
//
// It does NOT capture stdout in-process. Monkey-patching `process.stdout.write` under
// `node --test` swallows the runner's own TAP stream — measured: it silently dropped 40 of
// this file's 54 results while still reporting "pass". A test that breaks the reporter is
// worse than no test.
//
// A cheaper guard already exists and is proven: `check:tsc` rejects the bug outright
// (`TS2353: 'argv' does not exist in type 'CliOptions<AnyFlags>'`), verified by mutation.
// This is belt-and-braces on top of that.
describe('driving cli() with its own args (no ordinary spawn can catch this)', () => {
  it('cli(argv) parses ITS OWN argv, not process.argv', () => {
    // By path, not by package subpath: `lib/main.js` is deliberately NOT in diarie's
    // `exports` map (only `.` and `./schema` are public). The CLI entry is internal.
    const main = new URL('../lib/main.js', import.meta.url).href
    const script = `const { cli } = await import(${JSON.stringify(main)})\n` +
      `await cli(['ready', '--json', '--root', ${JSON.stringify(FIXTURES)}])\n`
    const r = spawnSync('node', ['--input-type=module', '-e', script], { encoding: 'utf8' })
    let parsed
    try { parsed = JSON.parse(r.stdout ?? '') } catch { /* left undefined */ }
    assert.ok(Array.isArray(parsed?.ready) && parsed.ready.some((/** @type {{ id: string }} */ t) => t.id === 'beta/T-2'))
  })
})

describe('validate CLI (against test/fixtures)', () => {
  it('clean fixtures: exit 0 + "passed (2 file(s))"', () => {
    const { both: out, code } = run(VALIDATE, [], FIXTURES)
    assert.ok(code === 0 && /passed \(2 file\(s\)\)/.test(out))
  })

  it('--json clean: exit 0 + {clean:true}', () => {
    const { both: out, code } = run(VALIDATE, ['--json'], FIXTURES)
    assert.ok(code === 0 && JSON.parse(out).clean === true)
  })
})

// An ABSENT store is an ERROR. These assertions used to read `exit 0 + skips` — they
// PINNED the bug. If they ever go red again, do NOT "repair" them by restoring
// exit-0-on-absent-store: that reinstates a tracker which, when it cannot find its
// store, prints an empty backlog to stdout and its only complaint to a stderr that
// ten call sites discard.
describe('the absent-vs-empty distinction (the defect this contract exists to kill)', () => {
  const nowhere = join(tmpdir(), 'vp-beads-nonexistent-xyz')

  it('ready, absent store: exits NON-ZERO', () => {
    assert.notEqual(run(READY, ['--json'], nowhere).code, 0)
  })

  it('ready, absent store: ENOSTORE on STDOUT (never stderr — that stream is discarded)', () => {
    const { err, out } = run(READY, ['--json'], nowhere)
    let parsed
    try { parsed = JSON.parse(out) } catch { /* stays undefined */ }
    assert.ok(parsed?.code === 'ENOSTORE' && !err.includes('ENOSTORE'))
  })

  it('ready, absent store: does NOT emit a fictional empty backlog', () => {
    const { out } = run(READY, ['--json'], nowhere)
    let parsed
    try { parsed = JSON.parse(out) } catch { /* stays undefined */ }
    assert.equal(parsed?.ready, undefined)
  })

  it('validate, absent store: exits NON-ZERO with ENOSTORE', () => {
    const { code, out } = run(VALIDATE, ['--json'], nowhere)
    let parsed
    try { parsed = JSON.parse(out) } catch { /* stays undefined */ }
    assert.ok(code !== 0 && parsed?.code === 'ENOSTORE')
  })

  it('validate, absent store: never claims to be clean', () => {
    const { out } = run(VALIDATE, ['--json'], nowhere)
    let parsed
    try { parsed = JSON.parse(out) } catch { /* stays undefined */ }
    assert.notEqual(parsed?.clean, true)
  })

  it('validate: the `skipped` flag is GONE (it only existed to paper over exit-0-on-absent)', () => {
    const { out } = run(VALIDATE, ['--json'], nowhere)
    let parsed
    try { parsed = JSON.parse(out) } catch { /* stays undefined */ }
    assert.equal(parsed?.skipped, undefined)
  })

  // ...and the CONVERSE. An EMPTY store is a perfectly legitimate, clean, exit-0
  // answer. Absent and empty must never look alike again — in EITHER direction.
  it('ready, EMPTY-but-present store: exit 0 + an empty backlog', (t) => {
    const dir = seedStore(tmpDir(t, 'vp-empty-'), 'x')
    const ready = run(READY, ['--json'], dir)
    assert.ok(ready.code === 0 && JSON.parse(ready.out).ready.length === 0)
  })

  it('validate, EMPTY-but-present store: exit 0 + clean', (t) => {
    const dir = seedStore(tmpDir(t, 'vp-empty-'), 'x')
    const valid = run(VALIDATE, ['--json'], dir)
    assert.ok(valid.code === 0 && JSON.parse(valid.out).clean === true)
  })
})

describe('validate CLI (error paths, via tmpdir)', () => {
  it('malformed YAML: exits 2 (ResultError) with a clear message', (t) => {
    const dir = seedStore(tmpDir(t, 'vp-tasks-'), 'x', 'tasks: [ : : not yaml')
    const { both: out, code } = run(VALIDATE, [], dir)
    // Exit 2, not 1. The CLI distinguishes "you got it wrong" (1: bad flag, no store)
    // from "it ran and the answer is no" (2: your store is invalid). A CI script can
    // now tell a misconfigured diarie from a broken backlog.
    assert.ok(code === 2 && /invalid YAML/.test(out))
  })

  it('--json on UNPARSEABLE yaml still emits JSON (the contract) with the error', (t) => {
    // `--json` MUST always emit JSON. The YAML-parse catch used to write to stderr and exit,
    // bypassing the --json branch entirely — so an unparseable store produced NO stdout, and
    // every consumer that reads stdout (both hooks) saw empty output and concluded there was
    // nothing to report. That is on the single commonest hand-edit mistake there is.
    const dir = seedStore(tmpDir(t, 'vp-tasks-'), 'x', 'tasks:\n  - id: T-1\n    title: "unclosed\n')
    const { both: out, code } = run(VALIDATE, ['--json'], dir)
    let parsed
    try { parsed = JSON.parse(out) } catch { /* stays undefined */ }
    assert.ok(code === 2 && parsed?.clean === false && /invalid YAML/.test(String(parsed?.errors ?? '')))
  })

  it('duplicate id: exits 2 with "duplicate id"', (t) => {
    const dir = seedStore(tmpDir(t, 'vp-tasks-'), 'x',
      'tasks:\n  - id: T-1\n    title: a\n    status: pending\n    type: task\n  - id: T-1\n    title: b\n    status: pending\n    type: task\n')
    const { both: out, code } = run(VALIDATE, [], dir)
    assert.ok(code === 2 && /duplicate id/.test(out))
  })
})

describe('the exit-code taxonomy — a typo is not a bug, and 2 means only one thing', () => {
  // Exit 2 is ResultError: "it ran, and the answer is no" (a cyclic backlog, --strict).
  // peowly's showHelp() defaults to exit(2) for "incorrect usage", so BEFORE this suite a
  // bare `diarie` also exited 2 — leaving a CI job branching on 2 unable to tell a
  // dependency cycle from a forgotten subcommand. Two meanings, one code, no way back.

  it('a bare `diarie` is an InputError (1), NOT the ResultError code (2)', () => {
    const { code } = run([], [], FIXTURES)
    assert.equal(code, 1)
  })

  it('a bare `diarie` still SHOWS the commands — exiting 1 must not mean staying silent', () => {
    const { both } = run([], [], FIXTURES)
    assert.match(both, /ready/)
    assert.match(both, /migrate/)
  })

  it('an unknown command is answered with a sentence, not a stack trace', () => {
    const { code, err } = run(['frobnicate'], [], FIXTURES)
    assert.equal(code, 1)
    assert.match(err, /unknown command: frobnicate/)
    // The tell of the old behaviour: it fell through to cli.js's "genuinely unexpected"
    // branch, which prints the cause chain. A typo is not a bug in the tool.
    assert.doesNotMatch(err, /unexpected error/)
    assert.doesNotMatch(err, /at .*\.js:\d+/)
  })

  it('an unknown flag is answered with a sentence, not node:internal parse_args frames', () => {
    const { code, err } = run(READY, ['--nosuchflag'], FIXTURES)
    assert.equal(code, 1)
    // The POSITIVE assertion comes first and is the point. Three `doesNotMatch`es alone would
    // pass just as happily against an EMPTY stderr — which is a different bug, and one this
    // project has shipped before. An absence-only test cannot tell "said the right thing" from
    // "said nothing at all".
    assert.match(err, /diarie: Unknown option '--nosuchflag'/)
    assert.doesNotMatch(err, /unexpected error/)
    assert.doesNotMatch(err, /node:internal/)
  })

  it('--json carries usage errors on STDOUT with a code — the whole point of this CLI', () => {
    // The defect this tool was built around: important things whispered to a stream that
    // ten call sites pipe to /dev/null. An unknown command used to leave stdout EMPTY and
    // dump a stack to stderr — silently violating the contract cli.js's own header states.
    for (const args of [['frobnicate', '--json'], ['ready', '--nosuchflag', '--json']]) {
      const { code, out } = run([], args, FIXTURES)
      assert.equal(code, 1)
      const parsed = JSON.parse(out)
      assert.equal(parsed.code, 'EUSAGE')
      assert.ok(typeof parsed.error === 'string' && parsed.error.length > 0)
    }
  })

  it('EUSAGE and ENOSTORE are DIFFERENT codes — "you typed it wrong" is not "there is no store"', () => {
    const { out: typo } = run([], ['frobnicate', '--json'], FIXTURES)
    const { out: nostore } = run(READY, ['--json', '--root', join(tmpdir(), 'diarie-nowhere-xyz')], '')
    assert.equal(JSON.parse(typo).code, 'EUSAGE')
    assert.equal(JSON.parse(nostore).code, 'ENOSTORE')
  })
})

describe('`--help` is a REQUEST, not a mistake (the oracle check:prose-commands stands on)', () => {
  // Every subcommand must answer --help on STDOUT with exit 0. `migrate` did not: it shared
  // a branch with the no-argument case and threw InputError, so asking for help printed to
  // STDERR and exited 1. That made --help useless as a uniform way to interrogate the CLI —
  // which is precisely what a prose-command checker needs it for.

  for (const sub of ['ready', 'stats', 'validate', 'init', 'migrate']) {
    it(`\`${sub} --help\` exits 0 and prints the usage on stdout`, () => {
      const { code, err, out } = run([sub], ['--help'], FIXTURES)
      assert.equal(code, 0)
      assert.ok(out.length > 0, `${sub} --help wrote nothing to stdout`)
      assert.equal(err, '')
    })
  }

  it('`migrate` with NO argument is still an error — help is not the same as forgetting the file', () => {
    const { code, err } = run(['migrate'], [], FIXTURES)
    assert.equal(code, 1)
    assert.match(err, /needs a bd export file/)
  })
})

describe('THE INVARIANT: a user mistake is never a crash, and never exit 2', () => {
  // Two reviewers, independently, gave the first cut of this taxonomy 22/100 and 3/100 — because
  // the fix crashed on three of the paths it was meant to protect and the suite never noticed.
  // Both defects share one shape: every assertion was about a SINGLE input, so nothing anywhere
  // asserted the RULE. A rule needs a test that quantifies over inputs, not a test per input.
  //
  // Exit 2 is ResultError, and nothing else. `unexpected error` is a bug in diarie, and nothing
  // else. Every row below is a user mistake, so every row must satisfy both.

  const MISTAKES = [
    { what: 'no command at all', argv: [] },
    // THE LIST IS THE TEST. This row was missing from the first cut, and its absence — not any
    // weak assertion — is what let `diarie ""` keep exiting 2 with 589 bytes of help prose on
    // stdout, through TWO rounds of review. `diarie "$CMD"` with an unset variable is how a
    // wrapper script writes it. When a quantified suite misses a bug, suspect the domain first.
    { what: 'an empty first argument', argv: [''] },
    { what: 'a flag where a command belongs', argv: ['--json'] },
    { what: 'a short flag where a command belongs', argv: ['-j'] },
    { what: 'a bare -h (peowly does NOT treat this as help)', argv: ['-h'] },
    { what: 'an unknown top-level flag', argv: ['--nosuchflag'] },
    { what: 'an unknown command', argv: ['frobnicate'] },
    { what: 'an unknown flag on a real command', argv: ['ready', '--nosuchflag'] },
    { what: 'an invalid enum value', argv: ['ready', '--filter', 'bogus'] },
    { what: 'a non-numeric number', argv: ['stats', '--days', 'abc'] },
    { what: 'a negative staleness window', argv: ['stats', '--days', '-5'] },
  ]

  for (const { argv, what } of MISTAKES) {
    it(`${what} — exits 1, not 2, and is never called "unexpected"`, () => {
      const { code, err, out } = run([], argv, FIXTURES)

      // 2 would mean "it ran, and your backlog is broken". None of these ran.
      assert.notEqual(code, 2, `\`diarie ${argv.join(' ')}\` exited 2 — the ResultError code`)
      assert.equal(code, 1)

      // The tell of a crash reaching the user. It is never the right answer to a typo.
      assert.doesNotMatch(err, /unexpected error/)
      assert.doesNotMatch(err + out, /Cannot read properties of undefined/)
      assert.doesNotMatch(err + out, /node:internal/)

      // Silence is its own failure: the user must be told SOMETHING.
      assert.ok((err + out).trim().length > 0, 'said nothing at all')
    })
  }

  for (const { argv, what } of MISTAKES) {
    it(`${what} — under --json, STDOUT carries parseable JSON with a code`, () => {
      // The defect this whole CLI exists to kill: important things whispered to stderr, a stream
      // ten call sites pipe to /dev/null. Before the fix, `diarie --json` printed 589 bytes of
      // HUMAN HELP PROSE to stdout under the flag that promises machine-readable output, and
      // `ready --filter bogus --json` printed nothing at all.
      const { code, out } = run([], [...argv, '--json'], FIXTURES)
      assert.equal(code, 1)

      const parsed = JSON.parse(out)   // throws on prose, and on emptiness
      assert.equal(typeof parsed.error, 'string')
      assert.ok(parsed.error.length > 0)
      assert.equal(parsed.code, 'EUSAGE')
    })
  }
})

describe('THE COMPLEMENT: exit 2 must remain REACHABLE, or the taxonomy lies the other way', () => {
  // The invariant suite above proves no user mistake exits 2. On its own that is only half a
  // rule, and the dangerous half to prove alone: a change that made exit 2 UNREACHABLE would
  // satisfy every one of those assertions while silently telling every CI job that a cyclic
  // backlog is fine. `validate` already pins its side (three assertions above). `--strict` did
  // not pin its side at all — the flag whose entire purpose is to exit non-zero.
  //
  // Both halves, or neither is a rule.

  it('`ready --strict` exits 2 when a row needs attention', (t) => {
    // `type: bug` is a bd fossil — not one of the four valid types — so the row is BROKEN, not
    // merely non-workable. It surfaces in needsAttention, and --strict must say so in its exit code.
    const dir = seedStore(tmpDir(t, 'diarie-strict-'), 'x',
      'tasks:\n  - id: T-1\n    title: fossil type\n    status: pending\n    type: bug\n')
    assert.equal(run(READY, ['--strict'], dir).code, 2)
  })

  it('`ready --strict` exits 0 on a healthy store — 2 must MEAN something', (t) => {
    const dir = seedStore(tmpDir(t, 'diarie-strict-ok-'), 'x',
      'tasks:\n  - id: T-1\n    title: fine\n    status: pending\n    type: task\n')
    assert.equal(run(READY, ['--strict'], dir).code, 0)
  })

  it('the ONLY executable exit(2) in the package is exitResultError()', () => {
    // The module docstring in lib/utils/exit.js claims `git grep exitResultError` is an exhaustive
    // list of every way this process can exit 2. That claim is load-bearing for the whole taxonomy,
    // and a claim nobody checks is a comment, not a guarantee. So: check it.
    const src = readFileSync(join(PKG, 'lib', 'utils', 'exit.js'), 'utf8')
    assert.match(src, /export function exitResultError/)

    const offenders = []
    for (const file of [join(PKG, 'cli.js'), ...walkJs(join(PKG, 'lib'))]) {
      if (file.endsWith(join('utils', 'exit.js'))) continue
      const body = readFileSync(file, 'utf8')
        .replaceAll(/\/\*[\s\S]*?\*\//g, '')   // strip block comments
        .replaceAll(/\/\/.*$/gm, '')           // strip line comments
      // ALL THREE FORMS. Checking only `exit(2)` would have let `process.exitCode = 2` through —
      // which is exactly how it got past the ast-grep rule, and it genuinely exits 2
      // (`node -e 'process.exitCode = 2'; echo $?` → 2). A test that enforces two thirds of a
      // claim is a test that makes the remaining third look enforced.
      if (/\bexit\(\s*2\s*\)|\bexitCode\s*=\s*2\b/.test(body)) offenders.push(file)
    }
    assert.deepEqual(offenders, [], `exit 2 written outside lib/utils/exit.js: ${offenders.join(', ')}`)
  })
})

/**
 * Every .js file under a directory, recursively.
 *
 * @param {string} dir
 * @returns {string[]}
 */
function walkJs (dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = join(dir, e.name)
    if (e.isDirectory()) return walkJs(p)
    return e.name.endsWith('.js') ? [p] : []
  })
}

describe('THE FOUNDING DEFECT, for a MALFORMED ROW: a --json consumer must never be told a broken store is empty', () => {
  // This CLI exists because the old readers printed `{"ready": []}` to stdout and whispered their
  // only complaint to stderr — a stream ten call sites pipe to /dev/null — so a tracker that could
  // not find its store was indistinguishable from one reporting an empty backlog.
  //
  // That was fixed for a MISSING store (ENOSTORE) and left standing for a MALFORMED ROW. A store
  // `validate` calls broken answered `{"ready": [], "blocked": [], "needsAttention": []}` with
  // exit 0, and the sentence naming the dropped field went to stderr. Same defect, same stream,
  // different cause — and it survived the commit that fixed the other half.

  it('validate calls the store broken — establishing that it IS broken', (t) => {
    assert.equal(run(VALIDATE, [], brokenRow(t)).code, 2)
  })

  it('`ready --json` puts the loader\'s complaint IN THE ANSWER, not only on stderr', (t) => {
    const { code, out } = run(READY, ['--json'], brokenRow(t))
    assert.equal(code, 0)
    const parsed = JSON.parse(out)
    assert.ok(Array.isArray(parsed.warnings), 'no `warnings` key — a JSON consumer is blind to it')
    assert.match(parsed.warnings[0] ?? '', /invalid status "open"/)
  })

  it('`ready --strict` exits 2 for a DROPPED row, exactly as it does for a broken type', (t) => {
    // The asymmetry this fixes: `computeReady` skips any row whose status is not `pending` BEFORE
    // it reaches the type guard. So `type: bug` landed in needsAttention and tripped --strict,
    // while `status: open` was silently discarded and --strict exited 0. Two malformed REQUIRED
    // fields, opposite behaviour — and CLAUDE.md says a malformed required field makes the row
    // BROKEN, not merely non-workable.
    assert.equal(run(READY, ['--strict'], brokenRow(t)).code, 2)
  })

  it('`stats --json` carries it too — "present in the sum, absent from every answer"', (t) => {
    const { out } = run(STATS, ['--json'], brokenRow(t))
    const parsed = JSON.parse(out)
    assert.equal(parsed.total, 1)
    assert.ok(Array.isArray(parsed.warnings))
  })

  it('a HEALTHY store carries NO warnings key and --strict exits 0 — 2 must MEAN something', (t) => {
    const dir = seedStore(tmpDir(t, 'diarie-clean-'), 'a',
      'tasks:\n  - id: T-1\n    title: fine\n    status: pending\n    type: task\n')
    const { code, out } = run(READY, ['--strict', '--json'], dir)
    assert.equal(code, 0)
    assert.equal(JSON.parse(out).warnings, undefined)
  })
})

describe('THE TWO-FLAG CROSS: --strict was DEAD under --filter, and the suite could not see it', () => {
  // `grep "filter.*strict"` over this suite returned NOTHING before these tests. Every --strict and
  // every `warnings` assertion went through the bare partition path, so when `formatWorkResult`
  // returned from the `mode === 'filter'` branch BEFORE the strict verdict, nothing noticed.
  //
  // The MISTAKES table above quantifies beautifully over user mistakes — and its domain is ONE
  // DIMENSIONAL. It never crosses two flags. A quantified suite is only as good as the domain you
  // chose, and choosing the domain is exactly where my blind spot lives.
  //
  // This matters beyond tidiness: the `--filter --json` output is a PINNED ARRAY with nowhere to
  // carry a `warnings` key, so the exit code is the ONLY channel that path has — and
  // hooks/session-start.sh reads that path at every session start.

  it('a DROPPED row makes `--filter --strict` exit 2 (it exited 0)', (t) => {
    // `status: in-progress` (hyphen) is not in VALID_STATUSES, so the loader rejects the field and
    // the row disappears from every partition AND from every filter. A live claim, gone.
    const dir = seedStore(tmpDir(t, 'diarie-x-drop-'), 'a',
      'tasks:\n  - id: T-9\n    title: THE LIVE CLAIM\n    status: in-progress\n    type: task\n')
    assert.equal(run(READY, ['--filter', 'in_progress', '--strict'], dir).code, 2)
  })

  it('a BROKEN-TYPE row makes `--filter --strict` exit 2 — and is still SERVED in the array', (t) => {
    // The two views disagree on purpose: the partition quarantines this row in needsAttention,
    // while `--filter pending` answers "what has this status" and hands it over. So a consumer that
    // reads the array and ignores the exit code gets a broken row as though it were healthy. The
    // exit code is its only warning. Pinning BOTH halves here so neither can drift.
    const dir = seedStore(tmpDir(t, 'diarie-x-type-'), 'a',
      'tasks:\n  - id: T-1\n    title: broken required type\n    status: pending\n    type: bug\n')
    const { code, out } = run(READY, ['--filter', 'pending', '--strict', '--json'], dir)
    assert.equal(code, 2)
    assert.equal(JSON.parse(out).length, 1)
  })

  it('`--strict` stays OPT-IN — a broken store without it still exits 0', (t) => {
    const dir = seedStore(tmpDir(t, 'diarie-x-optin-'), 'a',
      'tasks:\n  - id: T-1\n    title: broken\n    status: pending\n    type: bug\n')
    assert.equal(run(READY, ['--filter', 'pending', '--json'], dir).code, 0)
  })

  it('a HEALTHY store passes `--filter --strict` — 2 must MEAN something', (t) => {
    const dir = seedStore(tmpDir(t, 'diarie-x-ok-'), 'a',
      'tasks:\n  - id: T-1\n    title: fine\n    status: pending\n    type: task\n')
    assert.equal(run(READY, ['--filter', 'pending', '--strict'], dir).code, 0)
  })

  it('`--strict` is in the usage string — it was missing, and it was also dead', () => {
    const { out } = run(READY, ['--help'], FIXTURES)
    assert.match(out, /--strict/)
  })

  it('`stats --stale --json` carries the loader\'s complaint (it returned before the append)', (t) => {
    // The early return sat FOUR LINES above the comment explaining why warnings must be appended.
    // `agents/sprint-review.md` runs exactly `stats --stale --days 60 --json`.
    const dir = seedStore(tmpDir(t, 'diarie-x-stale-'), 'a',
      'tasks:\n  - id: T-9\n    title: dropped\n    status: in-progress\n    type: task\n')
    const parsed = JSON.parse(run(STATS, ['--stale', '--json'], dir).out)
    assert.ok(Array.isArray(parsed.warnings), 'no `warnings` key — a JSON consumer is blind to it')
    assert.match(parsed.warnings[0] ?? '', /invalid status/)
  })

  it('`stats --stale --json` on a HEALTHY store carries NO warnings key', (t) => {
    const dir = seedStore(tmpDir(t, 'diarie-x-stale-ok-'), 'a',
      'tasks:\n  - id: T-1\n    title: fine\n    status: pending\n    type: task\n')
    assert.equal(JSON.parse(run(STATS, ['--stale', '--json'], dir).out).warnings, undefined)
  })
})

describe('exit 2 must not TRUNCATE the answer — process.exit() does not flush a pipe', () => {
  // Every fixture in this suite is small, so no test could ever have caught this. Found by running
  // the CLI against a 400-row store and watching stdout stop at exactly 65536 bytes — the kernel
  // pipe buffer.
  //
  // Stdout to a pipe is ASYNCHRONOUS. `process.exit()` terminates immediately and abandons the
  // pending write. So the answer was written, the process exited 2, and a `--json` consumer got
  // half a JSON document. Its `jq` fails; it falls back to "no data"; and a broken store reads as
  // an empty one — the founding defect of this tool, re-entered through the exit code that exists
  // to report it. `process.exitCode` lets Node drain stdout and exit naturally.

  it('`ready --strict --json` exits 2 AND emits complete, parseable JSON', (t) => {
    const { code, out } = run(READY, ['--strict', '--json'], bigStore(t))
    assert.equal(code, 2)
    assert.ok(out.length > 65536, `payload must exceed the 64KB pipe buffer to be a real test (got ${out.length})`)
    const parsed = JSON.parse(out)   // throws on a truncated document — that IS the assertion
    assert.equal(parsed.ready.length, 400)
  })

  it('`ready --filter --strict --json` exits 2 AND emits complete, parseable JSON', (t) => {
    const { code, out } = run(READY, ['--filter', 'pending', '--strict', '--json'], bigStore(t))
    assert.equal(code, 2)
    assert.ok(out.length > 65536, `payload must exceed the 64KB pipe buffer (got ${out.length})`)
    assert.equal(JSON.parse(out).length, 400)
  })
})

describe('THE FOURTH DOOR: one unreadable file must not delete the whole store', () => {
  // `loadTasks` called `yaml.load` with NO try/catch. So a single stray unterminated quote in ONE
  // tasks file threw out of the reader, landed in cli.js's "genuinely unexpected: a bug, not a user
  // mistake" branch, and exited 1 with a stack trace — taking every OTHER file's rows with it,
  // including live in-progress claims in files that were perfectly fine.
  //
  // And exit 1 is what hooks/session-start.sh reads as ENOSTORE and blanks the payload for. So the
  // hook silently forgot a live claim, through a door the three previous fixes had not touched.
  //
  // CLAUDE.md's own Reader conventions: "Represent the malformed row; never delete it." One bad file
  // was deleting the store.

  it('the live claim in the HEALTHY file survives', (t) => {
    const { out } = run(READY, ['--filter', 'in_progress', '--json'], halfBroken(t))
    const rows = JSON.parse(out)
    assert.equal(rows.length, 1)
    assert.equal(rows[0].title, 'THE LIVE CLAIM')
  })

  it('the unreadable file is REPORTED by name, and says what it cost', (t) => {
    const { err } = run(READY, ['--json'], halfBroken(t))
    assert.match(err, /tasks-b\.yml: invalid YAML/)
    assert.match(err, /MISSING from every count/)
  })

  it('it is an InputError-class store problem, NOT an "unexpected error" crash', (t) => {
    const { err } = run(READY, [], halfBroken(t))
    assert.doesNotMatch(err, /unexpected error/)
  })

  it('`--strict` exits 2 — so the session-start hook (which reads exit 1 as ENOSTORE) is not fooled', (t) => {
    assert.equal(run(READY, ['--filter', 'in_progress', '--strict'], halfBroken(t)).code, 2)
  })

  it('`validate` still rejects it — the reader is honest, the validator is the authority', (t) => {
    assert.equal(run(VALIDATE, [], halfBroken(t)).code, 2)
  })
})

describe('ONE VERDICT, BOTH SHAPES: --filter --strict must agree with the partition', () => {
  // The first `--filter --strict` fix threw only on a dropped row, leaving the cycle, the
  // needs-attention and the dangling-dep cases behind — so the flag went from DEAD to merely WEAKER,
  // while the same commit taught `--help` to advertise it ("exit non-zero if any task needs
  // attention, or the queue looks cyclic"). A promise one of its paths did not keep.
  //
  // Fix the instance, leave the class — in the fix for exactly that. So the verdict is now computed
  // ONCE, in `doTheWork`, and both shapes read it.

  const STORES = [
    { what: 'a dependency cycle', yaml: 'tasks:\n  - id: A\n    title: a\n    status: pending\n    type: task\n    deps: [B]\n  - id: B\n    title: b\n    status: pending\n    type: task\n    deps: [A]\n' },
    { what: 'an ABSENT required type', yaml: 'tasks:\n  - id: T-1\n    title: no type\n    status: pending\n' },
    { what: 'a dangling dep', yaml: 'tasks:\n  - id: T-1\n    title: x\n    status: pending\n    type: task\n    deps: [NOPE]\n' },
    { what: 'a dropped row (bad status)', yaml: 'tasks:\n  - id: T-9\n    title: claim\n    status: in-progress\n    type: task\n' },
  ]

  for (const { what, yaml } of STORES) {
    it(`${what}: --filter --strict agrees with --strict`, (t) => {
      const dir = seedStore(tmpDir(t, 'diarie-agree-'), 'a', yaml)
      const filtered = run(READY, ['--filter', 'pending', '--strict'], dir).code
      const partition = run(READY, ['--strict'], dir).code
      assert.equal(filtered, partition, `--filter --strict exited ${filtered}, --strict exited ${partition}`)
      assert.equal(filtered, 2)
    })
  }

  it('a HEALTHY store: both shapes exit 0 — 2 must MEAN something', (t) => {
    const dir = seedStore(tmpDir(t, 'diarie-agree-ok-'), 'a',
      'tasks:\n  - id: T-1\n    title: fine\n    status: pending\n    type: task\n')
    assert.equal(run(READY, ['--filter', 'pending', '--strict'], dir).code, 0)
    assert.equal(run(READY, ['--strict'], dir).code, 0)
  })
})
