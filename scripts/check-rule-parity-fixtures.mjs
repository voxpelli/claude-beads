// Fixture-based RED test for check-rule-parity.mjs.
//
// check-rule-parity is the only thing standing between a NEUTERED ast-grep rule and a green build —
// `ast-grep test` does not fail on an untested rule, it SKIPS it and exits 0 — and until now its
// RED-proof lived in commit prose (`8f32f0a`, `3a5e140`: "each RED-proofed"). This repo has already
// paid for exactly that: check-validator-plugin-fixtures.mjs exists (vp-beads-vph) because
// vp-beads-gtd was marked complete asserting "Proven RED on planted violations" with no such proof
// ever built. So the guard that catches unproven guards was itself unproven (vp-beads-rpf).
//
// Worse than merely untested: check-rule-parity SHIPPED WITH THE DEFECT IT EXISTS TO PREVENT — it
// paired rules to tests by FILENAME while its own comments claimed it paired by the `id:` FIELD.
// Case 5 below is that bug, planted.
//
// Every case builds a THROWAWAY rule tree, points the checker at it via RULE_PARITY_ROOT, and
// asserts it EXITS NON-ZERO and NAMES the specific problem — plus a clean control that must stay
// GREEN, because a harness that is always red proves nothing ("self-test first").

import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import {
  mkdirSync, mkdtempSync, rmSync, writeFileSync,
} from 'node:fs'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CHECKER = join(REPO_ROOT, 'scripts', 'check-rule-parity.mjs')

const RULES = '.ast-grep/rules'
const TESTS = '.ast-grep/rule-tests'
const PKG = 'node_modules/@voxpelli/ast-grep-rules/rules'

let passed = 0
let failed = 0

/**
 * @param {string} name
 * @param {boolean} cond
 */
function assert (name, cond) {
  if (cond) {
    passed++
    console.log(`  ✓ ${name}`)
  } else {
    failed++
    console.error(`  ✗ ${name}`)
  }
}

/** @param {string} id */
const rule = id => `id: ${id}\nlanguage: js\nrule:\n  pattern: nothing_$X\n`

/**
 * @param {string} id
 * @param {boolean} [withInvalid]
 */
const test = (id, withInvalid = true) =>
  `id: ${id}\nvalid:\n  - "ok"\n` + (withInvalid ? 'invalid:\n  - "nothing_x"\n' : '')

// One clean local rule with a proper test. Every case starts from this, so a failure is attributable
// to the PLANTED file rather than to the baseline — the same discipline as the clean root manifest in
// check-validator-plugin-fixtures.mjs. The package dir is created EMPTY: `readdirSync` on a missing
// one throws, and the checker has no guard for that (noted in vp-beads-rpf, out of scope here).
const baseline = {
  [`${RULES}/alpha.yml`]: rule('alpha'),
  [`${TESTS}/alpha-test.yml`]: test('alpha'),
}

/**
 * @param {Record<string, string>} files
 * @returns {string}
 */
function buildFixture (files) {
  const dir = mkdtempSync(join(tmpdir(), 'vp-beads-rule-parity-'))
  for (const d of [RULES, TESTS, PKG]) mkdirSync(join(dir, d), { recursive: true })
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true })
    writeFileSync(join(dir, rel), content)
  }
  return dir
}

/**
 * @param {string} [root]
 * @returns {{ status: number|null, stderr: string, stdout: string }}
 */
function runChecker (root) {
  const env = { ...process.env }
  if (root === undefined) delete env.RULE_PARITY_ROOT
  else env.RULE_PARITY_ROOT = root
  const r = spawnSync(process.execPath, [CHECKER], { env, encoding: 'utf8', cwd: REPO_ROOT })
  return { status: r.status, stderr: r.stderr ?? '', stdout: r.stdout ?? '' }
}

/**
 * @param {string} name
 * @param {Record<string, string>} files files layered ON TOP of the baseline (same key overrides)
 * @param {(r: { status: number|null, stderr: string, stdout: string }) => boolean} check
 */
