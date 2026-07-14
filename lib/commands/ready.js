/**
 * `diarie ready` — what can be worked on right now.
 *
 * THE load-bearing primitive. A task is ready iff `type: task`, `status: pending`,
 * and every dep is `completed`. Non-task types (doc/decision/milestone) are records
 * or markers and never surface as work — a decision in force is not a chore.
 *
 * TWO OUTPUT SHAPES, both pinned by consumers:
 *
 *   ready --json            -> OBJECT  {ready, blocked, needsAttention}
 *   ready --filter <status> -> ARRAY   [task, …]
 *
 * They differ on purpose (a partition vs a plain list) and hooks/session-start.sh
 * parses each in a different branch. Do not "unify" them without changing both.
 *
 * FOUR PARTS (peowly-commands' shape — `example/complete/commands/single/index.js`):
 * `run()` holds no logic; `setupCommand` parses; `doTheWork` RETURNS DATA and never
 * prints; `formatWorkResult` is the only writer. The third part is the point — it is
 * what makes the work assertable in-process, with no spawn and no stdout capture.
 * `doTheWork` is exported for exactly that reason (the reference keeps it internal,
 * but the reference does not unit-test it).
 */

import { peowly } from 'peowly'

import { jsonOut, textOut, warn } from '../format.js'
import { loadTasks, strip } from '../store.js'
import { ResultError } from '../utils/errors.js'
import {
  filterFlags, outputFlags, requireRoot, storeFlags, validateFilterFlags,
} from '../flags/index.js'
import {
  attentionLine, blockedLine, computeReady, line,
} from '../ready.js'

const flags = /** @satisfies {import('peowly').AnyFlags} */ ({
  ...outputFlags,
  ...storeFlags,
  ...filterFlags,
  blocked: {
    description: 'Show blocked tasks and what blocks them, instead of ready ones',
    type: 'boolean',
    'default': false,
  },
  strict: {
    description: 'Exit non-zero if any task needs attention, or the queue looks cyclic',
    type: 'boolean',
    'default': false,
  },
})

/** @type {import('peowly-commands').CliCommand} */
export const ready = {
  description: 'List the work that is ready to start',

  async run (argv, meta, { parentName }) {
    const name = `${parentName} ready`

    const input = setupCommand(name, ready.description, argv, meta)
    const workResult = await doTheWork(input)

    formatWorkResult(workResult, { parentName, ...input })
  },
}

/**
 * @typedef CommandContext
 * @property {boolean} blocked
 * @property {import('../schema.js').Status|undefined} filter
 * @property {boolean} json
 * @property {string} root
 * @property {boolean} strict
 */

/**
 * @param {string} name
 * @param {string} description
 * @param {string[]} args
 * @param {import('peowly-commands').CliMeta} meta
 * @returns {CommandContext}
 */
function setupCommand (name, description, args, meta) {
  const { flags: opts } = peowly({
    ...meta,
    args,
    description,
    name,
    options: flags,
    // `--strict` was missing here for its whole life, and that was not merely a docs gap: it was
    // dead under `--filter`, so the usage string was accidentally honest.
    usage: '[--filter <status>] [--blocked] [--strict] [--json]',
  })

  // ORDER IS LOAD-BEARING: the store resolves BEFORE the filter is validated.
  //
  // On a double fault (`--filter bogus --root /nowhere`) the caller learns the store is
  // MISSING, with the `{code: 'ENOSTORE'}` a consumer branches on — not that its status
  // string was bad. ENOSTORE is the distinction this whole tracker exists to keep
  // ("a missing store is an error, never an empty backlog"), so it outranks a typo.
  //
  // `stats` resolves in the opposite order, and that asymmetry is likewise preserved
  // rather than tidied: both orders predate this refactor, and a refactor that quietly
  // reorders errors is not a refactor. Change either one deliberately, or not at all.
  const root = requireRoot(opts.root)

  // The status guard is a pure, exported validator living beside its own flag
  // declaration (`lib/flags/filter.js`), so the two cannot drift apart.
  const { filter } = validateFilterFlags(opts)

  return {
    blocked: opts.blocked,
    filter,
    json: opts.json,
    root,
    strict: opts.strict,
  }
}

