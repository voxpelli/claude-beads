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
// CONSUMED RULES ARE PAIRED TOO (2026-07-28). The pairing check runs over local ∪ package rule ids,
// because ast-grep pairs a test to a rule by its `id:` FIELD wherever that rule was loaded from —
// including a `ruleDirs` entry inside `node_modules`. Measured: neuter a package rule's pattern and
// `ast-grep test` goes to exit 4 via a local test file naming that id.
//
// That closes a real blind spot rather than a theoretical one. Before this, neutering a CONSUMED
// rule's pattern left every gate green — `ast-grep test` exits 0 (an unpaired rule is invisible, not
// failing), `ast-grep scan` exits 0 (all three package rules are `severity: warning`), and the count
// assertions below never move, because the rule FILE is still there. The same neutering on a local
// rule was caught. `@voxpelli/ast-grep-rules` excludes its own `rule-tests/` from its tarball, so the
// rules were untested on both sides (filed: `UPSTREAM-voxpelli--ast-grep-rules.md`).
//
// NOTE WHAT IS STILL **NOT** ASSERTED — the pairing proves a rule can match a synthetic snippet, NOT
// that it fires against the real corpus. A rule aimed at a language the scan bound contains no files
// of still passes on fixtures while guarding nothing (`no-jq-raw-interpolation` did exactly that;
// `vp-beads-agr`, a different guard). Do not read a green here as firing-in-anger.
//
// Consequence worth expecting, not "fixing": an upstream rule change now reddens the local snapshot
// on upgrade. That is the point — it is how a silently-altered consumed rule announces itself.
//
// The effective COUNT is asserted separately, by ASKING ast-grep rather than modelling it
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

/** @type {string[]} */
const problems = []

/**
 * Test ids in a directory, keyed off the `-test.yml` suffix. Filenames are how ast-grep DISCOVERS a
 * test, so discovering them the same way is correct here; the `id:` FIELD inside each is verified
 * separately below.
 *
 * @param {string} dir
 * @returns {Set<string>}
 */
const testIdsIn = (dir) => new Set(
  readdirSync(dir).filter(f => f.endsWith('.yml')).map(f => f.replace(/-test\.yml$/, ''))
)

/**
 * Rule ids as DECLARED INSIDE each `.yml`, mapped to the file that declares them.
 *
 * Reading the FIELD rather than the filename is the entire point, and getting it wrong here was a
 * real defect: the first version of this check derived rule ids from filenames while reading the
 * `id:` field of every TEST — enforcing the file's own thesis in exactly one of the two directions.
 * Measured: rename only the `id:` inside a rule file and `ast-grep test` prints
 * `Configuration not found!` and exits 0, `effectiveRuleCount` does not move (the rule still loads,
 * under its new id), and this check reported "7 rules, each paired to a test by its `id:` field" —
 * a claim it had never verified. From there, neutering that rule's pattern is invisible to
 * everything. Reachable from upstream too: the package is pinned `^0.1.0`, so a minor bump may
 * rename an id.
 *
 * @param {string} dir
 * @returns {Map<string, string>} declared id -> filename
 */
const ruleIdsIn = (dir) => {
  /** @type {Map<string, string>} */
  const found = new Map()
  for (const file of readdirSync(dir).filter(f => f.endsWith('.yml'))) {
    const doc = /** @type {Record<string, unknown>} */ (
      yaml.load(readFileSync(join(dir, file), 'utf8')) ?? {}
    )
    if (typeof doc.id !== 'string' || doc.id === '') {
      problems.push(
        `\`${dir}/${file}\` declares no string \`id:\`. ast-grep cannot load it, so it guards ` +
        'nothing — and nothing else here would notice, because every other assertion is keyed on the id.'
      )
      continue
    }
    const stem = file.replace(/\.yml$/, '')
    if (doc.id !== stem) {
      problems.push(
        `\`${dir}/${file}\` declares \`id: ${doc.id}\` — it does not match the filename stem ` +
        `\`${stem}\`. ast-grep pairs on the FIELD, so the rule is really \`${doc.id}\`, while the ` +
        'test and snapshot conventions are keyed on the filename. Rename the file or the id so they agree.'
      )
    }
    const clash = found.get(doc.id)
    if (clash) {
      problems.push(
        `\`${dir}/\` declares \`id: ${doc.id}\` twice (${clash} and ${file}). ast-grep exits 8 on a ` +
        'duplicate rule id.'
      )
      continue
    }
    found.set(doc.id, file)
  }
  return found
}

// EVERY RULE IS ACTUALLY TESTED. `ast-grep test` does not fail on an untested rule. It SKIPS it, and
// never says so: it discovers TEST files and replays them, so a rule with no test simply is not in the
// set. AND THE PAIRING KEY IS NOT THE FILENAME — ast-grep DISCOVERS the test by filename but PAIRS it
// to a rule by the `id:` field INSIDE it. Change only that field and the test silently detaches from
// its rule. So all three must hold: the file exists, its `id:` names this rule, and it carries an
// `invalid:` case.
const ruleIds = new Set(ruleIdsIn(RULES).keys())
const pkgIds = new Set(ruleIdsIn(PKG_RULES).keys())
const testIds = testIdsIn(TESTS)

