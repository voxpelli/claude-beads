/**
 * Unit tests for the integrity gate (lintTasks).
 *
 * Plants each violation class and asserts it is caught, plus clean cases that
 * must stay silent. Pure — inline data, no file IO.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { lintTasks } from 'diarie'

/**
 * Build a valid task, overridable per-field.
 *
 * @param {Record<string, unknown>} [task]
 * @returns {Record<string, unknown>}
 */
const ok = (task) => ({ id: 'T-1', title: 'x', status: 'pending', type: 'task', ...task })

/**
 * Lint a single inline file of tasks.
 *
 * `tasks` is deliberately `unknown` — lintTasks' whole job is to narrow untrusted
 * YAML, so the shape-guard cases below must be able to hand it malformed input.
 *
 * @param {unknown} tasks
 * @param {string} [name]
 * @returns {{ errors: string[], warnings: string[] }}
 */
const lint = (tasks, name = 'demo') => lintTasks([{ name, tasks }])

describe('lintTasks — Pass 1 (structural)', () => {
  it('a well-formed task file is clean', () => {
    const r = lint([ok({ id: 'T-1' }), ok({ id: 'T-2', status: 'completed', acceptance_criteria: ['done'] })])
    assert.ok(r.errors.length === 0 && r.warnings.length === 0)
  })

  it('missing required field (status) errors', () => {
    assert.ok(lint([{ id: 'T-1', title: 'x', type: 'task' }]).errors.some(e => /missing required field: status/.test(e)))
  })

  it('invalid status enum errors', () => {
    assert.ok(lint([ok({ status: 'doing' })]).errors.some(e => /invalid status/.test(e)))
  })

  it('invalid type enum errors', () => {
    assert.ok(lint([ok({ type: 'widget' })]).errors.some(e => /invalid type/.test(e)))
  })

  it('invalid priority enum errors', () => {
    assert.ok(lint([ok({ priority: 'urgent' })]).errors.some(e => /invalid priority/.test(e)))
  })

  it('invalid id shape errors', () => {
    assert.ok(lint([ok({ id: 'bad id!' })]).errors.some(e => /invalid id/.test(e)))
  })

  it('duplicate id within file errors', () => {
    assert.ok(lint([ok({ id: 'T-1' }), ok({ id: 'T-1' })]).errors.some(e => /duplicate id/.test(e)))
  })
})

describe('lintTasks — Pass 2 (dep graph)', () => {
  it('dangling dep errors', () => {
    assert.ok(lint([ok({ id: 'T-1', deps: ['T-99'] })]).errors.some(e => /dep "demo\/T-99" does not exist/.test(e)))
  })

  it('orphan parent errors', () => {
    assert.ok(lint([ok({ id: 'T-1', parent: 'T-99' })]).errors.some(e => /parent "demo\/T-99" does not exist/.test(e)))
  })

  it('a real dep does not error', () => {
    assert.equal(lint([ok({ id: 'T-1', status: 'completed', acceptance_criteria: ['x'] }), ok({ id: 'T-2', deps: ['T-1'] })]).errors.length, 0)
  })

  it('a 2-cycle is detected', () => {
    const r = lint([ok({ id: 'T-1', deps: ['T-2'] }), ok({ id: 'T-2', deps: ['T-1'] })])
    assert.ok(r.errors.some(e => /cycle/.test(e)))
  })

  it('cross-file dep (slug/id) resolves without dangling error', () => {
    const r = lintTasks([
      { name: 'a', tasks: [ok({ id: 'T-1', status: 'completed', acceptance_criteria: ['x'] })] },
      { name: 'b', tasks: [ok({ id: 'T-1', deps: ['a/T-1'] })] },
    ])
    assert.ok(!r.errors.some(e => /does not exist/.test(e)))
  })
})

describe('lintTasks — Pass 3 (transition sanity)', () => {
  it('in_progress claimed before a pending blocker warns', () => {
    const r = lint([ok({ id: 'T-1', status: 'pending' }), ok({ id: 'T-2', status: 'in_progress', deps: ['T-1'] })])
    assert.ok(r.warnings.some(w => /claimed before blockers resolved/.test(w)))
  })

  it('agent set on a pending task is a ghost-claim warning', () => {
    assert.ok(lint([ok({ id: 'T-1', status: 'pending', agent: 'loop-1' })]).warnings.some(w => /ghost claim/.test(w)))
  })
})

describe('lintTasks — Pass 4 (test-ratchet)', () => {
  it('completed task with no acceptance_criteria warns', () => {
    assert.ok(lint([ok({ id: 'T-1', status: 'completed', type: 'task' })]).warnings.some(w => /no acceptance_criteria/.test(w)))
  })

  it('completed task WITH acceptance_criteria is clean', () => {
    assert.equal(lint([ok({ id: 'T-1', status: 'completed', type: 'task', acceptance_criteria: ['ok'] })]).warnings.length, 0)
  })

  it('completed doc (non-ratchet type) needs no acceptance_criteria', () => {
    assert.equal(lint([ok({ id: 'T-1', status: 'completed', type: 'doc' })]).warnings.length, 0)
  })

  it('a former bd type (chore) is no longer a valid type', () => {
    assert.ok(lint([ok({ type: 'chore' })]).errors.some(e => /invalid type "chore"/.test(e)))
  })

  it('framings ride in labels, not type (task + bug label is clean)', () => {
    assert.equal(lint([ok({ labels: ['bug'] })]).errors.length, 0)
  })

  it('completed task with SCALAR acceptance_criteria still warns (not a list)', () => {
    assert.ok(lint([ok({ id: 'T-1', status: 'completed', type: 'task', acceptance_criteria: 'done' })]).warnings.some(w => /no acceptance_criteria/.test(w)))
  })
})

