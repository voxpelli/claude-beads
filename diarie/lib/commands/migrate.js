/**
 * `diarie migrate` — one-way cutover from a `bd export` JSONL into a diarie store.
 *
 * A thin wrapper over `runMigration`, which is the same code path the standalone
 * script uses. There is one migrator, not a library plus a drifting copy — the
 * failure mode here is SILENT DATA LOSS (it has already destroyed decision bodies
 * once, in review), so a second implementation would be a second chance to lose
 * someone's backlog.
 *
 * Flags are parsed inside runMigration (node:util parseArgs), not by peowly: its
 * `--epic`/`--title` are REPEATABLE key=value pairs, and the guards that consume
 * them are the tested part. Re-declaring the surface here would be a place for the
 * two to drift.
 */

import { textOut } from '../format.js'
import { runMigration, USAGE } from '../migrate/bootstrap.js'
import { TRACKER_DIR } from '../schema.js'
import { InputError } from '../utils/errors.js'

/** @type {import('peowly-commands').CliCommand} */
export const migrate = {
  description: `Migrate a bd (beads) export into a ${TRACKER_DIR}/ store — one way, once`,

  async run (argv) {
    // `--help` is a REQUEST, not a mistake. It used to share this branch with the
    // no-argument case, so asking for help printed the usage to STDERR and exited 1 —
    // while every other subcommand answers `--help` on stdout with 0. That told every
    // caller (a script, a CI step, a prose-command checker) that asking for help had
    // FAILED, and it made `--help` useless as a uniform way to interrogate the CLI.
    if (argv.includes('--help') || argv.includes('-h')) {
      textOut(USAGE)
      return
    }

    if (!argv.length) {
      throw new InputError('migrate needs a bd export file', USAGE, 'EUSAGE')
    }

    await runMigration(argv)
  },
}
