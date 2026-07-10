/**
 * ready-walker.mjs — the files-native replacement for `bd ready`.
 *
 * Computes ready / blocked work and summary stats over the flat-YAML task
 * substrate (`backlog/tasks/tasks-<slug>.yml`). The YAML files are canonical;
 * this is a pure derived read — no index, no daemon, no vendor. The pure
 * functions (`computeReady`, `computeStats`) are exported for unit tests; the
 * CLI wraps them with file IO.
 *
 * Usage:
 *   node scripts/ready-walker.mjs                  ready tasks (human-readable)
 *   node scripts/ready-walker.mjs --format json    machine-readable {ready,blocked,needsAttention}
 *   node scripts/ready-walker.mjs --stats          summary counts
 *   node scripts/ready-walker.mjs --blocked        blocked tasks with their blocker ids
 *   node scripts/ready-walker.mjs --stale --days N in_progress tasks not updated in N days
 *   node scripts/ready-walker.mjs --filter <status>  tasks in a given status
 *
 * Ready rule: a task is READY iff `type: task`, `status: pending`, and every
 * dep is `completed`; BLOCKED if any dep is pending/in_progress;
 * NEEDS_ATTENTION if a dep is failed/cancelled/missing. Non-task types
 * (`doc`/`decision`/`milestone`) are records or markers, never work — they
 * never appear in ready/blocked/needsAttention (mirrors bd: a milestone has
 * "no effort, no assignment" per CLAUDE.md's issue-type table). (Mirrors bd:
 * only the analog of `blocks` affects readiness; the graph is recomputed,
 * never enforced — see validate-tasks.mjs for the integrity gate.)
 */

import { existsSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  argv, env, exit, stderr, stdout,
} from 'node:process'

import yaml from 'js-yaml'

import {
  isNil, PRIORITY_RANK, VALID_PRIORITIES, VALID_STATUSES, VALID_TYPES,
} from './task-schema.mjs'

/**
 * @typedef {object} Task
 * @property {string} id          globally-unique id (loader prefixes with slug)
 * @property {string} [title]
 * @property {import('./task-schema.mjs').Status} status
 * @property {import('./task-schema.mjs').Priority} [priority]
 * @property {import('./task-schema.mjs').TaskType} [type]
 * @property {string[]} [deps]    resolvable ids in the same namespace
 * @property {string} [parent]
 * @property {string[]} [acceptance_criteria]
 * @property {string} [agent]
 * @property {string} [updated]   ISO date
 */

/**
 * A task as returned by loadTasks — a Task plus loader-only provenance. The
 * provenance fields are internal and stripped before any JSON output.
 *
 * @typedef {Task & { _slug?: string, _file?: string }} LoadedTask
 */

/**
 * Namespace a bare id to its file's slug (`slug/id`); pass through slugged ids.
 *
 * @param {unknown} id
 * @param {string} slug
 * @returns {string}
 */
export const nsId = (id, slug) => String(id).includes('/') ? String(id) : `${slug}/${id}`

/**
 * Coerce a YAML `deps` value to a safe namespaced string[]: an array → namespace
 * each entry; nil → []; any other shape → [] with a stderr warning (the
 * validator owns the hard error — this just keeps the reader from crashing).
 *
 * @param {unknown} raw
 * @param {string} slug
 * @param {string} file
 * @param {string} taskId
 * @returns {string[]}
 */
function safeDeps (raw, slug, file, taskId) {
  if (isNil(raw)) return []
  if (Array.isArray(raw)) return raw.map(d => nsId(d, slug))
  stderr.write(`ready-walker: ${file}: task ${taskId}: "deps" is not a list — treating as empty (run validate-tasks)\n`)
  return []
}

/**
 * Drop loader-only provenance fields before serializing to JSON.
 *
 * @param {LoadedTask} t
 * @returns {Task}
 */
const strip = ({ _file, _slug, ...task }) => task

/**
 * Build a zero-filled tally keyed by a set of allowed values. Uses a
 * null-prototype object so a junk key like `toString` can't reach the
 * prototype chain via the `in` operator.
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
 * Compute ready / blocked / needs-attention partitions over a flat task list.
 *
 * @param {Task[]} tasks
 * @returns {{ ready: Task[], blocked: Array<Task & { blockers: string[] }>, needsAttention: Array<Task & { reason: string }> }}
 */
