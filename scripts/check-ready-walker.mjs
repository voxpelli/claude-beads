/**
 * Unit tests for ready-walker.mjs (computeReady / computeStats).
 *
 * Pure functions tested with inline task arrays — no file IO. Mirrors the
 * scripts/check-validator.mjs idiom (assert + pass/fail counters).
 */

import { computeReady, computeStats, nsId } from './ready-walker.mjs'

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

console.log('computeReady')

assert(
  'pending with no deps is ready',
  computeReady([{ id: 'T-1', status: 'pending' }]).ready.length === 1
)

assert(
  'pending whose only dep is completed is ready',
  computeReady([
    { id: 'T-1', status: 'completed' },
    { id: 'T-2', status: 'pending', deps: ['T-1'] },
  ]).ready.some(t => t.id === 'T-2')
)

{
  const r = computeReady([
    { id: 'T-1', status: 'pending' },
    { id: 'T-2', status: 'pending', deps: ['T-1'] },
  ])
  assert('pending dep blocks (T-2 blocked, not ready)', r.blocked.some(t => t.id === 'T-2') && !r.ready.some(t => t.id === 'T-2'))
  assert('blocked task records its blocker id', r.blocked.find(t => t.id === 'T-2')?.blockers.includes('T-1') === true)
}

assert(
  'in_progress dep blocks',
  computeReady([
    { id: 'T-1', status: 'in_progress' },
    { id: 'T-2', status: 'pending', deps: ['T-1'] },
  ]).blocked.some(t => t.id === 'T-2')
)

assert(
  'failed dep → needs attention, not ready/blocked',
  (() => {
    const r = computeReady([
      { id: 'T-1', status: 'failed' },
      { id: 'T-2', status: 'pending', deps: ['T-1'] },
    ])
    return r.needsAttention.some(t => t.id === 'T-2') && !r.ready.length && !r.blocked.length
  })()
)

assert(
  'missing dep → needs attention',
  computeReady([{ id: 'T-2', status: 'pending', deps: ['T-99'] }]).needsAttention.some(t => t.reason.includes('missing'))
)

assert(
  'in_progress task is not ready (only pending is)',
  computeReady([{ id: 'T-1', status: 'in_progress' }]).ready.length === 0
)

assert(
  'ready is sorted by priority (critical before low)',
  (() => {
    const r = computeReady([
      { id: 'T-low', status: 'pending', priority: 'low' },
      { id: 'T-crit', status: 'pending', priority: 'critical' },
    ])
    return r.ready[0].id === 'T-crit'
  })()
)

console.log('computeStats')

{
  const tasks = [
    { id: 'T-1', status: 'completed', type: 'task', priority: 'high' },
    { id: 'T-2', status: 'pending', type: 'bug', priority: 'medium' },
    { id: 'T-3', status: 'pending', type: 'task', priority: 'low', deps: ['T-2'] },
    { id: 'T-4', status: 'in_progress', type: 'feature', priority: 'high', updated: '2026-01-01' },
  ]
  const s = computeStats(tasks, 30, new Date('2026-06-09T00:00:00Z'))
  assert('stats total counts all tasks', s.total === 4)
  assert('stats byStatus tallies', s.byStatus.pending === 2 && s.byStatus.completed === 1 && s.byStatus.in_progress === 1)
  assert('stats ready counts only unblocked pending', s.ready === 1) // T-2 ready, T-3 blocked by T-2
  assert('stats blocked counts blocked pending', s.blocked === 1)
  assert('stats flags an old in_progress task as stale', s.stale.includes('T-4'))
  assert('stats does not flag a recent task as stale', !computeStats(tasks, 30, new Date('2026-01-15T00:00:00Z')).stale.includes('T-4'))
}

console.log('computeStats — robustness')

{
  const s = computeStats([{ id: 'T-x', status: 'in_progress', updated: 'yesterday' }], 30, new Date('2026-06-09T00:00:00Z'))
  assert('a malformed updated date lands in malformedDates, not stale', s.malformedDates.includes('T-x') && !s.stale.includes('T-x'))
}
{
  const s = computeStats([{ id: 'T-x', status: 'toString', type: 'task', priority: 'medium' }], 30, new Date('2026-06-09T00:00:00Z'))
  assert('a prototype-name status does not pollute byStatus', !('toString' in s.byStatus))
}

console.log('nsId')

assert('nsId namespaces a bare id', nsId('T-1', 'alpha') === 'alpha/T-1')
assert('nsId passes through a slug-qualified id', nsId('beta/T-2', 'alpha') === 'beta/T-2')
assert('nsId stringifies a numeric id', nsId(1, 'alpha') === 'alpha/1')

console.log('computeReady — cross-file & self-cycle')

assert('a cross-file (slug/id) dep on a completed task is ready', computeReady([
  { id: 'a/T-1', status: 'completed' },
  { id: 'b/T-2', status: 'pending', deps: ['a/T-1'] },
]).ready.some(t => t.id === 'b/T-2'))
assert('a self-dependent task is blocked, not ready (no infinite loop)', (() => {
  const r = computeReady([{ id: 'a/T-1', status: 'pending', deps: ['a/T-1'] }])
  return r.blocked.some(t => t.id === 'a/T-1') && !r.ready.length
})())

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
