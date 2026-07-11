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
 */

import { peowly } from 'peowly'

import { outputFlags, requireRoot, storeFlags } from '../flags.js'
import { jsonOut, textOut, warn } from '../format.js'
import { computeReady, line } from '../ready.js'
import { VALID_STATUSES } from '../schema.js'
import { loadTasks, strip } from '../store.js'
import { InputError, ResultError } from '../utils/errors.js'

const flags = /** @satisfies {import('peowly').AnyFlags} */ ({
  ...outputFlags,
  ...storeFlags,
  blocked: {
    description: 'Show blocked tasks and what blocks them, instead of ready ones',
    type: 'boolean',
    'default': false,
  },
  filter: {
    description: `Show tasks in a given status (${[...VALID_STATUSES].join(', ')})`,
    type: 'string',
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
    const { flags: opts } = peowly({
      ...meta,
      args: argv,
      description: ready.description,
      name,
      options: flags,
      usage: '[--filter <status>] [--blocked] [--json]',
    })

    const root = requireRoot(opts.root)
    const tasks = await loadTasks(root, warn)

    // A flat ARRAY — a plain list of rows, not a partition. Pinned.
    if (opts.filter !== undefined) {
      if (!VALID_STATUSES.has(/** @type {any} */ (opts.filter))) {
        throw new InputError(`--filter must be one of: ${[...VALID_STATUSES].join(', ')}`)
      }
      const filtered = tasks.filter(t => t.status === opts.filter).map(t => strip(t))
      if (opts.json) return jsonOut(filtered)
      return textOut(filtered.length ? filtered.map(t => line(t)).join('\n') : '  (none)')
    }

    const result = computeReady(tasks)

    // An empty ready queue WITH blocked tasks is ambiguous: everything claimed, or
    // a dependency cycle nobody has noticed. Say so rather than shrug.
    const ambiguous = result.ready.length === 0 && result.blocked.length > 0
    if (ambiguous) warn(`0 ready, ${result.blocked.length} blocked — run \`${parentName} validate\` to check for a dependency cycle`)

    // An OBJECT — the full partition. Pinned.
    if (opts.json) {
      // strip(): `_slug`/`_file` are loader provenance, not part of the contract.
      // The first cut of this command leaked them into every consumer's JSON.
      jsonOut({
        ready: result.ready.map(t => strip(t)),
        blocked: result.blocked.map(t => strip(t)),
        needsAttention: result.needsAttention.map(t => strip(t)),
        ...(ambiguous ? { hint: `possible dependency cycle — run \`${parentName} validate\`` } : {}),
      })
    } else {
      const lines = opts.blocked
        ? result.blocked.map(t => `${line(t)}  ← blocked by ${t.blockers.join(', ')}`)
        : (result.ready.length ? result.ready.map(t => line(t)) : ['  (no ready tasks)'])
      lines.push(...result.needsAttention.map(t => `${line(t)}  ! needs attention: ${t.reason}`))
      textOut(lines.join('\n'))
    }

    if (opts.strict && (result.needsAttention.length || ambiguous)) {
      throw new ResultError('needs attention')
    }
  },
}
