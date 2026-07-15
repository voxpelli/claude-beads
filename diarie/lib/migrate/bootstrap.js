/**
 * bootstrap.js — the bd → flat-YAML migrator (`diarie migrate`).
 *
 * The write-half the read-only spike (`bd-map.js`) deliberately isn't.
 * Reads a `bd export` JSONL snapshot and evacuates the LIVE issues (everything
 * not `closed`) into the real substrate, under `--root`:
 *
 *   <root>/.diarie/tasks/tasks-<slug>.yml     live tasks, grouped (see --epic)
 *   <root>/.diarie/decisions/<id>.md          decision-type issues (prose has no YAML home)
 *   <root>/.diarie/_archive/bd-final-export.jsonl   the full snapshot (ALL statuses) — the
 *                                            only git-tracked survivor of bd history,
 *                                            since `.beads/` is gitignored.
 *
 * ORIGINALLY a one-shot for a single project (it hardcoded that repo's migration
 * epic and its two slugs). It was generalized to run against ANY bd repo — beads
 * 1.1.0's write-break hit every repo on the global binary at once, so the sibling
 * repos needed the same evacuation. That reverses the original plan to retire it
 * after one run: a tool other repos depend on earns kept test coverage (see
 * `test/migrate.spec.js`), because its failure mode is SILENT
 * DATA LOSS, not a crash. It is still a bootstrap, not a CRUD tool — ongoing
 * writes stay plain hand-edits to the YAML (the substrate ships no CRUD helper, by
 * design).
 *
 * What it does beyond the spike, each learned the hard way:
 *
 *   - `deferred` is preserved as `deferred` (the schema has the status); the
 *     spike approximated it to `cancelled`.
 *   - `## Acceptance Criteria` bullets are extracted into `acceptance_criteria`;
 *     the rest of each body is preserved as `description` (lossless — `validate`
 *     accepts the field and the ready computation ignores it entirely; groom later
 *     if a terser model is preferred).
 *   - Some bd bodies store literal backslash-n instead of real newlines, which
 *     un-anchors the `## Acceptance Criteria` heading and SILENTLY drops the
 *     criteria. Normalized before parsing.
 *   - An edge whose target is not in the live set is DROPPED, not dangled — a
 *     closed blocker is already satisfied, and a closed parent is history. Both
 *     are reported; the original edges live on in the archive JSONL.
 *
 * Two guards, because this now runs against repos that are not this one:
 *
 *   - `--root` defaults to the CURRENT DIRECTORY, never this package's own checkout.
 *     A script-relative default would make a forgotten `--root` clobber the tracker
 *     of whatever tree the installed code sits in, with some other project's issues.
 *   - An existing `tasks-*.yml` store is a HARD STOP (`--force` to override).
 *     The migration is one-way: re-running replays the export over hand-edits.
 *
 * Usage (`<epic-id>` is an id from your own bd export — the epic whose descendants
 * you want routed into their own `tasks-<slug>.yml`):
 *
 *   bd export -o /tmp/bd-export.jsonl
 *   diarie migrate /tmp/bd-export.jsonl --root . \
 *     --epic <epic-id>=migration \
 *     --title migration='Tracker migration off bd' \
 *     --default-slug backlog \
 *     --title backlog='Standalone backlog (non-epic live work)'
 *
 * Dry-run: point `--root` at a scratch dir and diff before writing for real.
 */

import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import {
  copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync,
} from 'node:fs'
import {
  argv, cwd, exit, stderr, stdout,
} from 'node:process'

import { isStringArray } from '@voxpelli/typed-utils'
import yaml from 'js-yaml'

import { InputError } from '../utils/errors.js'
import {
  isNil, TRACKER_DIR, VALID_STATUSES, VALID_TYPES,
} from '../schema.js'
import {
  parseBdExport, PRIORITY_MAP, STATUS_MAP, TYPE_MAP,
} from './bd-map.js'

/** A slug becomes a `tasks-<slug>.yml` filename — keep it filesystem-plain. */
const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/

