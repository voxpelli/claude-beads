/**
 * Unit tests for the bd → flat-YAML migrator (`bootstrap-tasks.mjs`).
 *
 * This suite exists because the migrator stopped being a one-shot: `/migrate-tracker`
 * runs it against sibling repos, and its failure mode is SILENT DATA LOSS (a body
 * that parses wrong drops its acceptance criteria without erroring), not a crash.
 * Every case below is a bug that actually bit, or a generalization the vp-beads
 * migration could never have exercised.
 *
 * NOTE the characterization test that guards the whole pipeline is NOT here — it
 * is a one-time proof recorded in the commit: the generalized migrator, given
 * vp-beads's parameters, reproduces the original 24-issue migration byte-for-byte.
 * These tests cover what that diff structurally cannot: repos unlike vp-beads.
 */

import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync,
} from 'node:fs'

import {
  groupTasks, normalizeBody, projectLive, splitBody,
} from '../diarie/lib/migrate/bootstrap.js'

let passed = 0
let failed = 0

/**
 * @param {string} name
 * @param {boolean} cond
 */
function assert (name, cond) {
  if (cond) {
    passed++
    console.log(`  ✓ ${name}`)
  } else {
    failed++
    console.error(`  ✗ ${name}`)
  }
}

/**
 * A minimal bd issue, with per-case overrides merged on top.
 *
 * @param {any} over fields to override on the base issue
 * @returns {any} a bd-shaped issue record
 */
const issue = (over) => ({ id: 'p-1', title: 't', status: 'open', issue_type: 'task', priority: 2, ...over })

console.log('splitBody')

{
  const { acceptanceCriteria, description } = splitBody('Intro.\n\n## Acceptance Criteria\n\n- one\n- two\n')
  assert('extracts AC bullets and keeps the rest as description',
    acceptanceCriteria.join('|') === 'one|two' && description === 'Intro.')
}
{
  // The vp-beads-8d5 bug: the body stored literal backslash-n, so the heading was
  // never line-anchored and the AC vanished with no error. Cost 1 of 10 carriers.
  const { acceptanceCriteria } = splitBody(String.raw`Intro.\n\n## Acceptance Criteria\n\n- one\n- two`)
  assert('escaped-newline body (8d5): AC still extracted, not silently dropped',
    acceptanceCriteria.join('|') === 'one|two')
}
{
  const { acceptanceCriteria, description } = splitBody('## Acceptance Criteria\n- a\n\n## Notes\nkeep me')
  assert('AC section ends at the next ## heading', acceptanceCriteria.join('|') === 'a' && description === '## Notes\nkeep me')
}
{
  const { acceptanceCriteria } = splitBody('## Acceptance Criteria\n- [ ] unchecked\n- [x] checked')
  assert('strips task-list checkbox markers', acceptanceCriteria.join('|') === 'unchecked|checked')
}
{
  const { acceptanceCriteria, description } = splitBody('Just a body.')
  assert('no AC heading: empty list, body preserved', acceptanceCriteria.length === 0 && description === 'Just a body.')
}

{
  // The DECISION path never got the normalization the TASK path had — and a decision is
  // ENTIRELY prose, so its whole payload rendered as one line of `\n` gibberish. vp-beads
  // never saw it: its 6 decisions didn't carry the artifact and its 1 artifact-carrying
  // issue was a task. Only a sibling repo would have hit it.
  const raw = String.raw`## Decision\nWe chose X.\n\n## Rationale\nBecause Y.`
  const out = normalizeBody(raw)
  assert('normalizeBody un-escapes literal backslash-n (the decision path needs it too)',
    out.includes('\n## Rationale') && !out.includes('\\n'))
}
assert('normalizeBody tolerates an absent body', normalizeBody() === '')

console.log('\nprojectLive (edges to non-live issues)')

const liveIds = new Set(['p-1', 'p-live'])

