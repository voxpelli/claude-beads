/**
 * `diarie stats` — summary counts.
 *
 * PINNED JSON SHAPE (agents/sprint-review.md parses it):
 *   {total, ready, blocked, stale[], malformedDates[], byStatus, byPriority, byType}
 *
 * `--stale` reports in_progress tasks not touched in N days. It is deliberately
 * in_progress-scoped: a pending task that has sat for a year is a backlog, not a
 * problem. A CLAIMED task that has sat for a month is an abandoned claim.
 */

import { peowly } from 'peowly'

import { outputFlags, requireRoot, storeFlags } from '../flags.js'
import { jsonOut, textOut, warn } from '../format.js'
import { computeStats, formatStats } from '../ready.js'
import { loadTasks } from '../store.js'
import { InputError } from '../utils/errors.js'

const flags = /** @satisfies {import('peowly').AnyFlags} */ ({
  ...outputFlags,
  ...storeFlags,
  days: {
    description: 'Staleness threshold in days for in-progress claims',
    type: 'string',
    'default': '30',
  },
  stale: {
    description: 'Show only the stale in-progress claims',
    type: 'boolean',
    'default': false,
  },
})

/** @type {import('peowly-commands').CliCommand} */
export const stats = {
  description: 'Summary counts: totals, ready, blocked, stale claims',

  async run (argv, meta, { parentName }) {
    const { flags: opts } = peowly({
      ...meta,
      args: argv,
      description: stats.description,
      name: `${parentName} stats`,
      options: flags,
      usage: '[--stale] [--days <n>] [--json]',
    })

    // Loudly, not as a silent NaN. `--days abc` producing a cutoff of NaN would make
    // every comparison false and report zero stale tasks — a confident wrong answer.
    const days = Number(opts.days)
    if (!Number.isFinite(days) || days < 0) {
      throw new InputError(`--days must be a non-negative number (got ${JSON.stringify(opts.days)})`)
    }

    const root = requireRoot(opts.root)
    const tasks = await loadTasks(root, warn)
    const summary = computeStats(tasks, Math.trunc(days))

    if (opts.stale) {
      if (opts.json) return jsonOut({ stale: summary.stale })
      return textOut(summary.stale.length ? summary.stale.map(id => `  ${id}`).join('\n') : '  (none)')
    }

    if (opts.json) jsonOut(summary)
    else textOut(formatStats(summary))
  },
}
