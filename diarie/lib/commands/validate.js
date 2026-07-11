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
 *
 * Four parts — see `commands/ready.js` for the shape and why `doTheWork` is exported.
 * Note the two distinct channels the WorkResult keeps apart: `warnings` are the
 * linter's, and belong in the ANSWER (stdout, and the `--json` payload); `notices` are
 * asides about the store's shape, and belong on stderr. Collapsing them would put a
 * lint warning somewhere `--json` consumers cannot see it.
 */

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { isObject } from '@voxpelli/typed-utils'
import yaml from 'js-yaml'
import { peowly } from 'peowly'

import { outputFlags, requireRoot, storeFlags } from '../flags/index.js'
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
    const input = setupCommand(`${parentName} validate`, validate.description, argv, meta)
    const workResult = await doTheWork(input)

    formatWorkResult(workResult, input)
  },
}

/**
 * @typedef CommandContext
 * @property {boolean} json
 * @property {string} root
 */

/**
 * @param {string} name
 * @param {string} description
 * @param {string[]} args
 * @param {import('peowly-commands').CliMeta} meta
 * @returns {CommandContext}
 */
function setupCommand (name, description, args, meta) {
  const { flags: opts } = peowly({
    ...meta,
    args,
    description,
    name,
    options: flags,
    usage: '[--json]',
  })

  return { json: opts.json, root: requireRoot(opts.root) }
}

/**
 * @typedef WorkResult
 * @property {string[]} errors Fatal: the store is invalid. Includes YAML parse failures.
 * @property {string[]} warnings The linter's — part of the answer, not an aside.
 * @property {string[]} notices Asides about the store's shape (stderr only).
 * @property {number} fileCount
 */

/**
 * Do the work and RETURN it. Prints nothing.
 *
 * @param {Pick<CommandContext, 'root'>} context
 * @returns {Promise<WorkResult>}
 */
export async function doTheWork ({ root }) {
  const { ignored, names, tasksDir } = await listTaskFiles(root)

  /** @type {string[]} */
  const notices = []

  // A dir of non-matching files is not an empty substrate — surface it. Silently
  // ignoring `tasks_old.yml` would mean validating nothing and calling it clean.
  if (ignored.length && !names.length) {
    notices.push(`tasks/ holds ${ignored.length} file(s) not matching tasks-*.yml (ignored): ${ignored.join(', ')}`)
  }

  const files = []
  /** @type {string[]} */
  const parseErrors = []

  for (const name of names) {
    let doc
    try {
      doc = yaml.load(await readFile(join(tasksDir, name), 'utf8'))
    } catch (err) {
      // Collect; do NOT bail. Bailing to stderr meant `--json` emitted no JSON at
      // all for an unparseable store — so every consumer reading stdout saw empty
      // output and concluded there was nothing to say, on the single commonest
      // hand-edit mistake there is. `--json` ALWAYS emits JSON. That is the contract.
      parseErrors.push(`${name}: invalid YAML — ${/** @type {Error} */ (err).message}`)
      continue
    }
    // Pass the raw value through — do NOT `?? []` it. That default silently laundered
    // a broken file into a clean empty one: a `task:` typo, or a truncation down to
    // just `meta:`, became `tasks: []`, and `lintTasks`' own Pass-0 guard ("top-level
    // 'tasks' must be a list") could never fire, because it never saw the nil. The
    // whole file's backlog disappeared while validate, ready and stats all exited 0.
    //
    // An empty store is a file that SAYS `tasks: []`. A file that says nothing is not
    // empty — it is broken, and only the linter gets to decide that.
    files.push({ name: slugOf(name), tasks: isObject(doc) ? doc['tasks'] : undefined })
  }

  const lint = lintTasks(files)

  return {
    errors: [...parseErrors, ...lint.errors],
    warnings: lint.warnings,
    notices,
    fileCount: files.length,
  }
}

/**
 * The ONLY place that writes.
 *
 * @param {WorkResult} workResult
 * @param {Pick<CommandContext, 'json'>} context
 * @returns {void}
 * @throws {ResultError} when the store is invalid
 */
function formatWorkResult ({ errors, fileCount, notices, warnings }, { json }) {
  for (const message of notices) warn(message)

  if (json) {
    jsonOut({ clean: errors.length === 0, errors, warnings })
  } else {
    if (warnings.length) textOut('Warnings:\n' + warnings.map(w => `  ~ ${w}`).join('\n') + '\n')
    if (errors.length) textOut('Task validation failed:\n\n' + errors.map(e => `  - ${e}`).join('\n') + `\n\n${errors.length} error(s).`)
    // An EMPTY store validating clean is correct and worth saying plainly — it is
    // an ABSENT store that is an error, and requireRoot already caught that.
    else textOut(`Task validation passed (${fileCount} file(s)).`)
  }

  if (errors.length) throw new ResultError('invalid store')
}
