/**
 * Unit tests for beads-probe.mjs — the read-only reconnaissance behind /deintegrate-beads.
 *
 * This suite exists because the skill's detection logic was PROSE, and prose cannot be
 * tested. Two review rounds found five critical bugs in it, and every single one failed
 * SILENTLY while reporting success — a cleanup tool's worst failure mode. Each case below
 * is one of those bugs.
 */

import { spawn, spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync,
} from 'node:fs'

import { fileURLToPath } from 'node:url'

import {
  probeDaemon, probeHooks, probeMigration, probeResidue,
} from './beads-probe.mjs'

/** Absolute path to the probe, for the CLI-level tests at the bottom. */
const PROBE = fileURLToPath(new URL('beads-probe.mjs', import.meta.url))

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

/**
 * A temp git repo.
 *
 * @returns {string} the repo root
 */
function makeRepo () {
  const dir = mkdtempSync(join(tmpdir(), 'vp-probe-'))
  spawnSync('git', ['-C', dir, 'init', '-q'])
  spawnSync('git', ['-C', dir, 'config', 'user.email', 't@t'])
  spawnSync('git', ['-C', dir, 'config', 'user.name', 't'])
  // This machine signs commits globally. Without this the setup `git commit` fails, its
  // ignored exit status hides it, and the assertions fail for a reason unrelated to them.
  spawnSync('git', ['-C', dir, 'config', 'commit.gpgsign', 'false'])
  return dir
}

/**
 * Commit everything, loudly. A silent setup failure produces a baffling assertion failure.
 *
 * @param {string} dir
 */
function commitAll (dir) {
  const add = spawnSync('git', ['-C', dir, 'add', '-A'])
  const commit = spawnSync('git', ['-C', dir, 'commit', '-qm', 'x'], { encoding: 'utf8' })
  if (add.status !== 0 || commit.status !== 0) {
    throw new Error(`test setup: git commit failed — ${commit.stderr ?? ''}`)
  }
}

/**
 * @param {string} dir
 * @param {string} body
 * @param {string} [storeDir] Which store form to write — defaults to the legacy `.diarie`.
 */
function writeStore (dir, body, storeDir = '.diarie') {
  mkdirSync(join(dir, storeDir, 'tasks'), { recursive: true })
  writeFileSync(join(dir, storeDir, 'tasks', 'tasks-x.yml'), body)
}

const ONE_TASK = 'meta:\n  slug: x\ntasks:\n  - id: T-1\n    title: a\n    status: pending\n    type: task\n'

console.log('probeMigration (the gate that must not pass vacuously)')

{
  const dir = makeRepo()
  try {
    assert('no store at all → NOT trusted', probeMigration(dir).trusted === false)
  } finally { rmSync(dir, { recursive: true, force: true }) }
}
{
  // The bug the SECOND review found: validate-tasks returns {clean:true} with exit 0 for
  // a store holding `tasks: []`, so a gate keyed on `clean` passed for an EMPTY backlog.
  const dir = makeRepo()
  try {
    writeStore(dir, 'meta:\n  slug: x\ntasks: []\n')
    commitAll(dir)
    const m = probeMigration(dir)
    assert('store exists but is EMPTY → NOT trusted (clean is not enough)',
      m.storeExists === true && m.taskCount === 0 && m.trusted === false)
  } finally { rmSync(dir, { recursive: true, force: true }) }
}
{
  // An uncommitted store is one `git clean` from gone — and bd would have been the only
  // other copy. Disarming bd against it is the "left with neither tracker" outcome.
  const dir = makeRepo()
  try {
    writeStore(dir, ONE_TASK)
    const m = probeMigration(dir)
    assert('tasks exist but are UNCOMMITTED → NOT trusted', m.taskCount === 1 && m.committed === false && m.trusted === false)
  } finally { rmSync(dir, { recursive: true, force: true }) }
}
{
  const dir = makeRepo()
  try {
    writeStore(dir, ONE_TASK)
    commitAll(dir)
    const m = probeMigration(dir)
    assert('committed store with real tasks → trusted', m.taskCount === 1 && m.committed === true && m.trusted === true)
  } finally { rmSync(dir, { recursive: true, force: true }) }
}

