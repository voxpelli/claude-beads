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
 */

import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { peowly } from 'peowly'

import { outputFlags, storeFlags } from '../flags.js'
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
    const { flags: opts } = peowly({
      ...meta,
      args: argv,
      description: init.description,
      name: `${parentName} init`,
      options: flags,
      usage: '[--slug <name>] [--root <dir>]',
    })

    const root = resolveInitRoot({ root: opts.root })
    const store = join(root, TRACKER_DIR)

    // Refuse, always. Never merge, never overwrite, never "helpfully" back up.
    if (existsSync(store)) {
      throw new InputError(`${TRACKER_DIR}/ already exists in ${root} — refusing to touch an existing store`)
    }

    const tasksFile = join(store, 'tasks', `tasks-${opts.slug}.yml`)
    await mkdir(join(store, 'tasks'), { recursive: true })
    await mkdir(join(store, 'decisions'), { recursive: true })
    await writeFile(tasksFile, STARTER, 'utf8')

    const created = [`${TRACKER_DIR}/tasks/tasks-${opts.slug}.yml`, `${TRACKER_DIR}/decisions/`]

    if (opts.json) return jsonOut({ root, created })

    textOut([
      `Created a task store in ${root}:`,
      ...created.map(f => `  ${f}`),
      '',
      'Commit it. The store IS the repo — that is the whole idea.',
    ].join('\n'))
  },
}
