/**
 * `diarie init` — create a store.
 *
 * The one command that must accept a root with NO store, so it uses
 * `resolveInitRoot` rather than `requireRoot` — you are naming where the store WILL
 * be, not asking us to find one.
 *
 * It refuses to touch an existing store. A tracker that can silently clobber your
 * backlog is not a tracker; and the whole premise here is that the data IS the repo,
 * so an overwrite is a `git checkout` away from being permanent.
 *
 * What it writes is deliberately tiny — a store is a directory and a list. There is
 * no `.diarierc`, no config, no state file. If this command ever grows a template
 * engine, something has gone wrong with the substrate.
 *
 * Four parts, even though the work here is a SIDE EFFECT rather than a computation:
 * `doTheWork` writes the store and returns what it created, and `formatWorkResult`
 * decides how to say so. The refusal lives in `doTheWork` because it is a fact about
 * the disk, not about the arguments. (`migrate` is the one command with no such split
 * — its flags are repeatable `key=value` pairs parsed by the migrator itself.)
 */

import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { peowly } from 'peowly'

import { outputFlags, storeFlags } from '../flags/index.js'
import { jsonOut, textOut } from '../format.js'
import { TRACKER_DIR } from '../schema.js'
import { resolveInitRoot } from '../store.js'
import { InputError } from '../utils/errors.js'

const flags = /** @satisfies {import('peowly').AnyFlags} */ ({
  ...outputFlags,
  ...storeFlags,
  slug: {
    description: 'Name of the first task file (tasks-<slug>.yml)',
    type: 'string',
    'default': 'backlog',
  },
})

/** A new store. Not a template — just the shape. */
const STARTER = `# The task store. Plain YAML, committed, reviewed in PRs like any other file.
#
# A task is ready iff type is task, status is pending, and every dep is completed.
# Write tasks by editing this file — there is no CRUD command, on purpose.
#
#   - id: T-1
#     title: Do the thing
#     status: pending        # pending | in_progress | completed | failed | cancelled | deferred
#     type: task             # task | doc | decision | milestone
#     priority: medium       # critical | high | medium | low | backlog
#     labels: [bug]          # framings: bug/feature/chore/story/spike
#     deps: [T-0]            # must be completed before this is ready
#     acceptance_criteria:
#       - how you will know it is done

tasks: []
`

/** @type {import('peowly-commands').CliCommand} */
export const init = {
  description: `Create a ${TRACKER_DIR}/ task store`,

  async run (argv, meta, { parentName }) {
    const input = setupCommand(`${parentName} init`, init.description, argv, meta)
    const workResult = await doTheWork(input)

    formatWorkResult(workResult, input)
  },
}

/**
 * @typedef CommandContext
 * @property {boolean} json
 * @property {string} root Where the store WILL be — it does not exist yet.
 * @property {string} slug
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
    usage: '[--slug <name>] [--root <dir>]',
  })

  return { json: opts.json, root: resolveInitRoot({ root: opts.root }), slug: opts.slug }
}

/**
 * @typedef WorkResult
 * @property {string} root
 * @property {string[]} created Paths, relative to the root.
 */

/**
 * Create the store and RETURN what was created. Prints nothing.
 *
 * @param {Pick<CommandContext, 'root'|'slug'>} context
 * @returns {Promise<WorkResult>}
 * @throws {InputError} when a store is already there
 */
export async function doTheWork ({ root, slug }) {
  const store = join(root, TRACKER_DIR)

  // Refuse, always. Never merge, never overwrite, never "helpfully" back up.
  //
  // `EEXIST` is the exact inverse of `ENOSTORE`, and it is a state, not a typo — so it gets its
  // own code rather than EUSAGE. A caller that wanted `init` to be idempotent can now branch on
  // it instead of regexing this sentence. (It shipped with NO code at all, which meant a --json
  // consumer got a bare `{error: "..."}` and had no way to tell this refusal — the whole reason
  // the guard exists — apart from any other input error.)
  if (existsSync(store)) {
    throw new InputError(
      `${TRACKER_DIR}/ already exists in ${root} — refusing to touch an existing store`,
      undefined,
      'EEXIST'
    )
  }

  await mkdir(join(store, 'tasks'), { recursive: true })
  await mkdir(join(store, 'decisions'), { recursive: true })
  await writeFile(join(store, 'tasks', `tasks-${slug}.yml`), STARTER, 'utf8')

  return {
    root,
    created: [`${TRACKER_DIR}/tasks/tasks-${slug}.yml`, `${TRACKER_DIR}/decisions/`],
  }
}

/**
 * The ONLY place that writes to the terminal (the STORE was written by doTheWork —
 * two different senses of "write", kept apart on purpose).
 *
 * @param {WorkResult} workResult
 * @param {Pick<CommandContext, 'json'>} context
 * @returns {void}
 */
function formatWorkResult ({ created, root }, { json }) {
  if (json) return jsonOut({ root, created })

  textOut([
    `Created a task store in ${root}:`,
    ...created.map(f => `  ${f}`),
    '',
    'Commit it. The store IS the repo — that is the whole idea.',
  ].join('\n'))
}
