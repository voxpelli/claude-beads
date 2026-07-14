/**
 * main.js — command dispatch.
 *
 * `peowly` parses flags but has no subcommands; `peowly-commands` adds the routing
 * layer on top. Each command owns its own flag set and parses it inside `run()`.
 */

import { isErrorWithCode } from '@voxpelli/typed-utils'
import { peowlyCommands, PeowlyCommandMissingError } from 'peowly-commands'

import { init } from './commands/init.js'
import { migrate } from './commands/migrate.js'
import { ready } from './commands/ready.js'
import { stats } from './commands/stats.js'
import { validate } from './commands/validate.js'
import { InputError, ResultError } from './utils/errors.js'

/** @type {import('peowly-commands').CliCommands} */
const commands = {
  ready,
  stats,
  validate,
  init,
  migrate,
}

const COMMAND_LIST = `Commands: ${Object.keys(commands).join(', ')}\n\nRun \`diarie --help\` for the full usage.`

/**
 * Everything a *user* can get wrong is an `InputError` (exit 1). This function is where
 * peowly's error vocabulary is translated into diarie's — see the two guards below.
 *
 * @param {string[]} argv
 * @returns {Promise<void>}
 */
export async function cli (argv) {
  // NO COMMAND must not exit 2. peowly-commands answers a missing subcommand with
  // `cli.showHelp()`, and peowly's showHelp defaults to `process.exit(2)` — deliberately,
  // for "incorrect usage" (peowly#47). But 2 is ALREADY SPOKEN FOR here: it is ResultError,
  // "it ran, and the answer is no" (a cyclic backlog, `--strict`). Letting both share it
  // means a CI job branching on 2 cannot tell a dependency cycle from a typo.
  //
  // "No command" is NOT the same as "no arguments", and reading it that way left the whole
  // bug standing behind a single dash: peowly-commands treats ANY leading-dash first argument
  // as "no command" (`if (commandOrAliasName?.startsWith('-')) commandOrAliasName = undefined`),
  // so `diarie --json` still reached showHelp() and still exited 2 — while printing 589 bytes
  // of human help text to stdout, under the very flag that promises machine-readable output.
  // The interception must therefore cover every argv that names no command at all.
  //
  // `--help` and `--version` are exempt: they ARE the request, and peowly answers both with
  // exit 0. They are honoured wherever they appear, not only in first position.
  const wantsMeta = argv.includes('--help') || argv.includes('--version')
  const names = argv[0]?.startsWith('-') === false

  if (!wantsMeta && !names) {
    throw new InputError('no command given', COMMAND_LIST, 'EUSAGE')
  }

  try {
    await peowlyCommands(commands, {
      // `args`, NOT `argv`. peowly-commands takes `args`; an `argv` key is simply not in
      // CliOptions, so it was silently ignored and the parser fell back to
      // `process.argv`. Production looked fine — process.argv happened to say the same
      // thing — but this function's own parameter did nothing, and driving the CLI
      // in-process (a test, a library consumer) got whatever the real process was
      // invoked with. Caught by tsc the day types were switched on.
      args: argv,
      name: 'diarie',
      importMeta: import.meta,
    })
  } catch (err) {
    // OUR OWN TAXONOMY PASSES THROUGH UNTOUCHED, and it must be checked FIRST.
    //
    // This line is the whole review. Without it, the sniff below reached `err.code.startsWith`
    // on an InputError whose `code` is undefined — because `isErrorWithCode` is `value instanceof
    // Error && 'code' in value`, a PRESENCE check whose type predicate nonetheless promises
    // `code: string`. It is unsound, and tsc endorsed the crash. InputError assigns `this.code`
    // unconditionally, so `'code' in err` is true even when nobody passed one.
    //
    // The result: `ready --filter bogus`, `stats --days abc`, and a second `init` — three clean,
    // actionable InputErrors — became `TypeError: Cannot read properties of undefined`, answered
    // with a stack trace and, under `--json`, an EMPTY STDOUT. Which is verbatim the defect the
    // comment below was written to eliminate. The suite stayed 194/194 green, because the tests
    // covering those paths assert only `exit === 1`, and a crash exits 1 too.
    if (err instanceof InputError || err instanceof ResultError) throw err

    // A TYPO IS NOT A BUG IN THE TOOL. Unnormalized, both cases below fall through to
    // cli.js's "genuinely unexpected: a bug, not a user mistake" branch, which answers with
    // a STACK TRACE — and, under `--json`, with an EMPTY STDOUT. `diarie frobnicate` deserves
    // a sentence, not a dump of `node:internal/util/parse_args` frames.
    if (err instanceof PeowlyCommandMissingError) {
      throw new InputError(`unknown command: ${err.commandName}`, COMMAND_LIST, 'EUSAGE')
    }

    // node:util.parseArgs (which peowly wraps) throws these for an unknown flag, a bad flag
    // value, or an unexpected positional. All three are the user's mistake, not ours.
    //
    // `typeof err.code === 'string'` is NOT redundant with `isErrorWithCode`, however much it
    // reads like it. See above: the guard only proves the KEY exists. Do not "simplify" this.
    if (isErrorWithCode(err) && typeof err.code === 'string' && err.code.startsWith('ERR_PARSE_ARGS_')) {
      // `cause` preserved: if this branch ever fires on OUR misconfiguration (a command that
      // forgot `allowPositionals`, say), the stack must remain recoverable — otherwise the tool
      // reports its own bug as the user's mistake.
      throw new InputError(err.message, undefined, 'EUSAGE', { cause: err })
    }

    throw err
  }
}
