/**
 * Unit tests for validate-tasks.mjs (lintTasks).
 *
 * Plants each violation class and asserts it is caught, plus clean cases that
 * must stay silent. Pure — inline data, no file IO. Mirrors
 * scripts/check-validator.mjs.
 */

import { lintTasks } from '../validate-tasks.mjs'

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
 * Build a valid task, overridable per-field.
 *
 * @param {Record<string, any>} [task]
 * @returns {Record<string, any>}
 */
const ok = (task) => ({ id: 'T-1', title: 'x', status: 'pending', type: 'task', ...task })

/**
 * Lint a single inline file of tasks.
 *
 * @param {any[]} tasks
 * @param {string} [name]
 * @returns {{ errors: string[], warnings: string[] }}
 */
const lint = (tasks, name = 'demo') => lintTasks([{ name, tasks }])

console.log('lintTasks — Pass 1 (structural)')

assert('a well-formed task file is clean', (() => {
  const r = lint([ok({ id: 'T-1' }), ok({ id: 'T-2', status: 'completed', acceptance_criteria: ['done'] })])
  return r.errors.length === 0 && r.warnings.length === 0
})())

assert('missing required field (status) errors', lint([{ id: 'T-1', title: 'x', type: 'task' }]).errors.some(e => /missing required field: status/.test(e)))
assert('invalid status enum errors', lint([ok({ status: 'doing' })]).errors.some(e => /invalid status/.test(e)))
assert('invalid type enum errors', lint([ok({ type: 'widget' })]).errors.some(e => /invalid type/.test(e)))
assert('invalid priority enum errors', lint([ok({ priority: 'urgent' })]).errors.some(e => /invalid priority/.test(e)))
assert('invalid id shape errors', lint([ok({ id: 'bad id!' })]).errors.some(e => /invalid id/.test(e)))
assert('duplicate id within file errors', lint([ok({ id: 'T-1' }), ok({ id: 'T-1' })]).errors.some(e => /duplicate id/.test(e)))

console.log('lintTasks — Pass 2 (dep graph)')

assert('dangling dep errors', lint([ok({ id: 'T-1', deps: ['T-99'] })]).errors.some(e => /dep "demo\/T-99" does not exist/.test(e)))
assert('orphan parent errors', lint([ok({ id: 'T-1', parent: 'T-99' })]).errors.some(e => /parent "demo\/T-99" does not exist/.test(e)))
assert('a real dep does not error', lint([ok({ id: 'T-1', status: 'completed', acceptance_criteria: ['x'] }), ok({ id: 'T-2', deps: ['T-1'] })]).errors.length === 0)

assert('a 2-cycle is detected', (() => {
  const r = lint([ok({ id: 'T-1', deps: ['T-2'] }), ok({ id: 'T-2', deps: ['T-1'] })])
  return r.errors.some(e => /cycle/.test(e))
})())

assert('cross-file dep (slug/id) resolves without dangling error', (() => {
  const r = lintTasks([
    { name: 'a', tasks: [ok({ id: 'T-1', status: 'completed', acceptance_criteria: ['x'] })] },
    { name: 'b', tasks: [ok({ id: 'T-1', deps: ['a/T-1'] })] },
  ])
  return !r.errors.some(e => /does not exist/.test(e))
})())

console.log('lintTasks — Pass 3 (transition sanity)')

assert('in_progress claimed before a pending blocker warns', (() => {
  const r = lint([ok({ id: 'T-1', status: 'pending' }), ok({ id: 'T-2', status: 'in_progress', deps: ['T-1'] })])
  return r.warnings.some(w => /claimed before blockers resolved/.test(w))
})())

assert('agent set on a pending task is a ghost-claim warning', lint([ok({ id: 'T-1', status: 'pending', agent: 'loop-1' })]).warnings.some(w => /ghost claim/.test(w)))

console.log('lintTasks — Pass 4 (test-ratchet)')

