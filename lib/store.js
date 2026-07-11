/**
 * store.js — locating and loading the flat-YAML task store.
 *
 * THE ONLY PLACE THAT KNOWS HOW TO FIND A STORE, and the only place that can
 * say it failed to. Everything else takes a resolved root.
 *
 * ## Why a missing store is an ERROR
 *
 * The tracker used to resolve its root from `import.meta.url` — its own location
 * on disk — and, when it found nothing there, print an empty backlog and exit 0:
 *
 *     $ TASKS_ROOT=/tmp/empty node scripts/ready-walker.mjs --format json
 *     ready-walker: no .diarie/ under /tmp/empty …          <- stderr
 *     { "ready": [], "blocked": [], "needsAttention": [] }   <- stdout
 *     $ echo $?
 *     0
 *
 * stdout carried a well-formed, entirely fictional "you have no work", and the
 * only signal that the tool was lost went to stderr — which ten call sites pipe
 * to /dev/null. An ABSENT store and an EMPTY store were indistinguishable to
 * every consumer.
 *
 * So: **only "I was told to look and found nothing" is an error.** An empty
 * backlog is a legitimate answer; a missing store is a question we cannot answer.
 *
 *   store root not found  -> ENOSTORE, non-zero exit
 *   .diarie/ but no tasks/     -> valid empty backlog, exit 0
 *   tasks/ but no tasks-*.yml  -> valid empty backlog, exit 0
 *   tasks-*.yml with `tasks: []` -> valid empty backlog, exit 0
 *
 * This is also what makes the tracker safe to package: once the code lives in
 * `node_modules/diarie/lib/`, an `import.meta.url`-relative root would point at
 * the package's own directory. Under the old contract that bug was invisible
 * (empty store, exit 0, checks green). Under this one it is a hard failure on
 * the first run.
 */

import { existsSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { env } from 'node:process'

import yaml from 'js-yaml'

import { isNil, nsId, TRACKER_DIR } from './schema.js'

/**
 * Thrown when the store root cannot be found. Carries `code` so machine
 * consumers can distinguish "no store here" from "your backlog is empty" —
 * the distinction the old contract collapsed.
 */
export class NoStoreError extends Error {
  /** @override */
  name = 'NoStoreError'

  /** @type {'ENOSTORE'} */
  code = 'ENOSTORE'

  /**
   * @param {string} from       where we looked
   * @param {boolean} searched  true if we walked up from cwd; false if given an explicit root
   */
  constructor (from, searched) {
    super(searched
      // Say what was actually done. An explicit --root is not a search, and
      // reporting "searched upward" when we did not is its own small lie.
      ? `no ${TRACKER_DIR}/ found in ${from} or any parent — run \`diarie init\`, or pass --root <dir>`
      : `no ${TRACKER_DIR}/ in ${from} — run \`diarie init\` there, or point --root somewhere else`)

    /** @type {string} */
    this.from = from

    /** @type {boolean} */
    this.searched = searched
  }
}

/**
 * Resolve the project root that holds `<root>/.diarie/`.
 *
 * Order: explicit `--root` > `TASKS_ROOT` env > walk up from cwd > throw.
 * There is deliberately no silent fallback to cwd — that is the behaviour this
 * module exists to delete.
 *
 * Every path is verified, explicit ones included — see the comment in the body.
 * `init` is the one command that does NOT call this (its job is a root with no
 * store yet); it uses `resolveInitRoot`.
 *
 * @param {object} [options]
 * @param {string} [options.root]  explicit root (the `--root` flag)
 * @param {string} [options.cwd]   where to start the upward search
 * @returns {string}
 * @throws {NoStoreError} when no `.diarie/` is found
 */
export function resolveRoot ({ cwd = process.cwd(), root } = {}) {
  // EVERY path is verified, including the explicit ones. An explicit `--root`
  // that holds no store is still "told to look and found nothing" — and it is
  // the case that matters most, because the hooks ALWAYS pass `--root`. Trusting
  // it unchecked would hand them back the very empty-backlog lie this deletes.
  const explicit = root ?? env.TASKS_ROOT
  if (explicit) {
    const dir = resolve(explicit)
    if (!existsSync(join(dir, TRACKER_DIR))) throw new NoStoreError(dir, false)
    return dir
  }

  let dir = resolve(cwd)
  for (;;) {
    if (existsSync(join(dir, TRACKER_DIR))) return dir
    const parent = dirname(dir)
    if (parent === dir) throw new NoStoreError(resolve(cwd), true) // hit the filesystem root
    dir = parent
  }
}

/**
 * Resolve the root for `init` — the one command whose job is a root with NO store
 * yet. No search, no ENOSTORE: you are naming where the store will be created.
 *
 * @param {object} [options]
 * @param {string} [options.root]
 * @param {string} [options.cwd]
 * @returns {string}
 */
export function resolveInitRoot ({ cwd = process.cwd(), root } = {}) {
  return resolve(root ?? env.TASKS_ROOT ?? cwd)
}

/**
 * @typedef {object} Task
 * @property {string} id          globally-unique id (loader prefixes with slug)
 * @property {string} [title]
 * @property {import('./schema.js').Status} status
 * @property {import('./schema.js').Priority} [priority]
 * @property {import('./schema.js').TaskType} [type]
 * @property {string[]} [deps]    resolvable ids in the same namespace
 * @property {string} [parent]
 * @property {string[]} [labels]
 * @property {string[]} [acceptance_criteria]
 * @property {string} [agent]
 * @property {string} [updated]   ISO date
 * @property {string} [description]
 */

/**
 * A task as returned by loadTasks — a Task plus loader-only provenance. The
 * provenance fields are internal and stripped before any JSON output.
 *
 * @typedef {Task & { _slug?: string, _file?: string }} LoadedTask
 */

/**
 * Drop the loader-only provenance fields (`_slug`, `_file`) before output.
 *
 * Lives here, in the module that ADDS them — a leak is otherwise inevitable, and it
 * happened: the first cut of `diarie ready --json` emitted `_slug`/`_file` into
 * every consumer's parsed output because the stripping lived in the old reader's
 * private scope and the new command simply forgot. The thing that creates a mess
 * should own cleaning it up.
 *
 * @param {LoadedTask} t
 * @returns {Task}
 */
export const strip = ({ _file, _slug, ...task }) => task

/**
 * Coerce a YAML `deps` value to a safe namespaced string[]: an array → namespace
 * each entry; nil → []; any other shape → [] plus a warning (the validator owns
 * the hard error — this just keeps the reader from crashing).
 *
 * @param {unknown} raw
 * @param {string} slug
 * @param {string} file
 * @param {string} taskId
 * @param {(msg: string) => void} warn
 * @returns {string[]}
 */
function safeDeps (raw, slug, file, taskId, warn) {
  if (isNil(raw)) return []
  if (Array.isArray(raw)) return raw.map(d => nsId(d, slug))
  warn(`${file}: task ${taskId}: "deps" is not a list — treating as empty (run \`diarie validate\`)`)
  return []
}

/** Matches the task files the store globs. Decisions and docs are deliberately outside it. */
const TASKS_FILE_RE = /^tasks-.+\.ya?ml$/

/**
 * List the `tasks-<slug>.yml` files under a resolved root.
 *
 * An absent `tasks/` dir is an EMPTY store, not a missing one — the root has
 * already been proven to exist by resolveRoot().
 *
 * @param {string} root
 * @returns {Promise<{ tasksDir: string, names: string[], ignored: string[] }>}
 */
export async function listTaskFiles (root) {
  const tasksDir = join(root, TRACKER_DIR, 'tasks')
  if (!existsSync(tasksDir)) return { tasksDir, names: [], ignored: [] }
  const entries = await readdir(tasksDir)
  return {
    tasksDir,
    names: entries.filter(f => TASKS_FILE_RE.test(f)),
    // A dir of non-matching files is not the same as an empty substrate —
    // callers surface this rather than skip it silently.
    ignored: entries.filter(f => !f.startsWith('.') && !TASKS_FILE_RE.test(f)),
  }
}

/**
 * Derive a file's slug (`tasks-<slug>.yml` → `<slug>`).
 *
 * @param {string} file
 * @returns {string}
 */
export const slugOf = (file) => file.replace(/^tasks-/, '').replace(/\.ya?ml$/, '')

/**
 * Load and globalize every task under a resolved root. Bare dep ids are
 * namespaced to their file's slug; `slug/id` deps pass through.
 *
 * @param {string} root
 * @param {(msg: string) => void} [warn]
 * @returns {Promise<LoadedTask[]>}
 */
export async function loadTasks (root, warn = () => {}) {
  const { names, tasksDir } = await listTaskFiles(root)
  /** @type {LoadedTask[]} */
  const all = []

  for (const file of names) {
    const slug = slugOf(file)
    const doc = /** @type {any} */ (yaml.load(await readFile(join(tasksDir, file), 'utf8')))
    const list = doc?.tasks
    if (!isNil(list) && !Array.isArray(list)) {
      warn(`${file}: "tasks" is not a list — skipping file (run \`diarie validate\`)`)
      continue
    }
    for (const t of list ?? []) {
      if (isNil(t) || typeof t !== 'object' || isNil(t.id)) {
        warn(`${file}: a task entry has no id — skipping it (run \`diarie validate\`)`)
        continue
      }
      all.push({
        ...t,
        id: nsId(t.id, slug),
        deps: safeDeps(t.deps, slug, file, t.id, warn),
        // `parent` is globalized for the SAME reason `deps` is: the ids this loader
        // hands out are `slug/id`, so a raw `parent: T-0` could never match any of
        // them. It was missing here for exactly that long, and every parent lookup
        // silently found nothing — which is why a container epic computed as ready.
        // The store hands out ONE id-space; a half-globalized task is a trap.
        ...(isNil(t.parent) ? {} : { parent: nsId(t.parent, slug) }),
        _slug: slug,
        _file: file,
      })
    }
  }

  return all
}
