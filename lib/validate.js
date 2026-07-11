/**
 * validate.js — the integrity gate.
 *
 * PURE: `lintTasks()` takes already-parsed files and returns errors/warnings. No
 * filesystem, no process, no exit codes. `commands/validate.js` does the IO and
 * owns the exit codes; `store.js` owns finding the store.
 *
 * Four passes:
 *   1. per-file structural — required fields, enum values, unique ids
 *   2. dep-graph integrity — dangling deps, orphan parents, no cycles (Kahn)
 *   3. status-transition sanity — claimed-before-blockers, ghost claims
 *   4. test-ratchet — completed work units must state their acceptance criteria
 *
 * Honest scope: this catches dep-graph rot at check time — the same guarantee
 * `bd graph check` gave (a snapshot, not a structural invariant). It cannot
 * make an agent write its plan-updates back; it makes the rot visible within
 * one `npm run check`.
 *
 * NOT substrate-optional any more. It used to exit 0 with `{clean:true,
 * skipped:true}` when no store existed — which made an ABSENT store and a CLEAN
 * one indistinguishable, and forced `beads-probe` to test `skipped === false` just
 * to know whether the gate had been real. A missing store is now ENOSTORE and a
 * non-zero exit; the `skipped` flag is gone with the defect it papered over. An
 * EMPTY store is still perfectly clean — see store.js.
 */

import {
  isObject, isStringArray, isType, isUnknownArray,
} from '@voxpelli/typed-utils'

import {
  ID_RE, isNil, isPriority, isStatus, isTaskType, nsId, RATCHET_TYPES, REQUIRED_FIELDS,
} from './schema.js'

/**
 * A task entry exactly as YAML handed it over: known keys, UNKNOWN values.
 *
 * `Record<string, unknown>`, not `any`. The values genuinely are unknown — that is this
 * file's entire subject — but the KEYS are not, and `any` was throwing both away. Under
 * `any`, renaming a schema field would make every check on it silently read `undefined`
 * and stop checking, while `npm run check` stayed green: the same silent-no-op class that
 * produced every other bug in this tracker, sitting inside the gate meant to catch them.
 *
 * @typedef {Record<string, unknown>} RawTask
 */

/**
 * If a dangling BARE dep matches a task id in a different slug, suggest it —
 * the most common copy-paste error (a task moved between files keeps bare deps).
 *
 * @param {unknown} rawDep    the dep exactly as written (bare or `slug/id`)
 * @param {string} resolved   the globalized id that failed to resolve
 * @param {Map<string, { t: RawTask, slug: string }>} all
 * @returns {string}
 */
function crossSlugHint (rawDep, resolved, all) {
  if (String(rawDep).includes('/')) return ''
  const match = [...all.keys()].find(k => k !== resolved && k.endsWith(`/${rawDep}`))
  return match ? ` (did you mean ${match}?)` : ''
}

/**
 * Pure linter over loaded task files.
 *
 * @param {Array<{ name: string, tasks: unknown }>} files  `name` is the slug
 * @returns {{ errors: string[], warnings: string[] }}
 */