export function computeReady (tasks) {
  const byId = new Map(tasks.map(t => [t.id, t]))
  const ready = []
  const blocked = []
  const needsAttention = []

  for (const task of tasks) {
    if (task.status !== 'pending') continue
    // Only `task`-type items are workable — `doc`/`decision`/`milestone` are
    // records or markers (e.g. a milestone has "no effort, no assignment").
    // `type` is a required field (task-schema.mjs REQUIRED_FIELDS); an absent
    // value here means malformed/unvalidated input — treat defensively as
    // ineligible rather than assuming `task` (validate-tasks.mjs is the
    // authority on shape; this is a second line of defense, not the gate).
    if (task.type !== 'task') continue
    const active = []   // deps still pending/in_progress → blocks
    // deps missing or terminal-but-not-completed (failed/cancelled/deferred) → needs attention
    const stalled = []

    for (const depId of task.deps ?? []) {
      const dep = byId.get(depId)
      if (!dep) stalled.push(`${depId} (missing)`)
      else if (dep.status === 'completed') continue
      else if (dep.status === 'pending' || dep.status === 'in_progress') active.push(depId)
      else stalled.push(`${depId} (${dep.status})`)
    }

    if (active.length) blocked.push({ ...task, blockers: active })
    else if (stalled.length) needsAttention.push({ ...task, reason: stalled.join(', ') })
    else ready.push(task)
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
 * @returns {object}
 */
export function computeStats (tasks, staleDays = 30, now = new Date()) {
  const byStatus = tally(VALID_STATUSES)
  const byPriority = tally(VALID_PRIORITIES)
  const byType = tally(VALID_TYPES)
  const stale = []
  const malformedDates = []
  const cutoff = now.getTime() - staleDays * 86_400_000

  for (const t of tasks) {
    // `in` is safe here: tally() objects are null-prototype, so a junk value
    // like `toString` cannot reach Object.prototype.
    if (t.status in byStatus) byStatus[t.status]++
    const p = t.priority ?? 'medium'
    if (p in byPriority) byPriority[p]++
    // No `?? 'task'` default here — mirrors computeReady's deliberate non-
    // assumption for malformed (type-less) input: `undefined in byType` is
    // false, so a type-less item is simply untallied, not misclassified.
    const ty = t.type
    if (ty in byType) byType[ty]++
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
 * Load and globalize tasks from every `tasks-<slug>.yml` under a backlog dir.
 * Bare dep/parent ids are namespaced to their slug; `slug/id` deps pass through.
 *
 * @param {string} backlogDir
 * @returns {Promise<LoadedTask[]>}
 */
export async function loadTasks (backlogDir) {
  const tasksDir = join(backlogDir, 'tasks')
  if (!existsSync(tasksDir)) return []
  const names = await readdir(tasksDir)
  const files = names.filter(f => /^tasks-.+\.ya?ml$/.test(f))
  /** @type {LoadedTask[]} */
  const all = []
  for (const file of files) {
    const slug = file.replace(/^tasks-/, '').replace(/\.ya?ml$/, '')
    const raw = await readFile(join(tasksDir, file), 'utf8')
    const doc = /** @type {any} */ (yaml.load(raw))
    const list = doc?.tasks
    if (!isNil(list) && !Array.isArray(list)) {
      stderr.write(`ready-walker: ${file}: "tasks" is not a list — skipping file (run validate-tasks)\n`)
      continue
    }
    for (const t of list ?? []) {
      if (isNil(t) || typeof t !== 'object' || isNil(t.id)) {
        stderr.write(`ready-walker: ${file}: a task entry has no id — skipping it (run validate-tasks)\n`)
        continue
      }
      all.push({ ...t, id: nsId(t.id, slug), deps: safeDeps(t.deps, slug, file, t.id), _slug: slug, _file: file })
    }
  }
  return all
}

/**
 * Render one task as a human-readable line.
 *
 * @param {Task} t
 * @returns {string}
 */
const line = (t) => `  ${t.id}  [${t.priority ?? 'medium'}] ${t.title ?? ''}`.trimEnd()

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
function formatStats (s) {
  const lines = [
    `total ${s.total}  ready ${s.ready}  blocked ${s.blocked}  stale ${s.stale.length}`,
    `status: ${tallyRow(s.byStatus)}`,
    `priority: ${tallyRow(s.byPriority)}`,
    `type: ${tallyRow(s.byType)}`,
  ]
  if (s.malformedDates.length) lines.push(`! malformed updated dates: ${s.malformedDates.join(' ')}`)
  return lines.join('\n') + '\n'
}

/** CLI entry. */
async function main () {
  const args = argv.slice(2)
  const has = (/** @type {string} */ flag) => args.includes(flag)
  const opt = (/** @type {string} */ flag, /** @type {string} */ fallback) => {
    const i = args.indexOf(flag)
    return i !== -1 && args[i + 1] ? args[i + 1] : fallback
  }
  // Parse a non-negative-integer flag, exiting loudly on bad input (no silent NaN).
  const numOpt = (/** @type {string} */ flag, /** @type {number} */ fallback) => {
    const raw = opt(flag, '')
    if (raw === '') return fallback
    const n = Number(raw)
    if (!Number.isFinite(n) || n < 0) { console.error(`error: ${flag} requires a non-negative number (got ${JSON.stringify(raw)})`); exit(1) }
    return Math.trunc(n)
  }
  const json = opt('--format', '') === 'json'
  const root = env.TASKS_ROOT ?? new URL('..', import.meta.url).pathname.replace(/\/$/, '')
  const backlogDir = join(root, 'backlog')
  if (!existsSync(backlogDir)) stderr.write(`ready-walker: no backlog/ under ${root} — is this the project root? (set TASKS_ROOT to override)\n`)
  const tasks = await loadTasks(backlogDir)

  if (has('--stats')) {
    const stats = computeStats(tasks, numOpt('--days', 30))
    stdout.write(json ? JSON.stringify(stats, undefined, 2) + '\n' : formatStats(stats))
    return
  }
  if (has('--stale')) {
    const { stale } = computeStats(tasks, numOpt('--days', 30))
    stdout.write(json ? JSON.stringify({ stale }, undefined, 2) + '\n' : (stale.length ? stale.map(id => `  ${id}`).join('\n') : '  (none)') + '\n')
    return
  }
  if (has('--filter')) {
    const status = opt('--filter', '')
    if (!VALID_STATUSES.has(status)) { console.error(`error: --filter requires one of: ${[...VALID_STATUSES].join(', ')}`); exit(1) }
    const filtered = tasks.filter(t => t.status === status)
    stdout.write(json ? JSON.stringify(filtered.map(t => strip(t)), undefined, 2) + '\n' : filtered.map(t => line(t)).join('\n') + '\n')
    return
  }

  const result = computeReady(tasks)
  // An empty ready queue with blocked tasks is ambiguous: all-claimed, or a cycle.
  const ambiguous = result.ready.length === 0 && result.blocked.length > 0
  if (ambiguous) stderr.write(`ready-walker: 0 ready, ${result.blocked.length} blocked — run validate-tasks.mjs to check for a dependency cycle\n`)
  if (has('--strict') && (result.needsAttention.length || ambiguous)) exit(1)

  if (json) {
    const payload = {
      ready: result.ready.map(t => strip(t)),
      blocked: result.blocked.map(t => strip(t)),
      needsAttention: result.needsAttention.map(t => strip(t)),
      ...(ambiguous ? { hint: 'possible dependency cycle — run validate-tasks.mjs' } : {}),
    }
    stdout.write(JSON.stringify(payload, undefined, 2) + '\n')
    return
  }

  const lines = has('--blocked')
    ? result.blocked.map(t => `${line(t)}  ← blocked by ${t.blockers.join(', ')}`)
    : (result.ready.length ? result.ready.map(t => line(t)) : ['  (no ready tasks)'])
  lines.push(...result.needsAttention.map(t => `${line(t)}  ! needs attention: ${t.reason}`))
  stdout.write(lines.join('\n') + '\n')
}

if (argv[1] && fileURLToPath(import.meta.url) === argv[1]) {
  main().catch(err => { console.error(err); exit(1) })
}
