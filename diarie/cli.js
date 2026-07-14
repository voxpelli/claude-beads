#!/usr/bin/env node

/**
 * The error boundary. All logic lives in lib/.
 *
 * Exit codes carry meaning, and one of them is the whole point of this tool:
 *
 *   0  the answer is on stdout
 *   1  InputError — you got it wrong. Most importantly: THERE IS NO STORE HERE.
 *   2  ResultError — it ran, and the answer is "no" (invalid store, --strict)
 *
 * NOTHING ELSE MAY USE 2. peowly's `showHelp()` defaults to `exit(2)` for "incorrect
 * usage", which would collide head-on with ResultError and leave a CI job unable to tell
 * a dependency cycle from a typo. `main.js` therefore intercepts the bare invocation, the
 * unknown command, and the unknown flag, and re-throws each as an InputError carrying the
 * code `EUSAGE` — so a machine consumer can tell "you typed it wrong" (EUSAGE) from
 * "there is no store here" (ENOSTORE) without regexing a human sentence.
 *
 * Under `--json`, an InputError is emitted as JSON on STDOUT, not as prose on
 * stderr. That is deliberate and it is the fix for the defect this CLI was built
 * around: the old readers printed `{"ready": []}` to stdout and their only
 * complaint to stderr — a stream that ten call sites pipe to /dev/null — so a
 * tracker that could not find its store was indistinguishable from one reporting
 * an empty backlog. Anything a caller must not miss goes to stdout, and shows up
 * in the exit code. Nothing important is whispered.
 */

import process, { argv, stderr } from 'node:process'

import { messageWithCauses, stackWithCauses } from 'pony-cause'

import { cli } from './lib/main.js'
import { InputError, ResultError } from './lib/utils/errors.js'
import { exitResultError } from './lib/utils/exit.js'

/** True if the user asked for machine-readable output. */
const wantsJson = argv.includes('--json') || argv.includes('-j')

try {
  await cli(argv.slice(2))
} catch (err) {
  // AN IF/ELSE CHAIN, AND `process.exitCode` — NOT `process.exit()`. Both halves are load-bearing.
  //
  // `process.exit()` does not flush a pending write to a PIPE (stdout to a pipe is async, and the
  // kernel buffer is 64 KB). So writing the answer and then exiting truncated any payload over
  // ~64 KB into unparseable JSON — a `--json` consumer's `jq` fails, it falls back to "no data",
  // and a broken store reads as an empty one. The founding defect, re-entered through the exit code
  // that reports it. Setting `exitCode` lets Node drain stdout and exit naturally.
  //
  // Which means these handlers no longer TERMINATE — so they must not fall through. They used to be
  // three sequential `if`s that each ended in `exit()`; drop the exit and a ResultError would sail
  // on into the "genuinely unexpected" branch and be answered with a stack trace.
  if (err instanceof ResultError) {
    // The command has already said its piece on stdout (validate printed the errors).
    // Adding a second, vaguer complaint here would just be noise.
    //
    // `exitResultError()` rather than a bare `exit(2)`: the code is reserved, and the name is what
    // reserves it. See lib/utils/exit.js — it is the only file allowed to write the number.
    exitResultError()
  } else if (err instanceof InputError) {
    if (wantsJson) {
      // On stdout, WITH a code, so a machine consumer can branch without regexing a human
      // sentence: ENOSTORE (no store here), EUSAGE (you typed it wrong), EEXIST (init, refusing
      // an existing store).
      //
      // `err.code` DIRECTLY — not through `isErrorWithCode`, which used to guard this line.
      // `err` is already narrowed to InputError, whose `code` is OUR field and is correctly typed
      // `string|undefined`. Reaching for a foreign predicate to read it was pure downside: that
      // predicate is `value instanceof Error && 'code' in value` — a PRESENCE check whose type
      // signature nonetheless promises `code: string` — so it narrowed nothing here (an InputError
      // always has the key) while licensing a non-string `code` straight into the JSON contract.
      //
      // The same unsound guard crashed main.js on three user-error paths. This was its sibling
      // site, and hardening only the one that had already blown up would have been fixing the
      // instance and leaving the class.
      const { code } = err
      process.stdout.write(JSON.stringify({ error: err.message, ...(code ? { code } : {}) }, undefined, 2) + '\n')
    } else {
      stderr.write(`diarie: ${err.message}\n`)
      if (err.body) stderr.write('\n' + err.body + '\n')
    }
    process.exitCode = 1
  } else {
    // Genuinely unexpected: a bug, not a user mistake. Show the whole cause chain —
    // this is the one place a stack trace is the honest answer.
    if (err instanceof Error) {
      stderr.write(`diarie: unexpected error: ${messageWithCauses(err)}\n\n`)
      stderr.write(stackWithCauses(err) + '\n')
    } else {
      stderr.write('diarie: unexpected error with no details\n')
    }
    process.exitCode = 1
  }
}