/**
 * The partition view, plus what the formatter needs in order to explain it.
 *
 * @typedef PartitionResult
 * @property {'partition'} mode
 * @property {ReturnType<typeof computeReady>} partition
 * @property {boolean} ambiguous Nothing ready, yet work exists — all claimed, or a cycle.
 * @property {string[]} warnings
 * @property {boolean} unsound Every reason `--strict` may refuse, computed ONCE for both shapes.
 */

/**
 * The `--filter` view: a plain list of rows in one status.
 *
 * @typedef FilterResult
 * @property {'filter'} mode
 * @property {import('../store.js').Task[]} tasks
 * @property {string[]} warnings
 * @property {boolean} unsound Every reason `--strict` may refuse, computed ONCE for both shapes.
 */

/** @typedef {FilterResult|PartitionResult} WorkResult */

/**
 * Do the work and RETURN it. Prints nothing — that is the entire contract.
 *
 * Loader complaints are COLLECTED rather than written straight to stderr. Not for
 * tidiness: it means a caller (a test, a library consumer) can finally see what the
 * loader objected to, which until now was observable only by capturing a stream.
 *
 * @param {Pick<CommandContext, 'filter'|'root'>} context
 * @returns {Promise<WorkResult>}
 */
export async function doTheWork ({ filter, root }) {
  /** @type {string[]} */
  const warnings = []
  const tasks = await loadTasks(root, m => warnings.push(m))

  // THE SOUNDNESS VERDICT IS COMPUTED ONCE, FOR BOTH SHAPES — and that is the whole point of
  // computing it here rather than in the formatter.
  //
  // `--strict` promises, in its own flag description, to "exit non-zero if any task needs attention,
  // OR THE QUEUE LOOKS CYCLIC". The first cut of the `--filter` fix threw only on a dropped row, so a
  // two-task dependency cycle gave `validate` → 2, `ready --strict` → 2, and
  // `ready --filter pending --strict` → 0. Not dead any more; merely WEAKER — and worse, that commit
  // added `--strict` to the usage string, so `--help` began advertising a promise one of its paths
  // did not keep. Fix the instance, leave the class: the same move, in the fix for the same move.
  //
  // So the partition is computed even when the caller asked for a filter. It is cheap (the rows are
  // already in memory) and it is the only way both views can answer the same question about the same
  // store.
  const partition = computeReady(tasks)

  // Nothing ready, yet work exists: SAY SO. Either everything is claimed, or there is a
  // cycle nobody has noticed — and the reader cannot tell those apart from an empty list.
  //
  // This used to filter to DEP-blocked rows, excluding containers, and the comment
  // justifying it was simply wrong. It claimed an all-container backlog was "a healthy
  // tree whose leaves are all done" — but a container only REACHES `blocked` when it has
  // an ACTIVE child (see childrenByParent). If its leaves were done it would be ready.
  // So an all-container 0-ready backlog means every open child is claimed, or the graph
  // has a cycle — exactly the ambiguity the dep case already warns about. The asymmetry
  // had no basis, and it made `--strict` exit 0 on a parent cycle: the one thing its own
  // flag description promises to catch.
  const ambiguous = partition.ready.length === 0 && partition.blocked.length > 0

  // Every reason `--strict` may refuse, in one place. A row the loader THREW AWAY (`warnings`), a
  // row it kept but could not make sense of (`needsAttention`, and the same broken row when it is
  // also legitimately blocked), and a queue that cannot be walked (`ambiguous`).
  const unsound = warnings.length > 0 ||
    partition.needsAttention.length > 0 ||
    ambiguous ||
    partition.blocked.some(t => t.attention?.length)

  if (filter !== undefined) {
    return { mode: 'filter', tasks: tasks.filter(t => t.status === filter), warnings, unsound }
  }

  return { mode: 'partition', partition, ambiguous, warnings, unsound }
}

/**
 * The ONLY place that writes — and the only one that sets the exit code, because
 * `--strict` is a verdict ON the result, not a step in computing it.
 *
 * @param {WorkResult} workResult
 * @param {{ parentName: string } & CommandContext} context
 * @returns {void}
 * @throws {ResultError} when --strict and the store is not sound
 */