{
  /** @type {string[]} */
  const dropped = []
  const t = projectLive(issue({ dependencies: [{ depends_on_id: 'p-closed', type: 'blocks' }] }), liveIds, dropped)
  assert('a blocks-dep on a CLOSED issue is dropped, not dangled',
    t.deps === undefined && dropped.length === 1 && dropped[0].includes('blocks'))
}
{
  /** @type {string[]} */
  const dropped = []
  const t = projectLive(issue({ dependencies: [{ depends_on_id: 'p-live', type: 'blocks' }] }), liveIds, dropped)
  assert('a blocks-dep on a LIVE issue is kept', t.deps?.join(',') === 'p-live' && dropped.length === 0)
}
{
  // vp-beads never hit this — every one of its parents was still live. A sibling
  // repo with a COMPLETED epic would emit a dangling parent and fail validate-tasks.
  /** @type {string[]} */
  const dropped = []
  const t = projectLive(issue({ dependencies: [{ depends_on_id: 'p-closed', type: 'parent-child' }] }), liveIds, dropped)
  assert('a parent-child edge to a CLOSED epic is dropped, not dangled',
    t.parent === undefined && dropped.length === 1 && dropped[0].includes('parent'))
}
{
  /** @type {string[]} */
  const dropped = []
  const t = projectLive(issue({ dependencies: [{ depends_on_id: 'p-live', type: 'parent-child' }] }), liveIds, dropped)
  assert('a parent-child edge to a LIVE epic is kept', t.parent === 'p-live' && dropped.length === 0)
}

console.log('\nprojectLive (type / status / priority mapping)')

{
  const t = projectLive(issue({ status: 'deferred' }), liveIds, [])
  assert('deferred survives as deferred (the spike approximated it to cancelled)', t.status === 'deferred')
}
{
  const t = projectLive(issue({ issue_type: 'bug' }), liveIds, [])
  assert('a bd framing (bug) collapses to type=task + a label', t.type === 'task' && t.labels?.includes('bug'))
}
{
  const t = projectLive(issue({ issue_type: 'decision' }), liveIds, [])
  assert('decision stays its own type (it is routed to decisions/, not a task row)', t.type === 'decision')
}
{
  const t = projectLive(issue({ priority: 99 }), liveIds, [])
  assert('an unmapped priority defaults to medium rather than emitting an invalid enum', t.priority === 'medium')
}
{
  let threw = false
  try { projectLive(issue({ issue_type: 'nonsense' }), liveIds, []) } catch { threw = true }
  assert('an unknown issue_type throws loudly (never a silently wrong type)', threw)
}
{
  // bd has statuses beyond STATUS_MAP's four (`reopened`, …). Unmapped → undefined →
  // js-yaml DROPS the key → a task row with no status. Silent corruption; must throw.
  let threw = false
  try { projectLive(issue({ status: 'reopened' }), liveIds, []) } catch { threw = true }
  assert('an unmapped bd status (reopened) throws, never emits a status-less row', threw)
}

console.log('\ngroupTasks (slug routing)')

const epicSlugs = new Map([['e-1', 'migration']])

{
  const tasks = [
    { id: 'e-1' },
    { id: 'c-1', parent: 'e-1' },
    { id: 'g-1', parent: 'c-1' }, // grandchild — must follow the epic transitively
    { id: 'o-1' },
  ]
  const g = groupTasks(tasks, epicSlugs, 'backlog')
  assert('the epic, its child, AND its grandchild land in the epic slug',
    g.get('migration')?.map(t => t.id).join(',') === 'e-1,c-1,g-1')
  assert('an unparented task falls to the default slug', g.get('backlog')?.map(t => t.id).join(',') === 'o-1')
}
{
  const g = groupTasks([{ id: 'o-1' }], new Map(), 'backlog')
  assert('no --epic given: everything lands in one default-slug file', g.size === 1 && g.get('backlog')?.length === 1)
}
{
  // A malformed export could carry a parent cycle; routing must terminate.
  const g = groupTasks([{ id: 'a', parent: 'b' }, { id: 'b', parent: 'a' }], epicSlugs, 'backlog')
  assert('a parent cycle terminates and falls to the default slug', g.get('backlog')?.length === 2)
}
{
  const g = groupTasks([{ id: 'o-1' }], epicSlugs, 'backlog')
  assert('an --epic with no live members yields an empty (still-written) slug', g.get('migration')?.length === 0)
}

console.log('\nCLI guards (the two data-loss stops)')

const SCRIPT = fileURLToPath(new URL('../diarie/lib/migrate/bootstrap.js', import.meta.url))
const EXPORT = fileURLToPath(new URL('../.diarie/_archive/bd-final-export.jsonl', import.meta.url))

/**
 * Run the migrator CLI against the frozen archive.
 *
 * @param {string[]} args
 * @param {string} [wd] working dir (to exercise the CWD default)
 * @returns {{ code: number|null, out: string }}
 */
const run = (args, wd) => {
  const r = spawnSync('node', [SCRIPT, EXPORT, ...args], { cwd: wd, encoding: 'utf8' })
  return { code: r.status, out: (r.stdout ?? '') + (r.stderr ?? '') }
}

