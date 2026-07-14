/**
 * `diarie stats` — summary counts.
 *
 * PINNED JSON SHAPE (agents/sprint-review.md parses it):
 *   {total, ready, blocked, stale[], malformedDates[], byStatus, byPriority, byType}
 *
 * `--stale` reports in_progress tasks not touched in N days. It is deliberately
 * in_progress-scoped: a pending task that has sat for a year is a backlog, not a
 * problem. A CLAIMED task that has sat for a month is an abandoned claim.
 *
 * Four parts — see `commands/ready.js` for the shape and why `doTheWork` is exported.
 */

import { peowly } from 'peowly'

import { jsonOut, textOut, warn } from '../format.js'
import { computeStats, formatStats } from '../ready.js'
import { loadTasks } from '../store.js'
import {
  outputFlags, requireRoot, staleFlags, storeFlags, validateStaleFlags,
} from '../flags/index.js'

const flags = /** @satisfies {import('peowly').AnyFlags} */ ({
  ...outputFlags,
  ...storeFlags,
  ...staleFlags,
})

/** @type {import('peowly-commands').CliCommand} */
export const stats = {
  description: 'Summary counts: totals, ready, blocked, stale claims',

  async run (argv, meta, { parentName }) {
    const input = setupCommand(`${parentName} stats`, stats.description, argv, meta)
    const workResult = await doTheWork(input)

    formatWorkResult(workResult, input)
  },
}

/**
 * @typedef CommandContext
 * @property {number} days
 * @property {boolean} json
 * @property {string} root
 * @property {boolean} stale
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
    usage: '[--stale] [--days <n>] [--json]',
  })

  // The `--days` coercion is a pure, exported validator living beside its own flag
  // declaration (`lib/flags/staleness.js`) — the kind of coercion that fails silently,
  // hence the kind worth testing without a process.
  const { days, stale } = validateStaleFlags(opts)

  return { days, json: opts.json, root: requireRoot(opts.root), stale }
}

/**
 * @typedef WorkResult
 * @property {ReturnType<typeof computeStats>} summary
 * @property {string[]} warnings
 */

/**
 * Do the work and RETURN it. Prints nothing.
 *
 * @param {Pick<CommandContext, 'days'|'root'>} context
 * @returns {Promise<WorkResult>}
 */
export async function doTheWork ({ days, root }) {
  /** @type {string[]} */
  const warnings = []
  const tasks = await loadTasks(root, m => warnings.push(m))

  return { summary: computeStats(tasks, days), warnings }
}

/**
 * The ONLY place that writes.
 *
 * @param {WorkResult} workResult
 * @param {Pick<CommandContext, 'json'|'stale'>} context
 * @returns {void}
 */
function formatWorkResult ({ summary, warnings }, { json, stale }) {
  for (const message of warnings) warn(message)

  if (stale) {
    if (json) return jsonOut({ stale: summary.stale })
    return textOut(summary.stale.length ? summary.stale.map(id => `  ${id}`).join('\n') : '  (none)')
  }

  // `warnings` APPENDED, so the pinned key order (agents/sprint-review.md parses this) is intact.
  // Without it a malformed row is counted in `total` while every `byStatus` bucket reads 0 —
  // present in the sum, absent from every answer — and the only sentence saying so goes to stderr,
  // which no `--json` consumer reads.
  if (json) jsonOut(warnings.length ? { ...summary, warnings } : summary)
  else textOut(formatStats(summary))
}
