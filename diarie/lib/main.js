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
import { InputError } from './utils/errors.js'

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
  // A BARE `diarie` must not exit 2. peowly-commands answers a missing subcommand with
  // `cli.showHelp()`, and peowly's showHelp defaults to `process.exit(2)` — deliberately,
  // for "incorrect usage" (peowly#47). But 2 is ALREADY SPOKEN FOR here: it is ResultError,
  // "it ran, and the answer is no" (a cyclic backlog, `--strict`). Letting both share it
  // means a CI job branching on 2 cannot tell a dependency cycle from a typo — so the bare
  // invocation is intercepted BEFORE peowly-commands can exit, and becomes what it actually
  // is: the user did not say what they wanted.
  if (argv.length === 0) {
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
    // A TYPO IS NOT A BUG IN THE TOOL. Unnormalized, both cases below fall through to
    // cli.js's "genuinely unexpected: a bug, not a user mistake" branch, which answers with
    // a STACK TRACE — and, under `--json`, with an EMPTY STDOUT, silently violating the very
    // contract cli.js's header spells out. `diarie frobnicate` deserves a sentence, not a
    // dump of `node:internal/util/parse_args` frames.
    if (err instanceof PeowlyCommandMissingError) {
      throw new InputError(`unknown command: ${err.commandName}`, COMMAND_LIST, 'EUSAGE')
    }

    // node:util.parseArgs (which peowly wraps) throws these for an unknown flag, a bad flag
    // value, or an unexpected positional. All three are the user's mistake, not ours.
    if (isErrorWithCode(err) && err.code.startsWith('ERR_PARSE_ARGS_')) {
      throw new InputError(err instanceof Error ? err.message : 'invalid arguments', undefined, 'EUSAGE')
    }

    throw err
  }
}
