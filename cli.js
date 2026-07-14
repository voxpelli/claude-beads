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

import { argv, exit, stderr } from 'node:process'

import { isErrorWithCode } from '@voxpelli/typed-utils'
import { messageWithCauses, stackWithCauses } from 'pony-cause'

import { cli } from './lib/main.js'
import { InputError, ResultError } from './lib/utils/errors.js'
import { exitResultError } from './lib/utils/exit.js'

/** True if the user asked for machine-readable output. */
const wantsJson = argv.includes('--json') || argv.includes('-j')

try {
  await cli(argv.slice(2))
} catch (err) {
  // The command has already said its piece on stdout (validate printed the errors).
  // Adding a second, vaguer complaint here would just be noise.
  //
  // `exitResultError()` rather than a bare `exit(2)`: the code is reserved, and the name is what
  // reserves it. See lib/utils/exit.js — it is the only file allowed to write the number.
  if (err instanceof ResultError) exitResultError()

  if (err instanceof InputError) {
    if (wantsJson) {
      // On stdout, WITH a code, so a machine consumer can branch without regexing
      // a human sentence. `code` is set by requireRoot for the ENOSTORE case.
      const code = isErrorWithCode(err) ? err.code : undefined
      process.stdout.write(JSON.stringify({ error: err.message, ...(code ? { code } : {}) }, undefined, 2) + '\n')
    } else {
      stderr.write(`diarie: ${err.message}\n`)
      if (err.body) stderr.write('\n' + err.body + '\n')
    }
    exit(1)
  }

  // Genuinely unexpected: a bug, not a user mistake. Show the whole cause chain —
  // this is the one place a stack trace is the honest answer.
  if (err instanceof Error) {
    stderr.write(`diarie: unexpected error: ${messageWithCauses(err)}\n\n`)
    stderr.write(stackWithCauses(err) + '\n')
  } else {
    stderr.write('diarie: unexpected error with no details\n')
  }
  exit(1)
}
