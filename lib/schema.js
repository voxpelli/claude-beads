/**
 * schema.js — the single canonical schema for the flat-YAML task substrate.
 *
 * THIS IS THE AUTHORITY. `ready.js`, `validate.js`, `store.js`, the migrator, the skills,
 * and any `SPEC.md` derive their vocabulary from here — never fork it. The enum Sets carry
 * the runtime vocabulary; the matching `@typedef` unions carry the type-level vocabulary,
 * checked by `npm run check:tsc`.
 *
 * A `.diarie/tasks/tasks-<slug>.yml` file is:
 *
 *   tasks:                    # top-level: a list (required)
 *     - id: T-1               # unique within the file; namespaced to slug/id on load
 *       title: ...            # required
 *       status: pending       # required; one of VALID_STATUSES
 *       type: task            # required; one of VALID_TYPES (4 kinds — see below)
 *       priority: medium      # optional; one of VALID_PRIORITIES (default medium)
 *       labels: [bug]         # optional LIST of strings; framings live here, not in type
 *       parent: T-0           # optional; an id in the same or another (slug/id) file
 *       deps: [T-0]           # optional LIST; bare ids resolve to slug/id, `slug/id` pass through
 *       acceptance_criteria:  # optional LIST; the test-ratchet checks it on completed work
 *         - ...
 *       agent: loop-1         # optional; set when claimed (status in_progress)
 *       updated: "2026-06-10" # optional; ISO date — staleness is computed from it
 *       description: |        # optional; the free-text body (see note below)
 *         free-text body
 *
 * `description` is a RATIFIED optional field (2026-07-11). It was introduced by
 * the bd→YAML migration to preserve each issue's body losslessly, which reversed
 * the original no-body design (RETRO-15 had deflated "missing body" as by-design)
 * — so it was held for the user's decision, and the decision is KEEP. The evidence:
 * all 23 migrated tasks carry one, and they hold the *why* a title cannot (the
 * provenance — "deferred recommendation from the v0.17.0 post-review" — and the
 * scoping data — "~95 bare fences vs 37 tagged"). Dropping them would have moved
 * that context to an archive nobody reads while working.
 *
 * It stays OPTIONAL and free-text: a terse row is still a legitimate row, and the
 * ready-walk ignores this field entirely (it is prose for humans, never a
 * computation input). If a future unknown-field warning is added to validate-tasks,
 * it must allowlist `description` or every migrated task will flag at once.
 *
 * Type model (decision vp-beads-etm, 2026-06-10): 4 exclusive kinds — `task`
 * (work), `doc` (reference), `decision` (record), `milestone` (marker). bd's
 * other five types (`bug` / `feature` / `chore` / `story` / `spike`) are
 * FRAMINGS of `task`, carried in `labels:`; `epic` is `task` + `parent:`
 * nesting (or an `epic` label). The enum stays exclusive (exactly one type per
 * item — the property labels can't give); the framings stay additive. Spike's
 * "closes with findings, not code" semantics travel with the `spike` label.
 *
 * `doc` and `decision` do NOT live as rows in `tasks-<slug>.yml`; their
 * content-home is frontmatter'd markdown under `.diarie/decisions/<id>.md` and
 * `.diarie/docs/<id>.md` (the frontmatter carries the schema fields; the body is
 * the prose the terse row can't hold). The migration exercised this for the first
 * real `decision` — `.diarie/decisions/vp-beads-etm.md`. `milestone` rows DO live
 * in `tasks-*.yml` (markers, no prose); there are none live yet. Because the
 * ready-walker only globs `tasks-*.yml`, decision/doc files are naturally outside
 * the ready computation — a decision "in force" is never surfaced as workable.
 *
 * Ready rule (the only computation that gates work): an item is READY iff
 * `type === 'task'`, `status === 'pending'`, every dep is `completed`, AND it is not a
 * CONTAINER — a task with open children, or one carrying the `epic` label, is the sum of
 * its children and never work in itself (`vp-beads-epc`). Non-task types
 * (`doc`/`decision`/`milestone`) never appear in ready/blocked/needsAttention — they are
 * records or markers, not work (a milestone has "no effort, no assignment") — and for the
 * same reason they never BLOCK one either. Both `deps` (the `blocks` analog) and `parent`
 * (containment) affect readiness; transitivity is emergent via the status invariant (a
 * task can't be `completed` until it was itself ready), not a graph walk.
 *
 * Atomic-write contract (load-bearing invariant): the substrate assumes a SOLO,
 * SINGLE-HOST developer with NO concurrent writers to the same `tasks-<slug>.yml`.
 * swarm-wave's file-disjoint + single-owner-per-issue partitioning is what
 * upholds it (two agents never own the same slug file in one wave). Skills mutate
 * tasks with the ordinary Edit/Write tools — there is deliberately no CRUD helper
 * (substrate-not-opinion). If that invariant is ever violated (multi-writer), the
 * upgrade is write-then-rename, not a lock daemon.
 */

