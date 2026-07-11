/**
 * validate-tasks.mjs — integrity gate for the flat-YAML task substrate.
 *
 * Mirrors validate-plugin.mjs: a standalone ESM script with `errors`/`warnings`
 * arrays and a non-zero exit on any error. The pure `lintTasks()` helper is
 * exported for unit tests; the CLI wraps it with file IO.
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
 * one `npm run check`. Substrate-optional: exits 0 when no tasks files exist.
 */

import { existsSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  argv, env, exit, stdout,
} from 'node:process'

import yaml from 'js-yaml'

import {
  ID_RE, isNil, RATCHET_TYPES, REQUIRED_FIELDS, TRACKER_DIR, VALID_PRIORITIES, VALID_STATUSES, VALID_TYPES,
} from './scripts/task-schema.mjs'

/**
 * Globalize a bare id to its file's slug namespace (`slug/id`); pass through
 * ids that already carry a slug.
 *
 * @param {unknown} ref
 * @param {string} slug
 * @returns {string}
 */
const glob = (ref, slug) => String(ref).includes('/') ? String(ref) : `${slug}/${ref}`

/**
 * If a dangling BARE dep matches a task id in a different slug, suggest it —
 * the most common copy-paste error (a task moved between files keeps bare deps).
 *
 * @param {unknown} rawDep    the dep exactly as written (bare or `slug/id`)
 * @param {string} resolved   the globalized id that failed to resolve
 * @param {Map<string, { t: any, slug: string }>} all
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

  /** @type {Map<string, { t: any, slug: string }>} */
  const all = new Map()
  /** Files whose top-level shape is broken — excluded from the value passes. */
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
      if (isNil(t) || typeof t !== 'object' || Array.isArray(t)) { err(name, `task at index ${i} is not a mapping`); continue }
      const label = t.id ?? `index ${i}`
      if (!isNil(t.deps) && !Array.isArray(t.deps)) err(name, `task ${label}: "deps" must be a list (got ${typeof t.deps})`)
      if (!isNil(t.acceptance_criteria) && !Array.isArray(t.acceptance_criteria)) err(name, `task ${label}: "acceptance_criteria" must be a list (got ${typeof t.acceptance_criteria})`)
      if (!isNil(t.labels)) {
        if (!Array.isArray(t.labels)) err(name, `task ${label}: "labels" must be a list (got ${typeof t.labels})`)
        else if (t.labels.some(l => typeof l !== 'string')) err(name, `task ${label}: "labels" entries must all be strings`)
      }
    }
  }

  // --- Pass 1: per-file structural (field values) ---
  for (const { name, tasks } of files) {
    if (badFiles.has(name)) continue
    const seen = new Set()
    for (const t of /** @type {any[]} */ (tasks)) {
      if (isNil(t) || typeof t !== 'object' || Array.isArray(t)) continue // shape error already reported in Pass 0
      const label = t.id ?? '(no id)'
      for (const field of REQUIRED_FIELDS) {
        if (isNil(t[field]) || t[field] === '') err(name, `task ${label} missing required field: ${field}`)
      }
      if (!isNil(t.id)) {
        if (!ID_RE.test(String(t.id))) err(name, `task ${label}: invalid id (expected ${ID_RE.source})`)
        if (seen.has(t.id)) err(name, `duplicate id "${t.id}" within file`)
        seen.add(t.id)
      }
      if (!isNil(t.status) && !VALID_STATUSES.has(t.status)) err(name, `task ${label}: invalid status "${t.status}"`)
      if (!isNil(t.type) && !VALID_TYPES.has(t.type)) err(name, `task ${label}: invalid type "${t.type}"`)
      if (!isNil(t.priority) && !VALID_PRIORITIES.has(t.priority)) err(name, `task ${label}: invalid priority "${t.priority}"`)
      if (!isNil(t.updated) && (typeof t.updated !== 'string' || !Number.isFinite(Date.parse(t.updated)))) {
        err(name, `task ${label}: invalid updated "${t.updated}" (expected an ISO date string)`)
      }
      if (!isNil(t.id)) all.set(glob(t.id, name), { t, slug: name })
    }
  }

  // --- Pass 2: dep graph (dangling, orphan parent, cycles) ---
  /** @type {Map<string, string[]>} */ const deps = new Map()
  for (const [gid, { slug, t }] of all) {
    const resolved = []
    for (const d of Array.isArray(t.deps) ? t.deps : []) {
      const gd = glob(d, slug)
      if (all.has(gd)) resolved.push(gd)
      else err(slug, `task ${t.id}: dep "${gd}" does not exist${crossSlugHint(d, gd, all)}`)
    }
    deps.set(gid, resolved)
    if (!isNil(t.parent) && !all.has(glob(t.parent, slug))) {
      err(slug, `task ${t.id}: parent "${glob(t.parent, slug)}" does not exist`)
    }
  }
  for (const cycle of findCycles(deps)) {
    const { slug } = all.get(cycle[0]) ?? { slug: '(graph)' }
    err(slug, `dependency cycle: ${cycle.join(' → ')}`)
  }

  // --- Pass 3: status-transition sanity ---
  for (const [, { slug, t }] of all) {
    if (t.status === 'in_progress') {
      for (const d of Array.isArray(t.deps) ? t.deps : []) {
        const dep = all.get(glob(d, slug))?.t
        if (dep && (dep.status === 'pending' || dep.status === 'in_progress')) {
          warn(slug, `task ${t.id}: in_progress but dep ${glob(d, slug)} is ${dep.status} (claimed before blockers resolved)`)
        }
      }
    }
    if (!isNil(t.agent) && t.status === 'pending') {
      warn(slug, `task ${t.id}: agent "${t.agent}" set but status is pending (ghost claim — clear agent or claim it)`)
    }
  }

  // --- Pass 4: test-ratchet ---
  for (const [, { slug, t }] of all) {
    if (t.status === 'completed' && RATCHET_TYPES.has(t.type) &&
        !(Array.isArray(t.acceptance_criteria) && t.acceptance_criteria.length)) {
      warn(slug, `task ${t.id}: completed ${t.type} with no acceptance_criteria (state done-ness before marking done)`)
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
  const covered = new Set()
  const cycles = []
  for (const start of stuck) {
    if (covered.has(start)) continue
    const path = []
    let cur = start
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

/** CLI entry. */
async function main () {
  // TASKS_ROOT lets the smoke test point the CLI at test/fixtures/ without
  // touching the repo's real tracker dir. Unset in normal `npm run check`.
  const root = env.TASKS_ROOT ?? new URL('.', import.meta.url).pathname.replace(/\/$/, '')
  const tasksDir = join(root, TRACKER_DIR, 'tasks')
  const json = argv.includes('--json')

  if (!existsSync(tasksDir)) {
    if (!json) console.log(`No ${TRACKER_DIR}/tasks/ directory found — skipping task validation.`)
    else stdout.write(JSON.stringify({ clean: true, skipped: true, errors: [], warnings: [] }) + '\n')
    return
  }
  const entries = await readdir(tasksDir)
  const names = entries.filter(f => /^tasks-.+\.ya?ml$/.test(f))
  // Phantom-files guard: a dir of non-matching files is not the same as an empty
  // substrate — surface it rather than skip silently ("silent-skip is a bug").
  const ignored = entries.filter(f => !f.startsWith('.') && !/^tasks-.+\.ya?ml$/.test(f))
  if (ignored.length && !names.length && !json) {
    console.warn(`Warning: ${TRACKER_DIR}/tasks/ has ${ignored.length} file(s) not matching tasks-*.yml (ignored): ${ignored.join(', ')}\n  Rename to tasks-<slug>.yml to include them in validation.\n`)
  }
  if (!names.length) {
    if (!json) console.log(`No ${TRACKER_DIR}/tasks/tasks-*.yml found — skipping task validation.`)
    else stdout.write(JSON.stringify({ clean: true, skipped: true, errors: [], warnings: [] }) + '\n')
    return
  }

  const files = []
  /** @type {string[]} */
  const parseErrors = []
  for (const name of names) {
    const slug = name.replace(/^tasks-/, '').replace(/\.ya?ml$/, '')
    let doc
    try {
      doc = /** @type {any} */ (yaml.load(await readFile(join(tasksDir, name), 'utf8')))
    } catch (err) {
      // Collect, do NOT exit here. Bailing out on stderr meant `--json` emitted NO JSON
      // at all for an unparseable store — so every consumer that reads stdout (both hooks)
      // saw empty output and concluded there was nothing to say, on the single commonest
      // hand-edit mistake. `--json` must ALWAYS emit JSON; that is the contract.
      parseErrors.push(`${name}: invalid YAML — ${/** @type {Error} */ (err).message}`)
      continue
    }
    files.push({ name: slug, tasks: doc?.tasks ?? [] })
  }

  const lint = lintTasks(files)
  const errors = [...parseErrors, ...lint.errors]
  const { warnings } = lint

  if (json) {
    stdout.write(JSON.stringify({ clean: errors.length === 0, errors, warnings }, undefined, 2) + '\n')
    if (errors.length) exit(1)
    return
  }
  if (warnings.length) {
    console.warn('Task validation warnings:\n')
    for (const w of warnings) console.warn(`  ~ ${w}`)
    console.warn('')
  }
  if (errors.length) {
    console.error('Task validation failed:\n')
    for (const e of errors) console.error(`  - ${e}`)
    console.error(`\n${errors.length} error(s) found.`)
    exit(1)
  } else {
    console.log(`Task validation passed (${files.length} file(s)).`)
  }
}

if (argv[1] && fileURLToPath(import.meta.url) === argv[1]) {
  main().catch(err => { console.error(err); exit(1) })
}
