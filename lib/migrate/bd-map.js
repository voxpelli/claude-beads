/**
 * bd-map.js — the bd vocabulary maps + a READ-ONLY shadow-dogfood projector (spike, not the shipped migrator).
 *
 * Projects a `bd export` JSONL snapshot into the flat-YAML task-schema shape,
 * applying the decided 9→4 type collapse (decision vp-beads-etm). This is
 * deliberately the read-only HALF of the full migration: it never writes into
 * `.diarie/tasks/`, bd stays canonical, and the projection is meant to be
 * regenerated (never hand-edited) and thrown away. Its purpose is to give the
 * type-model decision its first implementation feedback — dual-run its output
 * against `bd ready` before the exploration branch concludes — not to ship a
 * production migration path. `projectRecords` is exported for reuse by
 * vp-beads-bj7's eventual test suite when that migrator is built — this
 * spike itself ships untested by design (its one-time job is done; see
 * SPIKE-etm-dogfood-findings.md and decision vp-beads-etm's `## Affects`).
 *
 * The FULL lossless migrator (acceptance-criteria extraction from markdown,
 * comment history, --scrub handling, writing into the real substrate) is
 * vp-beads-bj7, a future-wave deliverable. This script intentionally does
 * LESS than that and says so in its loss report.
 *
 * Usage:
 *   bd export -o /tmp/bd-export.jsonl --readonly
 *   node diarie/cli.js migrate /tmp/bd-export.jsonl /tmp/tasks-vp-beads.yml
 *
 * Guardrail: refuses to write under any `.diarie/tasks/` directory — the
 * projection is scratch-only by construction, not an accident of discipline.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  argv, exit, stderr, stdout,
} from 'node:process'

import { isObject, isStringArray } from '@voxpelli/typed-utils'
import yaml from 'js-yaml'

import { isNil, TRACKER_DIR, VALID_TYPES } from '../schema.js'

/**
 * One row of a `bd export` JSONL snapshot — the shape we are migrating AWAY from.
 *
 * Every field is optional and loosely typed on purpose. This describes a foreign
 * export from a tool whose writes are dead (beads 1.1.0) and whose archive is frozen;
 * we do not get to insist on its shape, only to survive it. The maps below turn each
 * field into something the schema recognises and report anything they cannot.
 *
 * @typedef BdIssue
 * @property {string} [id]
 * @property {string} [title]
 * @property {string} [status]        bd's vocabulary: open / in_progress / closed / deferred
 * @property {string} [issue_type]    bd's 9 types — collapsed to 4 by TYPE_MAP
 * @property {number|string} [priority]  bd's numeric 0–4
 * @property {string} [description]
 * @property {unknown} [labels]       trusted only after an Array.isArray check
 * @property {BdDependency[]} [dependencies]
 * @property {string} [updated_at]    ISO timestamp; we keep the date half
 */

/**
 * @typedef BdDependency
 * @property {string} [type]              `blocks` → a dep; `parent-child` → a parent
 * @property {string} [depends_on_id]
 */

/** @typedef {import('../schema.js').TaskRow} TaskRow */

/**
 * bd exports more than issues (`_type` also covers dependencies, comments, …). This is the
 * predicate that says which rows are ours, and — being a type predicate — it is what makes
 * `BdIssue` bind to real data instead of decorating an `any`.
 *
 * @param {unknown} r
 * @returns {r is BdIssue}
 */
const isBdIssue = (r) => isObject(r) && r['_type'] === 'issue'

/**
 * Parse a `bd export` JSONL snapshot into issue records.
 *
 * THE PARSE BOUNDARY, and it has to be a real one. `JSON.parse` returns `any`, and `any`
 * is assignable to everything — so passing it straight to a `@param {BdIssue}` bound
 * `BdIssue` to NOTHING. tsc was not checking the migrator against bd's export; it was
 * checking it against a type that never touched a byte of real data, while every field
 * guard downstream looked redundant to the compiler.
 *
 * `unknown[]` plus one predicate fixes that: from here on, `BdIssue` is the actual type
 * of the actual rows, and each guard in projectLive/projectRecords is a checked narrowing
 * rather than decoration.
 *
 * The line-splitting half of this is now also `@voxpelli/ndjson`'s `ndjsonParseString`
 * (extracted 2026-07-11 from list-dependents-cli, which had the same code and a bug: it
 * dropped the final record when the input lacked a trailing newline). Swap to it once that
 * package is on npm — diarie cannot take an unpublished runtime dep without stranding the
 * plugin's `$PLUGIN_ROOT/diarie/cli.js` hook rung, which resolves deps from the plugin
 * cache. The `filter(Boolean)` below is what spares us that bug in the meantime; verified
 * against the real 131-record archive and against an unterminated input.
 *
 * What would NOT move into that package is the predicate — `_type === 'issue'` is bd's
 * vocabulary, not NDJSON's, and it is the part that earns the type.
 *
 * @param {string} contents  the raw JSONL
 * @returns {BdIssue[]}      issue rows only (bd also exports other `_type`s)
 */