/** @typedef {'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled' | 'deferred'} Status */
/** @typedef {'task' | 'doc' | 'decision' | 'milestone'} TaskType */
/** @typedef {'critical' | 'high' | 'medium' | 'low' | 'backlog'} Priority */

/**
 * `deferred` is an open item consciously postponed — distinct from `cancelled`
 * (won't do) and from `pending` (workable now). Like every non-`completed`
 * status it is not `ready` and does not resolve a dependency: a task depending
 * on a deferred item surfaces in `needsAttention`, never `ready` (see
 * computeReady in ready.js — deferred falls through the dep partition's
 * catch-all `else` into `stalled`).
 */
/** @type {Set<Status>} */
export const VALID_STATUSES = new Set(['pending', 'in_progress', 'completed', 'failed', 'cancelled', 'deferred'])

/** @type {Set<TaskType>} */
export const VALID_TYPES = new Set(['task', 'doc', 'decision', 'milestone'])

/** @type {Set<Priority>} */
export const VALID_PRIORITIES = new Set(['critical', 'high', 'medium', 'low', 'backlog'])

/** Priority sort order for the ready queue (lower = more urgent). */
export const PRIORITY_RANK = { critical: 0, high: 1, medium: 2, low: 3, backlog: 4 }

/** Allowed shape of a task `id` (letters/digits then word chars, `.`, `-`). */
export const ID_RE = /^[A-Z0-9][\w.-]*$/i

/** Always-required fields on every task entry. */
export const REQUIRED_FIELDS = ['id', 'title', 'status', 'type']

/**
 * The per-repo directory that holds the flat-YAML task store, resolved relative
 * to the project root. Dotted + product-namespaced (`.diarie/`, the `diarie`
 * tracker) so it can't collide on the shared dotfile namespace — but committed,
 * not ephemeral (cf. `.claude/`, `.github/`; NOT `.beads/`, which was gitignored
 * tool state). Every tool derives the store location from here — never hardcode
 * the segment. (Renamed from `backlog/` 2026-07-11.)
 */
export const TRACKER_DIR = '.diarie'

/**
 * Types whose completion should carry stated acceptance criteria (the
 * test-ratchet). A completed item of one of these with an empty
 * `acceptance_criteria` warns — "state done-ness before marking done".
 * Under the 4-type model only `task` carries work, so only `task` ratchets;
 * label-conditional refinements (e.g. `spike` → findings) are a future
 * ADVISORY layer, never hard errors.
 */
/** @type {Set<TaskType>} */
export const RATCHET_TYPES = new Set(['task'])

/**
 * Nullish check (a missing YAML key → `undefined`; an explicit `key: null` → `null`).
 *
 * @param {unknown} v
 * @returns {boolean}
 */
export const isNil = (v) => v === undefined || v === null

/**
 * Globalize a reference to a task: a bare id takes its file's slug (`slug/id`); an
 * id that already carries a slug passes through. Idempotent, so it is always safe
 * to apply again.
 *
 * THE ONE PLACE THIS RULE LIVES. It used to exist twice — `store.js` had it as `nsId`,
 * `validate.js` had a behaviourally identical private `glob` — and the copies drifted:
 * `store.js` applied it to `id` and `deps` but not to `parent`, so `loadTasks` handed out
 * a half-globalized task whose `parent` (`T-0`) could never match any `id` (`slug/T-0`).
 * `validate.js` was spared only because its copy WAS applied to `parent`.
 *
 * Nothing was broken by this at the time — no reader consumed `parent`. It was a trap
 * laid for the next one. When the container rule arrived (`vp-beads-epc`), indexing
 * children by parent would have matched nothing, excluded no epic, changed no behaviour,
 * and passed a green suite. A latent bug that only fires when someone finally trusts the
 * data is worse than a loud one, because it fires as a silent success.
 *
 * Two implementations of one id rule is what let one of them be incomplete. Keep it here,
 * keep it single, and import it.
 *
 * @param {unknown} ref   a task id or reference, bare or already `slug/id`
 * @param {string} slug   the slug of the file the reference was written in
 * @returns {string}
 */
export const nsId = (ref, slug) => String(ref).includes('/') ? String(ref) : `${slug}/${ref}`