describe('lintTasks — Pass 0 (shape guard)', () => {
  it('deps as a scalar string errors (not char-split)', () => {
    assert.ok(lint([ok({ id: 'T-1', deps: 'T-2' })]).errors.some(e => /"deps" must be a list/.test(e)))
  })

  it('acceptance_criteria as a scalar string errors', () => {
    assert.ok(lint([ok({ id: 'T-1', acceptance_criteria: 'done' })]).errors.some(e => /"acceptance_criteria" must be a list/.test(e)))
  })

  it('top-level tasks as a non-array errors cleanly', () => {
    assert.ok(lintTasks([{ name: 'demo', tasks: 'oops' }]).errors.some(e => /"tasks" must be a list/.test(e)))
  })

  it('a non-mapping task entry errors', () => {
    assert.ok(lintTasks([{ name: 'demo', tasks: ['oops'] }]).errors.some(e => /is not a mapping/.test(e)))
  })

  it('labels as a scalar string errors', () => {
    assert.ok(lint([ok({ labels: 'bug' })]).errors.some(e => /"labels" must be a list/.test(e)))
  })

  it('a non-string labels entry errors', () => {
    assert.ok(lint([ok({ labels: ['bug', 7] })]).errors.some(e => /"labels" entries must all be strings/.test(e)))
  })

  it('a scalar deps does not crash and skips graph use', () => {
    assert.doesNotThrow(() => lint([ok({ id: 'T-1', deps: 'T-2' })]))
  })
})

describe('lintTasks — Pass 2 (cycle exhaustiveness + hints)', () => {
  it('two disjoint 2-cycles each produce a distinct cycle error', () => {
    const r = lint([
      ok({ id: 'T-1', deps: ['T-2'] }), ok({ id: 'T-2', deps: ['T-1'] }),
      ok({ id: 'T-3', deps: ['T-4'] }), ok({ id: 'T-4', deps: ['T-3'] }),
    ])
    const cycles = r.errors.filter(e => /cycle/.test(e))
    assert.ok(cycles.length === 2 && cycles.some(e => /T-1|T-2/.test(e)) && cycles.some(e => /T-3|T-4/.test(e)))
  })

  it('a self-loop is detected as a cycle', () => {
    assert.ok(lint([ok({ id: 'T-1', deps: ['T-1'] })]).errors.some(e => /cycle/.test(e)))
  })

  it('a dangling bare dep matching another slug suggests it', () => {
    const r = lintTasks([
      { name: 'a', tasks: [ok({ id: 'T-1', status: 'completed', acceptance_criteria: ['x'] })] },
      { name: 'b', tasks: [ok({ id: 'T-2', deps: ['T-1'] })] }, // bare 'T-1' → 'b/T-1' (dangling)
    ])
    assert.ok(r.errors.some(e => /did you mean a\/T-1/.test(e)))
  })
})

describe('lintTasks — Pass 1 (updated date)', () => {
  it('malformed updated date errors', () => {
    assert.ok(lint([ok({ id: 'T-1', updated: 'yesterday' })]).errors.some(e => /invalid updated/.test(e)))
  })

  it('valid ISO updated date is clean', () => {
    assert.equal(lint([ok({ id: 'T-1', updated: '2026-01-01' })]).errors.length, 0)
  })
})

// THE WORST BUG THIS FILE HAS EVER PINNED. `computeReady` blocks on TWO edge kinds pointing
// opposite ways: a dep blocks the DEPENDENT (task → dep), a child blocks the PARENT
// (parent → child). Checking `deps` and `parents` as SEPARATE graphs meant a ring that
// ALTERNATES edge kinds was acyclic in both projections and cyclic in neither — so every
// gate went green over a backlog in which nothing could ever be worked, and `ready` sent
// the human to `validate`, which sent them back. Forever.
describe('the BLOCKING graph — one check over the union, not two over the projections', () => {
  it('a task that depends on its own epic is a CYCLE (deps ⨯ containment) — both projections call it clean', () => {
    assert.ok(lint([
      { id: 'E', title: 'the epic', status: 'pending', type: 'task', labels: ['epic'] },
      { id: 'T', title: 'depends on its own epic', status: 'pending', type: 'task', parent: 'E', deps: ['E'] },
    ]).errors.some(e => /cycle/.test(e)))
  })

  it('a 3-node alternating ring is caught too (X deps Y; Y contains Z; Z deps X)', () => {
    assert.ok(lint([
      { id: 'X', title: 'x', status: 'pending', type: 'task', deps: ['Y'] },
      { id: 'Y', title: 'y', status: 'pending', type: 'task' },
      { id: 'Z', title: 'z', status: 'pending', type: 'task', parent: 'Y', deps: ['X'] },
    ]).errors.some(e => /cycle/.test(e)))
  })

  it('a LEGITIMATE deep parent chain is NOT a cycle (guards against over-rejecting)', () => {
    assert.equal(lint([
      { id: 'GP', title: 'grandparent', status: 'pending', type: 'task' },
      { id: 'P', title: 'parent', status: 'pending', type: 'task', parent: 'GP' },
      { id: 'C', title: 'child', status: 'pending', type: 'task', parent: 'P' },
    ]).errors.length, 0)
  })

  it('a self-parent still errors (the one-element case)', () => {
    assert.ok(lint([{ id: 'S', title: 's', status: 'pending', type: 'task', parent: 'S' }]).errors.some(e => /itself/.test(e)))
  })
})
