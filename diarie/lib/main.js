/**
 * main.js — command dispatch.
 *
 * `peowly` parses flags but has no subcommands; `peowly-commands` adds the routing
 * layer on top. Each command owns its own flag set and parses it inside `run()`.
 */

import { peowlyCommands } from 'peowly-commands'

import { init } from './commands/init.js'
import { migrate } from './commands/migrate.js'
import { ready } from './commands/ready.js'
import { stats } from './commands/stats.js'
import { validate } from './commands/validate.js'

/** @type {import('peowly-commands').CliCommands} */
const commands = {
  ready,
  stats,
  validate,
  init,
  migrate,
}

/**
 * @param {string[]} argv
 * @returns {Promise<void>}
 */
export async function cli (argv) {
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
}