// The store is a PAIR after diarie's rename — visible `diarium/` or dotted `.diarium/` — plus the
// legacy `.diarie/`. A probe that knows only one form reports "no store" against the others, and
// migrate-tracker's precondition IS "no store", so it would migrate a second time. These assert the
// dangerous direction, not just the happy path.
// The installed diarie is <0.3.0, so it answers ENOSTORE for these forms. That must read as "this
// CLI cannot see the store", NOT as "the store is empty" — reporting taskCount 0 on a store full of
// work is the absent-vs-empty conflation ENOSTORE exists to delete.
for (const form of ['diarium', '.diarium']) {
  const dir = makeRepo()
  try {
    writeStore(dir, ONE_TASK, form)
    commitAll(dir)
    const m = probeMigration(dir)
    assert(`a committed \`${form}/\` store is SEEN, not reported as absent`,
      m.storeExists === true && m.storeDir === form && m.committed === true)
    assert(`\`${form}/\` unreadable by an old CLI → verifyFailed, NOT "empty", NOT trusted`,
      m.storeInvisibleToCli === true && m.verifyFailed === true &&
      m.malformed === false && m.trusted === false)
  } finally { rmSync(dir, { recursive: true, force: true }) }
}

{
  // Two stores present: diarie answers this with ETWOSTORES rather than a precedence rule, because
  // silently picking one makes the loser a file nobody reads and everybody keeps editing. The probe
  // must not resolve it either — and must never report "trusted" while it is unclear which store is
  // the live backlog, since the caller uses that to decide whether to disarm bd.
  const dir = makeRepo()
  try {
    writeStore(dir, ONE_TASK)
    writeStore(dir, ONE_TASK, 'diarium')
    commitAll(dir)
    const m = probeMigration(dir)
    assert('TWO stores on disk → reported as ambiguous, NOT trusted',
      m.ambiguousStore === true && m.storeDirs.length === 2 && m.trusted === false)
    // PRECEDENCE, not just the count. `storeDir` feeds `files`, `committed`, the ls-tree pathspec
    // and the human report, and TRACKER_DIRS is ordered legacy-first on purpose so an in-place
    // `.diarie/` still wins mid-rename. Asserting only `.length === 2` let a reorder pass 31/31.
    assert('the legacy `.diarie` wins precedence when both are present',
      m.storeDir === '.diarie' && m.storeDirs[0] === '.diarie')
  } finally { rmSync(dir, { recursive: true, force: true }) }
}

{
  // The store-file filter was unpinned in BOTH directions: widening it to /\.ya?ml$/ and narrowing
  // it to /^tasks-.+\.yml$/ each passed 31/31. The narrowing is the dangerous one — a `.yaml` store
  // yields files: [] and storeExists: false, and /migrate-tracker's precondition IS "no store", so
  // it migrates a second time. That is the two-backlogs failure this probe exists to prevent.
  const dir = makeRepo()
  try {
    mkdirSync(join(dir, '.diarie', 'tasks'), { recursive: true })
    writeFileSync(join(dir, '.diarie', 'tasks', 'tasks-x.yaml'), ONE_TASK)
    writeFileSync(join(dir, '.diarie', 'tasks', 'notes-x.yml'), ONE_TASK)
    writeFileSync(join(dir, '.diarie', 'tasks', 'tasks.yml'), ONE_TASK)
    const m = probeMigration(dir)
    assert('a `.yaml` store file counts — the extension is optional, not the prefix',
      m.storeExists === true && m.files.includes('tasks-x.yaml'))
    assert('files not matching `tasks-<slug>.` are excluded',
      !m.files.includes('notes-x.yml') && !m.files.includes('tasks.yml'))
  } finally { rmSync(dir, { recursive: true, force: true }) }
}

