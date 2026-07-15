/**
 * Unit tests for the bd → flat-YAML migrator.
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
 *
 * The CLI guards below drive a SYNTHETIC export (test/fixtures/bd-export.jsonl), not
 * the plugin's frozen archive. The archive lives outside this package and would not
 * survive extraction — a test that reads it is a test the standalone package cannot
 * run. The synthetic file is richer besides: it carries every TYPE_MAP entry, both
 * edge-drop paths, an unmappable priority and the escaped-newline body, which the real
 * export only partly did.
 */

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync,
} from 'node:fs'
import {
  after, before, describe, it,
} from 'node:test'

import {
  groupTasks, MIGRATE_OPTIONS, normalizeBody, projectLive, splitBody, USAGE,
} from '../lib/migrate/bootstrap.js'

/** @typedef {import('../lib/migrate/bd-map.js').BdIssue} BdIssue */

/**
 * A minimal bd issue, with per-case overrides merged on top.
 *
 * @param {Partial<BdIssue>} [over] fields to override on the base issue
 * @returns {BdIssue} a bd-shaped issue record
 */
const issue = (over) => ({ id: 'p-1', title: 't', status: 'open', issue_type: 'task', priority: 2, ...over })

describe('splitBody', () => {
  it('extracts AC bullets and keeps the rest as description', () => {
    const { acceptanceCriteria, description } = splitBody('Intro.\n\n## Acceptance Criteria\n\n- one\n- two\n')
    assert.ok(acceptanceCriteria.join('|') === 'one|two' && description === 'Intro.')
  })

  it('escaped-newline body (8d5): AC still extracted, not silently dropped', () => {
    // The vp-beads-8d5 bug: the body stored literal backslash-n, so the heading was
    // never line-anchored and the AC vanished with no error. Cost 1 of 10 carriers.
    const { acceptanceCriteria } = splitBody(String.raw`Intro.\n\n## Acceptance Criteria\n\n- one\n- two`)
    assert.equal(acceptanceCriteria.join('|'), 'one|two')
  })

  it('AC section ends at the next ## heading', () => {
    const { acceptanceCriteria, description } = splitBody('## Acceptance Criteria\n- a\n\n## Notes\nkeep me')
    assert.ok(acceptanceCriteria.join('|') === 'a' && description === '## Notes\nkeep me')
  })

  it('strips task-list checkbox markers', () => {
    const { acceptanceCriteria } = splitBody('## Acceptance Criteria\n- [ ] unchecked\n- [x] checked')
    assert.equal(acceptanceCriteria.join('|'), 'unchecked|checked')
  })

  it('no AC heading: empty list, body preserved', () => {
    const { acceptanceCriteria, description } = splitBody('Just a body.')
    assert.ok(acceptanceCriteria.length === 0 && description === 'Just a body.')
  })
})

describe('normalizeBody', () => {
  it('normalizeBody un-escapes literal backslash-n (the decision path needs it too)', () => {
    // The DECISION path never got the normalization the TASK path had — and a decision is
    // ENTIRELY prose, so its whole payload rendered as one line of `\n` gibberish. vp-beads
    // never saw it: its 6 decisions didn't carry the artifact and its 1 artifact-carrying
    // issue was a task. Only a sibling repo would have hit it.
    const out = normalizeBody(String.raw`## Decision\nWe chose X.\n\n## Rationale\nBecause Y.`)
    assert.ok(out.includes('\n## Rationale') && !out.includes('\\n'))
  })

  it('normalizeBody tolerates an absent body', () => {
    assert.equal(normalizeBody(), '')
  })
})