assert('completed task with no acceptance_criteria warns', lint([ok({ id: 'T-1', status: 'completed', type: 'task' })]).warnings.some(w => /no acceptance_criteria/.test(w)))
assert('completed task WITH acceptance_criteria is clean', lint([ok({ id: 'T-1', status: 'completed', type: 'task', acceptance_criteria: ['ok'] })]).warnings.length === 0)
assert('completed doc (non-ratchet type) needs no acceptance_criteria', lint([ok({ id: 'T-1', status: 'completed', type: 'doc' })]).warnings.length === 0)
assert('a former bd type (chore) is no longer a valid type', lint([ok({ type: 'chore' })]).errors.some(e => /invalid type "chore"/.test(e)))
assert('framings ride in labels, not type (task + bug label is clean)', lint([ok({ labels: ['bug'] })]).errors.length === 0)
assert('completed task with SCALAR acceptance_criteria still warns (not a list)', lint([ok({ id: 'T-1', status: 'completed', type: 'task', acceptance_criteria: 'done' })]).warnings.some(w => /no acceptance_criteria/.test(w)))

console.log('lintTasks — Pass 0 (shape guard)')

assert('deps as a scalar string errors (not char-split)', lint([ok({ id: 'T-1', deps: 'T-2' })]).errors.some(e => /"deps" must be a list/.test(e)))
assert('acceptance_criteria as a scalar string errors', lint([ok({ id: 'T-1', acceptance_criteria: 'done' })]).errors.some(e => /"acceptance_criteria" must be a list/.test(e)))
assert('top-level tasks as a non-array errors cleanly', lintTasks([{ name: 'demo', tasks: 'oops' }]).errors.some(e => /"tasks" must be a list/.test(e)))
assert('a non-mapping task entry errors', lintTasks([{ name: 'demo', tasks: ['oops'] }]).errors.some(e => /is not a mapping/.test(e)))
assert('labels as a scalar string errors', lint([ok({ labels: 'bug' })]).errors.some(e => /"labels" must be a list/.test(e)))
assert('a non-string labels entry errors', lint([ok({ labels: ['bug', 7] })]).errors.some(e => /"labels" entries must all be strings/.test(e)))
assert('a scalar deps does not crash and skips graph use', (() => { lint([ok({ id: 'T-1', deps: 'T-2' })]); return true })())

console.log('lintTasks — Pass 2 (cycle exhaustiveness + hints)')

assert('two disjoint 2-cycles each produce a distinct cycle error', (() => {
  const r = lint([
    ok({ id: 'T-1', deps: ['T-2'] }), ok({ id: 'T-2', deps: ['T-1'] }),
    ok({ id: 'T-3', deps: ['T-4'] }), ok({ id: 'T-4', deps: ['T-3'] }),
  ])
  const cycles = r.errors.filter(e => /cycle/.test(e))
  return cycles.length === 2 && cycles.some(e => /T-1|T-2/.test(e)) && cycles.some(e => /T-3|T-4/.test(e))
})())
assert('a self-loop is detected as a cycle', lint([ok({ id: 'T-1', deps: ['T-1'] })]).errors.some(e => /cycle/.test(e)))
assert('a dangling bare dep matching another slug suggests it', (() => {
  const r = lintTasks([
    { name: 'a', tasks: [ok({ id: 'T-1', status: 'completed', acceptance_criteria: ['x'] })] },
    { name: 'b', tasks: [ok({ id: 'T-2', deps: ['T-1'] })] }, // bare 'T-1' → 'b/T-1' (dangling)
  ])
  return r.errors.some(e => /did you mean a\/T-1/.test(e))
})())

console.log('lintTasks — Pass 1 (updated date)')

assert('malformed updated date errors', lint([ok({ id: 'T-1', updated: 'yesterday' })]).errors.some(e => /invalid updated/.test(e)))
assert('valid ISO updated date is clean', lint([ok({ id: 'T-1', updated: '2026-01-01' })]).errors.length === 0)

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
