/**
 * bootstrap-tasks.mjs — the one-shot bd → flat-YAML migrator (vp-beads-bj7).
 *
 * The write-half the read-only spike (`migrate-from-bd.mjs`) deliberately isn't.
 * Reads a `bd export` JSONL snapshot and evacuates the LIVE issues (everything
 * not `closed`) into the real substrate:
 *
 *   backlog/tasks/tasks-migration.yml   the migration epic (l9i) + its children
 *   backlog/tasks/tasks-backlog.yml     every other live task
 *   backlog/decisions/<id>.md           decision-type issues (prose has no YAML home)
 *   backlog/_archive/bd-final-export.jsonl   the full snapshot (ALL statuses) — the
 *                                            only git-tracked survivor of bd history,
 *                                            since `.beads/` is gitignored.
 *
 * This is a BOOTSTRAP, not an ongoing tool: it runs once, its output is then
 * hand-maintained with Edit/Write (substrate-not-opinion — no CRUD helper), and
 * the script is retired to backlog/_archive/ afterwards. It reuses the spike's
 * maps (STATUS_MAP/TYPE_MAP/PRIORITY_MAP) as the single source of truth but
 * implements its own projection because it does MORE than the dogfood:
 *
 *   - `deferred` is preserved as `deferred` (the schema now has the status);
 *     the spike approximated it to `cancelled`.
 *   - `## Acceptance Criteria` bullets are extracted into `acceptance_criteria`;
 *     the rest of each body is preserved as `description` (lossless — the terse
 *     schema has no body field, but validate-tasks tolerates the extra key and
 *     ready-walker ignores it; groom later if the terse model is preferred).
 *   - a `blocks` dep whose target is not in the live set is DROPPED: a closed
 *     blocker is already satisfied (bd stops blocking on it), so keeping the dep
 *     would dangle. Dropped deps are reported, and the full original edge lives
 *     in the archive JSONL.
 *
 * Usage:
 *   bd export -o /tmp/bd-export.jsonl
 *   node scripts/bootstrap-tasks.mjs /tmp/bd-export.jsonl
 */

import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  copyFileSync, mkdirSync, readFileSync, writeFileSync,
} from 'node:fs'
import {
  argv, exit, stderr, stdout,
} from 'node:process'

import yaml from 'js-yaml'

import { PRIORITY_MAP, STATUS_MAP, TYPE_MAP } from './migrate-from-bd.mjs'
import { VALID_TYPES } from './task-schema.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** The migration epic — its family lands in one slug, everything else in another. */
const MIGRATION_EPIC = 'vp-beads-l9i'

/**
 * Split a bd markdown body into extracted acceptance criteria and the remaining
 * description. The AC section runs from a `## Acceptance Criteria` heading to the
 * next `##` heading (or EOF); its bullet lines become the list, and the body with
 * that whole section excised becomes the description.
 *
 * @param {string} body
 * @returns {{ description: string, acceptanceCriteria: string[] }}
 */
