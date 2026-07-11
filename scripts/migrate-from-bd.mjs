/**
 * migrate-from-bd.mjs — READ-ONLY shadow-dogfood projector (spike, not the shipped migrator).
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
 *   node scripts/migrate-from-bd.mjs /tmp/bd-export.jsonl /tmp/tasks-vp-beads.yml
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

import yaml from 'js-yaml'

import { TRACKER_DIR, VALID_TYPES } from './task-schema.mjs'

/**
 * bd status → task-schema status. `deferred` has no exact analog — see loss
 * report. Exported so the real migrator (bootstrap-tasks.mjs / bj7) shares this
 * single source of truth for the map rather than re-deriving it.
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

/** bd numeric priority → task-schema priority string. Exported for bj7 reuse. */
export const PRIORITY_MAP = { '0': 'critical', '1': 'high', '2': 'medium', '3': 'low', '4': 'backlog' }

/**
 * bd's 9 issue_types → the 4-type model (decision vp-beads-etm).
 * `decision` and `milestone` pass through directly (bd already has them as
 * top-level types, not framings). The other 6 collapse to `task` + a label.
 *
 * @type {Record<string, { type: string, label?: string }>}
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
 * @param {object[]} records   parsed bd export lines (regular issues only)
 * @returns {{ tasks: object[], loss: object }}
 */
export function projectRecords (records) {
  const tasks = []
  const unknownStatuses = new Set()
  const unknownTypes = new Set()
  const untranslatedDepTypes = new Set()
  const deferredIds = []
  const priorityDefaultedIds = []
  let acceptanceCriteriaSkipped = 0

  for (const r of records) {
    const status = STATUS_MAP[r.status]
    if (!status) { unknownStatuses.add(r.status); continue }
    if (r.status === 'deferred') deferredIds.push(r.id)

    const mapped = TYPE_MAP[r.issue_type]
    if (!mapped) { unknownTypes.add(r.issue_type); continue }
    // Drift guard: every TYPE_MAP value is schema-valid by construction today,
    // so this can't fire yet — it catches a future bad edit to TYPE_MAP.
    if (!VALID_TYPES.has(mapped.type)) { unknownTypes.add(r.issue_type); continue }

    const labels = [...(Array.isArray(r.labels) ? r.labels : []), ...(mapped.label ? [mapped.label] : [])]

    /** @type {string[]} */
    const deps = []
    let parent
    for (const d of r.dependencies ?? []) {
      if (d.type === 'blocks') deps.push(d.depends_on_id)
      else if (d.type === 'parent-child') parent = d.depends_on_id
      else untranslatedDepTypes.add(d.type)
    }

    // The full migrator (bj7) extracts `## Acceptance Criteria` from
    // markdown description bodies. This spike doesn't — that's real parsing
    // work belonging to the lossless migrator, not this ready-semantics
    // dogfood. Record the skip; don't silently drop it.
    if (/## Acceptance Criteria/i.test(r.description ?? '')) acceptanceCriteriaSkipped++

    let priority = PRIORITY_MAP[r.priority]
    if (!priority) {
      priorityDefaultedIds.push({ id: r.id, priority: r.priority })
      priority = 'medium'
    }

    const task = {
      id: r.id,
      title: r.title,
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
      note: 'acceptanceCriteriaSkipped counts records with a "## Acceptance Criteria" markdown ' +
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
    stderr.write('usage: node scripts/migrate-from-bd.mjs <bd-export.jsonl> <output.yml>\n')
    exit(1)
  }
  // Segment-wise rather than a regex: the tracker dir is TRACKER_DIR-derived, and
  // splitting on `sep` needs no escaping of its leading dot.
  const segments = resolve(outputPath).split(sep)
  const trackerAt = segments.indexOf(TRACKER_DIR)
  if (trackerAt !== -1 && segments[trackerAt + 1] === 'tasks') {
    stderr.write(`refusing to write under ${TRACKER_DIR}/tasks/ — this projector is scratch-only ` +
      '(regenerate, never hand-edit; the live store is owned by bootstrap-tasks.mjs / Edit)\n')
    exit(1)
  }

  const lines = readFileSync(inputPath, 'utf8').split('\n').filter(Boolean)
  const records = lines.map(l => JSON.parse(l)).filter(r => r._type === 'issue')
  const { loss, tasks } = projectRecords(records)

  writeFileSync(outputPath, yaml.dump({ meta: { slug: 'vp-beads', title: 'Shadow projection of bd (read-only spike)' }, tasks }))
  stdout.write(`projected ${tasks.length} issues → ${outputPath}\n`)
  stdout.write(`loss report: ${JSON.stringify(loss, undefined, 2)}\n`)
}
