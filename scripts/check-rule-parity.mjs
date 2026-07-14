// The five ast-grep rules that exist in BOTH trees must not drift apart.
//
// ast-grep's `sgconfig.yml` has no `extends` and no `include` — the format simply offers no config
// inheritance (only ruleDirs / utilDirs / testConfigs / customLanguages / languageGlobs /
// languageInjections). A rule needed on both sides of the diarie boundary must therefore be a COPY.
// The root's copy guards the plugin (`scripts/`, `validate-plugin.mjs`); diarie's guards the package
// and travels with it on `git subtree split`.
//
// Copies drift. Nothing noticed when they did, and `ast-grep test` structurally cannot: it replays
// each rule against its own inline snippets, so it never compares the two files and never reads
// `files:`/`ignores:` at all — which is exactly the axis a rule dies along. Someone appends an
// `ignores:` to one copy, that copy quietly stops guarding, and both suites stay green.
//
// So the parity is asserted here instead of hoped for. The RULE BODY must match byte for byte; the
// SCOPING (`files:`, `ignores:`) is expected to differ and is excluded from the comparison — the
// root's copy is scoped to the plugin's tree, diarie's to its own.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'

/** Rules that legitimately exist in both trees. Anything else in both is a mistake. */
const SHARED = [
  'no-commonjs-require',
  'no-hardcoded-tracker-dir',
  'no-identifier-shadow-call',
  'no-jsdoc-any-type',
  'no-jsdoc-object-typedef',
]

const ROOT = '.ast-grep/rules'
const DIARIE = 'diarie/.ast-grep/rules'

/**
 * The parts that must be identical: everything except the scoping keys and comments.
 *
 * `files:`/`ignores:` are SUPPOSED to differ — that is the whole point of two copies. What must not
 * differ is what the rule actually MATCHES and what it TELLS you when it matches.
 *
 * @param {string} yaml
 * @returns {string}
 */
function loadBearing (yaml) {
  const lines = yaml.split('\n')
  /** @type {string[]} */
  const kept = []
  let skipping = false

  for (const line of lines) {
    if (/^(?:files|ignores):/.test(line)) {
      skipping = true
      continue
    }
    // A new top-level key ends the skipped block.
    if (skipping && /^\S/.test(line)) skipping = false
    if (skipping) continue
    if (/^\s*#/.test(line) || line.trim() === '') continue
    kept.push(line)
  }

  return kept.join('\n')
}

/** @type {string[]} */
const drifted = []

for (const id of SHARED) {
  const a = loadBearing(readFileSync(join(ROOT, `${id}.yml`), 'utf8'))
  const b = loadBearing(readFileSync(join(DIARIE, `${id}.yml`), 'utf8'))
  if (a !== b) drifted.push(id)
}

if (drifted.length) {
  console.error(
    `check-rule-parity: ${drifted.length} shared ast-grep rule(s) have DRIFTED between\n` +
    `  ${ROOT}/  and  ${DIARIE}/\n\n` +
    drifted.map(id => `  - ${id}`).join('\n') + '\n\n' +
    'Their `rule:`/`message:`/`severity:` must stay identical; only `files:`/`ignores:` may differ\n' +
    '(the two copies are scoped to different trees). ast-grep has no config inheritance, so the\n' +
    'copies are unavoidable — but drifting apart in SILENCE is not.'
  )
  process.exit(1)
}

console.log(`check-rule-parity: ${SHARED.length} shared rules identical across both trees`)
