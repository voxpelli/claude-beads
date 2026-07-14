/**
 * The one sanctioned exit 2, and the only place in diarie allowed to write it.
 *
 * Exit 2 means `ResultError`: it ran, and the answer is "no" — an invalid store, a cyclic
 * backlog, `--strict`. It is the one exit code this tool exists to make trustworthy, and a
 * second meaning would destroy it: a CI job branching on 2 could no longer tell a dependency
 * cycle from a typo. Everything a user can get *wrong* is an `InputError` — exit 1, with a
 * machine-readable code (`ENOSTORE`, `EUSAGE`, `EEXIST`).
 *
 * WHY A WHOLE MODULE FOR ONE CALL. The invariant was first guarded by an ast-grep rule that
 * exempted `exit(2)` when it sat inside an `if (err instanceof ResultError)`. Two reviewers broke
 * that exemption in three different ways within minutes — an `exit(2)` in the ELSE arm, one in a
 * closure nested inside the sanctioned branch, and one in an `if` merely *wrapped* by the
 * sanctioned branch. All three were exempted, silently. The exemption was strictly harder to
 * reason about than the thing it was protecting, which is how a guard becomes a liability.
 *
 * So the exemption is gone. `exit(2)` is now banned OUTRIGHT everywhere in `diarie/lib/**` and
 * `cli.js` (`no-unsanctioned-exit-2`), and every exit code must be a literal
 * (`no-computed-exit-code`, which closes `const TWO = 2; exit(TWO)`). This file is the sole
 * `ignores:` entry — one file, one function, one call. The rule needs no logic, and there is
 * nowhere left for a second meaning to hide.
 *
 * `git grep exitResultError` is now an exhaustive list of every way this process can exit 2.
 */

import { exit } from 'node:process'

/**
 * Exit 2 — the operation ran and the answer is "no".
 *
 * Callers must have already said their piece on stdout: `validate` prints the errors it found,
 * and the errors ARE the output. There is deliberately no message here.
 *
 * @returns {never}
 */
export function exitResultError () {
  exit(2)
}
