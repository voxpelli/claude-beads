/**
 * Unit tests for ready-walker.mjs (computeReady / computeStats).
 *
 * Pure functions tested with inline task arrays — no file IO. Mirrors the
 * scripts/check-validator.mjs idiom (assert + pass/fail counters).
 */

import { computeReady, computeStats, nsId } from 'diarie'

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
  computeReady([{ id: 'T-1', status: 'pending', type: 'task' }]).ready.length === 1
)

assert(
  'pending whose only dep is completed is ready',
  computeReady([
    { id: 'T-1', status: 'completed', type: 'task' },
    { id: 'T-2', status: 'pending', type: 'task', deps: ['T-1'] },
  ]).ready.some(t => t.id === 'T-2')
)

{
  const r = computeReady([
    { id: 'T-1', status: 'pending', type: 'task' },
    { id: 'T-2', status: 'pending', type: 'task', deps: ['T-1'] },
  ])
  assert('pending dep blocks (T-2 blocked, not ready)', r.blocked.some(t => t.id === 'T-2') && !r.ready.some(t => t.id === 'T-2'))
  assert('blocked task records its blocker id', r.blocked.find(t => t.id === 'T-2')?.blockers.includes('T-1') === true)
}

assert(
  'in_progress dep blocks',
  computeReady([
    { id: 'T-1', status: 'in_progress', type: 'task' },
    { id: 'T-2', status: 'pending', type: 'task', deps: ['T-1'] },
  ]).blocked.some(t => t.id === 'T-2')
)

assert(
  'failed dep → needs attention, not ready/blocked',
  (() => {
    const r = computeReady([
      { id: 'T-1', status: 'failed', type: 'task' },
      { id: 'T-2', status: 'pending', type: 'task', deps: ['T-1'] },
    ])
    return r.needsAttention.some(t => t.id === 'T-2') && !r.ready.length && !r.blocked.length
  })()
)

assert(
  'deferred dep → needs attention, not ready/blocked (deferred never resolves a dep)',
  (() => {
    const r = computeReady([
      { id: 'T-1', status: 'deferred', type: 'task' },
      { id: 'T-2', status: 'pending', type: 'task', deps: ['T-1'] },
    ])
    return r.needsAttention.some(t => t.id === 'T-2' && t.reason.includes('deferred')) && !r.ready.length && !r.blocked.length
  })()
)

assert(
  'a deferred task is never ready (only pending is)',
  computeReady([{ id: 'T-1', status: 'deferred', type: 'task' }]).ready.length === 0
)

assert(
  'missing dep → needs attention',
  computeReady([{ id: 'T-2', status: 'pending', type: 'task', deps: ['T-99'] }]).needsAttention.some(t => t.reason.includes('missing'))
)

assert(
  'in_progress task is not ready (only pending is)',
  computeReady([{ id: 'T-1', status: 'in_progress', type: 'task' }]).ready.length === 0
)

assert(
  'ready is sorted by priority (critical before low)',
  (() => {
    const r = computeReady([
      { id: 'T-low', status: 'pending', type: 'task', priority: 'low' },
      { id: 'T-crit', status: 'pending', type: 'task', priority: 'critical' },
    ])
    return r.ready[0].id === 'T-crit'
  })()
)

console.log('computeReady — type gate (decision vp-beads-etm)')

assert(
  'a pending doc is never ready',
  computeReady([{ id: 'D-1', status: 'pending', type: 'doc' }]).ready.length === 0
)
assert(
  'a pending decision is never ready',
  computeReady([{ id: 'DEC-1', status: 'pending', type: 'decision' }]).ready.length === 0
)
assert(
  'a pending milestone is never ready',
  computeReady([{ id: 'M-1', status: 'pending', type: 'milestone' }]).ready.length === 0
)
assert(
  'a pending doc is never blocked or needs-attention either — it is simply excluded',
  (() => {
    const r = computeReady([{ id: 'D-1', status: 'pending', type: 'doc', deps: ['T-99'] }])
    return r.ready.length === 0 && r.blocked.length === 0 && r.needsAttention.length === 0
  })()
)
assert(
  'a pending task is unaffected by sibling non-task items in the same list',
  (() => {
    const r = computeReady([
      { id: 'T-1', status: 'pending', type: 'task' },
      { id: 'D-1', status: 'pending', type: 'doc' },
      { id: 'M-1', status: 'pending', type: 'milestone' },
    ])
    return r.ready.length === 1 && r.ready[0].id === 'T-1'
  })()
)

console.log('computeReady — containers (vp-beads-epc)')

// These cover the RULE. They cannot cover the bug that made the rule necessary: the
// half-globalized `parent` in loadTasks. Inline arrays let the author write `id` and
// `parent` in one consistent id-space by hand — exactly the coherence the real loader was
// failing to provide. So every assertion below WOULD STAY GREEN against a tracker that
// still hands out a raw `parent` and therefore still offers every epic as work. Verified
// by mutation, not assumed. The regression guard lives in check-tasks-smoke.mjs, which
// goes through loadTasks and a real store on disk. Do not move it here.

assert(
  'a parent with an OPEN child is not ready — it is blocked BY that child',
  (() => {
    const r = computeReady([
      { id: 'P', status: 'pending', type: 'task' },
      { id: 'C', status: 'pending', type: 'task', parent: 'P' },
    ])
    return !r.ready.some(t => t.id === 'P') &&
      r.blocked.find(t => t.id === 'P')?.children?.includes('C') === true
  })()
)