function splitBody (body) {
  // A handful of bd issues stored their body with literal backslash-n instead of
  // real newlines (a create-time escaping artifact) — normalize so the heading
  // becomes line-anchored and the description doesn't render as `\n` gibberish.
  const lines = (body ?? '').replaceAll('\\n', '\n').split('\n')
  const acIdx = lines.findIndex(l => /^##\s+Acceptance Criteria\s*$/i.test(l))
  if (acIdx === -1) return { description: lines.join('\n').trim(), acceptanceCriteria: [] }

  let end = lines.length
  for (let i = acIdx + 1; i < lines.length; i++) {
    if (/^##\s+/.test(lines[i])) { end = i; break }
  }
  const acceptanceCriteria = lines
    .slice(acIdx + 1, end)
    .filter(l => /^\s*(?:[-*]|\d+\.)\s+/.test(l))
    // strip the bullet, then an optional `[ ]`/`[x]` task-list checkbox marker
    .map(l => l.replace(/^\s*(?:[-*]|\d+\.)\s+/, '').replace(/^\[[ x]\]\s*/i, '').trim())
    .filter(Boolean)

  const description = [...lines.slice(0, acIdx), ...lines.slice(end)].join('\n').trim()
  return { description, acceptanceCriteria }
}

/**
 * Project one live bd issue into a flat-YAML task record.
 *
 * @param {object} r          a parsed bd issue
 * @param {Set<string>} liveIds   ids of every issue being migrated
 * @param {string[]} droppedDeps  accumulator for satisfied (non-live) blocks-deps
 * @returns {object} the task record
 */
function projectLive (r, liveIds, droppedDeps) {
  const status = r.status === 'deferred' ? 'deferred' : STATUS_MAP[r.status]
  const mapped = TYPE_MAP[r.issue_type]
  if (!VALID_TYPES.has(mapped.type)) throw new Error(`bad type map for ${r.id}: ${r.issue_type}`)

  const labels = [...(Array.isArray(r.labels) ? r.labels : []), ...(mapped.label ? [mapped.label] : [])]

  const deps = []
  let parent
  for (const d of r.dependencies ?? []) {
    if (d.type === 'blocks') {
      if (liveIds.has(d.depends_on_id)) deps.push(d.depends_on_id)
      else droppedDeps.push(`${r.id} → ${d.depends_on_id} (satisfied: blocker not live)`)
    } else if (d.type === 'parent-child') {
      parent = d.depends_on_id
    }
  }

  const { acceptanceCriteria, description } = splitBody(r.description)

  const task = { id: r.id, title: r.title, status, type: mapped.type, priority: PRIORITY_MAP[r.priority] ?? 'medium' }
  if (labels.length) task.labels = labels
  if (parent) task.parent = parent
  if (deps.length) task.deps = deps
  if (acceptanceCriteria.length) task.acceptance_criteria = acceptanceCriteria
  if (description) task.description = description
  if (r.updated_at) task.updated = r.updated_at.slice(0, 10)
  return task
}

/**
 * Serialize a tasks file with a stable, diff-friendly key order.
 *
 * @param {string} slug
 * @param {string} title
 * @param {object[]} tasks
 * @returns {string}
 */
function dumpTasks (slug, title, tasks) {
  const ordered = tasks.toSorted((a, b) => a.id.localeCompare(b.id))
  return yaml.dump({ meta: { slug, title }, tasks: ordered }, { lineWidth: 100, noRefs: true })
}

/**
 * Serialize a decision to frontmatter'd markdown (its prose has no YAML home).
 *
 * @param {object} task
 * @param {string} body
 * @returns {string}
 */
function dumpDecision (task, body) {
  const { description, ...front } = task
  const fm = yaml.dump(front, { lineWidth: 100, noRefs: true }).trimEnd()
  return `---\n${fm}\n---\n\n${(body ?? '').trim()}\n`
}

function write (relPath, content) {
  const abs = resolve(ROOT, relPath)
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, content)
  return relPath
}

// --- CLI -------------------------------------------------------------------

if (argv[1] && fileURLToPath(import.meta.url) === argv[1]) {
  const [inputPath] = argv.slice(2)
  if (!inputPath) {
    stderr.write('usage: node scripts/bootstrap-tasks.mjs <bd-export.jsonl>\n')
    exit(1)
  }

  const raw = readFileSync(inputPath, 'utf8')
  const records = raw.split('\n').filter(Boolean).map(l => JSON.parse(l)).filter(r => r._type === 'issue')

  // Archive the FULL snapshot first — the only git-tracked survivor of bd history.
  mkdirSync(resolve(ROOT, 'backlog/_archive'), { recursive: true })
  copyFileSync(resolve(inputPath), resolve(ROOT, 'backlog/_archive/bd-final-export.jsonl'))

  const live = records.filter(r => r.status !== 'closed')
  const liveIds = new Set(live.map(r => r.id))
  const droppedDeps = []

  const migration = []
  const backlog = []
  const decisions = []
  for (const r of live) {
    const task = projectLive(r, liveIds, droppedDeps)
    if (task.type === 'decision') {
      decisions.push({ task, body: r.description })
    } else if (task.id === MIGRATION_EPIC || task.parent === MIGRATION_EPIC) {
      migration.push(task)
    } else {
      backlog.push(task)
    }
  }

  const written = [
    write('backlog/tasks/tasks-migration.yml', dumpTasks('migration', 'Tracker migration off bd (epic vp-beads-l9i)', migration)),
    write('backlog/tasks/tasks-backlog.yml', dumpTasks('backlog', 'Standalone backlog (non-epic live work)', backlog)),
    ...decisions.map(({ body, task }) => write(`backlog/decisions/${task.id}.md`, dumpDecision(task, body))),
  ]

  stdout.write(`migrated ${live.length} live issues (of ${records.length} total):\n`)
  stdout.write(`  ${migration.length} → tasks-migration.yml · ${backlog.length} → tasks-backlog.yml · ${decisions.length} → backlog/decisions/\n`)
  stdout.write('  archived full snapshot → backlog/_archive/bd-final-export.jsonl\n')
  if (droppedDeps.length) {
    stdout.write(`  dropped ${droppedDeps.length} satisfied (closed-blocker) deps:\n`)
    for (const d of droppedDeps) stdout.write(`    - ${d}\n`)
  }
  stdout.write(`written:\n${written.map(w => `  ${w}`).join('\n')}\n`)
}
