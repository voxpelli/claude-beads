/**
 * index.js — diarie's public library surface.
 *
 * The node-cli-template is bin-only ("consumers never import the CLI as a
 * library"), but diarie is a library-with-a-bin: vp-beads' plugin tooling imports
 * the pure functions directly (validate-plugin's silent-skip auditor, the beads
 * de-integration probe, the test suites). Hence `exports` alongside `bin`.
 *
 * `./schema` is exported as its own subpath because it is THE AUTHORITY — the
 * one definition of the enums, the ready rule's vocabulary, and TRACKER_DIR. An
 * ast-grep rule enforces that nothing hardcodes the tracker directory instead of
 * importing it from here.
 */

export * from './schema.js'
export {
  computeReady, computeStats, formatStats, line,
} from './ready.js'
export { lintTasks } from './validate.js'
export {
  listTaskFiles, loadTasks, NoStoreError, nsId, resolveInitRoot, resolveRoot, slugOf,
} from './store.js'
