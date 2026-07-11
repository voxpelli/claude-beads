/**
 * `diarie validate` — the integrity gate.
 *
 * Four passes: structural (required fields, enums, unique ids), dep-graph
 * (dangling deps, orphan parents, cycles via Kahn), status-transition sanity, and
 * the test-ratchet (a completed task should state how you knew it was done).
 *
 * Exit codes carry meaning:
 *   0  the store is clean (INCLUDING an empty store — that is a real answer)
 *   1  no store here (ENOSTORE) — an InputError, via requireRoot
 *   2  the store exists and is INVALID — a ResultError; the errors are the output
 */

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import yaml from 'js-yaml'
import { peowly } from 'peowly'
import { outputFlags, requireRoot, storeFlags } from '../flags.js'
import { jsonOut, textOut, warn } from '../format.js'
import { listTaskFiles, slugOf } from '../store.js'
import { ResultError } from '../utils/errors.js'
import { lintTasks } from '../validate.js'

const flags = /** @satisfies {import('peowly').AnyFlags} */ ({
  ...outputFlags,
  ...storeFlags,
})

/** @type {import('peowly-commands').CliCommand} */
export const validate = {
  description: 'Check the task store for dangling deps, bad enums, and cycles',

  async run (argv, meta, { parentName }) {
    const { flags: opts } = peowly({
      ...meta,
      args: argv,
      description: validate.description,
      name: `${parentName} validate`,
      options: flags,
      usage: '[--json]',
    })

    const root = requireRoot(opts.root)
    const { ignored, names, tasksDir } = await listTaskFiles(root)

    // A dir of non-matching files is not an empty substrate — surface it. Silently
    // ignoring `tasks_old.yml` would mean validating nothing and calling it clean.
    if (ignored.length && !names.length) {
      warn(`tasks/ holds ${ignored.length} file(s) not matching tasks-*.yml (ignored): ${ignored.join(', ')}`)
    }

    const files = []
    /** @type {string[]} */
    const parseErrors = []

    for (const name of names) {
      let doc
      try {
        doc = /** @type {any} */ (yaml.load(await readFile(join(tasksDir, name), 'utf8')))
      } catch (err) {
        // Collect; do NOT bail. Bailing to stderr meant `--json` emitted no JSON at
        // all for an unparseable store — so every consumer reading stdout saw empty
        // output and concluded there was nothing to say, on the single commonest
        // hand-edit mistake there is. `--json` ALWAYS emits JSON. That is the contract.
        parseErrors.push(`${name}: invalid YAML — ${/** @type {Error} */ (err).message}`)
        continue
      }
      files.push({ name: slugOf(name), tasks: doc?.tasks ?? [] })
    }

    const lint = lintTasks(files)
    const errors = [...parseErrors, ...lint.errors]
    const { warnings } = lint

    if (opts.json) {
      jsonOut({ clean: errors.length === 0, errors, warnings })
    } else {
      if (warnings.length) textOut('Warnings:\n' + warnings.map(w => `  ~ ${w}`).join('\n') + '\n')
      if (errors.length) textOut('Task validation failed:\n\n' + errors.map(e => `  - ${e}`).join('\n') + `\n\n${errors.length} error(s).`)
      // An EMPTY store validating clean is correct and worth saying plainly — it is
      // an ABSENT store that is an error, and requireRoot already caught that.
      else textOut(`Task validation passed (${files.length} file(s)).`)
    }

    if (errors.length) throw new ResultError('invalid store')
  },
}