{
  // `git ls-files` reads the INDEX, so a `git add`-ed but never-committed store reported
  // committed:true — in a repo with NO COMMITS AT ALL. Its only durable copy would have
  // been the index, and bd was about to be disarmed. `ls-tree HEAD` asks history.
  const dir = makeRepo()
  try {
    writeStore(dir, ONE_TASK)
    spawnSync('git', ['-C', dir, 'add', '-A']) // staged, deliberately NOT committed
    const m = probeMigration(dir)
    assert('STAGED but never committed → NOT trusted (ls-files reads the index, not history)',
      m.taskCount === 1 && m.committed === false && m.trusted === false)
  } finally { rmSync(dir, { recursive: true, force: true }) }
}
{
  // The migration preserves every bd body as a `description:` block scalar, and bd bodies
  // routinely quote YAML. A regex count of `- id:` therefore counted PROSE as tasks — so an
  // EMPTY store reported as trusted. That is the vacuous gate this function exists to kill,
  // reintroduced inside it. Parse the YAML; do not pattern-match it.
  const dir = makeRepo()
  try {
    writeStore(dir, 'meta:\n  slug: x\ntasks: []\nnotes: |\n  the bd body said:\n    - id: T-1\n      title: something\n')
    commitAll(dir)
    const m = probeMigration(dir)
    assert('a `- id:` inside a block scalar is PROSE, not a task → NOT trusted',
      m.taskCount === 0 && m.trusted === false)
  } finally { rmSync(dir, { recursive: true, force: true }) }
}
{
  // A store we cannot parse is a store we cannot vouch for.
  const dir = makeRepo()
  try {
    writeStore(dir, 'meta:\n  slug: x\ntasks:\n  - id: T-1\n    title: "unclosed\n')
    commitAll(dir)
    const m = probeMigration(dir)
    assert('an UNPARSEABLE store → malformed, NOT trusted', m.malformed === true && m.trusted === false)
  } finally { rmSync(dir, { recursive: true, force: true }) }
}
{
  // diarie itself could not RUN (offline, unresolvable) — that is "could NOT verify", NOT a bad store.
  // It must block trust WITHOUT being falsely reported as malformed: can't-determine != determined-bad.
  // A real run in a diarie-resolving repo never takes this branch, so it is injected here on purpose.
  const dir = makeRepo()
  try {
    writeStore(dir, 'meta:\n  slug: x\ntasks:\n  - id: T-1\n    title: real\n    status: pending\n    type: task\n')
    commitAll(dir)
    const cliDown = () => ({ ok: false, out: '', code: 1 })
    const m = probeMigration(dir, cliDown)
    assert('diarie NOT runnable → verifyFailed, NOT malformed, NOT trusted',
      m.verifyFailed === true && m.malformed === false && m.trusted === false)
  } finally { rmSync(dir, { recursive: true, force: true }) }
}

console.log('\nprobeDaemon (the function that authorizes killing a process)')

