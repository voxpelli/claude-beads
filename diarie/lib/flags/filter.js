/**
 * Status-filter flags.
 *
 * The group owns BOTH halves — the declaration and its meaning — so the two cannot
 * drift apart. `validateFilterFlags` is pure: no filesystem, no printing, no process.
 * It is therefore unit-testable without spawning anything, which is the entire point
 * of lifting it out of `run()`.
 */

import { isStatus, VALID_STATUSES } from '../schema.js'
import { InputError } from '../utils/errors.js'

export const filterFlags = /** @satisfies {import('peowly').AnyFlags} */ ({
  filter: {
    description: `Show tasks in a given status (${[...VALID_STATUSES].join(', ')})`,
    type: 'string',
  },
})

/**
 * @typedef FilterFlags
 * @property {import('../schema.js').Status|undefined} filter
 */

/**
 * @param {import('peowly').TypedFlags<typeof filterFlags>} flags
 * @returns {FilterFlags}
 * @throws {InputError} when the status is not one this store can hold
 */
export function validateFilterFlags ({ filter }) {
  // Absent is not invalid — `--filter` is optional, and its absence selects the
  // partition view rather than the list view. Only a PRESENT-and-wrong value is an error.
  if (filter === undefined) return { filter: undefined }

  // `isStatus`, not `VALID_STATUSES.has()`. A `Set<Status>` refuses a `string` argument
  // outright, so this check used to cast through `any` — an `any`, at the exact
  // validation boundary the Set existed to guard. The guard narrows instead.
  if (!isStatus(filter)) {
    throw new InputError(`--filter must be one of: ${[...VALID_STATUSES].join(', ')}`, undefined, 'EUSAGE')
  }

  return { filter }
}
