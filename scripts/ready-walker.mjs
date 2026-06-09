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
 * Ready rule: a task is READY iff `status: pending` and every dep is
 * `completed`; BLOCKED if any dep is pending/in_progress; NEEDS_ATTENTION if a
 * dep is failed/cancelled/missing. (Mirrors beads: only the analog of `blocks`
 * affects readiness; the graph is recomputed, never enforced — see
 * validate-tasks.mjs for the integrity gate.)
 */

import { existsSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { argv, exit, stdout } from 'node:process'
import { fileURLToPath } from 'node:url'

import yaml from 'js-yaml'

export const VALID_STATUSES = new Set(['pending', 'in_progress', 'completed', 'failed', 'cancelled'])
export const VALID_TYPES = new Set(['task', 'bug', 'feature', 'chore', 'epic', 'decision', 'spike', 'story', 'milestone'])
export const VALID_PRIORITIES = new Set(['critical', 'high', 'medium', 'low', 'backlog'])

const PRIORITY_RANK = { critical: 0, high: 1, medium: 2, low: 3, backlog: 4 }

/**
 * @typedef {object} Task
 * @property {string} id          globally-unique id (loader prefixes with slug)
 * @property {string} [title]
 * @property {string} status
 * @property {string} [priority]
 * @property {string} [type]
 * @property {string[]} [deps]    resolvable ids in the same namespace
 * @property {string} [agent]
 * @property {string} [updated]   ISO date
 */

/**
 * Namespace a bare id to its file's slug (`slug/id`); pass through slugged ids.
 *
 * @param {string} id
 * @param {string} slug
 * @returns {string}
 */
const nsId = (id, slug) => String(id).includes('/') ? String(id) : `${slug}/${id}`

/**
 * Build a zero-filled tally object keyed by a set of allowed values.
 *
 * @param {Set<string>} keys
 * @returns {Record<string, number>}
 */
const tally = (keys) => Object.fromEntries([...keys].map(k => [k, 0]))

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
    const active = []   // deps still pending/in_progress → blocks
    const stalled = []  // deps failed/cancelled/missing → needs attention

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
  const cutoff = now.getTime() - staleDays * 86_400_000

  for (const t of tasks) {
    if (t.status in byStatus) byStatus[t.status]++
    const p = t.priority ?? 'medium'
    if (p in byPriority) byPriority[p]++
    const ty = t.type ?? 'task'
    if (ty in byType) byType[ty]++
    if (t.status === 'in_progress' && t.updated && Date.parse(t.updated) < cutoff) stale.push(t.id)
  }

  const { blocked, ready } = computeReady(tasks)
  return { total: tasks.length, ready: ready.length, blocked: blocked.length, stale, byStatus, byPriority, byType }
}

/**
 * Load and globalize tasks from every `tasks-<slug>.yml` under a backlog dir.
 * Bare dep/parent ids are namespaced to their slug; `slug/id` deps pass through.
 *
 * @param {string} backlogDir
 * @returns {Promise<Task[]>}
 */
export async function loadTasks (backlogDir) {
  const tasksDir = join(backlogDir, 'tasks')
  if (!existsSync(tasksDir)) return []
  const names = await readdir(tasksDir)
  const files = names.filter(f => /^tasks-.+\.ya?ml$/.test(f))
  /** @type {Task[]} */
  const all = []
  for (const file of files) {
    const slug = file.replace(/^tasks-/, '').replace(/\.ya?ml$/, '')
    const raw = await readFile(join(tasksDir, file), 'utf8')
    const doc = /** @type {any} */ (yaml.load(raw))
    for (const t of doc?.tasks ?? []) {
      all.push({ ...t, id: nsId(t.id, slug), deps: (t.deps ?? []).map(d => nsId(d, slug)), _slug: slug, _file: file })
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
  return [
    `total ${s.total}  ready ${s.ready}  blocked ${s.blocked}  stale ${s.stale.length}`,
    `status: ${tallyRow(s.byStatus)}`,
    `priority: ${tallyRow(s.byPriority)}`,
    `type: ${tallyRow(s.byType)}`,
  ].join('\n') + '\n'
}

/** CLI entry. */
async function main () {
  const args = argv.slice(2)
  const has = (/** @type {string} */ flag) => args.includes(flag)
  const opt = (/** @type {string} */ flag, /** @type {string} */ fallback) => {
    const i = args.indexOf(flag)
    return i !== -1 && args[i + 1] ? args[i + 1] : fallback
  }
  const json = opt('--format', '') === 'json'
  const root = new URL('..', import.meta.url).pathname.replace(/\/$/, '')
  const tasks = await loadTasks(join(root, 'backlog'))

  if (has('--stats')) {
    const stats = computeStats(tasks, Number(opt('--days', '30')))
    stdout.write(json ? JSON.stringify(stats, undefined, 2) + '\n' : formatStats(stats))
    return
  }
  if (has('--stale')) {
    const { stale } = computeStats(tasks, Number(opt('--days', '30')))
    stdout.write(json ? JSON.stringify({ stale }, undefined, 2) + '\n' : stale.map(id => `  ${id}`).join('\n') + '\n')
    return
  }
  if (has('--filter')) {
    const status = opt('--filter', 'pending')
    const filtered = tasks.filter(t => t.status === status)
    stdout.write(json ? JSON.stringify(filtered, undefined, 2) + '\n' : filtered.map(t => line(t)).join('\n') + '\n')
    return
  }

  const result = computeReady(tasks)
  if (json) { stdout.write(JSON.stringify(result, undefined, 2) + '\n'); return }
  if (has('--blocked')) {
    stdout.write(result.blocked.map(t => `${line(t)}  ← blocked by ${t.blockers.join(', ')}`).join('\n') + '\n')
    return
  }
  stdout.write((result.ready.length ? result.ready.map(t => line(t)).join('\n') : '  (no ready tasks)') + '\n')
}

if (argv[1] && fileURLToPath(import.meta.url) === argv[1]) {
  main().catch(err => { console.error(err); exit(1) })
}