describe('projectLive (edges to non-live issues)', () => {
  const liveIds = new Set(['p-1', 'p-live'])

  it('a blocks-dep on a CLOSED issue is dropped, not dangled', () => {
    /** @type {string[]} */
    const dropped = []
    const t = projectLive(issue({ dependencies: [{ depends_on_id: 'p-closed', type: 'blocks' }] }), liveIds, dropped)
    assert.ok(t.deps === undefined && dropped.length === 1 && dropped[0]?.includes('blocks'))
  })

  it('a blocks-dep on a LIVE issue is kept', () => {
    /** @type {string[]} */
    const dropped = []
    const t = projectLive(issue({ dependencies: [{ depends_on_id: 'p-live', type: 'blocks' }] }), liveIds, dropped)
    assert.ok(t.deps?.join(',') === 'p-live' && dropped.length === 0)
  })

  it('a parent-child edge to a CLOSED epic is dropped, not dangled', () => {
    // vp-beads never hit this — every one of its parents was still live. A sibling
    // repo with a COMPLETED epic would emit a dangling parent and fail validate.
    /** @type {string[]} */
    const dropped = []
    const t = projectLive(issue({ dependencies: [{ depends_on_id: 'p-closed', type: 'parent-child' }] }), liveIds, dropped)
    assert.ok(t.parent === undefined && dropped.length === 1 && dropped[0]?.includes('parent'))
  })

  it('a parent-child edge to a LIVE epic is kept', () => {
    /** @type {string[]} */
    const dropped = []
    const t = projectLive(issue({ dependencies: [{ depends_on_id: 'p-live', type: 'parent-child' }] }), liveIds, dropped)
    assert.ok(t.parent === 'p-live' && dropped.length === 0)
  })
})

describe('projectLive (type / status / priority mapping)', () => {
  const liveIds = new Set(['p-1', 'p-live'])

  it('deferred survives as deferred (the spike approximated it to cancelled)', () => {
    assert.equal(projectLive(issue({ status: 'deferred' }), liveIds, []).status, 'deferred')
  })

  it('a bd framing (bug) collapses to type=task + a label', () => {
    const t = projectLive(issue({ issue_type: 'bug' }), liveIds, [])
    assert.ok(t.type === 'task' && t.labels?.includes('bug'))
  })

  it('decision stays its own type (it is routed to decisions/, not a task row)', () => {
    assert.equal(projectLive(issue({ issue_type: 'decision' }), liveIds, []).type, 'decision')
  })

  it('an unmapped priority defaults to medium rather than emitting an invalid enum', () => {
    assert.equal(projectLive(issue({ priority: 99 }), liveIds, []).priority, 'medium')
  })

  it('an unknown issue_type throws loudly (never a silently wrong type)', () => {
    assert.throws(() => projectLive(issue({ issue_type: 'nonsense' }), liveIds, []))
  })

  it('an unmapped bd status (reopened) throws, never emits a status-less row', () => {
    // bd has statuses beyond STATUS_MAP's four (`reopened`, …). Unmapped → undefined →
    // js-yaml DROPS the key → a task row with no status. Silent corruption; must throw.
    assert.throws(() => projectLive(issue({ status: 'reopened' }), liveIds, []))
  })
})

/**
 * A migrated task row. Only `id` and `parent` steer the routing, but the row must
 * still BE a row — the type is what says so, and the spec files are type-checked.
 *
 * @param {string} id
 * @param {string} [parent]
 * @returns {import('../lib/schema.js').TaskRow}
 */
const row = (id, parent) => ({ id, title: id, status: 'pending', type: 'task', ...(parent ? { parent } : {}) })

/**
 * The epic, a child, a GRANDchild (must follow the epic transitively), and an outsider.
 *
 * @returns {import('../lib/schema.js').TaskRow[]}
 */
const tree = () => [row('e-1'), row('c-1', 'e-1'), row('g-1', 'c-1'), row('o-1')]

