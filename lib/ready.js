/**
 * ready.js — the ready/blocked partition and summary stats.
 *
 * Pure computation over a loaded task list. Finding and loading the store is
 * `store.js`'s job; this file never touches the filesystem except in the
 * temporary CLI entry at the bottom.
 *
 * Ready rule: a task is READY iff it is `type: task`, `status: pending`, has no open
 * dependency, AND is not a container (no open children, no `epic` label). BLOCKED if a
 * dep or a child is still pending/in_progress. NEEDS_ATTENTION if a dep or child is
 * failed/cancelled/deferred/missing, if a `parent:` dangles, or if an `epic` has nothing
 * open left inside it. Non-task types (`doc`/`decision`/`milestone`) are records or
 * markers, never work — they never appear in any partition, and never block one.
 * (The graph is recomputed, never enforced — see validate.js for the integrity gate.)
 */

import {
  PRIORITY_RANK, VALID_PRIORITIES, VALID_STATUSES, VALID_TYPES,
} from './schema.js'

/** @typedef {import('./store.js').Task} Task */

/**
 * Build a zero-filled tally keyed by a set of allowed values. Null-prototype, so a junk
 * key like `toString` reads back `undefined` instead of climbing to Object.prototype and
 * returning a function — see `bump()`, which relies on exactly that.
 *
 * @param {Set<string>} keys
 * @returns {Record<string, number>}
 */
const tally = (keys) => {
  /** @type {Record<string, number>} */
  const o = Object.create(null)
  for (const k of keys) o[k] = 0
  return o
}

/**
 * Increment a tally slot, but only one that the tally already declared.
 *
 * The lookup IS the guard: a `tally()` object is null-prototype, so an unexpected key
 * — `toString`, or a status the schema has never heard of — reads back `undefined`
 * rather than climbing to `Object.prototype` and returning a function. An undeclared
 * key is therefore left uncounted instead of being invented, which is the behaviour we
 * want for malformed input: untallied, never misclassified.
 *
 * @param {Record<string, number>} counts
 * @param {string} [key]
 * @returns {void}
 */
const bump = (counts, key) => {
  if (key === undefined) return
  const n = counts[key]
  if (n !== undefined) counts[key] = n + 1
}

/**
 * Index a parent's WORKABLE children by parent id, split exactly the way deps are.
 *
 * The child taxonomy deliberately MIRRORS the dep taxonomy below — same three buckets,
 * same statuses — because a container and a prerequisite fail in the same ways and a
 * reader should not have to learn two vocabularies:
 *
 *   pending / in_progress          -> ACTIVE   : real remaining work; the parent is blocked
 *   completed                      -> done     : contains nothing; ignore
 *   failed / cancelled / deferred  -> STALLED  : needs a human, not a blocker
 *
 * The first cut got this wrong in a way worth recording. "Open child" was defined as
 * `status !== 'completed'` — the acceptance criterion's own words — which quietly swept
 * the terminal statuses into ACTIVE. A parent whose only child was `cancelled` then sat
 * in `blocked` forever, unworkable, with nothing to point at and no way out: the very
 * "offered nothing, said nothing" failure this module exists to prevent, reintroduced by
 * the fix for it. Deps had always got this right; the children just had to be told.
 *
 * Only `type: task` children count. `decision` records are safe by construction (they
 * live in `.diarie/decisions/`, outside `loadTasks`'s glob) — but `milestone` is NOT:
 * it lives in `tasks-*.yml`, it has "no effort, no assignment", so it is never worked and
 * therefore never `completed`. A milestone filed under an epic would have blocked it
 * until the heat death of the repository.
 *
 * @param {Task[]} tasks
 * @returns {Map<string, { active: string[], stalled: string[] }>}
 */
function childrenByParent (tasks) {
  /** @type {Map<string, { active: string[], stalled: string[] }>} */
  const kids = new Map()
  for (const t of tasks) {
    if (!t.parent || t.type !== 'task') continue
    if (t.status === 'completed') continue
    let entry = kids.get(t.parent)
    if (!entry) { entry = { active: [], stalled: [] }; kids.set(t.parent, entry) }
    if (t.status === 'pending' || t.status === 'in_progress') entry.active.push(t.id)
    else entry.stalled.push(`${t.id} (${t.status})`)
  }
  return kids
}