export function lintTasks (files) {
  /** @type {string[]} */ const errors = []
  /** @type {string[]} */ const warnings = []
  const err = (/** @type {string} */ f, /** @type {string} */ m) => errors.push(`${f}: ${m}`)
  const warn = (/** @type {string} */ f, /** @type {string} */ m) => warnings.push(`${f}: ${m}`)

  /** @type {Map<string, { t: RawTask, slug: string }>} */
  const all = new Map()
  /**
   * Files whose top-level shape is broken — excluded from the value passes.
   *
   * @type {Set<string>}
   */
  const badFiles = new Set()

  // --- Pass 0: shape guard (types, not values) — a wrong YAML shape would
  // otherwise char-split a scalar into nonsense or throw on a non-iterable. ---
  for (const { name, tasks } of files) {
    if (!Array.isArray(tasks)) {
      err(name, `top-level "tasks" must be a list (got ${tasks === null ? 'null' : typeof tasks})`)
      badFiles.add(name)
      continue
    }
    for (const [i, t] of tasks.entries()) {
      if (!isObject(t)) { err(name, `task at index ${i} is not a mapping`); continue }
      const label = t['id'] ?? `index ${i}`
      if (!isNil(t['deps']) && !isUnknownArray(t['deps'])) err(name, `task ${label}: "deps" must be a list (got ${typeof t['deps']})`)
      if (!isNil(t['acceptance_criteria']) && !isUnknownArray(t['acceptance_criteria'])) err(name, `task ${label}: "acceptance_criteria" must be a list (got ${typeof t['acceptance_criteria']})`)
      if (!isNil(t['labels'])) {
        if (!isUnknownArray(t['labels'])) err(name, `task ${label}: "labels" must be a list (got ${typeof t['labels']})`)
        else if (!isStringArray(t['labels'])) err(name, `task ${label}: "labels" entries must all be strings`)
      }
    }
  }

  // --- Pass 1: per-file structural (field values) ---
  for (const { name, tasks } of files) {
    if (badFiles.has(name)) continue
    /** @type {Set<unknown>} */ const seen = new Set()
    for (const t of isUnknownArray(tasks) ? tasks : []) {
      if (!isObject(t)) continue // shape error already reported in Pass 0
      const label = t['id'] ?? '(no id)'
      for (const field of REQUIRED_FIELDS) {
        if (isNil(t[field]) || t[field] === '') err(name, `task ${label} missing required field: ${field}`)
      }
      if (!isNil(t['id'])) {
        if (!ID_RE.test(String(t['id']))) err(name, `task ${label}: invalid id (expected ${ID_RE.source})`)
        if (seen.has(t['id'])) err(name, `duplicate id "${t['id']}" within file`)
        seen.add(t['id'])
      }
      if (!isNil(t['status']) && !isStatus(t['status'])) err(name, `task ${label}: invalid status "${t['status']}"`)
      if (!isNil(t['type']) && !isTaskType(t['type'])) err(name, `task ${label}: invalid type "${t['type']}"`)
      if (!isNil(t['priority']) && !isPriority(t['priority'])) err(name, `task ${label}: invalid priority "${t['priority']}"`)
      if (!isNil(t['updated']) && (!isType(t['updated'], 'string') || !Number.isFinite(Date.parse(t['updated'])))) {
        err(name, `task ${label}: invalid updated "${t['updated']}" (expected an ISO date string)`)
      }
      if (!isNil(t['id'])) all.set(nsId(t['id'], name), { t, slug: name })
    }
  }

  // --- Pass 2: dep graph (dangling, orphan parent, cycles) ---
  /** @type {Map<string, string[]>} */ const deps = new Map()
  /** @type {Map<string, string>} */ const parents = new Map()
  for (const [gid, { slug, t }] of all) {
    const resolved = []
    for (const d of isUnknownArray(t['deps']) ? t['deps'] : []) {
      const gd = nsId(d, slug)
      if (all.has(gd)) resolved.push(gd)
      else err(slug, `task ${t['id']}: dep "${gd}" does not exist${crossSlugHint(d, gd, all)}`)
    }
    deps.set(gid, resolved)
    if (!isNil(t['parent'])) {
      const gp = nsId(t['parent'], slug)
      if (gp === gid) err(slug, `task ${t['id']}: parent "${gp}" is itself`)
      else if (!all.has(gp)) err(slug, `task ${t['id']}: parent "${gp}" does not exist`)
      else parents.set(gid, gp)
    }
  }
  // The parent graph gets its own cycle check. `findCycles` above walks `deps` only, so a
  // ring of parents (A→B→A, or any longer loop) sailed through — and it is not a harmless
  // one: each member is the other's open child, so the ready-walk blocks every task in the
  // ring on every other, forever, with nothing to point at. Self-parenting is just the
  // one-element case of this; guarding only that would have been guarding the easy half.
  for (const cycle of findCycles(new Map([...parents].map(([k, v]) => [k, [v]])))) {
    const { slug } = all.get(cycle[0] ?? '') ?? { slug: '(graph)' }
    err(slug, `parent cycle: ${cycle.join(' → ')}`)
  }
  for (const cycle of findCycles(deps)) {
    const head = cycle[0]
    const { slug } = (head === undefined ? undefined : all.get(head)) ?? { slug: '(graph)' }
    err(slug, `dependency cycle: ${cycle.join(' → ')}`)
  }

  // --- Pass 3: status-transition sanity ---
  for (const [, { slug, t }] of all) {
    if (t['status'] === 'in_progress') {
      for (const d of isUnknownArray(t['deps']) ? t['deps'] : []) {
        const dep = all.get(nsId(d, slug))?.t
        const depStatus = dep?.['status']
        if (depStatus === 'pending' || depStatus === 'in_progress') {
          warn(slug, `task ${t['id']}: in_progress but dep ${nsId(d, slug)} is ${depStatus} (claimed before blockers resolved)`)
        }
      }
    }
    if (!isNil(t['agent']) && t['status'] === 'pending') {
      warn(slug, `task ${t['id']}: agent "${t['agent']}" set but status is pending (ghost claim — clear agent or claim it)`)
    }
  }

  // --- Pass 4: test-ratchet ---
  for (const [, { slug, t }] of all) {
    if (t['status'] === 'completed' && isTaskType(t['type']) && RATCHET_TYPES.has(t['type']) &&
        !(isUnknownArray(t['acceptance_criteria']) && t['acceptance_criteria'].length)) {
      warn(slug, `task ${t['id']}: completed ${t['type']} with no acceptance_criteria (state done-ness before marking done)`)
    }
  }

  return { errors, warnings }
}

