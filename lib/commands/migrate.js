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

import { runMigration } from '../migrate/bootstrap.js'
import { TRACKER_DIR } from '../schema.js'
import { InputError } from '../utils/errors.js'

const USAGE = `Usage: diarie migrate <bd-export.jsonl> [options]

  --root <dir>            project root to write into (default: the current directory)
  --epic <id>=<slug>      route an epic + its descendants to tasks-<slug>.yml (repeatable)
  --default-slug <slug>   everything else (default: backlog)
  --title <slug>=<title>  meta.title for a slug (repeatable)
  --force                 overwrite an existing task store (destroys hand-edits)

Get the input with:  bd export -o /tmp/bd-export.jsonl

This is a BOOTSTRAP, not a sync. It runs once; afterwards the store is hand-edited
like any other file. An existing store is a hard stop unless you pass --force.`

/** @type {import('peowly-commands').CliCommand} */
export const migrate = {
  description: `Migrate a bd (beads) export into a ${TRACKER_DIR}/ store — one way, once`,

  async run (argv) {
    if (!argv.length || argv.includes('--help') || argv.includes('-h')) {
      throw new InputError('migrate needs a bd export file', USAGE)
    }

    await runMigration(argv)
  },
}