function formatWorkResult (workResult, { blocked, json, parentName, strict }) {
  // Replayed first, so the asides still precede the answer exactly as they always did.
  for (const message of workResult.warnings) warn(message)

  // ONE VERDICT, BOTH SHAPES — `doTheWork` computed it, because a store is broken or it is not, and
  // that cannot depend on which output the caller asked for.
  //
  // It used to live at the BOTTOM of this function, below the `mode === 'filter'` early return, which
  // made `--strict` silently DEAD under `--filter`: `ready --filter in_progress --strict --json`
  // exited 0 against a store `validate` exits 2 on. The first fix moved a `dropped` check up here —
  // and left the cycle and needs-attention checks behind, so the flag went from dead to merely
  // WEAKER, while `--help` (which that same commit taught to advertise `--strict`) promised "or the
  // queue looks cyclic". A promise one path did not keep.
  //
  // The `--filter` output is a PINNED ARRAY with nowhere to carry a `warnings` key, so the exit code
  // is the only channel that path has, and `hooks/session-start.sh` reads it at every session start.
  const { unsound } = workResult

  if (workResult.mode === 'filter') {
    // A flat ARRAY — a plain list of rows, not a partition. Pinned: two hook call sites parse it as
    // an array, so `warnings` cannot ride in the payload.
    //
    // NOTE WHAT THIS LIST CONTAINS. `--filter` is a raw status query, not the ready-walk — so a row
    // with a broken REQUIRED field (`type: bug`, but a valid `status`) appears here UNMARKED, while
    // the partition quarantines it in `needsAttention`. The two views disagree, on purpose: one asks
    // "what is workable", the other "what has this status". A consumer that reads the array and
    // ignores the exit code will therefore be handed a broken row as though it were healthy. The
    // exit code is the only warning it gets, which is the second reason `--strict` must work here.
    //
    // strip(): `_slug`/`_file` are loader provenance, not part of the contract.
    const { tasks } = workResult
    if (json) jsonOut(tasks.map(t => strip(t)))
    else textOut(tasks.length ? tasks.map(t => line(t)).join('\n') : '  (none)')

    // The answer is on stdout; NOW the verdict. (Order matters: a caller that reads stdout still
    // gets its rows, and learns from the exit code that the store is not sound.)
    if (strict && unsound) throw new ResultError('the store is not sound')
    return
  }

  const { ambiguous, partition } = workResult

  if (ambiguous) {
    const containers = partition.blocked.filter(t => t.children?.length).length
    const deps = partition.blocked.length - containers
    const what = [deps && `${deps} waiting on deps`, containers && `${containers} epic(s) in flight`].filter(Boolean).join(', ')
    warn(`0 ready, ${partition.blocked.length} blocked (${what}) — everything is claimed, or the graph has a cycle. Run \`${parentName} validate\`.`)
  }

  if (json) {
    // An OBJECT — the full partition. Pinned, key order included; `warnings` is APPENDED, so
    // every existing consumer's key order is untouched.
    //
    // WARNINGS BELONG IN THE ANSWER, not only in the asides. This CLI exists because the old
    // readers printed `{"ready": []}` to stdout and whispered their only complaint to stderr — a
    // stream ten call sites pipe to /dev/null — so a tracker that could not find its store looked
    // exactly like one reporting an empty backlog. That defect was fixed for a MISSING STORE
    // (ENOSTORE) and left standing for a MALFORMED ROW: a store `validate` calls broken answered
    // `{"ready": [], "blocked": [], "needsAttention": []}` with exit 0, and the sentence naming the
    // dropped field went to stderr, where no JSON consumer will ever look. Same defect, same
    // stream, different cause.
    jsonOut({
      ready: partition.ready.map(t => strip(t)),
      blocked: partition.blocked.map(t => strip(t)),
      needsAttention: partition.needsAttention.map(t => strip(t)),
      ...(ambiguous ? { hint: `possible dependency cycle — run \`${parentName} validate\`` } : {}),
      ...(workResult.warnings.length ? { warnings: workResult.warnings } : {}),
    })
  } else {
    const lines = blocked
      ? partition.blocked.map(t => blockedLine(t))
      : (partition.ready.length ? partition.ready.map(t => line(t)) : ['  (no ready tasks)'])
    lines.push(...partition.needsAttention.map(t => attentionLine(t)))
    textOut(lines.join('\n'))
  }

  // The SAME verdict the filter branch used. `computeReady` skips any row whose `status` is not
  // `pending` BEFORE it reaches the type guard — so `type: bug` lands in needsAttention while
  // `status: open` is discarded entirely and shows up only as a loader warning. Two malformed
  // REQUIRED fields, opposite mechanisms, and `unsound` is what makes them one answer.
  if (strict && unsound) {
    throw new ResultError('the store is not sound')
  }
}