/**
 * The flags `runMigration` accepts, in ONE place — the parser reads it AND the USAGE-parity
 * test asserts against it, so the two cannot drift (a hand-copied usage string already had).
 *
 * `json` governs ERROR shape only: on failure, `cli.js`'s boundary emits the InputError as JSON
 * on stdout. A SUCCESSFUL migrate always prints its human progress report — there is no
 * machine-readable success payload, because a bootstrap's output is a report, not a queryable result.
 *
 * An EXPLICIT literal type, NOT the wide `ParseArgsConfig['options']`: the wide type is an index
 * signature, which erases the per-key names (`values.root` would fail TS4111) and widens every value
 * to `string | boolean | ... | undefined`. Spelling the keys out — with literal `'string'` and
 * `multiple: true` — is what lets parseArgs infer `values.epic` as `string[]`, `values.root` as
 * `string`, etc., exactly as the old inline literal did. (`@type {const}` is unsupported in this
 * tsc, and `@satisfies` re-widens `multiple: true` to `boolean` via its contextual type.)
 *
 * @type {{
 *   root: { type: 'string' },
 *   epic: { type: 'string', multiple: true, default: string[] },
 *   'default-slug': { type: 'string', default: string },
 *   title: { type: 'string', multiple: true, default: string[] },
 *   force: { type: 'boolean', default: boolean },
 *   json: { type: 'boolean' },
 * }}
 */
export const MIGRATE_OPTIONS = {
  root: { type: 'string' },
  epic: { type: 'string', multiple: true, 'default': [] },
  'default-slug': { type: 'string', 'default': 'backlog' },
  title: { type: 'string', multiple: true, 'default': [] },
  force: { type: 'boolean', 'default': false },
  json: { type: 'boolean' },
}

/**
 * The one canonical usage string. Lives here, beside the parser it describes — NOT in
 * `commands/migrate.js`, which imports it: that module already imports `runMigration` from here,
 * so the reverse dependency would be a cycle. Every flag listed below is a key of MIGRATE_OPTIONS,
 * enforced by a test.
 */
export const USAGE = `Usage: diarie migrate <bd-export.jsonl> [options]

  --root <dir>            project root to write into (default: the current directory)
  --epic <id>=<slug>      route an epic + its descendants to tasks-<slug>.yml (repeatable)
  --default-slug <slug>   everything else (default: backlog)
  --title <slug>=<title>  meta.title for a slug (repeatable)
  --force                 overwrite an existing task store (destroys hand-edits)
  --json                  emit errors as JSON on stdout (success output stays human-readable)

Get the input with:  bd export -o /tmp/bd-export.jsonl

This is a BOOTSTRAP, not a sync. It runs once; afterwards the store is hand-edited
like any other file. An existing store is a hard stop unless you pass --force.`

/**
 * Undo bd's create-time escaping artifact: some issue bodies store a literal
 * backslash-n instead of a real newline.
 *
 * EVERY path that touches a bd body must go through this. It lived inside `splitBody`
 * once, which meant the TASK path was normalized and the DECISION path was not — and a
 * decision is *entirely* prose, so its whole payload rendered as one line of `\n`
 * gibberish. The repo this migrator was written in never saw it: its handful of decisions
 * happened not to carry the escaping artifact, and its one artifact-carrying issue was a
 * task. Only a FOREIGN export would have hit it — which is every export this tool now
 * runs against.
 *
 * @param {string} [body]
 * @returns {string}
 */
