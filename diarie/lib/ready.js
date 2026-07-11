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
 *
 * TEMPORARY: the `main()` at the bottom keeps `node diarie/lib/ready.js` runnable
 * so `npm run check` stays green across the move. Stage 2 replaces it with
 * `diarie ready` and deletes it. It is not the CLI; it is scaffolding.
 */

import { fileURLToPath } from 'node:url'
import {
  argv, exit, stderr, stdout,
} from 'node:process'

import {
  PRIORITY_RANK, VALID_PRIORITIES, VALID_STATUSES, VALID_TYPES,
} from './schema.js'
import { loadTasks, NoStoreError, resolveRoot } from './store.js'

/** @typedef {import('./store.js').Task} Task */
/** @typedef {import('./store.js').LoadedTask} LoadedTask */

/**
 * Drop loader-only provenance fields before serializing to JSON.
 *
 * @param {LoadedTask} t
 * @returns {Task}
 */
const strip = ({ _file, _slug, ...task }) => task

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
 * Compute ready / blocked / needs-attention partitions over a flat task list.
 *
 * @param {Task[]} tasks
 * @returns {{ ready: Task[], blocked: Array<Task & { blockers: string[] }>, needsAttention: Array<Task & { reason: string }> }}
 */
export function computeReady (tasks) {
  const byId = new Map(tasks.map(t => [t.id, t]))
  /** @type {Task[]} */
  const ready = []
  /** @type {Array<Task & { blockers: string[] }>} */
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

/**
 * TEMPORARY CLI entry — replaced by `diarie ready` in Stage 2. See the file
 * header. Kept only so `npm run check` stays green across the move.
 */
async function main () {
  const args = argv.slice(2)
  const has = (/** @type {string} */ flag) => args.includes(flag)
  const opt = (/** @type {string} */ flag, /** @type {string} */ fallback) => {
    const i = args.indexOf(flag)
    return i !== -1 && args[i + 1] ? args[i + 1] : fallback
  }
  const numOpt = (/** @type {string} */ flag, /** @type {number} */ fallback) => {
    const raw = opt(flag, '')
    if (raw === '') return fallback
    const n = Number(raw)
    if (!Number.isFinite(n) || n < 0) { stderr.write(`error: ${flag} requires a non-negative number (got ${JSON.stringify(raw)})\n`); exit(1) }
    return Math.trunc(n)
  }
  const json = opt('--format', '') === 'json' || has('--json')

  /** @type {string} */
  let root
  try {
    root = resolveRoot({ root: opt('--root', '') || undefined })
  } catch (err) {
    // A missing store is an ERROR, not an empty backlog. It goes to stdout under
    // --json and carries a non-zero exit, because stderr is the stream every
    // caller discards — which is precisely how this defect survived so long.
    if (err instanceof NoStoreError) {
      if (json) stdout.write(JSON.stringify({ error: err.message, code: err.code }, undefined, 2) + '\n')
      else stderr.write(`diarie: ${err.message}\n`)
      exit(1)
    }
    throw err
  }

  const tasks = await loadTasks(root, msg => stderr.write(`diarie: ${msg}\n`))

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
    if (!VALID_STATUSES.has(/** @type {any} */ (status))) { stderr.write(`error: --filter requires one of: ${[...VALID_STATUSES].join(', ')}\n`); exit(1) }
    const filtered = tasks.filter(t => t.status === status)
    stdout.write(json ? JSON.stringify(filtered.map(t => strip(t)), undefined, 2) + '\n' : filtered.map(t => line(t)).join('\n') + '\n')
    return
  }

  const result = computeReady(tasks)
  // An empty ready queue with blocked tasks is ambiguous: all-claimed, or a cycle.
  const ambiguous = result.ready.length === 0 && result.blocked.length > 0
  if (ambiguous) stderr.write(`diarie: 0 ready, ${result.blocked.length} blocked — run \`diarie validate\` to check for a dependency cycle\n`)
  if (has('--strict') && (result.needsAttention.length || ambiguous)) exit(1)

  if (json) {
    stdout.write(JSON.stringify({
      ready: result.ready.map(t => strip(t)),
      blocked: result.blocked.map(t => strip(t)),
      needsAttention: result.needsAttention.map(t => strip(t)),
      ...(ambiguous ? { hint: 'possible dependency cycle — run `diarie validate`' } : {}),
    }, undefined, 2) + '\n')
    return
  }

  const lines = has('--blocked')
    ? result.blocked.map(t => `${line(t)}  ← blocked by ${t.blockers.join(', ')}`)
    : (result.ready.length ? result.ready.map(t => line(t)) : ['  (no ready tasks)'])
  lines.push(...result.needsAttention.map(t => `${line(t)}  ! needs attention: ${t.reason}`))
  stdout.write(lines.join('\n') + '\n')
}

if (argv[1] && fileURLToPath(import.meta.url) === argv[1]) {
  main().catch(err => { stderr.write(String(err?.stack ?? err) + '\n'); exit(1) })
}