// Every rule the scan LOADS needs a test, wherever it came from. A package rule is exactly as
// silently-neuterable as a local one, so it gets the same three assertions.
const allRuleIds = ruleIds.union(pkgIds)

/**
 * @param {string} id
 * @returns {string} the directory the rule was declared in
 */
const originOf = id => (ruleIds.has(id) ? RULES : PKG_RULES)

for (const id of [...allRuleIds].toSorted()) {
  if (!testIds.has(id)) {
    problems.push(
      `\`${id}\` (from ${originOf(id)}/) has NO test file (${TESTS}/${id}-test.yml). ` +
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

// The loop header states the finding — these ARE the tests with no rule.
for (const id of [...testIds.difference(allRuleIds)].toSorted()) {
  problems.push(
    `\`${TESTS}/${id}-test.yml\` tests a rule that exists in neither ${RULES}/ nor ${PKG_RULES}/. ` +
    'Either the rule was deleted and its test outlived it, or the `id:` is a typo — ' +
    '`ast-grep test` reports `Configuration not found!` for this and still exits 0.'
  )
}

// A local rule and a package rule sharing an id is not a layering — ast-grep hard-errors
// `Duplicate rule id` (exit 8) and prints NO summary at all, so `effectiveRuleCount` is unreadable.
// Name the collision here, because that symptom otherwise reaches the reader as a probe complaint
// pointing nowhere near the cause. Both sides are DECLARED ids, not filenames: a collision between
// two differently-named files was the shape that slipped through before.
for (const id of [...ruleIds.intersection(pkgIds)].toSorted()) {
  problems.push(
    `\`${id}\` is defined in BOTH ${RULES}/ and ${PKG_RULES}/. ast-grep does not layer these — ` +
    'it exits 8 on a duplicate id. Adopting a packaged rule means deleting the local file outright.'
  )
}

// THE PACKAGE RULES ARE ACTUALLY LOADED. Ask ast-grep for the count it really used; never infer it.
const expected = allRuleIds.size

// `--inspect summary` reports on STDERR. `spawnSync` (not `execFileSync`) because the value needed is
// stderr, which execFileSync does not return — its return value is STDOUT, so an earlier draft that
// silenced stdout read back an empty string and could never find the count. It failed loudly rather
// than skipping the assertion, which is the only reason that draft did not ship as a dead guard.
// spawnSync also tolerates a non-zero scan (a duplicate rule id exits 8) without throwing. It does
// NOT print a summary in that case — measured, correcting an earlier claim here that it did — so the
// count assertions correctly fall into could-not-determine, and the duplicate-id check above exists
// to name the cause the probe cannot.
//
// The binary is addressed DIRECTLY, not through `npx`: inside a gate, `npx` adds startup latency and,
// worse, carries an install-if-missing resolution path — a check that can silently reach the network
// and fetch *something* is a check whose subject is not pinned. `@ast-grep/cli` is a devDependency,
// so this path exists whenever the repo is installed at all.
const probe = spawnSync('node_modules/.bin/ast-grep', ['scan', '--inspect', 'summary'], {
  encoding: 'utf8', maxBuffer: Infinity,
})
const effective = Number(/effectiveRuleCount=(\d+)/.exec(probe.stderr ?? '')?.[1])

if (!Number.isInteger(effective)) {
  // Say WHY. A missing binary, a renamed `--inspect` flag, a changed output format and an ast-grep
  // crash all land here, and without the spawn's own diagnostics they are one indistinguishable
  // message — honest about not having run the assertion, useless for fixing it.
  const why = [
    probe.error?.message,
    typeof probe.status === 'number' ? `exit ${probe.status}` : undefined,
    // A spawn killed by a signal leaves `error` undefined AND `status` null, so without this the
    // whole message collapses to "(no output, no error, no exit status)" — the one path that
    // otherwise loses its own diagnostic.
    probe.signal ? `killed by ${probe.signal}` : undefined,
    (probe.stderr ?? '').trim().slice(0, 500) || undefined,
  ].filter(Boolean).join(' · ')
  problems.push(
    'could not read `effectiveRuleCount` from `ast-grep scan --inspect summary` — the count assertions ' +
    'did not run, so a shrunken rule set would pass unnoticed. Fix the probe rather than dropping it. ' +
    `Probe said: ${why || '(no output, no error, no exit status)'}`
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
  `check-rule-parity: ${allRuleIds.size} rule(s) (${ruleIds.size} local + ${pkgIds.size} from ` +
  `${PKG_RULES}/), each paired to a test by its \`id:\` field, each with an \`invalid:\` case; ` +
  `ast-grep loaded ${effective}`
)
