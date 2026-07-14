// The ast-grep rules that exist in BOTH trees must not drift apart.
//
// ast-grep's `sgconfig.yml` has no `extends` and no `include` — the format offers no config
// inheritance at all. A rule needed on both sides of the diarie boundary must therefore be a COPY:
// the root's guards the plugin (`scripts/`, `hooks/`, `validate-plugin.mjs`), diarie's guards the
// package and travels with it on `git subtree split`.
//
// Copies drift, and `ast-grep test` structurally cannot notice: it replays each rule against its own
// inline snippets, so it never compares the two files. Someone edits one copy, that copy quietly
// stops matching what its twin matches, and both suites stay green.
//
// WHAT IS ASSERTED, precisely — read this before trusting it:
//
//   1. The SET of rules present in both trees is exactly `SHARED`. Not "contains"; EQUALS. A rule
//      added to both trees and forgotten here is a failure, and so is a `SHARED` entry that has
//      gone missing from a tree.
//   2. For each, the parsed YAML is identical after deleting `files:`/`ignores:` — the two copies
//      are scoped to different trees, so their scoping is SUPPOSED to differ. Everything else —
//      `rule:`, `message:`, `severity:`, `constraints:` — must match.
//
// NOTE WHAT IS **NOT** ASSERTED: drift in `files:`/`ignores:` is invisible here, by construction.
// An `ignores:` appended to one copy silently narrows it and this check will not say so. That is a
// real hole; it is the price of allowing the scoping to differ at all, and naming it is better than
// implying it is covered.
//
// The first version of this script got both halves wrong, and a reviewer proved it in minutes:
// it iterated a HARDCODED list (so a sixth shared rule was unpoliced forever, while the checker
// printed reassurance every run), and it compared the files with a LINE FILTER, which two YAML
// folded-scalar cases walked straight past — a blank line inside a `>-` block is a paragraph break
// that changes the parsed string, and a `#` inside one is literal text, not a comment. A script
// written to catch silent drift, drifting silently. So: compute the set, and parse the YAML.

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'

import yaml from 'js-yaml'

/** Rules that legitimately exist in both trees. The set is ASSERTED below, not assumed. */
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
 * Rule ids in a rules directory.
 *
 * @param {string} dir
 * @returns {Set<string>}
 */
const idsIn = (dir) => new Set(
  readdirSync(dir).filter(f => f.endsWith('.yml')).map(f => f.replace(/\.yml$/, ''))
)

/**
 * The parsed rule, minus the scoping that is supposed to differ.
 *
 * Parsed, not line-filtered. A line filter cannot see YAML: it strips a `#` that is literal text
 * inside a folded scalar, and it strips a blank line that is a paragraph break inside one. Both
 * change the rule's actual message while leaving the filtered text identical.
 *
 * @param {string} path
 * @returns {unknown}
 */
function loadBearing (path) {
  const doc = yaml.load(readFileSync(path, 'utf8'))
  if (doc && typeof doc === 'object') {
    const { files: _files, ignores: _ignores, ...rest } = /** @type {Record<string, unknown>} */ (doc)
    return rest
  }
  return doc
}

/** @type {string[]} */
const problems = []

// (1) THE SET ITSELF. The old version trusted SHARED and never looked at the directories, so a rule
// added to both trees and omitted here was unguarded — silently, permanently, and while the check
// reported success.
const inBoth = [...idsIn(ROOT)].filter(id => idsIn(DIARIE).has(id)).sort()
const listed = [...SHARED].sort()

for (const id of inBoth) {
  if (!listed.includes(id)) {
    problems.push(`\`${id}\` exists in BOTH trees but is not in SHARED — it is unpoliced. Add it.`)
  }
}
for (const id of listed) {
  if (!inBoth.includes(id)) {
    problems.push(`\`${id}\` is in SHARED but is not in both trees — remove it, or restore the missing copy.`)
  }
}

// (2) THE BODIES. Only for rules genuinely in both, so a set mismatch reports once, not twice.
for (const id of inBoth.filter(id => listed.includes(id))) {
  const a = JSON.stringify(loadBearing(join(ROOT, `${id}.yml`)))
  const b = JSON.stringify(loadBearing(join(DIARIE, `${id}.yml`)))
  if (a !== b) {
    problems.push(`\`${id}\` has DRIFTED — its rule/message/severity differs between the two trees.`)
  }
}

if (problems.length) {
  console.error(
    `check-rule-parity: ${problems.length} problem(s) between\n` +
    `  ${ROOT}/  and  ${DIARIE}/\n\n` +
    problems.map(p => `  - ${p}`).join('\n') + '\n\n' +
    'Only `files:`/`ignores:` may differ between the copies (they are scoped to different trees).\n' +
    'ast-grep has no config inheritance, so the copies are unavoidable — drifting apart in SILENCE\n' +
    'is not.'
  )
  process.exit(1)
}

console.log(`check-rule-parity: ${inBoth.length} shared rules, set verified, bodies identical`)
