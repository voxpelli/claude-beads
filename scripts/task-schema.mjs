/**
 * task-schema.mjs — the single canonical schema for the flat-YAML task substrate.
 *
 * THIS IS THE AUTHORITY. `ready-walker.mjs`, `validate-tasks.mjs`, the
 * eventual `migrate-from-bd.mjs`, the skills, and any `SPEC.md` derive their
 * vocabulary from here — never fork it. The enum Sets carry the runtime
 * vocabulary; the matching `@typedef` unions carry the (advisory, JSDoc-only —
 * no tsc is wired) type-level vocabulary.
 *
 * A `backlog/tasks/tasks-<slug>.yml` file is:
 *
 *   tasks:                    # top-level: a list (required)
 *     - id: T-1               # unique within the file; namespaced to slug/id on load
 *       title: ...            # required
 *       status: pending       # required; one of VALID_STATUSES
 *       type: task            # required; one of VALID_TYPES (the 9 beads types)
 *       priority: medium      # optional; one of VALID_PRIORITIES (default medium)
 *       parent: T-0           # optional; an id in the same or another (slug/id) file
 *       deps: [T-0]           # optional LIST; bare ids resolve to slug/id, `slug/id` pass through
 *       acceptance_criteria:  # optional LIST; the test-ratchet checks it on completed work
 *         - ...
 *       agent: loop-1         # optional; set when claimed (status in_progress)
 *       updated: "2026-06-10" # optional; ISO date — staleness is computed from it
 *
 * Ready rule (the only computation that gates work): a task is READY iff
 * `status === 'pending'` and every dep is `completed`. Only `deps` (the `blocks`
 * analog) affects readiness; transitivity is emergent via the status invariant
 * (a task can't be `completed` until it was itself ready), not a graph walk.
 *
 * Atomic-write contract (load-bearing invariant): the substrate assumes a SOLO,
 * SINGLE-HOST developer with NO concurrent writers to the same `tasks-<slug>.yml`.
 * swarm-wave's file-disjoint + single-owner-per-issue partitioning is what
 * upholds it (two agents never own the same slug file in one wave). Skills mutate
 * tasks with the ordinary Edit/Write tools — there is deliberately no CRUD helper
 * (substrate-not-opinion). If that invariant is ever violated (multi-writer), the
 * upgrade is write-then-rename, not a lock daemon.
 */

/** @typedef {'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled'} Status */
/** @typedef {'task' | 'bug' | 'feature' | 'chore' | 'epic' | 'decision' | 'spike' | 'story' | 'milestone'} TaskType */
/** @typedef {'critical' | 'high' | 'medium' | 'low' | 'backlog'} Priority */

/** @type {Set<Status>} */
export const VALID_STATUSES = new Set(['pending', 'in_progress', 'completed', 'failed', 'cancelled'])

/** @type {Set<TaskType>} */
export const VALID_TYPES = new Set(['task', 'bug', 'feature', 'chore', 'epic', 'decision', 'spike', 'story', 'milestone'])

/** @type {Set<Priority>} */
export const VALID_PRIORITIES = new Set(['critical', 'high', 'medium', 'low', 'backlog'])

/** Priority sort order for the ready queue (lower = more urgent). */
export const PRIORITY_RANK = { critical: 0, high: 1, medium: 2, low: 3, backlog: 4 }

/** Allowed shape of a task `id` (letters/digits then word chars, `.`, `-`). */
export const ID_RE = /^[A-Z0-9][\w.-]*$/i

/** Always-required fields on every task entry. */
export const REQUIRED_FIELDS = ['id', 'title', 'status', 'type']

/**
 * Types whose completion should carry stated acceptance criteria (the
 * test-ratchet). A completed task of one of these with an empty
 * `acceptance_criteria` warns — "state done-ness before marking done".
 */
export const RATCHET_TYPES = new Set(['task', 'bug', 'feature', 'story'])

/**
 * Nullish check (a missing YAML key → `undefined`; an explicit `key: null` → `null`).
 *
 * @param {unknown} v
 * @returns {boolean}
 */
export const isNil = (v) => v === undefined || v === null