assert(
  'the CHILD stays ready (you work the children, not the container)',
  computeReady([
    { id: 'P', status: 'pending', type: 'task' },
    { id: 'C', status: 'pending', type: 'task', parent: 'P' },
  ]).ready.some(t => t.id === 'C')
)

assert(
  'children go in `children`, never in `blockers` (a dep must FINISH FIRST; a child is CONTAINED)',
  (() => {
    const p = computeReady([
      { id: 'P', status: 'pending', type: 'task' },
      { id: 'C', status: 'pending', type: 'task', parent: 'P' },
    ]).blocked.find(t => t.id === 'P')
    return p?.blockers.length === 0 && p?.children?.length === 1
  })()
)

assert(
  'a parent whose children are ALL completed is ready again (only OPEN children contain work)',
  computeReady([
    { id: 'P', status: 'pending', type: 'task' },
    { id: 'C', status: 'completed', type: 'task', parent: 'P' },
  ]).ready.some(t => t.id === 'P')
)

// The DECLARATIVE predicate, isolated from the structural one. In the live store these
// two always co-occur (vp-beads-l9i is epic-labelled AND has open children), so a fix
// that never implements this check would still look correct there.
assert(
  'an `epic`-labelled task with NO children is never ready — it needs attention',
  (() => {
    const r = computeReady([{ id: 'E', status: 'pending', type: 'task', labels: ['epic'] }])
    return r.ready.length === 0 && /no open children/.test(r.needsAttention[0]?.reason ?? '')
  })()
)

assert(
  'an `epic`-labelled task whose children are all completed still is not ready (close it, do not work it)',
  (() => {
    const r = computeReady([
      { id: 'E', status: 'pending', type: 'task', labels: ['epic'] },
      { id: 'C', status: 'completed', type: 'task', parent: 'E' },
    ])
    return !r.ready.some(t => t.id === 'E') && r.needsAttention.some(t => t.id === 'E')
  })()
)

assert(
  'an in_progress child still counts as OPEN (a claimed child is not a finished one)',
  computeReady([
    { id: 'P', status: 'pending', type: 'task' },
    { id: 'C', status: 'in_progress', type: 'task', parent: 'P' },
  ]).blocked.some(t => t.id === 'P')
)

assert(
  'a task can be blocked by deps AND by children at once, reported separately',
  (() => {
    const p = computeReady([
      { id: 'D', status: 'pending', type: 'task' },
      { id: 'P', status: 'pending', type: 'task', deps: ['D'] },
      { id: 'C', status: 'pending', type: 'task', parent: 'P' },
    ]).blocked.find(t => t.id === 'P')
    return p?.blockers.includes('D') === true && p?.children?.includes('C') === true
  })()
)

assert(
  'a CANCELLED child does not entomb its parent in `blocked` — it needs a human, like a cancelled DEP',
  (() => {
    const r = computeReady([
      { id: 'P', status: 'pending', type: 'task' },
      { id: 'C', status: 'cancelled', type: 'task', parent: 'P' },
    ])
    // The bug this pins: "open child" was once `status !== 'completed'`, which swept the
    // terminal statuses into ACTIVE and left the parent blocked forever, by a dead child,
    // in the bucket nobody reads. A cancelled DEP had always routed to needsAttention.
    return !r.blocked.some(t => t.id === 'P') && r.needsAttention.some(t => t.id === 'P' && /cancelled/.test(t.reason))
  })()
)

assert(
  'a MILESTONE child never blocks its parent (it is never worked, so it never completes)',
  (() => {
    const r = computeReady([
      { id: 'P', status: 'pending', type: 'task' },
      { id: 'M', status: 'pending', type: 'milestone', parent: 'P' },
    ])
    // A milestone lives in tasks-*.yml (unlike a decision), has "no effort, no assignment",
    // and therefore never reaches `completed`. Counting it as an open child would have held
    // its parent hostage forever.
    return r.ready.some(t => t.id === 'P')
  })()
)

assert(
  'a DANGLING parent surfaces the child (the tripwire for an id-space divergence)',
  (() => {
    const r = computeReady([{ id: 'C', status: 'pending', type: 'task', parent: 'NOPE' }])
    // If `id` and `parent` ever fall into different id-spaces again, EVERY parent dangles
    // and every row lands here at once — instead of every epic silently becoming workable.
    return !r.ready.some(t => t.id === 'C') && r.needsAttention.some(t => /parent NOPE \(missing\)/.test(t.reason))
  })()
)

console.log('computeStats')

{
  const tasks = [
    { id: 'T-1', status: 'completed', type: 'task', priority: 'high' },
    { id: 'T-2', status: 'pending', type: 'task', labels: ['bug'], priority: 'medium' },
    { id: 'T-3', status: 'pending', type: 'task', priority: 'low', deps: ['T-2'] },
    { id: 'T-4', status: 'in_progress', type: 'task', labels: ['feature'], priority: 'high', updated: '2026-01-01' },
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
  { id: 'a/T-1', status: 'completed', type: 'task' },
  { id: 'b/T-2', status: 'pending', type: 'task', deps: ['a/T-1'] },
]).ready.some(t => t.id === 'b/T-2'))
assert('a self-dependent task is blocked, not ready (no infinite loop)', (() => {
  const r = computeReady([{ id: 'a/T-1', status: 'pending', type: 'task', deps: ['a/T-1'] }])
  return r.blocked.some(t => t.id === 'a/T-1') && !r.ready.length
})())

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