{
  const dir = makeRepo()
  mkdirSync(join(dir, '.beads'), { recursive: true })
  try {
    const d = probeDaemon(dir)
    assert('no pid file → never signal (and do not pretend a daemon was stopped)',
      d.pidFile === null && d.safeToSignal === false)
  } finally { rmSync(dir, { recursive: true, force: true }) }
}
{
  // A pid file that outlived its process is the whole pid-reuse hazard.
  const dir = makeRepo()
  mkdirSync(join(dir, '.beads'), { recursive: true })
  try {
    writeFileSync(join(dir, '.beads', 'dolt-server.pid'), '999999\n')
    const d = probeDaemon(dir)
    assert('a DEAD pid → not signalable', d.safeToSignal === false && d.owned?.alive === false)
  } finally { rmSync(dir, { recursive: true, force: true }) }
}
{
  // THE FALSE-POSITIVE THAT KILLS SOMEONE ELSE'S PROCESS. A live process whose argv merely
  // CONTAINS "dolt" and the right `-P <port>` used to pass: `isDolt` was /dolt/i over the
  // whole command line, and the port was the only ownership evidence. It is not enough —
  // a pid and its port are freed TOGETHER when a daemon dies, so a sibling repo's dolt can
  // inherit both. Ownership is now proven from the process CWD.
  const dir = makeRepo()
  mkdirSync(join(dir, '.beads'), { recursive: true })
  // Detached, or it dies with the shell that spawned it and the fixture proves nothing.
  const fake = spawn('sleep', ['30'], { detached: true, stdio: 'ignore' })
  fake.unref()
  try {
    writeFileSync(join(dir, '.beads', 'dolt-server.pid'), `${fake.pid}\n`)
    writeFileSync(join(dir, '.beads', 'dolt-server.port'), '50426\n')
    const d = probeDaemon(dir)
    assert('a live NON-dolt process at the recorded pid → NOT signalable',
      d.owned?.alive === true && d.owned.isDolt === false && d.safeToSignal === false)
  } finally {
    if (fake.pid) { try { process.kill(fake.pid) } catch { /* already gone */ } }
    rmSync(dir, { recursive: true, force: true })
  }
}
{
  // OWNERSHIP MUST BE BOUNDARY-ANCHORED. `cwdInTarget` was a bare `startsWith(beadsDir)`, so a
  // process living in a SIBLING directory — `.beads-backup/`, `.beads2/`, `.beadsX/` — satisfied the
  // one predicate that authorises SIGTERM. Every other daemon test asserts `safeToSignal === false`,
  // which is the direction that cannot expose a false positive; that is exactly why this survived.
  // realpathSync is load-bearing, not tidiness: on macOS `tmpdir()` is `/var/folders/…` while `lsof`
  // reports the resolved `/private/var/folders/…`. Without it the two paths share no prefix at all,
  // so `cwdInTarget` comes back false for a reason unrelated to the anchor — and the assertion below
  // passes identically against the BUGGY code. Caught by RED-proofing this very test.
  const dir = realpathSync(makeRepo())
  mkdirSync(join(dir, '.beads'), { recursive: true })
  mkdirSync(join(dir, '.beads-backup'), { recursive: true })
  const sibling = spawn('sleep', ['30'], { detached: true, stdio: 'ignore', cwd: join(dir, '.beads-backup') })
  sibling.unref()
  try {
    writeFileSync(join(dir, '.beads', 'dolt-server.pid'), `${sibling.pid}\n`)
    const d = probeDaemon(dir)
    assert('a process in a SIBLING dir (.beads-backup) is NOT in the target',
      d.owned?.alive === true && d.owned.cwd !== null && d.owned.cwdInTarget === false && d.safeToSignal === false)
  } finally {
    if (sibling.pid) { try { process.kill(sibling.pid) } catch { /* already gone */ } }
    rmSync(dir, { recursive: true, force: true })
  }
}
{
  // A half-dead daemon leaves a truncated port file. That string used to be interpolated
  // straight into `new RegExp` — `5042(6` threw "Unterminated group" and took the WHOLE
  // probe down, migration gate included, in a tool whose own header promises that a
  // malformed store must not crash reconnaissance.
  const dir = makeRepo()
  mkdirSync(join(dir, '.beads'), { recursive: true })
  try {
    writeFileSync(join(dir, '.beads', 'dolt-server.pid'), '999999\n')
    writeFileSync(join(dir, '.beads', 'dolt-server.port'), '5042(6\n')
    let threw = false
    try { probeDaemon(dir) } catch { threw = true }
    assert('a CORRUPT port file does not crash the probe', threw === false)
  } finally { rmSync(dir, { recursive: true, force: true }) }
}

console.log('\nprobeHooks (shape, ownership, and what unsetting would ARM)')

