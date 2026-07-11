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
    argv,
    name: 'diarie',
    importMeta: import.meta,
  })
}
