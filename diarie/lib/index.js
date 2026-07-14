/**
 * index.js — diarie's public library surface.
 *
 * The node-cli-template this package follows is bin-only ("consumers never import
 * the CLI as a library"), but diarie is a library-with-a-bin: a consuming project's
 * own tooling imports these pure functions directly rather than shelling out to the
 * binary and parsing its stdout — validators, migration probes, and test suites all
 * want the computation, not the rendering. Hence `exports` alongside `bin`.
 *
 * `./schema` is exported as its own subpath because it is THE AUTHORITY — the
 * one definition of the enums, the ready rule's vocabulary, and TRACKER_DIR. An
 * ast-grep rule enforces that nothing hardcodes the tracker directory instead of
 * importing it from here — and that rule deliberately reaches CONSUMERS too, not
 * just this package: a hardcoded `.diarie` in a consumer's guard code would not
 * error after a rename, it would silently stop guarding.
 */

export * from './schema.js'
export {
  computeReady, computeStats, formatStats, line,
} from './ready.js'
export { lintTasks } from './validate.js'
export {
  listTaskFiles, loadTasks, NoStoreError, resolveInitRoot, resolveRoot, slugOf,
} from './store.js'
// `nsId` is NOT re-exported here — it comes from `export * from './schema.js'` above,
// which is now its only home. It used to live in store.js as a second copy of the rule.