/**
 * Find EVERY disjoint dependency cycle via Kahn's algorithm. `deps` maps each
 * task → its prerequisites (edges point task → prerequisite); in-degree is
 * counted on the prerequisite side, so a node nothing depends on starts at 0 and
 * is removed first. Nodes that never reach in-degree 0 are in a cycle; one
 * representative path is recovered per disjoint cycle component. The recovery
 * order is sorted, so the output is deterministic across runs.
 *
 * @param {Map<string, string[]>} deps  task → its prerequisites
 * @returns {string[][]} one representative path per disjoint cycle (`[]` if acyclic)
 */
function findCycles (deps) {
  const indeg = new Map([...deps.keys()].map(k => [k, 0]))
  for (const ds of deps.values()) for (const d of ds) indeg.set(d, (indeg.get(d) ?? 0) + 1)
  const queue = [...indeg].filter(([, n]) => n === 0).map(([k]) => k)
  /** @type {Set<string>} */
  const removed = new Set()
  while (queue.length) {
    const n = /** @type {string} */ (queue.shift())
    removed.add(n)
    for (const d of deps.get(n) ?? []) {
      indeg.set(d, /** @type {number} */ (indeg.get(d)) - 1)
      if (indeg.get(d) === 0) queue.push(d)
    }
  }
  const stuck = [...deps.keys()].filter(k => !removed.has(k))
  stuck.sort() // sort the fresh array in place for deterministic recovery order
  if (!stuck.length) return []

  const inCycle = new Set(stuck)
  /** @type {Set<string>} */
  const covered = new Set()
  /** @type {string[][]} */
  const cycles = []
  for (const start of stuck) {
    if (covered.has(start)) continue
    /** @type {string[]} */ const path = []
    /** @type {string | undefined} */ let cur = start
    /** @type {Set<string>} */
    const visited = new Set()
    while (cur && !visited.has(cur)) {
      visited.add(cur)
      path.push(cur)
      cur = (deps.get(cur) ?? []).find(d => inCycle.has(d))
    }
    if (cur) path.push(cur) // close the loop
    for (const node of path) covered.add(node)
    cycles.push(path)
  }
  return cycles
}
