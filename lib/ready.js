/**
 * ready.js — the ready/blocked partition and summary stats.
 *
 * Pure computation over a loaded task list. Finding and loading the store is
 * `store.js`'s job; this file never touches the filesystem except in the
 * temporary CLI entry at the bottom.
 *
 * Ready rule: a task is READY iff `type: task`, `status: pending`, and every dep
 * is `completed`; BLOCKED if any dep is pending/in_progress; NEEDS_ATTENTION if a
 * dep is failed/cancelled/deferred/missing. Non-task types (`doc`/`decision`/
 * `milestone`) are records or markers, never work — they never appear in any
 * partition. (Only the analog of bd's `blocks` affects readiness; the graph is
 * recomputed, never enforced — see validate.js for the integrity gate.)
 */

import {
  PRIORITY_RANK, VALID_PRIORITIES, VALID_STATUSES, VALID_TYPES,
} from './schema.js'

/** @typedef {import('./store.js').Task} Task */

/**
 * Build a zero-filled tally keyed by a set of allowed values. Uses a
 * null-prototype object so a junk key like `toString` can't reach the prototype
 * chain via the `in` operator.
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
 * Index open children by parent id.
 *
 * An OPEN child is any child whose status is not `completed` — the wording is the
 * acceptance criterion's, deliberately, rather than a re-derivation of it.
 *
 * Only tasks in `tasks-*.yml` are candidates, because that is all `loadTasks` globs.
 * That is load-bearing: `decision` records live in `.diarie/decisions/` and stay
 * `pending` forever by design, so a decision filed under an epic (as `vp-beads-etm`
 * is) can never hold its parent hostage.
 *
 * @param {Task[]} tasks
 * @returns {Map<string, string[]>}
 */
function openChildrenByParent (tasks) {
  /** @type {Map<string, string[]>} */
  const kids = new Map()
  for (const t of tasks) {
    if (!t.parent || t.status === 'completed') continue
    const list = kids.get(t.parent)
    if (list) list.push(t.id)
    else kids.set(t.parent, [t.id])
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
 * bd had an `epic` TYPE, so its ready-walk excluded containers structurally. We
 * collapsed epic to `task` + `parent:` (the better model — see CLAUDE.md `### Issue
 * types`), which left `computeReady` gating on type alone and happily offering the
 * migration epic as the next thing to work on. That was `vp-beads-epc`.
 *
 * `blockers` and `children` are separate fields because they mean different things:
 * a dep must FINISH FIRST, a child is CONTAINED. Collapsing them into one array would
 * make "blocked by" ambiguous exactly where it needs to be precise.
 *
 * @param {Task[]} tasks
 * @returns {{ ready: Task[], blocked: Array<Task & { blockers: string[], children?: string[] }>, needsAttention: Array<Task & { reason: string }> }}
 */
export function computeReady (tasks) {
  const byId = new Map(tasks.map(t => [t.id, t]))
  const openKids = openChildrenByParent(tasks)
  /** @type {Task[]} */
  const ready = []
  /** @type {Array<Task & { blockers: string[], children?: string[] }>} */
  const blocked = []
  /** @type {Array<Task & { reason: string }>} */
  const needsAttention = []

  for (const task of tasks) {
    if (task.status !== 'pending') continue
    // Only `task`-type items are workable — `doc`/`decision`/`milestone` are
    // records or markers (a milestone has "no effort, no assignment"). `type` is
    // required (schema.js REQUIRED_FIELDS); an absent value here means malformed
    // input — treat it defensively as ineligible rather than assuming `task`.
    // validate.js is the authority on shape; this is a second line of defense.
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

    const children = openKids.get(task.id) ?? []
    const isEpic = task.labels?.includes('epic') ?? false

    if (active.length || children.length) {
      blocked.push({ ...task, blockers: active, ...(children.length ? { children } : {}) })
    } else if (stalled.length) {
      needsAttention.push({ ...task, reason: stalled.join(', ') })
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
    // `in` is safe here: tally() objects are null-prototype, so a junk value like
    // `toString` cannot reach Object.prototype.
    if (t.status in byStatus) byStatus[t.status]++
    const p = t.priority ?? 'medium'
    if (p in byPriority) byPriority[p]++
    // No `?? 'task'` default — mirrors computeReady's deliberate non-assumption
    // for malformed (type-less) input: `undefined in byType` is false, so a
    // type-less item is simply untallied, not misclassified.
    const ty = t.type
    if (ty && ty in byType) byType[ty]++
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