{
  const dir = makeRepo()
  try {
    const h = probeHooks(dir)
    assert('no hooks at all → shape=none, nothing to re-arm', h.shape === 'none' && h.reArmCommand === null)
  } finally { rmSync(dir, { recursive: true, force: true }) }
}
{
  // Shape A. bd stores an ABSOLUTE path — a relative-prefix check would silently miss it,
  // and a guessed relative re-arm command would not restore what bd set.
  const dir = makeRepo()
  try {
    const abs = join(dir, '.beads', 'hooks')
    mkdirSync(abs, { recursive: true })
    writeFileSync(join(abs, 'pre-commit'), '#!/bin/sh\n# --- BEGIN BEADS INTEGRATION v1.0.3 ---\n')
    spawnSync('git', ['-C', dir, 'config', 'core.hooksPath', abs])
    const h = probeHooks(dir)
    assert('Shape A: absolute hooksPath into .beads → detected as bd\'s',
      h.shape === 'hooksPath' && h.hooksPath.isBeads === true && h.hooksPath.scope === 'local')
    assert('the re-arm command echoes the EXACT absolute value', h.reArmCommand?.includes(abs) === true)
    assert('the shims are listed', h.shims.includes('pre-commit'))
  } finally { rmSync(dir, { recursive: true, force: true }) }
}
{
  // A repo pointing hooksPath at husky/lefthook is NOT bd's. Unsetting it would silently
  // disable THEIR tooling — collateral damage from a tool that promised to be reversible.
  const dir = makeRepo()
  try {
    spawnSync('git', ['-C', dir, 'config', 'core.hooksPath', '.husky/_'])
    const h = probeHooks(dir)
    assert('a non-beads hooksPath is NOT claimed as bd\'s', h.hooksPath.isBeads === false && h.shape !== 'hooksPath')
  } finally { rmSync(dir, { recursive: true, force: true }) }
}
{
  // The bug the second review found: unsetting hooksPath RE-ENABLES .git/hooks/, which may
  // hold bd's OWN dormant hooks. A naive disarm can end with bd MORE armed than it started.
  const dir = makeRepo()
  try {
    const abs = join(dir, '.beads', 'hooks')
    mkdirSync(abs, { recursive: true })
    spawnSync('git', ['-C', dir, 'config', 'core.hooksPath', abs])
    writeFileSync(join(dir, '.git', 'hooks', 'pre-push'), '#!/bin/sh\n# --- BEGIN BEADS INTEGRATION v1.0.5 ---\nbd hooks run pre-push\n')
    writeFileSync(join(dir, '.git', 'hooks', 'post-commit'), '#!/bin/sh\necho theirs\n')
    const h = probeHooks(dir)
    assert('dormant bd hooks in .git/hooks/ are flagged (they RE-ARM on unset)',
      h.gitHooks.dormantBdHooks.includes('pre-push'))
    assert('a third-party .git/hooks/ file is reported separately, not as bd\'s',
      h.gitHooks.otherGitHooks.includes('post-commit') && !h.gitHooks.dormantBdHooks.includes('post-commit'))
  } finally { rmSync(dir, { recursive: true, force: true }) }
}
{
  // The marker is VERSION-STAMPED, and the stamp records the version that INSTALLED the
  // hook — this repo runs bd 1.1.0 with a v1.0.3 marker on disk. A literal `v1.0.3` match
  // would silently strip nothing on any other target.
  const dir = makeRepo()
  try {
    writeFileSync(join(dir, '.git', 'hooks', 'pre-commit'), '#!/bin/sh\n# --- BEGIN BEADS INTEGRATION v9.9.9 ---\n')
    const h = probeHooks(dir)
    assert('the marker match is version-agnostic (prefix, not v1.0.3)', h.gitHooks.dormantBdHooks.includes('pre-commit'))
  } finally { rmSync(dir, { recursive: true, force: true }) }
}
{
  // The remedy INVERTS by mechanism. husky uses core.hooksPath (bd clobbered it). lefthook
  // and pre-commit install into .git/hooks/ — they were merely dormant and RE-ARM on unset.
  // The first review's prose told the user to restore a hooksPath for all three, which
  // would have been wrong for two of them.
  const dir = makeRepo()
  try {
    mkdirSync(join(dir, '.husky'), { recursive: true })
    writeFileSync(join(dir, 'lefthook.yml'), 'pre-commit:\n')
    const h = probeHooks(dir)
    const husky = h.otherHookManagers.find(m => m.name === 'husky')
    const lefthook = h.otherHookManagers.find(m => m.name === 'lefthook.yml')
    assert('husky → clobbered-by-bd (its mechanism IS core.hooksPath)', husky?.effect === 'clobbered-by-bd')
    assert('lefthook → dormant-rearms-on-unset (it lives in .git/hooks/)', lefthook?.effect === 'dormant-rearms-on-unset')
    // Behavioural, not prose-pinned: the remedy must NOT be a hand-written hooksPath
    // command, because husky v8 uses .husky and v9 uses .husky/_ and a guess is a fresh
    // silent break. (An earlier version asserted the substring "installer" — reword the
    // sentence and the test failed for no behavioural reason.)
    assert('the husky remedy is not a hand-written core.hooksPath command',
      !/git\s+config\s+core\.hooksPath/.test(husky?.remedy ?? ''))
  } finally { rmSync(dir, { recursive: true, force: true }) }
}

