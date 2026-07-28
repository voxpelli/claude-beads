// Every ast-grep rule in this repo's config must be genuinely TESTED — a test file exists, its `id:`
// FIELD names that rule, and it carries at least one `invalid:` case.
//
// `ast-grep test` checks none of this and cannot: it discovers TEST files and replays them, so a rule
// it cannot pair is not "failing" to it — it is INVISIBLE. Two measured ways to detach a rule from its
// test, both exit 0:
//   - delete the test file   -> `ok. 7 passed; 0 failed`, and the 8th is never named
//   - change only its `id:`   -> `Configuration not found! <id>`, printed, and still exit 0
// A rule with a typo'd pattern then passes every check we own: unpaired, so `ast-grep test` skips it;
// matching nothing, so `ast-grep scan` exits 0. Green checks over a rule that guards nothing. So the
// pairing is asserted HERE, where ast-grep will not: the file exists, its `id:` names this rule, and it
// carries a real `invalid:` case (a test with nothing to reject proves nothing).
//
// (Formerly this also asserted the root and the vendored `diarie/.ast-grep/` configs had not drifted
// apart — a drift `ast-grep test` structurally cannot notice. diarie now lives in its own repo and
// owns its own rules, so that cross-tree half is gone; what remains is the half that was never about
// two trees: every root rule is genuinely tested.)
//
// NOTE WHAT IS **NOT** ASSERTED: nothing here checks that a rule can ever FIRE — a rule aimed at a
// language the scan bound contains no files of passes `ast-grep test` on synthetic snippets while
// guarding nothing (`no-jq-raw-interpolation` did exactly that; `vp-beads-agr`, a different guard).
//
// SECOND HALF, added when `@voxpelli/ast-grep-rules` was adopted (2026-07-22): the pairing check above
// globs rules OFF DISK from `.ast-grep/rules`, so it is structurally blind to the rules `sgconfig.yml`
// pulls out of `node_modules`. Left alone it would report "4 rules, each paired" — TRUE, and quietly no
// longer covering three rules the repo depends on. That is this script's own failure mode turned on
// itself. So the effective COUNT is asserted too, by ASKING ast-grep rather than modelling it
// (`vp-beads-agr`): `--inspect summary` prints `effectiveRuleCount` on stderr, and it demonstrably
// tracks reality. A package that ships fewer rules after an upgrade, or a `ruleDirs` entry that stops
// resolving, then goes RED here instead of silently shrinking the gate.
//
// (A `ruleDirs` path that does not exist is already a hard ast-grep error — exit 6 — so THAT case is
// loud on its own. The silent one is a dir that resolves and contains less than it used to.)

import { spawnSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'

import yaml from 'js-yaml'

const RULES = '.ast-grep/rules'
const TESTS = '.ast-grep/rule-tests'
// Rules consumed from node_modules.
const PKG_RULES = 'node_modules/@voxpelli/ast-grep-rules/rules'

// A HARDCODED FLOOR, and it must stay hardcoded. The first draft of this check derived the expected
// total by counting the rule files on disk (local + package) and asserting equality — which is
// CIRCULAR: delete a rule and the expectation drops with it, so the assertion can never disagree.
// RED-proofed and measured: hiding one package rule reported "6 rules total (+2)" and exited 0. An
// expectation computed from the thing being watched cannot notice that thing shrinking.
//
// So the two assertions below are complementary, not alternatives:
//   - `effective === onDisk` catches rule files that EXIST but were not LOADED (a ruleDirs misconfig)
//   - `effective >= FLOOR`   catches rule files that VANISHED (an upgrade shipping fewer, a bad prune)
// Raise this deliberately when rules are added; that edit is the point, not an annoyance.
const MIN_EFFECTIVE_RULES = 7

/**
 * Rule (or test) ids in a directory, keyed off the `.yml` / `-test.yml` suffix.
 *
 * @param {string} dir
 * @param {RegExp} strip
 * @returns {Set<string>}
 */
const idsIn = (dir, strip) => new Set(
  readdirSync(dir).filter(f => f.endsWith('.yml')).map(f => f.replace(strip, ''))
)

/** @type {string[]} */
const problems = []

// EVERY RULE IS ACTUALLY TESTED. `ast-grep test` does not fail on an untested rule. It SKIPS it, and
// never says so: it discovers TEST files and replays them, so a rule with no test simply is not in the
// set. AND THE PAIRING KEY IS NOT THE FILENAME — ast-grep DISCOVERS the test by filename but PAIRS it
// to a rule by the `id:` field INSIDE it. Change only that field and the test silently detaches from
// its rule. So all three must hold: the file exists, its `id:` names this rule, and it carries an
// `invalid:` case.
const ruleIds = idsIn(RULES, /\.yml$/)
const testIds = idsIn(TESTS, /-test\.yml$/)

for (const id of [...ruleIds].toSorted()) {
  if (!testIds.has(id)) {
    problems.push(
      `\`${id}\` has NO test file (${TESTS}/${id}-test.yml). ` +
      '`ast-grep test` will not fail — it will not even name it.'
    )
    continue
  }

  const doc = /** @type {Record<string, unknown>} */ (
    yaml.load(readFileSync(join(TESTS, `${id}-test.yml`), 'utf8')) ?? {}
  )

  if (doc.id !== id) {
    problems.push(
      `\`${TESTS}/${id}-test.yml\` declares \`id: ${String(doc.id)}\` — ast-grep pairs a test to a rule ` +
      `by that FIELD, not by the filename, so \`${id}\` is UNTESTED. ` +
      '`ast-grep test` prints `Configuration not found!` and exits 0.'
    )
  }

  if (!Array.isArray(doc.invalid) || doc.invalid.length === 0) {
    problems.push(
      `\`${TESTS}/${id}-test.yml\` has no \`invalid:\` case — nothing proves the rule can match ANYTHING. ` +
      'A test that only lists what a rule must ignore is satisfied by a rule that ignores everything.'
    )
  }
}

for (const id of [...testIds].toSorted()) {
  if (!ruleIds.has(id)) {
    problems.push(`\`${TESTS}/${id}-test.yml\` tests a rule that does not exist in ${RULES}/.`)
  }
}

// THE PACKAGE RULES ARE ACTUALLY LOADED. Ask ast-grep for the count it really used; never infer it.
const pkgIds = idsIn(PKG_RULES, /\.yml$/)
const expected = ruleIds.size + pkgIds.size

// `--inspect summary` reports on STDERR. `spawnSync` (not `execFileSync`) because the value needed is
// stderr, which execFileSync does not return — its return value is STDOUT, so an earlier draft that
// silenced stdout read back an empty string and could never find the count. It failed loudly rather
// than skipping the assertion, which is the only reason that draft did not ship as a dead guard.
// spawnSync also tolerates a non-zero scan (a duplicate rule id exits 8) without throwing, and the
// summary is still printed in that case.
const probe = spawnSync('npx', ['ast-grep', 'scan', '--inspect', 'summary'], {
  encoding: 'utf8', maxBuffer: Infinity,
})
const effective = Number(/effectiveRuleCount=(\d+)/.exec(probe.stderr ?? '')?.[1])

if (!Number.isInteger(effective)) {
  problems.push(
    'could not read `effectiveRuleCount` from `ast-grep scan --inspect summary` — the count assertion ' +
    'below did not run, so a shrunken rule set would pass unnoticed. Fix the probe rather than dropping it.'
  )
} else {
  if (effective !== expected) {
    problems.push(
      `ast-grep loaded ${effective} rule(s) but ${expected} rule file(s) are on disk ` +
      `(${ruleIds.size} local in ${RULES}/ + ${pkgIds.size} in ${PKG_RULES}/). ` +
      'Files that exist but are not loaded mean a `ruleDirs` entry is missing or misspelled in ' +
      '`sgconfig.yml` — the rule sits there looking present while guarding nothing.'
    )
  }
  if (effective < MIN_EFFECTIVE_RULES) {
    problems.push(
      `ast-grep loaded only ${effective} rule(s); the floor is ${MIN_EFFECTIVE_RULES}. Rules DISAPPEARED — ` +
      'most likely an upgrade of `@voxpelli/ast-grep-rules` shipping fewer, or a deleted local rule. ' +
      'The on-disk count agrees with the loaded count, so nothing else here can notice this. ' +
      'Confirm the loss is intended, then lower the floor deliberately.'
    )
  }
}

if (problems.length) {
  console.error(
    `check-rule-parity: ${problems.length} problem(s) in ${RULES}/\n\n` +
    problems.map(p => `  - ${p}`).join('\n') + '\n\n' +
    'Every rule needs a test file: `ast-grep test` SKIPS a rule that has none, and pairs test↔rule by\n' +
    'the `id:` field inside the test, not the filename.'
  )
  process.exit(1)
}

console.log(
  `check-rule-parity: ${ruleIds.size} local rule(s), each paired to a test by its \`id:\` field, each with an ` +
  `\`invalid:\` case; ast-grep loaded ${effective} rule(s) total ` +
  `(+${pkgIds.size} from ${PKG_RULES}/, tested upstream in that package, not here)`
)