export function normalizeBody (body) {
  return (body ?? '').replaceAll('\\n', '\n')
}

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
  // Normalize first, or the `## Acceptance Criteria` heading is never line-anchored and
  // the criteria SILENTLY vanish — a real bug, and a quiet one: the body still migrates,
  // the task still lands, and only its acceptance criteria are gone.
  const lines = normalizeBody(body).split('\n')
  const acIdx = lines.findIndex(l => /^##\s+Acceptance Criteria\s*$/i.test(l))
  if (acIdx === -1) return { description: lines.join('\n').trim(), acceptanceCriteria: [] }

  let end = lines.length
  for (let i = acIdx + 1; i < lines.length; i++) {
    if (/^##\s+/.test(lines[i] ?? '')) { end = i; break }
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
 * would dangle and fail `diarie validate`.
 *
 * @param {import('./bd-map.js').BdIssue} r a parsed bd issue
 * @param {Set<string>} liveIds ids of every issue being migrated
 * @param {string[]} droppedEdges accumulator for dropped (non-live) edges
 * @param {string[]} [priorityDefaulted] accumulator for coerced priorities
 * @param {string[]} [droppedLabels] accumulator for malformed `labels` values
 * @returns {import('../schema.js').TaskRow} the task row (bare ids — the loader namespaces them)
 */
export function projectLive (r, liveIds, droppedEdges, priorityDefaulted = [], droppedLabels = []) {
  // Throw, never fall through: an absent value yields `undefined`, js-yaml then DROPS
  // the key on write, and the result is a task row silently missing a required field —
  // the exact failure mode this migrator exists to avoid. A migrator that loses data
  // quietly is worse than one that stops.
  //
  // Typing `r` as BdIssue instead of `any` is what surfaced the rest of these: `id`,
  // `issue_type` and `depends_on_id` were all dereferenced as if guaranteed. bd's own
  // exports happen to carry them, so only a foreign export would ever have been bitten.
  if (!r.id) throw new Error('bd record with no id — cannot become a task (the schema requires one)')

  const status = r.status === 'deferred' ? 'deferred' : (r.status === undefined ? undefined : STATUS_MAP[r.status])
  if (!status || !VALID_STATUSES.has(status)) {
    throw new Error(`unmapped bd status for ${r.id}: "${r.status}" — add it to STATUS_MAP in bd-map.js`)
  }
  const mapped = r.issue_type === undefined ? undefined : TYPE_MAP[r.issue_type]
  if (!mapped || !VALID_TYPES.has(mapped.type)) {
    throw new Error(`bad type map for ${r.id}: ${r.issue_type}`)
  }

  // isStringArray, not Array.isArray: the latter narrows `unknown` to `any[]`, so a bd
  // export with `labels: [{...}]` would flow straight into `TaskRow.labels: string[]`
  // unchecked. (It fails later, at validate — but a migration that fails at the gate is a
  // migration you have to run twice.)
  // A malformed `labels` is REPORTED, not swallowed. `isStringArray` rejects the whole
  // array if ONE element is a non-string (a bd export with `labels: [{name: 'x'}]`, or a
  // bare scalar), so the good labels go too — and if one of them was `epic`, the migrated
  // repo gets a container that is workable again: an epic, having no dependencies of its
  // own, offered as the next thing to work on instead of the children it contains. That
  // was a real bug here, and losing the label re-creates it in someone else's repo, by the
  // migration itself. The guard turned a type leak into a SILENT one, inside the function
  // whose entire product is a loss report.
  const rawLabels = r.labels
  if (!isNil(rawLabels) && !isStringArray(rawLabels)) {
    droppedLabels.push(`${r.id}: ${JSON.stringify(rawLabels)}`)
  }
  const labels = [...(isStringArray(r.labels) ? r.labels : []), ...(mapped.label ? [mapped.label] : [])]

  /** @type {string[]} */
  const deps = []
  /** @type {string | undefined} */
  let parent
  for (const d of r.dependencies ?? []) {
    // An edge pointing nowhere is not an edge. Report it rather than pushing `undefined`
    // into deps, where it would serialize as a null and dangle at validation.
    if (!d.depends_on_id) { droppedEdges.push(`${r.id} → (no target) (${d.type ?? 'unknown'}; malformed edge)`); continue }
    const live = liveIds.has(d.depends_on_id)
    if (d.type === 'blocks') {
      if (live) deps.push(d.depends_on_id)
      else droppedEdges.push(`${r.id} → ${d.depends_on_id} (blocks; satisfied: blocker not live)`)
    } else if (d.type === 'parent-child') {
      if (live) parent = d.depends_on_id
      else droppedEdges.push(`${r.id} → ${d.depends_on_id} (parent; dropped: epic not live)`)
    } else {
      // bd has edge types beyond `blocks` and `parent-child` (`related`,
      // `discovered-from`, …). They have no analog in the schema, so dropping them is
      // right — dropping them SILENTLY is not. Without this branch the tool that WRITES
      // was strictly less honest than the read-only spike that only previews, which
      // already accumulates them as `untranslatedDepTypes`. The export this was first
      // written against happened to carry none of these edge types — which is exactly why
      // the branch was missing, and exactly why a foreign export needs it.
      droppedEdges.push(`${r.id} → ${d.depends_on_id} (${d.type ?? 'unknown'}; untranslated edge type — no schema analog)`)
    }
  }

  const { acceptanceCriteria, description } = splitBody(r.description ?? '')

  // An unmappable priority is the ONE field here that degrades instead of halting, and
  // that is the right call — `medium` is a defensible default and priority affects only
  // ORDERING, never correctness. But it must still be SAID. Priority is the ready-queue's
  // sort key, so a silent coercion quietly reorders the target repo's backlog, and the
  // read-only spike this migrator replaced already reported it (bd-map.js's
  // `priorityDefaultedIds`) while the shipped tool did not. Report-and-continue is the
  // policy; reporting is not the optional half.
  const priority = PRIORITY_MAP[String(r.priority)]
  if (!priority) priorityDefaulted.push(`${r.id} (bd priority: ${JSON.stringify(r.priority)}) → medium`)

  /** @type {import('../schema.js').TaskRow} */
  const task = {
    id: r.id,
    // Spread-conditional, not `title: r.title`. The reason is tsc, not the validator:
    // `exactOptionalPropertyTypes` forbids assigning `undefined` to an optional property.
    // Runtime behaviour is identical either way — `isNil` rejects a missing title and an
    // explicit `undefined` alike, and js-yaml drops undefined keys on dump. (An earlier
    // version of this comment claimed a present-but-undefined key would "slip through the
    // gate". It would not. Do not restore that claim: it invents a hole in the validator
    // and would tell whoever simplifies this line that they broke a guard that never was.)
    ...(r.title === undefined ? {} : { title: r.title }),
    status,
    type: mapped.type,
    priority: priority ?? 'medium',
  }
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
 * @param {import('../schema.js').TaskRow[]} tasks projected live rows (decisions already removed)
 * @param {Map<string, string>} epicSlugs epic id → slug
 * @param {string} defaultSlug
 * @returns {Map<string, any[]>} slug → tasks
 */
export function groupTasks (tasks, epicSlugs, defaultSlug) {
  const byId = new Map(tasks.map(t => [t.id, t]))

  /**
   * Walk up the parent chain to the first id with an explicit slug.
   *
   * @param {import('../schema.js').TaskRow} task
   * @returns {string} the slug it routes to
   */
  const slugFor = (task) => {
    /** @type {Set<string>} */
    const seen = new Set()
    /** @type {import('../schema.js').TaskRow | undefined} */
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
    const bucket = grouped.get(slug)
    // A `?.push()` here would silently DISCARD a migrated task if this invariant ever
    // broke — in a file whose stated failure mode is silent data loss. Refuse instead.
    if (!bucket) throw new Error(`internal: no bucket for slug "${slug}" — refusing to drop task ${task.id}`)
    bucket.push(task)
  }
  return grouped
}

/**
 * Serialize a tasks file with a stable, diff-friendly key order.
 *
 * @param {string} slug
 * @param {string} title
 * @param {import('../schema.js').TaskRow[]} tasks
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
  // normalizeBody, not the raw body: a decision is ENTIRELY prose, so an unnormalized
  // escaping artifact turns the whole file into one line of `\n` gibberish.
  return `---\n${fm}\n---\n\n${normalizeBody(body).trim()}\n`
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
      throw new InputError(`--${flag} expects <key>=<value>, got: ${pair}`, USAGE, 'EUSAGE')
    }
    map.set(pair.slice(0, at), pair.slice(at + 1))
  }
  return map
}

// --- CLI -------------------------------------------------------------------

/**
 * Run the bd → flat-YAML migration.
 *
 * Exposed as a function so `diarie migrate` can call it directly instead of
 * re-implementing 170 lines of guards that already caught a data-loss bug. The
 * file's own CLI entry (below) is a thin caller of the same thing, which is what
 * keeps this honest: there is one migrator, not a library and a drifting copy.
 *
 * @param {string[]} args  argv after the command name
 * @returns {Promise<void>}
 */
export async function runMigration (args) {
  // parseArgs is strict: an unknown flag throws ERR_PARSE_ARGS_UNKNOWN_OPTION. That is a user
  // mistake, not a bug, so re-throw it as an InputError — otherwise it sails into cli.js's
  // "genuinely unexpected" branch and is answered with a stack trace, the exact defect this row fixes.
  let positionals, values
  try {
    ({ positionals, values } = parseArgs({ args, allowPositionals: true, options: MIGRATE_OPTIONS }))
  } catch (cause) {
    throw new InputError(
      cause instanceof Error ? cause.message : 'bad migrate arguments',
      USAGE, 'EUSAGE',
      { cause: cause instanceof Error ? cause : undefined }
    )
  }

  const [inputPath] = positionals
  if (!inputPath) {
    throw new InputError('migrate needs a bd export file', USAGE, 'EUSAGE')
  }

  // Default to CWD, never to this package's own checkout: the migrator is installed
  // somewhere and run against OTHER repos, so a script-relative default would make a
  // forgotten --root silently clobber the tracker of whatever tree the code happens to
  // live in — the installing package's own store, not the user's.
  const root = resolve(values.root ?? cwd())
  const epicSlugs = parsePairs(values.epic, 'epic')
  const titles = parsePairs(values.title, 'title')
  const defaultSlug = values['default-slug']

  // The migration is a BOOTSTRAP: after it runs, the store is hand-maintained with
  // Edit/Write. Re-running would silently overwrite that work with the export's
  // (stale) state, so an existing store is a hard stop rather than a doc warning.
  const tasksDir = resolve(root, `${TRACKER_DIR}/tasks`)
  // `.ya?ml` — both readers accept either extension, so matching only `.yml` here
  // would let a `tasks-*.yaml` store slip past the guard and be silently clobbered.
  const existing = existsSync(tasksDir) ? readdirSync(tasksDir).filter(f => /^tasks-.+\.ya?ml$/.test(f)) : []
  if (existing.length && !values.force) {
    throw new InputError(
      `refusing to overwrite an existing task store: ${tasksDir} already holds ${existing.join(', ')}`,
      'This is a one-way bootstrap, not a sync — re-running replays the bd export over any hand-edits\n' +
      'made since. Pass --force only to redo a botched migration, or --root <dir> to target elsewhere.',
      'EEXIST'
    )
  }

  for (const slug of [...epicSlugs.values(), defaultSlug]) {
    if (!SLUG_RE.test(slug)) {
      throw new InputError(`invalid slug "${slug}" — must match ${SLUG_RE} (it becomes tasks-<slug>.yml)`, USAGE, 'EUSAGE')
    }
  }

  const write = (/** @type {string} */ relPath, /** @type {string} */ content) => {
    const abs = resolve(root, relPath)
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, content)
    return relPath
  }

  // Pointing at a file that is not there is the archetypal user mistake — the whole thesis of
  // this row. readFileSync throws a raw ENOENT, which cli.js can only answer with a stack trace;
  // convert it to an InputError. A non-ENOENT read failure (permissions, is-a-directory) IS
  // unexpected enough to keep its stack, so re-throw those untouched.
  let raw
  try {
    raw = readFileSync(inputPath, 'utf8')
  } catch (cause) {
    if (cause instanceof Error && /** @type {NodeJS.ErrnoException} */ (cause).code === 'ENOENT') {
      throw new InputError(`no such bd export file: ${inputPath}`, USAGE, 'EUSAGE', { cause })
    }
    throw cause
  }
  // One checked parse boundary, shared with the spike — see parseBdExport. Before it, the
  // rows were `any`, so `BdIssue` bound to nothing and tsc checked this migrator against
  // a shape it had never actually seen.
  const records = parseBdExport(raw)

  const live = records.filter(r => r.status !== 'closed')
  // `.filter(Boolean)` is not cosmetic: BdIssue.id is optional (bd's export is foreign and
  // we do not get to insist on it), so an id-less row would otherwise put `undefined` into
  // liveIds and make every edge-liveness check nonsense. projectLive throws on such a row
  // anyway — this just keeps the set honest.
  /** @type {Set<string>} */
  const liveIds = new Set(live.flatMap(r => r.id ? [r.id] : []))
  /** @type {string[]} */
  const droppedEdges = []
  /** @type {string[]} */
  const priorityDefaulted = []
  /** @type {string[]} */
  const droppedLabels = []

  for (const epicId of epicSlugs.keys()) {
    if (!liveIds.has(epicId)) stderr.write(`warning: --epic ${epicId} is not a live issue — its slug will be empty\n`)
  }

  const tasks = []
  const decisions = []
  for (const r of live) {
    const task = projectLive(r, liveIds, droppedEdges, priorityDefaulted, droppedLabels)
    // `?? ''` because BdIssue.description is optional and dumpDecision takes a string. This
    // was a live type lie until the parse boundary stopped being `any`: an undescribed bd
    // decision passed `undefined` into a `@param {string}`. It survived only because
    // normalizeBody does `body ?? ''` two calls down.
    if (task.type === 'decision') decisions.push({ task, body: r.description ?? '' })
    else tasks.push(task)
  }

  const grouped = groupTasks(tasks, epicSlugs, defaultSlug)

  // Archive the FULL snapshot — but ONLY NOW, once every record has projected without
  // refusing. It used to be written first, "so bd's history is safe" — and that created
  // the very defect this tracker exists to eliminate.
  //
  // `projectLive` THROWS on a record it cannot honestly migrate (no id, an unmapped
  // status). Archiving first meant an aborted migration still left a `.diarie/` behind —
  // a real directory, holding only the archive, with no tasks in it. The target repo then
  // had a store that EXISTS and is EMPTY, which is exactly the state we teach every
  // consumer to trust:
  //
  //   diarie ready    →  {"ready":[],"blocked":[],"needsAttention":[]}   exit 0
  //   diarie validate →  "Task validation passed (0 file(s))."           exit 0
  //
  // An honest ENOSTORE ("this project has no tracker") converted into a confident, empty,
  // entirely fictional backlog — by the failure path of the migrator itself. A migration
  // that refuses must leave NO TRACE, so the next attempt starts from an honest absence.
  mkdirSync(resolve(root, `${TRACKER_DIR}/_archive`), { recursive: true })
  copyFileSync(resolve(inputPath), resolve(root, `${TRACKER_DIR}/_archive/bd-final-export.jsonl`))

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
  if (droppedLabels.length) {
    // Not cosmetic: a dropped `epic` label un-contains an epic in the MIGRATED repo.
    stdout.write(`  dropped ${droppedLabels.length} malformed labels list(s) — a lost \`epic\` label makes a container workable again:\n`)
    for (const l of droppedLabels) stdout.write(`    - ${l}\n`)
  }
  if (priorityDefaulted.length) {
    // Priority is the ready-queue's sort key, so this is not cosmetic: it means the
    // migrated backlog may not come out in the order bd would have given it.
    stdout.write(`  coerced ${priorityDefaulted.length} unmappable priority/-ies to medium (affects ready ORDER):\n`)
    for (const p of priorityDefaulted) stdout.write(`    - ${p}\n`)
  }
  stdout.write(`written:\n${written.map(w => `  ${w}`).join('\n')}\n`)

  // `git add -A` skips an ignored file WITHOUT A WORD, and `*.jsonl` / `_archive/`
  // are unremarkable .gitignore lines — so ask git what it would actually commit
  // rather than trusting the layout. The two halves carry very different stakes.
  const archive = `${TRACKER_DIR}/_archive/bd-final-export.jsonl`
  const check = spawnSync('git', ['-C', root, 'check-ignore', '--stdin'], {
    input: [...written, archive].join('\n'),
    encoding: 'utf8',
  })
  // exit 0 = something matched an ignore rule; 1 = nothing ignored; 128 = not a repo.
  const ignored = check.status === 0 ? check.stdout.split('\n').filter(Boolean) : []
  const storeIgnored = ignored.filter(f => !f.includes('_archive'))
  const archiveIgnored = ignored.some(f => f.includes('_archive'))

  // The live store being ignored is not a policy question — it means the migration
  // produced nothing durable. Hard stop.
  if (storeIgnored.length) {
    throw new InputError(
      `the migrated task store is GITIGNORED in ${root} — it will not commit`,
      storeIgnored.map(f => `      ${f}`).join('\n') + '\n' +
      `    ${TRACKER_DIR}/ is dotted but MUST be tracked — it IS the backlog. A negation\n` +
      // `!<dir>/` does NOT work: git will not descend into an excluded directory, so a
      // negation on the dir alone can never re-include the files under it. `/**` can.
      `    line works: !${TRACKER_DIR}/**`,
      'EUSAGE'
    )
  }

  // The ARCHIVE is a judgment call, and git already knows the answer. Whether the
  // project ever TRACKED `.beads/` is its revealed preference on versioning bd history:
  // a gitignored `.beads/` means it chose not to, years ago. Committing a JSONL of the
  // closed issues now would quietly reverse that. So speak only when the migration
  // would CHANGE the status quo — never to push a default. (The file is written to disk
  // regardless: it costs nothing and bd's Dolt DB may not stay readable.)
  const beadsTracked = spawnSync('git', ['-C', root, 'ls-files', '.beads'], { encoding: 'utf8' })
  const historyWasVersioned = Boolean(beadsTracked.stdout?.trim())

  if (archiveIgnored && historyWasVersioned) {
    // A real regression: they DID version bd history, and now it would stop.
    stderr.write(
      `\nwarning: this project tracks \`.beads/\` in git, but ${archive} is gitignored —\n` +
      '  so the bd history you have been versioning would stop being versioned here.\n' +
      `  Add !${archive} (or !${TRACKER_DIR}/**) to keep it.\n`
    )
  } else if (archiveIgnored) {
    stderr.write(
      `\nnote: ${archive} is gitignored — consistent with \`.beads/\`, which this project\n` +
      '  never tracked either. Nothing to do: closed issues record what was DONE (your git\n' +
      '  log and CHANGELOG already tell you that); the backlog is for what comes NEXT, and\n' +
      '  it commits normally. The archive still exists on disk if you ever want it.\n'
    )
  } else if (!historyWasVersioned) {
    // Not ignored, so it WOULD commit — but they never versioned bd history before.
    // Flag it as a new choice rather than letting it slip in.
    stderr.write(
      `\nnote: ${archive} is NOT gitignored, so committing will put bd's ${records.length - live.length}\n` +
      '  closed issues into git for the first time — this project never tracked `.beads/`.\n' +
      '  Fine if you want that history queryable; if not, drop the file or ignore it. Your call —\n' +
      '  git log and CHANGELOG usually already record what was done.\n'
    )
  }
}

// The file stays runnable on its own (the tests spawn it, and it predates the CLI). It has no
// cli.js boundary above it, so it needs its own: an InputError is a user mistake and gets its
// message (never a stack), mirroring cli.js's non-JSON branch. Anything else keeps its stack —
// that is the honest answer to a genuine bug. `--json` here is cli.js's job, not this legacy entry's.
if (argv[1] && fileURLToPath(import.meta.url) === argv[1]) {
  runMigration(argv.slice(2)).catch(err => {
    if (err instanceof InputError) {
      stderr.write(`diarie: ${err.message}\n`)
      if (err.body) stderr.write('\n' + err.body + '\n')
    } else {
      stderr.write(String(err?.stack ?? err) + '\n')
    }
    exit(1)
  })
}
