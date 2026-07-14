/**
 * Unit tests for the WORK stage of each command — `doTheWork`.
 *
 * This file is the point of the four-part command shape. `doTheWork` returns a typed
 * `WorkResult` and prints nothing, so every assertion below runs IN-PROCESS: no spawn,
 * no stdout capture, no env seam.
 *
 * That matters concretely. The one test that previously tried to drive the CLI
 * in-process had to monkey-patch `process.stdout.write` — which, under `node --test`,
 * swallows the runner's own TAP stream. It silently dropped 40 of 54 results while
 * still printing "pass". The seam tested here is what makes that hack unnecessary.
 *
 * The file-IO path end-to-end (exit codes, flag dispatch, the stdout/stderr split)
 * stays in `cli.spec.js`, which SPAWNS — as the reference does (compare-eslint-configs
 * splits `audit.spec.js` from `audit.cli.spec.js` on exactly this line).
 */

import assert from 'node:assert/strict'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync,
} from 'node:fs'

import { doTheWork as initWork } from '../lib/commands/init.js'
import { doTheWork as readyWork } from '../lib/commands/ready.js'
import { doTheWork as statsWork } from '../lib/commands/stats.js'
import { doTheWork as validateWork } from '../lib/commands/validate.js'

const FIXTURES = fileURLToPath(new URL('fixtures', import.meta.url))

/** @type {string[]} */
const scratch = []

after(() => {
  for (const dir of scratch) rmSync(dir, { force: true, recursive: true })
})

/**
 * Write a throwaway store and return its root.
 *
 * @param {string} yaml The body of `tasks-backlog.yml`.
 * @returns {string}
 */
function storeWith (yaml) {
  const root = mkdtempSync(join(tmpdir(), 'diarie-cmd-'))
  scratch.push(root)
  mkdirSync(join(root, '.diarie', 'tasks'), { recursive: true })
  writeFileSync(join(root, '.diarie', 'tasks', 'tasks-backlog.yml'), yaml, 'utf8')
  return root
}

describe('ready — doTheWork', () => {
  it('returns the PARTITION as data, and says nothing', async () => {
    const result = await readyWork({ filter: undefined, root: FIXTURES })

    assert.equal(result.mode, 'partition')
    assert.ok(result.mode === 'partition') // narrows the union for the reads below
    assert.equal(result.partition.ready.length, 3)
    assert.equal(result.partition.blocked.length, 1)
    assert.equal(result.partition.needsAttention.length, 0)
    assert.equal(result.ambiguous, false)
    assert.deepEqual(result.warnings, [])
  })

  it('returns a flat LIST under --filter — a different shape, on purpose', async () => {
    const result = await readyWork({ filter: 'completed', root: FIXTURES })

    assert.equal(result.mode, 'filter')
    assert.ok(result.mode === 'filter')
    assert.ok(result.tasks.length > 0)
    assert.ok(result.tasks.every(t => t.status === 'completed'))
  })

  it('COLLECTS the loader\'s complaints as data instead of writing them to stderr', async () => {
    // The seam, demonstrated. `priority: urgent` is not in the enum, so the loader
    // rejects the field and the row silently becomes `medium`. Before this refactor the
    // only way to observe that was to capture a stream that ten call sites discard.
    const root = storeWith([
      'tasks:',
      '  - id: T-1',
      '    title: Bad priority',
      '    status: pending',
      '    type: task',
      '    priority: urgent',
    ].join('\n') + '\n')

    const result = await readyWork({ filter: undefined, root })

    assert.equal(result.warnings.length, 1)
    assert.match(result.warnings[0] ?? '', /urgent/)
    // And the consequence is named, not merely the rejection — a guard that DROPS must
    // also REPORT (CLAUDE.md `### Reader conventions`).
    assert.match(result.warnings[0] ?? '', /medium/)
  })

  it('flags AMBIGUITY: nothing ready, yet work exists — claimed, or a cycle', async () => {
    const root = storeWith([
      'tasks:',
      '  - id: T-1',
      '    title: Blocked on a task that never completes',
      '    status: pending',
      '    type: task',
      '    deps: [T-2]',
      '  - id: T-2',
      '    title: Claimed, so T-1 can never be ready',
      '    status: in_progress',
      '    type: task',
    ].join('\n') + '\n')

    const result = await readyWork({ filter: undefined, root })

    assert.ok(result.mode === 'partition')
    assert.equal(result.partition.ready.length, 0)
    assert.equal(result.ambiguous, true)
  })
})