function runCase (name, files, check) {
  const dir = buildFixture({ ...baseline, ...files })
  try {
    assert(name, check(runChecker(dir)))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

console.log('check-rule-parity — planted violations must go RED')

// 1. a rule whose declared `id:` disagrees with its filename stem
runCase(
  'rule `id:` != filename stem → RED, naming both',
  { [`${RULES}/beta.yml`]: rule('renamed-beta') },
  r => r.status === 1 && r.stderr.includes('renamed-beta') && r.stderr.includes('beta.yml')
)

// 2. a rule file ast-grep cannot load at all — every other assertion here is keyed on the id, so
//    without this branch it would vanish from the check entirely rather than fail it
runCase(
  'rule with no string `id:` → RED (it would otherwise leave the keyed set silently)',
  { [`${RULES}/nameless.yml`]: 'language: js\nrule:\n  pattern: x\n' },
  r => r.status === 1 && r.stderr.includes('nameless.yml') && r.stderr.includes('no string')
)

// 3. two DIFFERENTLY-NAMED files declaring one id — the shape that slipped past a filename-keyed
//    check, and a hard ast-grep error (exit 8) that prints no summary at all
runCase(
  'duplicate `id:` across two differently-named files → RED',
  {
    [`${RULES}/shared-id.yml`]: rule('shared-id'),
    [`${RULES}/alias.yml`]: rule('shared-id'),
    [`${TESTS}/shared-id-test.yml`]: test('shared-id'),
  },
  r => r.status === 1 && r.stderr.includes('twice') && r.stderr.includes('alias.yml')
)

// 4. a rule with no test file — `ast-grep test` prints `ok. N passed` and never names it
runCase(
  'rule with NO test file → RED',
  { [`${RULES}/untested.yml`]: rule('untested') },
  r => r.status === 1 && r.stderr.includes('untested') && r.stderr.includes('NO test file')
)

// 5. THE DEFECT THIS CHECKER SHIPPED WITH. The test file is named correctly, so a filename-keyed
//    check sees a paired rule; the `id:` FIELD inside names something else, so ast-grep pairs it to
//    nothing, prints `Configuration not found!` and still exits 0.
runCase(
  'test file named right but `id:` names ANOTHER rule → RED (the filename-vs-field bug)',
  { [`${TESTS}/alpha-test.yml`]: test('not-alpha') },
  r => r.status === 1 && r.stderr.includes('UNTESTED') && r.stderr.includes('not-alpha')
)

// 6. a test that only says what the rule must IGNORE is satisfied by a rule that ignores everything
runCase(
  'test with no `invalid:` case → RED',
  { [`${TESTS}/alpha-test.yml`]: test('alpha', false) },
  r => r.status === 1 && r.stderr.includes('invalid:') && r.stderr.includes('alpha-test.yml')
)

// 7. a test outliving its rule, or an `id:` typo
runCase(
  'test naming a rule that exists in NEITHER dir → RED',
  { [`${TESTS}/ghost-test.yml`]: test('ghost') },
  r => r.status === 1 && r.stderr.includes('ghost') && r.stderr.includes('neither')
)

// 8. a local rule and a package rule sharing an id — ast-grep exits 8 and prints no summary, so the
//    count probe reads as could-not-determine; this branch exists to name the real cause
runCase(
  'same `id:` in BOTH local and package rule dirs → RED',
  { [`${PKG}/alpha.yml`]: rule('alpha') },
  r => r.status === 1 && r.stderr.includes('BOTH') && r.stderr.includes('alpha')
)

// 9. CONTROL — the harness must be able to go GREEN, or none of the eight reds above mean anything
runCase(
  'a clean rule tree → exit 0 (control: prove the harness is not always-red)',
  {},
  r => r.status === 0 && r.stdout.includes('each paired to a test by its `id:` field')
)

// 10. FIXTURE MODE MUST ANNOUNCE ITSELF. It disables the loaded-count assertions (the probe can only
//     ask the REAL sgconfig.yml), and a skipped assertion that says nothing is this repo's signature
//     bug — a green check over less than it claims.
runCase(
  'fixture mode SAYS the loaded-count assertions did not run',
  {},
  r => r.stdout.includes('FIXTURE MODE') && r.stdout.includes('did NOT run')
)

// 11. …AND IT MUST NOT LEAK. Without the env var the real path is unchanged and the count assertions
//     really do run — the direction a wrong answer is dangerous in, since a leaked FIXTURE_MODE would
//     silently retire the only assertion that notices a SHRINKING rule set.
{
  const bare = runChecker()
  assert('a BARE run still asserts the loaded count (fixture mode did not leak)',
    bare.status === 0 && /ast-grep loaded \d+/.test(bare.stdout) && !bare.stdout.includes('FIXTURE MODE'))
}

console.log(`\n${passed + failed} fixture cases: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
