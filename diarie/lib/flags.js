/**
 * flags.js — flag sets composed per command, plus the one place that turns a
 * missing store into an honest answer.
 *
 * Every read command shares `--json` and `--root`. `--json` is the template's
 * convention (`-j`); the old readers were inconsistent (`ready-walker --format
 * json` but `validate-tasks --json`), and a greenfield CLI should not inherit an
 * incoherence from scripts that no longer exist.
 */

import { TRACKER_DIR } from './schema.js'
import { NoStoreError, resolveRoot } from './store.js'
import { InputError } from './utils/errors.js'

/** Output flags — shared by every command that prints a result. */
export const outputFlags = /** @satisfies {import('peowly').AnyFlags} */ ({
  json: {
    description: 'Output the result as JSON',
    listGroup: 'Output options',
    type: 'boolean',
    'default': false,
    'short': 'j',
  },
})

/** Store-location flags — shared by every command that reads a store. */
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
