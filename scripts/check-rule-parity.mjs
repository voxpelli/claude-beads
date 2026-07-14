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
//   3. Every rule in EITHER tree is genuinely TESTED — a test file exists, its `id:` FIELD names that
//      rule, and it carries at least one `invalid:` case. `ast-grep test` checks none of this and
//      cannot: it discovers TEST files and replays them, so a rule it cannot pair is not "failing" to
//      it — it is INVISIBLE. Two measured ways to detach a rule from its test, both exit 0:
//        - delete the test file      -> `ok. 7 passed; 0 failed`, and the 8th is never named
//        - change only its `id:`     -> `Configuration not found! <id>`, printed, and still exit 0
//      A rule with a typo'd pattern then passes every check we own: unpaired, so `ast-grep test` skips
//      it; matching nothing, so `ast-grep scan` exits 0; and single-tree, so the parity check above
//      never looks at it. Three green checks over a rule that guards nothing.
//
// NOTE WHAT IS **NOT** ASSERTED — and this is the big one. Nothing here checks that a rule can ever
// FIRE. `files:`/`ignores:` drift is invisible by construction (the two copies are SUPPOSED to be
// scoped differently), and so is a rule aimed at a language the scan bound contains no files of:
// `no-jq-raw-interpolation` is `language: bash` and guarded NOTHING for its entire life, while passing
// `ast-grep test` 6/6 on synthetic snippets. That is `vp-beads-agr`, and it is a different guard.
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
 * The two trees, each as `{ rules, tests }`. `testDir` mirrors the `testConfigs` entry in the
 * corresponding `sgconfig.yml`; ast-grep pairs a rule with `<testDir>/<id>-test.yml` by NAME, so
 * the pairing is checkable here without asking ast-grep anything.
 */
const TREES = [
  { label: 'root', rules: ROOT, tests: '.ast-grep/rule-tests' },
  { label: 'diarie', rules: DIARIE, tests: 'diarie/.ast-grep/rule-tests' },
]

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

// (3) EVERY RULE IS ACTUALLY TESTED — in BOTH trees, shared or not.
//
// `ast-grep test` does not fail on an untested rule. It SKIPS it, and never says so: it discovers
// TEST files and replays them, so a rule with no test simply is not in the set. Delete one test file
// and it prints `ok. 7 passed; 0 failed` and exits 0 — going from 8 rules to 7 without naming the one
// it dropped.
//
// AND THE PAIRING KEY IS NOT THE FILENAME. ast-grep DISCOVERS the test by filename but PAIRS it to a
// rule by the `id:` field INSIDE it. Change only that field — leave the filename alone — and the test
// silently detaches from its rule: `Configuration not found! <id>`, printed to stdout, **exit 0**.
// Both are measured. So all three must hold: the file exists, its `id:` names this rule, and it
// actually carries an `invalid:` case (a test with nothing to reject proves nothing).
for (const { label, rules, tests } of TREES) {
  const ruleIds = idsIn(rules)
  const testFiles = readdirSync(tests).filter(f => f.endsWith('-test.yml'))
  const testIds = new Set(testFiles.map(f => f.replace(/-test\.yml$/, '')))

  for (const id of [...ruleIds].sort()) {
    if (!testIds.has(id)) {
      problems.push(
        `[${label}] \`${id}\` has NO test file (${tests}/${id}-test.yml). ` +
        '`ast-grep test` will not fail — it will not even name it.'
      )
      continue
    }

    const doc = /** @type {Record<string, unknown>} */ (
      yaml.load(readFileSync(join(tests, `${id}-test.yml`), 'utf8')) ?? {}
    )

    if (doc.id !== id) {
      problems.push(
        `[${label}] \`${tests}/${id}-test.yml\` declares \`id: ${String(doc.id)}\` — ast-grep pairs a ` +
        `test to a rule by that FIELD, not by the filename, so \`${id}\` is UNTESTED. ` +
        '`ast-grep test` prints `Configuration not found!` and exits 0.'
      )
    }

    if (!Array.isArray(doc.invalid) || doc.invalid.length === 0) {
      problems.push(
        `[${label}] \`${tests}/${id}-test.yml\` has no \`invalid:\` case — nothing proves the rule can ` +
        'match ANYTHING. A test that only lists what a rule must ignore is satisfied by a rule that ' +
        'ignores everything.'
      )
    }
  }

  for (const id of [...testIds].sort()) {
    if (!ruleIds.has(id)) {
      problems.push(`[${label}] \`${tests}/${id}-test.yml\` tests a rule that does not exist in ${rules}/.`)
    }
  }
}

if (problems.length) {
  console.error(
    `check-rule-parity: ${problems.length} problem(s) between\n` +
    `  ${ROOT}/  and  ${DIARIE}/\n\n` +
    problems.map(p => `  - ${p}`).join('\n') + '\n\n' +
    'Only `files:`/`ignores:` may differ between the copies (they are scoped to different trees).\n' +
    'ast-grep has no config inheritance, so the copies are unavoidable — drifting apart in SILENCE\n' +
    'is not. And every rule needs a test file: ast-grep SKIPS a rule that has none.'
  )
  process.exit(1)
}

const tested = TREES.reduce((n, t) => n + idsIn(t.rules).size, 0)
// Say exactly what was checked. "each with a test file" would be an UNDERclaim now — and a summary
// line that drifts from what the code asserts is how a guard quietly stops meaning anything.
console.log(
  `check-rule-parity: ${inBoth.length} shared rules, set verified, bodies identical; ` +
  `${tested} rules across both trees, each paired to a test by its \`id:\` field, each with an \`invalid:\` case`
)
