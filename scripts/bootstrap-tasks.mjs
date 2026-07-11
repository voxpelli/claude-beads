/**
 * bootstrap-tasks.mjs — the bd → flat-YAML migrator.
 *
 * The write-half the read-only spike (`migrate-from-bd.mjs`) deliberately isn't.
 * Reads a `bd export` JSONL snapshot and evacuates the LIVE issues (everything
 * not `closed`) into the real substrate, under `--root`:
 *
 *   <root>/.diarie/tasks/tasks-<slug>.yml     live tasks, grouped (see --epic)
 *   <root>/.diarie/decisions/<id>.md          decision-type issues (prose has no YAML home)
 *   <root>/.diarie/_archive/bd-final-export.jsonl   the full snapshot (ALL statuses) — the
 *                                            only git-tracked survivor of bd history,
 *                                            since `.beads/` is gitignored.
 *
 * ORIGINALLY a vp-beads one-shot (it hardcoded this repo's migration epic and
 * its two slugs). It was generalized so `/migrate-tracker` can run it against
 * ANY bd repo — vp-knowledge and vp-git hit the same beads 1.1.0 write-break.
 * That reverses vp-beads-bj7's "retire it to _archive/ after one run" decision:
 * a tool other repos depend on earns kept test coverage (see
 * `scripts/check-bootstrap-tasks.mjs`), because its failure mode is SILENT
 * DATA LOSS, not a crash. It is still a bootstrap, not a CRUD tool — ongoing
 * writes stay plain Edit/Write (substrate-not-opinion).
 *
 * What it does beyond the spike, each learned the hard way:
 *
 *   - `deferred` is preserved as `deferred` (the schema has the status); the
 *     spike approximated it to `cancelled`.
 *   - `## Acceptance Criteria` bullets are extracted into `acceptance_criteria`;
 *     the rest of each body is preserved as `description` (lossless — the terse
 *     schema has no body field, but validate-tasks tolerates the extra key and
 *     ready-walker ignores it; groom later if the terse model is preferred).
 *   - Some bd bodies store literal backslash-n instead of real newlines, which
 *     un-anchors the `## Acceptance Criteria` heading and SILENTLY drops the
 *     criteria. Normalized before parsing.
 *   - An edge whose target is not in the live set is DROPPED, not dangled — a
 *     closed blocker is already satisfied, and a closed parent is history. Both
 *     are reported; the original edges live on in the archive JSONL.
 *
 * Usage:
 *   bd export -o /tmp/bd-export.jsonl
 *   node scripts/bootstrap-tasks.mjs /tmp/bd-export.jsonl \
 *     --epic vp-beads-l9i=migration \
 *     --title migration='Tracker migration off bd (epic vp-beads-l9i)' \
 *     --default-slug backlog \
 *     --title backlog='Standalone backlog (non-epic live work)'
 *
 * Dry-run: point `--root` at a scratch dir and diff before writing for real.
 */

import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import {
  copyFileSync, mkdirSync, readFileSync, writeFileSync,
} from 'node:fs'
import {
  argv, exit, stderr, stdout,
} from 'node:process'

import yaml from 'js-yaml'

import { PRIORITY_MAP, STATUS_MAP, TYPE_MAP } from './migrate-from-bd.mjs'
import { TRACKER_DIR, VALID_TYPES } from './task-schema.mjs'

/** A slug becomes a `tasks-<slug>.yml` filename — keep it filesystem-plain. */
const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/

/**
 * Split a bd markdown body into extracted acceptance criteria and the remaining
 * description. The AC section runs from a `## Acceptance Criteria` heading to the
 * next `##` heading (or EOF); its bullet lines become the list, and the body with
 * that whole section excised becomes the description.
 *
 * @param {string} body
 * @returns {{ description: string, acceptanceCriteria: string[] }}
 */