/**
 * Compute ready / blocked / needs-attention partitions over a flat task list.
 *
 * A CONTAINER is never ready — you work its children, not the container. Two
 * predicates, and they are independent on purpose:
 *
 *   structural  — has at least one open child        → blocked, by those children
 *   declarative — carries the `epic` label           → never workable, children or not
 *
 * bd had an `epic` TYPE, so its ready-walk excluded containers structurally. This schema
 * collapsed epic to `task` + `parent:` (the better model — see the type model in
 * `./schema.js`), which left `computeReady` gating on type alone. The result was a real
 * bug: an epic container, having no dependencies of its own and being `type: task` like
 * anything else, sailed through every check and was offered as the single next thing to
 * work on — while the children that held the actual work stayed invisible behind it.
 * Collapsing the type is what removed the structural exclusion; these two predicates are
 * what put it back.
 *
 * `blockers` and `children` are separate fields because they mean different things:
 * a dep must FINISH FIRST, a child is CONTAINED. Collapsing them into one array would
 * make "blocked by" ambiguous exactly where it needs to be precise.
 *
 * @param {Task[]} tasks
 * @returns {{ ready: Task[], blocked: Array<Task & { blockers: string[], children?: string[], attention?: string[] }>, needsAttention: Array<Task & { reason: string }> }}
 */
export function computeReady (tasks) {
  const byId = new Map(tasks.map(t => [t.id, t]))
  const kids = childrenByParent(tasks)
  /** @type {Task[]} */
  const ready = []
  /** @type {Array<Task & { blockers: string[], children?: string[], attention?: string[] }>} */
  const blocked = []
  /** @type {Array<Task & { reason: string }>} */
  const needsAttention = []

  for (const task of tasks) {
    if (task.status !== 'pending') continue

    // A row with NO valid type is MALFORMED, not merely non-workable, and the difference
    // matters. `type` is required (schema.js REQUIRED_FIELDS), so `undefined` here means the
    // YAML said nothing or said something the schema does not know — and the loader has
    // already dropped it. Excluding it *silently*, the way we exclude a legitimate
    // `doc`/`decision`/`milestone`, makes it vanish from every partition while still counting
    // toward `total`: present in the sum, absent from every answer. Worse, its parent then
    // sees no open child and gets told to close an epic whose work has not started.
    //
    // So: surface it. A `type: bug` typo (a bd fossil — framings live in `labels` now) is an
    // ordinary slip, and the tracker must say so rather than quietly rewrite the backlog.
    if (task.type === undefined) {
      needsAttention.push({ ...task, reason: 'missing or invalid `type` — it belongs in no partition (run `diarie validate`)' })
      continue
    }

    // Only `task`-type items are workable — `doc`/`decision`/`milestone` are records or
    // markers (a milestone has "no effort, no assignment"). These ARE excluded silently, and
    // correctly: they are well-formed things that simply are not work.
    if (task.type !== 'task') continue

    /** @type {string[]} */ const active = [] // deps still pending/in_progress → blocks
    /** @type {string[]} */ const stalled = [] // missing, or terminal-but-not-completed

    for (const depId of task.deps ?? []) {
      const dep = byId.get(depId)
      if (!dep) stalled.push(`${depId} (missing)`)
      else if (dep.status === 'completed') continue
      else if (dep.status === 'pending' || dep.status === 'in_progress') active.push(depId)
      else stalled.push(`${depId} (${dep.status})`)
    }

    // A `parent:` that resolves to nothing gets the same treatment as a dangling dep —
    // and it is the tripwire for this module's worst bug. Ids here are globalized
    // (`slug/id`) and `parent` is globalized by the same rule, in the same place. Should
    // those two ever drift apart again — as they did, silently, for the tracker's whole
    // life — then every parent stops matching every id, every epic finds zero children,
    // and every container quietly becomes workable again. No unit test can see that (it
    // writes both ids by hand, in one consistent space). This makes it scream instead:
    // one typo surfaces one row, an id-space divergence surfaces EVERY row at once.
    if (task.parent && !byId.has(task.parent)) stalled.push(`parent ${task.parent} (missing)`)

    // Children fold into the SAME two buckets as deps, deliberately. An abandoned child
    // is not a blocker — it is a question for a human, exactly as an abandoned dep is.
    const { active: kidsActive = [], stalled: kidsStalled = [] } = kids.get(task.id) ?? {}
    const isEpic = task.labels?.includes('epic') ?? false

    const attention = [...stalled, ...kidsStalled]

    if (active.length || kidsActive.length) {
      // `attention` rides ALONG on a blocked row — it is not an either/or. A row can be
      // waiting on a live dep AND carry a dangling parent or a cancelled dep at the same
      // time, and the old code dropped the second on the floor: one active blocker was
      // enough to erase every stalled one.
      //
      // That silently weakened the dangling-parent tripwire this module leans on. Its claim
      // is that an id-space divergence surfaces EVERY row at once — but a row with any live
      // dep would have been swallowed into `blocked` and said nothing. "Every row" has to
      // mean every row. A task can be blocked AND broken.
      blocked.push({
        ...task,
        blockers: active,
        ...(kidsActive.length ? { children: kidsActive } : {}),
        ...(attention.length ? { attention } : {}),
      })
    } else if (attention.length) {
      needsAttention.push({ ...task, reason: attention.join(', ') })
    } else if (isEpic) {
      // Labelled a container, but nothing left inside it: either the work is done and
      // the epic wants closing, or nobody ever filed its children. Both are real states
      // a human should see — silently dropping it would hide an empty epic forever.
      needsAttention.push({ ...task, reason: 'epic label, no open children — close it or add children' })
    } else {
      // A parent whose children are ALL completed is ready again on its own merits:
      // the container may still carry integration work. Only OPEN children block.
      ready.push(task)
    }
  }

  ready.sort((a, b) => (PRIORITY_RANK[a.priority ?? 'medium'] ?? 2) - (PRIORITY_RANK[b.priority ?? 'medium'] ?? 2))
  return { ready, blocked, needsAttention }
}