{
  const dir = mkdtempSync(join(tmpdir(), 'vp-boot-'))
  try {
    const { code } = run(['--root', dir])
    const wrote = existsSync(join(dir, '.diarie', 'tasks', 'tasks-backlog.yml'))
    assert('an empty root migrates cleanly', code === 0 && wrote)

    // Second run over the now-populated store must STOP. This is the guard that
    // stands between a re-invocation and every hand-edit made since the cutover.
    const again = run(['--root', dir])
    assert('re-running over an existing store refuses (exit 1, names the files)',
      again.code === 1 && /refusing to overwrite/.test(again.out) && again.out.includes('tasks-backlog.yml'))

    assert('--force overrides the refusal (the deliberate redo path)', run(['--root', dir, '--force']).code === 0)
  } finally { rmSync(dir, { recursive: true, force: true }) }
}
{
  // An ignored ARCHIVE is a judgment call — closed issues record what was DONE, which
  // git log/CHANGELOG usually already cover. Say something; do not refuse. Asserted on
  // BEHAVIOUR (migrated + spoke about the archive), not on the exact prose — an earlier
  // version of this test pinned a sentence and broke when the wording improved.
  const dir = mkdtempSync(join(tmpdir(), 'vp-boot-'))
  try {
    spawnSync('git', ['-C', dir, 'init', '-q'])
    writeFileSync(join(dir, '.gitignore'), '*.jsonl\n')
    const { code, out } = run(['--root', dir])
    assert('a gitignored ARCHIVE still migrates and is mentioned (policy is the user\'s, not ours)',
      code === 0 &&
      existsSync(join(dir, '.diarie', 'tasks', 'tasks-backlog.yml')) &&
      /gitignored/.test(out) && /bd-final-export\.jsonl/.test(out))
  } finally { rmSync(dir, { recursive: true, force: true }) }
}
{
  // Revealed preference: a project that never tracked `.beads/` already decided bd
  // history is not worth versioning. Committing a JSONL of it now would quietly
  // reverse that — so when the archive WOULD commit, say so as a new choice.
  const dir = mkdtempSync(join(tmpdir(), 'vp-boot-'))
  try {
    spawnSync('git', ['-C', dir, 'init', '-q'])
    const { code, out } = run(['--root', dir])
    assert('archive not ignored + bd history never tracked → flagged as a NEW choice',
      code === 0 && /first time/.test(out))
  } finally { rmSync(dir, { recursive: true, force: true }) }
}
{
  // An ignored STORE is not a judgment call — the migration produced nothing durable.
  const dir = mkdtempSync(join(tmpdir(), 'vp-boot-'))
  try {
    spawnSync('git', ['-C', dir, 'init', '-q'])
    writeFileSync(join(dir, '.gitignore'), '.diarie/\n')
    const { code, out } = run(['--root', dir])
    assert('a gitignored STORE is a hard stop (the backlog itself would not commit)',
      code === 1 && /GITIGNORED/.test(out))
  } finally { rmSync(dir, { recursive: true, force: true }) }
}
{
  // …but a plain non-git directory must not false-positive.
  const dir = mkdtempSync(join(tmpdir(), 'vp-boot-'))
  try {
    assert('a non-git target still migrates (check-ignore absence is not a failure)',
      run(['--root', dir]).code === 0)
  } finally { rmSync(dir, { recursive: true, force: true }) }
}
{
  // Both readers accept tasks-*.yaml too, so the guard must match that extension —
  // otherwise a .yaml store is invisible to it and gets clobbered.
  const dir = mkdtempSync(join(tmpdir(), 'vp-boot-'))
  try {
    mkdirSync(join(dir, '.diarie', 'tasks'), { recursive: true })
    writeFileSync(join(dir, '.diarie', 'tasks', 'tasks-x.yaml'), 'tasks: []\n')
    const { code, out } = run(['--root', dir])
    assert('a tasks-*.yaml store also trips the overwrite guard (not just .yml)',
      code === 1 && /refusing to overwrite/.test(out))
  } finally { rmSync(dir, { recursive: true, force: true }) }
}
{
  // Without --root the target is CWD, never the plugin checkout — so a forgotten
  // --root cannot clobber the tracker of whatever repo happens to ship this script.
  const dir = mkdtempSync(join(tmpdir(), 'vp-boot-'))
  try {
    const { code } = run([], dir)
    assert('a bare run (no --root) targets CWD, not the script\'s own repo',
      code === 0 && existsSync(join(dir, '.diarie', 'tasks', 'tasks-backlog.yml')))
  } finally { rmSync(dir, { recursive: true, force: true }) }
}

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