describe('groupTasks (slug routing)', () => {
  const epicSlugs = new Map([['e-1', 'migration']])

  it('the epic, its child, AND its grandchild land in the epic slug', () => {
    const g = groupTasks(tree(), epicSlugs, 'backlog')
    assert.equal(g.get('migration')?.map(t => t.id).join(','), 'e-1,c-1,g-1')
  })

  it('an unparented task falls to the default slug', () => {
    const g = groupTasks(tree(), epicSlugs, 'backlog')
    assert.equal(g.get('backlog')?.map(t => t.id).join(','), 'o-1')
  })

  it('no --epic given: everything lands in one default-slug file', () => {
    const g = groupTasks([row('o-1')], new Map(), 'backlog')
    assert.ok(g.size === 1 && g.get('backlog')?.length === 1)
  })

  it('a parent cycle terminates and falls to the default slug', () => {
    // A malformed export could carry a parent cycle; routing must terminate.
    const g = groupTasks([row('a', 'b'), row('b', 'a')], epicSlugs, 'backlog')
    assert.equal(g.get('backlog')?.length, 2)
  })

  it('an --epic with no live members yields an empty (still-written) slug', () => {
    assert.equal(groupTasks([row('o-1')], epicSlugs, 'backlog').get('migration')?.length, 0)
  })
})

const SCRIPT = fileURLToPath(new URL('../lib/migrate/bootstrap.js', import.meta.url))
const EXPORT = fileURLToPath(new URL('fixtures/bd-export.jsonl', import.meta.url))

/**
 * Run the migrator CLI against the synthetic export.
 *
 * @param {string[]} args
 * @param {string} [wd] working dir (to exercise the CWD default)
 * @returns {{ code: number|null, out: string }}
 */
const run = (args, wd) => {
  const r = spawnSync('node', [SCRIPT, EXPORT, ...args], { cwd: wd, encoding: 'utf8' })
  return { code: r.status, out: (r.stdout ?? '') + (r.stderr ?? '') }
}

/**
 * A temp dir that cleans itself up when the test ends.
 *
 * @param {import('node:test').TestContext} t
 * @returns {string}
 */
