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
import { argv, exit, stdout } from 'node:process'
import { fileURLToPath } from 'node:url'

import yaml from 'js-yaml'

import { VALID_PRIORITIES, VALID_STATUSES, VALID_TYPES } from './scripts/ready-walker.mjs'

const ID_RE = /^[A-Z0-9][\w.-]*$/i
const RATCHET_TYPES = new Set(['task', 'bug', 'feature', 'story'])
const REQUIRED_FIELDS = ['id', 'title', 'status', 'type']

/**
 * Nullish check (handles both a missing YAML key → undefined and `key: null`).
 *
 * @param {unknown} v
 * @returns {boolean}
 */
const isNil = (v) => v === undefined || v === null

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
 * Pure linter over loaded task files.
 *
 * @param {Array<{ name: string, tasks: any[] }>} files  `name` is the slug
 * @returns {{ errors: string[], warnings: string[] }}
 */
export function lintTasks (files) {
  /** @type {string[]} */ const errors = []
  /** @type {string[]} */ const warnings = []
  const err = (/** @type {string} */ f, /** @type {string} */ m) => errors.push(`${f}: ${m}`)
  const warn = (/** @type {string} */ f, /** @type {string} */ m) => warnings.push(`${f}: ${m}`)

  /** @type {Map<string, { t: any, slug: string }>} */
  const all = new Map()

  // --- Pass 1: per-file structural ---
  for (const { name, tasks } of files) {
    const seen = new Set()
    for (const t of tasks ?? []) {
      if (isNil(t) || typeof t !== 'object') { err(name, 'task entry is not a mapping'); continue }
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
      if (!isNil(t.id)) all.set(glob(t.id, name), { t, slug: name })
    }
  }

  // --- Pass 2: dep graph (dangling, orphan parent, cycles) ---
  /** @type {Map<string, string[]>} */ const deps = new Map()
  for (const [gid, { slug, t }] of all) {
    const resolved = []
    for (const d of t.deps ?? []) {
      const gd = glob(d, slug)
      if (!all.has(gd)) err(slug, `task ${t.id}: dep "${gd}" does not exist`)
      else resolved.push(gd)
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
      for (const d of t.deps ?? []) {
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
    if (t.status === 'completed' && RATCHET_TYPES.has(t.type) && !(t.acceptance_criteria?.length)) {
      warn(slug, `task ${t.id}: completed ${t.type} with no acceptance_criteria (state done-ness before marking done)`)
    }
  }

  return { errors, warnings }
}

/**
 * Find dependency cycles via Kahn's algorithm over `dep → dependent` edges:
 * any node never reaching in-degree 0 is part of a cycle.
 *
 * @param {Map<string, string[]>} deps  task → its deps
 * @returns {string[][]} one representative cycle path per detected cycle
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
  if (!stuck.length) return []
  // Recover one concrete cycle path for the report.
  const inCycle = new Set(stuck)
  const path = []
  let cur = stuck[0]
  const visited = new Set()
  while (cur && !visited.has(cur)) {
    visited.add(cur)
    path.push(cur)
    cur = (deps.get(cur) ?? []).find(d => inCycle.has(d))
  }
  if (cur) path.push(cur) // close the loop
  return [path]
}

/** CLI entry. */
async function main () {
  const root = new URL('.', import.meta.url).pathname.replace(/\/$/, '')
  const tasksDir = join(root, 'backlog', 'tasks')
  const json = argv.includes('--json')

  if (!existsSync(tasksDir)) {
    if (!json) console.log('No backlog/tasks/ directory found — skipping task validation.')
    else stdout.write(JSON.stringify({ clean: true, skipped: true, errors: [], warnings: [] }) + '\n')
    return
  }
  const entries = await readdir(tasksDir)
  const names = entries.filter(f => /^tasks-.+\.ya?ml$/.test(f))
  if (!names.length) {
    if (!json) console.log('No backlog/tasks/tasks-*.yml found — skipping task validation.')
    else stdout.write(JSON.stringify({ clean: true, skipped: true, errors: [], warnings: [] }) + '\n')
    return
  }

  const files = []
  for (const name of names) {
    const slug = name.replace(/^tasks-/, '').replace(/\.ya?ml$/, '')
    let doc
    try {
      doc = /** @type {any} */ (yaml.load(await readFile(join(tasksDir, name), 'utf8')))
    } catch (err) {
      console.error(`Task validation failed:\n\n  - ${name}: invalid YAML — ${/** @type {Error} */ (err).message}\n`)
      exit(1)
    }
    files.push({ name: slug, tasks: doc?.tasks ?? [] })
  }

  const { errors, warnings } = lintTasks(files)

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