export function parseBdExport (contents) {
  /** @type {unknown[]} */
  const parsed = contents.split('\n').filter(Boolean).map(l => JSON.parse(l))
  return parsed.filter(r => isBdIssue(r))
}

/**
 * bd status → task-schema status. `deferred` has no exact analog — see loss
 * report. Exported so the real migrator (bootstrap.js / bj7) shares this
 * single source of truth for the map rather than re-deriving it.
 *
 * @type {Record<string, import('../schema.js').Status>}
 */
export const STATUS_MAP = {
  open: 'pending',
  in_progress: 'in_progress',
  closed: 'completed',
  // A deferred bd issue is excluded from `bd ready` (verified empirically) but
  // isn't a failure — 'cancelled' is the closest of the 5 YAML statuses (a
  // dependent should see it and pause, not silently block forever). This is
  // an approximation, not a clean mapping — flagged as a named loss below.
  deferred: 'cancelled',
}

/**
 * bd numeric priority → task-schema priority string. Exported for bj7 reuse.
 *
 * @type {Record<string, import('../schema.js').Priority>}
 */
export const PRIORITY_MAP = { '0': 'critical', '1': 'high', '2': 'medium', '3': 'low', '4': 'backlog' }

/**
 * bd's 9 issue_types → the 4-type model (decision vp-beads-etm).
 * `decision` and `milestone` pass through directly (bd already has them as
 * top-level types, not framings). The other 6 collapse to `task` + a label.
 *
 * Typed against the schema's own `TaskType`, so a bad edit here now fails `tsc`, not
 * just the runtime drift guard in projectRecords(). Both are kept: the guard still
 * earns its place for a plain-JS consumer who never runs the type-checker.
 *
 * @type {Record<string, { type: import('../schema.js').TaskType, label?: string }>}
 */
export const TYPE_MAP = {
  task: { type: 'task' },
  decision: { type: 'decision' },
  milestone: { type: 'milestone' },
  bug: { type: 'task', label: 'bug' },
  feature: { type: 'task', label: 'feature' },
  chore: { type: 'task', label: 'chore' },
  story: { type: 'task', label: 'story' },
  spike: { type: 'task', label: 'spike' },
  epic: { type: 'task', label: 'epic' },
  // bd has no 'doc' type in its own vocabulary — nothing maps TO 'doc'. It
  // exists in the YAML model with zero bd-side source, which is itself a
  // fact worth recording (see loss report "typesWithNoBdSource").
}

/**
 * @param {BdIssue[]} records   parsed bd export lines (regular issues only)
 * @returns {{ tasks: TaskRow[], loss: object }}
 */