describe('stats — doTheWork', () => {
  it('returns the summary as data', async () => {
    const { summary, warnings } = await statsWork({ days: 30, root: FIXTURES })

    assert.equal(typeof summary.total, 'number')
    assert.ok(summary.total > 0)
    assert.equal(summary.ready, 3)
    assert.ok(Array.isArray(summary.stale))
    assert.deepEqual(warnings, [])
  })

  it('takes the staleness threshold as an already-validated NUMBER', async () => {
    // The coercion happened in setupCommand (validateStaleFlags). By the time the work
    // runs, `days` cannot be NaN — which is what stops the silent zero-stale answer.
    const { summary } = await statsWork({ days: 0, root: FIXTURES })
    assert.ok(Array.isArray(summary.stale))
  })
})

describe('validate — doTheWork', () => {
  it('reports a clean store with no errors', async () => {
    const result = await validateWork({ root: FIXTURES })

    assert.deepEqual(result.errors, [])
    assert.equal(result.fileCount, 2)
  })

  it('returns a YAML parse failure as an ERROR, not as a crash', async () => {
    const root = storeWith('tasks:\n  - id: T-1\n   bad indent: [\n')

    const result = await validateWork({ root })

    assert.equal(result.errors.length, 1)
    assert.match(result.errors[0] ?? '', /invalid YAML/)
  })

  it('keeps NOTICES (stderr asides) apart from WARNINGS (part of the answer)', async () => {
    // Two channels, deliberately not merged: a lint warning belongs in the --json
    // payload, an aside about the store's shape does not. Collapsing them would hide a
    // lint warning from every machine consumer.
    const root = mkdtempSync(join(tmpdir(), 'diarie-cmd-'))
    scratch.push(root)
    mkdirSync(join(root, '.diarie', 'tasks'), { recursive: true })
    writeFileSync(join(root, '.diarie', 'tasks', 'tasks_old.yml'), 'tasks: []\n', 'utf8')

    const result = await validateWork({ root })

    assert.equal(result.fileCount, 0)
    assert.equal(result.notices.length, 1)
    assert.match(result.notices[0] ?? '', /not matching tasks-\*\.yml/)
  })
})

describe('init — doTheWork', () => {
  // The ONLY command whose work has a side effect, and the only one whose `doTheWork` was
  // exported and never tested — knip found it the day diarie started running its own gates.
  // A four-part command that nobody drives through the seam has the seam and none of the benefit.

  it('creates the store and REPORTS what it created', async () => {
    const root = mkdtempSync(join(tmpdir(), 'diarie-init-'))
    scratch.push(root)

    const { created, root: where } = await initWork({ root, slug: 'backlog' })

    assert.equal(where, root)
    assert.ok(created.length > 0)
    assert.ok(existsSync(join(root, '.diarie', 'tasks', 'tasks-backlog.yml')))
    assert.ok(existsSync(join(root, '.diarie', 'decisions')))
  })

  it('honours --slug — the first task file is named, not assumed', async () => {
    const root = mkdtempSync(join(tmpdir(), 'diarie-init-slug-'))
    scratch.push(root)

    await initWork({ root, slug: 'roadmap' })

    assert.ok(existsSync(join(root, '.diarie', 'tasks', 'tasks-roadmap.yml')))
  })

  it('REFUSES an existing store, and the refusal carries EEXIST', async () => {
    // Never merge, never overwrite, never "helpfully" back up. The code matters as much as the
    // refusal: a --json consumer must be able to tell this apart from any other input error
    // without regexing a human sentence. It shipped with no code at all.
    const root = mkdtempSync(join(tmpdir(), 'diarie-init-twice-'))
    scratch.push(root)

    await initWork({ root, slug: 'backlog' })
    await assert.rejects(
      () => initWork({ root, slug: 'backlog' }),
      (/** @type {Error & {code?: string}} */ err) => {
        assert.equal(err.name, 'InputError')
        assert.equal(err.code, 'EEXIST')
        assert.match(err.message, /refusing to touch an existing store/)
        return true
      }
    )
  })

  it('the store it creates is one `validate` accepts — init must not produce a broken store', async () => {
    const root = mkdtempSync(join(tmpdir(), 'diarie-init-valid-'))
    scratch.push(root)

    await initWork({ root, slug: 'backlog' })
    const result = await validateWork({ root })

    assert.deepEqual(result.errors, [])
  })
})