/**
 * Summary counts (the files-native `bd stats`).
 *
 * @param {Task[]} tasks
 * @param {number} [staleDays]
 * @param {Date} [now]
 * @returns {{ total: number, ready: number, blocked: number, stale: string[], malformedDates: string[], byStatus: Record<string, number>, byPriority: Record<string, number>, byType: Record<string, number> }}
 */
export function computeStats (tasks, staleDays = 30, now = new Date()) {
  const byStatus = tally(VALID_STATUSES)
  const byPriority = tally(VALID_PRIORITIES)
  const byType = tally(VALID_TYPES)
  /** @type {string[]} */ const stale = []
  /** @type {string[]} */ const malformedDates = []
  const cutoff = now.getTime() - staleDays * 86_400_000

  for (const t of tasks) {
    bump(byStatus, t.status)
    bump(byPriority, t.priority ?? 'medium')
    // No `?? 'task'` default — mirrors computeReady's deliberate non-assumption for
    // malformed (type-less) input: an untallied key is left alone, so a type-less item
    // is simply not counted, never misclassified.
    bump(byType, t.type)
    if (t.status === 'in_progress' && t.updated) {
      const u = Date.parse(t.updated)
      if (Number.isNaN(u)) malformedDates.push(t.id)
      else if (u < cutoff) stale.push(t.id)
    }
  }

  const { blocked, ready } = computeReady(tasks)
  return { total: tasks.length, ready: ready.length, blocked: blocked.length, stale, malformedDates, byStatus, byPriority, byType }
}

/**
 * Render one task as a human-readable line.
 *
 * @param {Task} t
 * @returns {string}
 */
export const line = (t) => `  ${t.id}  [${t.priority ?? 'medium'}] ${t.title ?? ''}`.trimEnd()

/**
 * Render one blocked task, saying WHY — which is the whole reason the view exists.
 *
 * A container and a dep-blocked task are both "blocked", but not for the same reason,
 * and the reader has to be able to tell: one is waiting on prerequisites, the other IS
 * the work its children are doing. A task can be both, so these are appended, not
 * branched.
 *
 * The third clause is the one that earns its keep: a blocked row can ALSO be broken,
 * and a live blocker must not be allowed to hide a dead one.
 *
 * @param {Task & { blockers: string[], children?: string[], attention?: string[] }} t
 * @returns {string}
 */
export function blockedLine (t) {
  const why = [
    ...(t.blockers.length ? [`← blocked by ${t.blockers.join(', ')}`] : []),
    ...(t.children?.length ? [`← contains ${t.children.length} open: ${t.children.join(', ')}`] : []),
    ...(t.attention?.length ? [`! also needs attention: ${t.attention.join(', ')}`] : []),
  ]
  return `${line(t)}  ${why.join('  ')}`
}

/**
 * Render one malformed task and the reason it cannot be worked.
 *
 * @param {Task & { reason: string }} t
 * @returns {string}
 */
export const attentionLine = (t) => `${line(t)}  ! needs attention: ${t.reason}`

/**
 * Render a tally object as `key=n` pairs, omitting zeros.
 *
 * @param {Record<string, number>} obj
 * @returns {string}
 */
const tallyRow = (obj) => Object.entries(obj).filter(([, n]) => n).map(([k, n]) => `${k}=${n}`).join(' ')

/**
 * @param {ReturnType<typeof computeStats>} s
 * @returns {string}
 */
export function formatStats (s) {
  const lines = [
    `total ${s.total}  ready ${s.ready}  blocked ${s.blocked}  stale ${s.stale.length}`,
    `status: ${tallyRow(s.byStatus)}`,
    `priority: ${tallyRow(s.byPriority)}`,
    `type: ${tallyRow(s.byType)}`,
  ]
  if (s.malformedDates.length) lines.push(`! malformed updated dates: ${s.malformedDates.join(' ')}`)
  return lines.join('\n') + '\n'
}