export function projectRecords (records) {
  /** @type {TaskRow[]} */
  const tasks = []
  const unknownStatuses = new Set()
  const unknownTypes = new Set()
  const untranslatedDepTypes = new Set()
  const deferredIds = []
  const priorityDefaultedIds = []
  let acceptanceCriteriaSkipped = 0
  let idlessRecords = 0
  let malformedEdges = 0
  /** @type {string[]} */
  const droppedLabels = []

  for (const r of records) {
    // An id-less bd row cannot become a task: the schema requires `id`, and every
    // blank one would collide with every other at load. Refuse it, and SAY SO — a
    // migrator that quietly drops rows is the worst kind of migrator.
    if (!r.id) { idlessRecords++; continue }

    const status = r.status === undefined ? undefined : STATUS_MAP[r.status]
    if (!status) { unknownStatuses.add(r.status); continue }
    if (r.status === 'deferred') deferredIds.push(r.id)

    const mapped = r.issue_type === undefined ? undefined : TYPE_MAP[r.issue_type]
    if (!mapped) { unknownTypes.add(r.issue_type); continue }
    // Drift guard: every TYPE_MAP value is schema-valid by construction today,
    // so this can't fire yet — it catches a future bad edit to TYPE_MAP.
    if (!VALID_TYPES.has(mapped.type)) { unknownTypes.add(r.issue_type); continue }

    // isStringArray, not Array.isArray: the latter narrows `unknown` to `any[]`, so a bd
    // export with `labels: [{...}]` would flow straight into `TaskRow.labels: string[]`
    // unchecked. (It fails later, at validate — but a migration that fails at the gate is
    // a migration you have to run twice.)
    // A malformed `labels` is REPORTED, not swallowed. `isStringArray` rejects the whole
    // array if ONE element is a non-string (a bd export with `labels: [{name: 'x'}]`, or a
    // bare scalar), so the good labels go too — and if one of them was `epic`, the migrated
    // repo gets a container that is workable again. That is vp-beads-epc, re-created in
    // someone else's repo, by the migration itself. The guard turned a type leak into a
    // SILENT one, inside the function whose entire product is a loss report.
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
      // A bare `continue` would drop an edge with NO record — inside the one function
      // whose entire product IS a loss report. Count it, or the report lies by omission.
      if (d.depends_on_id === undefined) { malformedEdges++; continue }
      if (d.type === 'blocks') deps.push(d.depends_on_id)
      else if (d.type === 'parent-child') parent = d.depends_on_id
      else untranslatedDepTypes.add(d.type)
    }

    // The full migrator (bj7) extracts `## Acceptance Criteria` from
    // markdown description bodies. This spike doesn't — that's real parsing
    // work belonging to the lossless migrator, not this ready-semantics
    // dogfood. Record the skip; don't silently drop it.
    if (/## Acceptance Criteria/i.test(r.description ?? '')) acceptanceCriteriaSkipped++

    let priority = PRIORITY_MAP[String(r.priority)]
    if (!priority) {
      priorityDefaultedIds.push({ id: r.id, priority: r.priority })
      priority = 'medium'
    }

    /** @type {TaskRow} */
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
      priority,
    }
    if (labels.length) task.labels = labels
    if (parent) task.parent = parent
    if (deps.length) task.deps = deps
    if (r.updated_at) task.updated = r.updated_at.slice(0, 10)

    tasks.push(task)
  }

  return {
    tasks,
    loss: {
      unknownStatuses: [...unknownStatuses],
      unknownTypes: [...unknownTypes],
      untranslatedDepTypes: [...untranslatedDepTypes],
      deferredIdsApproximatedAsCancelled: deferredIds,
      priorityDefaultedIds,
      acceptanceCriteriaSkipped,
      idlessRecords,
      malformedEdges,
      droppedLabels,
      note: 'idlessRecords counts bd rows with no `id`, which cannot become tasks (the schema ' +
        'requires one, and blank ids would collide at load) — they are dropped, and counted here ' +
        'so the drop is visible rather than silent. ' +
        'acceptanceCriteriaSkipped counts records with a "## Acceptance Criteria" markdown ' +
        'section that this read-only spike does not extract (that parsing belongs to the full ' +
        'lossless migrator, vp-beads-bj7) — not a defect in this projector. ' +
        'priorityDefaultedIds lists records whose bd priority was missing or out of the 0-4 ' +
        'range and was coerced to \'medium\'; because priority is ready-walker\'s sort key, a ' +
        'nonempty list means the projected ready ordering may diverge from `bd ready`.',
    },
  }
}

// --- CLI -------------------------------------------------------------------

if (argv[1] && fileURLToPath(import.meta.url) === argv[1]) {
  const [inputPath, outputPath] = argv.slice(2)
  if (!inputPath || !outputPath) {
    stderr.write('usage: node diarie/cli.js migrate <bd-export.jsonl> <output.yml>\n')
    exit(1)
  }
  // Segment-wise rather than a regex: the tracker dir is TRACKER_DIR-derived, and
  // splitting on `sep` needs no escaping of its leading dot. `some` (not indexOf)
  // so a repeated segment — /a/.diarie/b/.diarie/tasks — still trips the guard.
  const segments = resolve(outputPath).split(sep)
  if (segments.some((s, i) => s === TRACKER_DIR && segments[i + 1] === 'tasks')) {
    stderr.write(`refusing to write under ${TRACKER_DIR}/tasks/ — this projector is scratch-only ` +
      '(regenerate, never hand-edit; the live store is owned by `diarie migrate` / Edit)\n')
    exit(1)
  }

  const records = parseBdExport(readFileSync(inputPath, 'utf8'))
  const { loss, tasks } = projectRecords(records)

  writeFileSync(outputPath, yaml.dump({ meta: { slug: 'vp-beads', title: 'Shadow projection of bd (read-only spike)' }, tasks }))
  stdout.write(`projected ${tasks.length} issues → ${outputPath}\n`)
  stdout.write(`loss report: ${JSON.stringify(loss, undefined, 2)}\n`)
}
