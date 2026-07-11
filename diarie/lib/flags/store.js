/**
 * Store-location flags — shared by every command that reads a store.
 *
 * `requireRoot` is deliberately NOT named `validateStoreFlags`: it touches the
 * filesystem (it searches upward for the store), so it is a resolution seam, not a
 * pure validator. The pure ones are `validateFilterFlags` and `validateStaleFlags`;
 * do not hold this up as an example of that pattern.
 */

import { TRACKER_DIR } from '../schema.js'
import { NoStoreError, resolveRoot } from '../store.js'
import { InputError } from '../utils/errors.js'

export const storeFlags = /** @satisfies {import('peowly').AnyFlags} */ ({
  root: {
    description: `Project root holding ${TRACKER_DIR}/ (default: search upward from cwd)`,
    listGroup: 'Store options',
    type: 'string',
  },
})

/**
 * Resolve the store root, converting a NoStoreError into an InputError.
 *
 * A missing store is a USER error, not a crash and — emphatically — not an empty
 * backlog. The tracker used to print `{"ready":[]}` to stdout and its only warning
 * to a stderr that ten call sites discard, so "I can't find your store" and "you
 * have no work" were indistinguishable to every consumer. That is the bug this
 * function exists to make impossible.
 *
 * The ENOSTORE code rides on the error so `--json` callers can branch on it.
 *
 * @param {string|undefined} root
 * @returns {string}
 * @throws {InputError}
 */
export function requireRoot (root) {
  try {
    return resolveRoot({ root })
  } catch (err) {
    // The code rides through so the --json branch can emit {code: 'ENOSTORE'} rather
    // than a human sentence a machine consumer would have to regex.
    if (err instanceof NoStoreError) throw new InputError(err.message, undefined, err.code)
    throw err
  }
}
