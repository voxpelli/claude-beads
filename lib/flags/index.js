/**
 * index.js — the flag-group barrel.
 *
 * Groups are composed by SPREAD at the point of use (`{...outputFlags, ...storeFlags,
 * blocked: {…}}`), which is why a command can take two shared groups and still declare
 * its own one-off booleans inline. A group earns a module when it owns a validator or
 * enables reuse; a bare boolean used by one command does not, and stays in that command.
 *
 * This barrel is the peowly-commands example's convention. The production consumer
 * (list-dependents-cli) has no barrel and imports each group by path instead — both
 * are house style. The barrel wins here only because diarie's groups are few and every
 * reading command wants two of them.
 */

export { filterFlags, validateFilterFlags } from './filter.js'
export { outputFlags } from './output.js'
export { staleFlags, validateStaleFlags } from './staleness.js'
export { requireRoot, storeFlags } from './store.js'
