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
      if (!isNil(t['acceptance_criteria'])) {
        if (!isUnknownArray(t['acceptance_criteria'])) err(name, `task ${label}: "acceptance_criteria" must be a list (got ${typeof t['acceptance_criteria']})`)
        // The ELEMENTS, not just the container. `labels` was checked this way and
        // `acceptance_criteria` was not — and the gap bit immediately: an unquoted `priority: 2`
        // inside a criterion made YAML parse that element as a MAP, the list stayed an Array,
        // and validate waved it through. Only the loader's reject-warn caught it, on stderr.
        else if (!isStringArray(t['acceptance_criteria'])) err(name, `task ${label}: "acceptance_criteria" entries must all be strings (an unquoted \`key: value\` becomes a map — quote it)`)
      }
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
  // --- The BLOCKING graph. One check, over the union — not two, over the projections. ---
  //
  // `computeReady` blocks a task on TWO kinds of edge, and they point opposite ways:
  //
  //   a dep       blocks the DEPENDENT   →  edge  task → dep      (finish the dep first)
  //   a child     blocks the PARENT      →  edge  parent → child  (the work is inside it)
  //
  // Checking `deps` and `parents` as SEPARATE graphs was wrong, and wrong in the worst
  // available way: a ring that ALTERNATES edge kinds is acyclic in both projections and
  // cyclic in neither, so every check passed over a backlog that could never be worked.
  // The minimal case is a task that depends on its own epic — an entirely natural thing to
  // write:
  //
  //   EPIC-1 (epic)                    EPIC-1 is blocked by its child T-1
  //   T-1  parent: EPIC-1              T-1 is blocked by its dep EPIC-1
  //        deps:  [EPIC-1]             → neither can ever start
  //
  //   `diarie ready`    → "0 ready, 1 blocked — run `diarie validate` to check for a cycle"
  //   `diarie validate` → "Task validation passed."     ...and the human loops, forever.
  //
  // So build the graph the ready-walk ACTUALLY walks, and check that. Note the parent edge
  // is REVERSED relative to how `parents` stores it (child→parent): it is the parent that
  // gets blocked.
  /** @type {Map<string, string[]>} */
  const blocking = new Map()
  /** @type {Map<string, 'dep' | 'child'>} */
  const edgeKind = new Map()
  const addEdge = (/** @type {string} */ from, /** @type {string} */ to, /** @type {'dep'|'child'} */ kind) => {
    const list = blocking.get(from)
    if (list) list.push(to)
    else blocking.set(from, [to])
    edgeKind.set(`${from}\u0000${to}`, kind)
  }
  for (const [gid, targets] of deps) for (const d of targets) addEdge(gid, d, 'dep')
  for (const [child, parent] of parents) addEdge(parent, child, 'child')
  for (const gid of all.keys()) if (!blocking.has(gid)) blocking.set(gid, [])

  for (const cycle of findCycles(blocking)) {
    const head = cycle[0]
    const { slug } = (head === undefined ? undefined : all.get(head)) ?? { slug: '(graph)' }
    // Name the edge kinds in the path, so the reader can see WHICH relationship to break.
    const path = cycle.map((node, i) => {
      const next = cycle[i + 1]
      if (next === undefined) return node
      return `${node} ${edgeKind.get(`${node}\u0000${next}`) === 'child' ? '⊃' : '→'} `
    }).join('')
    const kinds = new Set(cycle.map((n, i) => edgeKind.get(`${n}\u0000${cycle[i + 1]}`)).filter(Boolean))
    const label = kinds.has('child') ? (kinds.has('dep') ? 'blocking cycle (deps ⨯ containment)' : 'parent cycle') : 'dependency cycle'
    err(slug, `${label}: ${path}  (→ depends on, ⊃ contains)`)
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