console.log('\nprobeResidue (what deleting .beads/ would actually do)')

{
  // `check-ignore` is the wrong question: not-ignored != tracked, and bd's own
  // .beads/.gitignore ignores CONTENTS while leaving config files tracked. ls-files answers
  // what git would really delete.
  const dir = makeRepo()
  try {
    mkdirSync(join(dir, '.beads'), { recursive: true })
    writeFileSync(join(dir, '.beads', 'config.yaml'), 'x: 1\n')
    commitAll(dir)
    spawnSync('git', ['-C', dir, 'config', 'beads.role', 'maintainer'])
    const r = probeResidue(dir)
    assert('tracked .beads/ files are counted (rm -rf would stage deletions)',
      r.trackedCount === 1 && r.trackedFiles[0] === '.beads/config.yaml')
    assert('beads.* git config keys are found', r.beadsConfigKeys.some(k => k.includes('beads.role')))
  } finally { rmSync(dir, { recursive: true, force: true }) }
}
{
  const dir = makeRepo()
  try {
    mkdirSync(join(dir, '.beads'), { recursive: true })
    writeFileSync(join(dir, '.gitignore'), '.beads/\n')
    const r = probeResidue(dir)
    assert('a fully-gitignored .beads/ reports 0 tracked files', r.beadsDirExists === true && r.trackedCount === 0)
  } finally { rmSync(dir, { recursive: true, force: true }) }
}

// --- CLI argument handling -------------------------------------------------
//
// The one CLI-level test, and it guards the worst answer this tool can give: a confident
// verdict about the WRONG REPOSITORY. `allowPositionals` was `true` and nothing read the
// positionals, so `beads-probe.mjs <other-repo>` probed the CWD instead — pointed at an empty
// directory it announced `migration TRUSTED — 85 task(s)`, which is vp-beads' own store. The
// skill's mutations are all pinned with `git -C <target>`, so the hazard is not a mis-aimed
// write; it is that every decision authorising those writes came from somewhere else.
//
// Asserted in the DANGEROUS direction, per this suite's own house rule: the thing that must
// hold is that a positional FAILS, not merely that `--root` works.
{
  const dir = realpathSync(makeRepo())
  try {
    const positional = spawnSync(process.execPath, [PROBE, dir], { encoding: 'utf8' })
    assert('a POSITIONAL path is REJECTED, not silently reinterpreted as the cwd',
      positional.status !== 0 && !(positional.stdout ?? '').includes('beads probe:'))

    const rooted = spawnSync(process.execPath, [PROBE, '--root', dir], { encoding: 'utf8' })
    assert('`--root <path>` still probes THAT path',
      rooted.status === 0 && (rooted.stdout ?? '').includes(`beads probe: ${dir}`))

    const bare = spawnSync(process.execPath, [PROBE], { encoding: 'utf8', cwd: dir })
    assert('no argument still falls back to the cwd',
      bare.status === 0 && (bare.stdout ?? '').includes(`beads probe: ${dir}`))
  } finally { rmSync(dir, { recursive: true, force: true }) }
}

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