function tmpDir (t) {
  const dir = mkdtempSync(join(tmpdir(), 'vp-boot-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  return dir
}

describe('CLI guards (the two data-loss stops)', () => {
  // The overwrite guard is STATEFUL — migrate, then re-run, then --force. The three
  // assertions share one store on purpose: the second only means anything because the
  // first populated it. Hence a shared dir and ordered `it`s, not three isolated cases.
  describe('the overwrite guard, in sequence', () => {
    /** @type {string} */
    let dir
    before(() => { dir = mkdtempSync(join(tmpdir(), 'vp-boot-')) })
    after(() => rmSync(dir, { recursive: true, force: true }))

    it('an empty root migrates cleanly', () => {
      const { code } = run(['--root', dir])
      assert.ok(code === 0 && existsSync(join(dir, '.diarie', 'tasks', 'tasks-backlog.yml')))
    })

    it('re-running over an existing store refuses (exit 1, names the files)', () => {
      // This is the guard that stands between a re-invocation and every hand-edit made
      // since the cutover.
      const again = run(['--root', dir])
      assert.ok(again.code === 1 && /refusing to overwrite/.test(again.out) && again.out.includes('tasks-backlog.yml'))
    })

    it('--force overrides the refusal (the deliberate redo path)', () => {
      assert.equal(run(['--root', dir, '--force']).code, 0)
    })
  })

  it('a gitignored ARCHIVE still migrates and is mentioned (policy is the user\'s, not ours)', (t) => {
    // An ignored ARCHIVE is a judgment call — closed issues record what was DONE, which
    // git log/CHANGELOG usually already cover. Say something; do not refuse. Asserted on
    // BEHAVIOUR (migrated + spoke about the archive), not on the exact prose — an earlier
    // version of this test pinned a sentence and broke when the wording improved.
    const dir = tmpDir(t)
    spawnSync('git', ['-C', dir, 'init', '-q'])
    writeFileSync(join(dir, '.gitignore'), '*.jsonl\n')
    const { code, out } = run(['--root', dir])
    assert.ok(
      code === 0 &&
      existsSync(join(dir, '.diarie', 'tasks', 'tasks-backlog.yml')) &&
      /gitignored/.test(out) && /bd-final-export\.jsonl/.test(out)
    )
  })

  it('archive not ignored + bd history never tracked → flagged as a NEW choice', (t) => {
    // Revealed preference: a project that never tracked `.beads/` already decided bd
    // history is not worth versioning. Committing a JSONL of it now would quietly
    // reverse that — so when the archive WOULD commit, say so as a new choice.
    const dir = tmpDir(t)
    spawnSync('git', ['-C', dir, 'init', '-q'])
    const { code, out } = run(['--root', dir])
    assert.ok(code === 0 && /first time/.test(out))
  })

  it('a gitignored STORE is a hard stop (the backlog itself would not commit)', (t) => {
    // An ignored STORE is not a judgment call — the migration produced nothing durable.
    const dir = tmpDir(t)
    spawnSync('git', ['-C', dir, 'init', '-q'])
    writeFileSync(join(dir, '.gitignore'), '.diarie/\n')
    const { code, out } = run(['--root', dir])
    assert.ok(code === 1 && /GITIGNORED/.test(out))
  })

  it('a non-git target still migrates (check-ignore absence is not a failure)', (t) => {
    // …but a plain non-git directory must not false-positive.
    assert.equal(run(['--root', tmpDir(t)]).code, 0)
  })

  it('a tasks-*.yaml store also trips the overwrite guard (not just .yml)', (t) => {
    // Both readers accept tasks-*.yaml too, so the guard must match that extension —
    // otherwise a .yaml store is invisible to it and gets clobbered.
    const dir = tmpDir(t)
    mkdirSync(join(dir, '.diarie', 'tasks'), { recursive: true })
    writeFileSync(join(dir, '.diarie', 'tasks', 'tasks-x.yaml'), 'tasks: []\n')
    const { code, out } = run(['--root', dir])
    assert.ok(code === 1 && /refusing to overwrite/.test(out))
  })

  it('a bare run (no --root) targets CWD, not the script\'s own repo', (t) => {
    // Without --root the target is CWD, never the plugin checkout — so a forgotten
    // --root cannot clobber the tracker of whatever repo happens to ship this script.
    const dir = tmpDir(t)
    const { code } = run([], dir)
    assert.ok(code === 0 && existsSync(join(dir, '.diarie', 'tasks', 'tasks-backlog.yml')))
  })
})

describe('USAGE ⇔ parser parity (vp-beads-mig)', () => {
  // migrate is the ONE command whose --help is hand-written, not generated by peowly — so its
  // USAGE can silently drift from the flags parseArgs actually accepts, with nothing going red.
  // This asserts the single source, and it is what lets vp-beads-vcb's oracle trust migrate's USAGE.
  it('every flag listed in USAGE is a MIGRATE_OPTIONS key, and vice versa', () => {
    const usageFlags = [...USAGE.matchAll(/^ {2}--([a-z-]+)/gm)].map(m => m[1]).toSorted()
    assert.deepEqual(usageFlags, Object.keys(MIGRATE_OPTIONS).toSorted())
  })
})

const CLI = fileURLToPath(new URL('../cli.js', import.meta.url))

describe('a missing input file is an InputError, not a crash (vp-beads-mig)', () => {
  // The archetypal user mistake: point at a file that is not there. It used to reach cli.js as a
  // raw ENOENT and be answered with a stack trace ("unexpected error"); migrate lived outside the
  // boundary. Now readFileSync's ENOENT is converted, so it lands in the same InputError/--json
  // contract as the four peowly commands. Spawned via cli.js, the real boundary.
  const MISSING = join(tmpdir(), 'diarie-does-not-exist-xyzzy.jsonl')

  it('plain: exit 1, a clear message, and NO stack trace', () => {
    const r = spawnSync('node', [CLI, 'migrate', MISSING], { encoding: 'utf8' })
    assert.equal(r.status, 1)
    assert.match(r.stderr, /no such bd export file/)
    assert.doesNotMatch(r.stderr, /unexpected error|^\s*at /m)
  })

  it('--json: the error is on STDOUT with the machine code EUSAGE', () => {
    const r = spawnSync('node', [CLI, 'migrate', MISSING, '--json'], { encoding: 'utf8' })
    assert.equal(r.status, 1)
    const parsed = JSON.parse(r.stdout)
    assert.equal(parsed.code, 'EUSAGE')
    assert.match(parsed.error, /no such bd export file/)
  })
})
