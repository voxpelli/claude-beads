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
 * So the exemption is gone. Exit 2 is now banned OUTRIGHT everywhere in `diarie/lib/**` and
 * `cli.js` (`no-unsanctioned-exit-2`), in all three forms it can take — `exit(2)`,
 * `process.exit(2)`, and `process.exitCode = 2`. That third one is the idiomatic MODERN way to set
 * a status, and it evaded the rule until a reviewer planted it: you reach for it precisely to
 * avoid `process.exit()` truncating a pending stdout write, so it is what a careful contributor
 * writes. Its sibling `no-computed-exit-code` requires every exit code to be a plain decimal
 * integer literal, which closes `const TWO = 2`, `0x2`, `2.0`, and `1 + 1` — tree-sitter calls all
 * of those `number` too, and each exits 2 while slipping past a literal-`2` match.
 *
 * This file is the sole `ignores:` entry — one file, one function, one call.
 *
 * `git grep exitResultError` is an exhaustive list of every way this process deliberately exits 2,
 * and `cli.spec.js` enforces that claim rather than trusting this comment: it walks every .js file
 * in the package, strips the comments, and fails if the number is written anywhere else. A claim
 * nobody checks is a comment, not a guarantee — and this one was already false once.
 */

import process from 'node:process'

/**
 * Exit 2 — the operation ran and the answer is "no".
 *
 * Callers must have already said their piece on stdout: `validate` prints the errors it found,
 * and the errors ARE the output. There is deliberately no message here.
 *
 * `process.exitCode = 2`, NOT `process.exit(2)`. THIS IS THE WHOLE POINT OF THE FUNCTION.
 *
 * `process.exit()` terminates immediately and does NOT flush a pending write to a pipe. Stdout to a
 * pipe is asynchronous and the kernel buffer is 64 KB — so `ready --strict --json` against a store
 * with more than ~64 KB of rows emitted exactly 65536 bytes of TRUNCATED, unparseable JSON, and then
 * exited 2. A `--json` consumer runs `jq`, `jq` fails, the caller falls back to "no data" — and a
 * broken store becomes an empty one. That is the founding defect of this tool, re-entered through
 * the very exit code that exists to report it. Measured, on a 400-row store.
 *
 * Setting `exitCode` lets Node drain stdout and exit naturally with the status. It is why the
 * ast-grep rules permit `process.exitCode = 2` *here* and nowhere else.
 *
 * @returns {void}
 */
export function exitResultError () {
  process.exitCode = 2
}