export function splitBody (body) {
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
 * Edges to non-live (closed) issues are dropped rather than carried: a closed
 * blocker is already satisfied, and a closed parent is history. Carrying either
 * would dangle and fail `validate-tasks`.
 *
 * @param {any} r a parsed bd issue
 * @param {Set<string>} liveIds ids of every issue being migrated
 * @param {string[]} droppedEdges accumulator for dropped (non-live) edges
 * @returns {any} the task record
 */
export function projectLive (r, liveIds, droppedEdges) {
  const status = r.status === 'deferred' ? 'deferred' : STATUS_MAP[r.status]
  const mapped = TYPE_MAP[r.issue_type]
  if (!mapped || !VALID_TYPES.has(mapped.type)) {
    throw new Error(`bad type map for ${r.id}: ${r.issue_type}`)
  }

  const labels = [...(Array.isArray(r.labels) ? r.labels : []), ...(mapped.label ? [mapped.label] : [])]

  const deps = []
  let parent
  for (const d of r.dependencies ?? []) {
    const live = liveIds.has(d.depends_on_id)
    if (d.type === 'blocks') {
      if (live) deps.push(d.depends_on_id)
      else droppedEdges.push(`${r.id} → ${d.depends_on_id} (blocks; satisfied: blocker not live)`)
    } else if (d.type === 'parent-child') {
      if (live) parent = d.depends_on_id
      else droppedEdges.push(`${r.id} → ${d.depends_on_id} (parent; dropped: epic not live)`)
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
 * Route each task to a slug. A task lands in an epic's slug if it IS that epic
 * or descends from it (transitively — a grandchild follows its grandparent);
 * everything else falls to `defaultSlug`.
 *
 * @param {any[]} tasks projected live tasks (decisions already removed)
 * @param {Map<string, string>} epicSlugs epic id → slug
 * @param {string} defaultSlug
 * @returns {Map<string, any[]>} slug → tasks
 */
export function groupTasks (tasks, epicSlugs, defaultSlug) {
  const byId = new Map(tasks.map(t => [t.id, t]))

  /**
   * Walk up the parent chain to the first id with an explicit slug.
   *
   * @param {any} task
   * @returns {string} the slug it routes to
   */
  const slugFor = (task) => {
    const seen = new Set()
    let cur = task
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id) // a parent cycle would otherwise spin here
      const slug = epicSlugs.get(cur.id)
      if (slug) return slug
      cur = cur.parent ? byId.get(cur.parent) : undefined
    }
    return defaultSlug
  }

  /** @type {Map<string, any[]>} */
  const grouped = new Map([[defaultSlug, []], ...[...epicSlugs.values()].map(s => /** @type {[string, any[]]} */ ([s, []]))])
  for (const task of tasks) {
    const slug = slugFor(task)
    grouped.get(slug)?.push(task)
  }
  return grouped
}

/**
 * Serialize a tasks file with a stable, diff-friendly key order.
 *
 * @param {string} slug
 * @param {string} title
 * @param {any[]} tasks
 * @returns {string}
 */
function dumpTasks (slug, title, tasks) {
  const ordered = tasks.toSorted((a, b) => a.id.localeCompare(b.id))
  return yaml.dump({ meta: { slug, title }, tasks: ordered }, { lineWidth: 100, noRefs: true })
}

/**
 * Serialize a decision to frontmatter'd markdown (its prose has no YAML home).
 *
 * @param {any} task
 * @param {string} body
 * @returns {string}
 */
function dumpDecision (task, body) {
  const { description, ...front } = task
  const fm = yaml.dump(front, { lineWidth: 100, noRefs: true }).trimEnd()
  return `---\n${fm}\n---\n\n${(body ?? '').trim()}\n`
}

/**
 * Parse repeatable `key=value` flags (`--epic id=slug`, `--title slug=text`).
 *
 * @param {string[]} pairs
 * @param {string} flag flag name, for the error message
 * @returns {Map<string, string>}
 */
function parsePairs (pairs, flag) {
  const map = new Map()
  for (const pair of pairs) {
    const at = pair.indexOf('=')
    if (at < 1 || at === pair.length - 1) {
      stderr.write(`--${flag} expects <key>=<value>, got: ${pair}\n`)
      exit(1)
    }
    map.set(pair.slice(0, at), pair.slice(at + 1))
  }
  return map
}

// --- CLI -------------------------------------------------------------------

if (argv[1] && fileURLToPath(import.meta.url) === argv[1]) {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      root: { type: 'string' },
      epic: { type: 'string', multiple: true, 'default': [] },
      'default-slug': { type: 'string', 'default': 'backlog' },
      title: { type: 'string', multiple: true, 'default': [] },
    },
  })

  const [inputPath] = positionals
  if (!inputPath) {
    stderr.write(
      'usage: node scripts/bootstrap-tasks.mjs <bd-export.jsonl> [options]\n' +
      '  --root <dir>            project root to write into (default: this repo)\n' +
      '  --epic <id>=<slug>      route an epic + its descendants to tasks-<slug>.yml (repeatable)\n' +
      '  --default-slug <slug>   everything else (default: backlog)\n' +
      '  --title <slug>=<title>  meta.title for a slug (repeatable)\n'
    )
    exit(1)
  }

  const root = resolve(values.root ?? resolve(dirname(fileURLToPath(import.meta.url)), '..'))
  const epicSlugs = parsePairs(values.epic, 'epic')
  const titles = parsePairs(values.title, 'title')
  const defaultSlug = values['default-slug']

  for (const slug of [...epicSlugs.values(), defaultSlug]) {
    if (!SLUG_RE.test(slug)) {
      stderr.write(`invalid slug "${slug}" — must match ${SLUG_RE} (it becomes tasks-<slug>.yml)\n`)
      exit(1)
    }
  }

  const write = (/** @type {string} */ relPath, /** @type {string} */ content) => {
    const abs = resolve(root, relPath)
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, content)
    return relPath
  }

  const raw = readFileSync(inputPath, 'utf8')
  const records = raw.split('\n').filter(Boolean).map(l => JSON.parse(l)).filter(r => r._type === 'issue')

  // Archive the FULL snapshot first — the only git-tracked survivor of bd history.
  mkdirSync(resolve(root, `${TRACKER_DIR}/_archive`), { recursive: true })
  copyFileSync(resolve(inputPath), resolve(root, `${TRACKER_DIR}/_archive/bd-final-export.jsonl`))

  const live = records.filter(r => r.status !== 'closed')
  const liveIds = new Set(live.map(r => r.id))
  /** @type {string[]} */
  const droppedEdges = []

  for (const epicId of epicSlugs.keys()) {
    if (!liveIds.has(epicId)) stderr.write(`warning: --epic ${epicId} is not a live issue — its slug will be empty\n`)
  }

  const tasks = []
  const decisions = []
  for (const r of live) {
    const task = projectLive(r, liveIds, droppedEdges)
    if (task.type === 'decision') decisions.push({ task, body: r.description })
    else tasks.push(task)
  }

  const grouped = groupTasks(tasks, epicSlugs, defaultSlug)

  const written = [
    ...[...grouped].map(([slug, slugTasks]) => write(
      `${TRACKER_DIR}/tasks/tasks-${slug}.yml`,
      dumpTasks(slug, titles.get(slug) ?? `Live work migrated from bd (${slug})`, slugTasks)
    )),
    ...decisions.map(({ body, task }) => write(`${TRACKER_DIR}/decisions/${task.id}.md`, dumpDecision(task, body))),
  ]

  stdout.write(`migrated ${live.length} live issues (of ${records.length} total):\n`)
  const tally = [...grouped].map(([slug, t]) => `${t.length} → tasks-${slug}.yml`).join(' · ')
  stdout.write(`  ${tally} · ${decisions.length} → ${TRACKER_DIR}/decisions/\n`)
  stdout.write(`  archived full snapshot → ${TRACKER_DIR}/_archive/bd-final-export.jsonl\n`)
  if (droppedEdges.length) {
    stdout.write(`  dropped ${droppedEdges.length} edge(s) to non-live issues:\n`)
    for (const d of droppedEdges) stdout.write(`    - ${d}\n`)
  }
  stdout.write(`written:\n${written.map(w => `  ${w}`).join('\n')}\n`)
}
