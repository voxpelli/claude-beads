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

/** True if the user asked for machine-readable output. */
const wantsJson = argv.includes('--json') || argv.includes('-j')

try {
  await cli(argv.slice(2))
} catch (err) {
  // The command has already said its piece on stdout (validate printed the errors).
  // Adding a second, vaguer complaint here would just be noise.
  if (err instanceof ResultError) exit(2)

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
