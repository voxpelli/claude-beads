/**
 * Staleness flags — the in-progress claim that nobody has touched.
 *
 * Deliberately in_progress-scoped: a pending task that has sat for a year is a
 * backlog, not a problem. A CLAIMED task that has sat for a month is an abandoned
 * claim.
 *
 * `validateStaleFlags` is pure, and it is the reason this group exists: `--days` is
 * a *string* on the wire and a *number* in the work, and the coercion between them
 * is the kind that fails silently (see below).
 */

import { InputError } from '../utils/errors.js'

export const staleFlags = /** @satisfies {import('peowly').AnyFlags} */ ({
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

/**
 * @typedef StaleFlags
 * @property {number} days A non-negative integer.
 * @property {boolean} stale
 */

/**
 * @param {import('peowly').TypedFlags<typeof staleFlags>} flags
 * @returns {StaleFlags}
 * @throws {InputError} when --days is not a non-negative number
 */
export function validateStaleFlags ({ days: rawDays, stale }) {
  const days = Number(rawDays)

  // Loudly, not as a silent NaN. `--days abc` producing a cutoff of NaN would make
  // every comparison false and report zero stale tasks — a confident wrong answer,
  // which is this project's signature failure and the reason the coercion is tested.
  if (!Number.isFinite(days) || days < 0) {
    throw new InputError(`--days must be a non-negative number (got ${JSON.stringify(rawDays)})`)
  }

  return { days: Math.trunc(days), stale }
}
