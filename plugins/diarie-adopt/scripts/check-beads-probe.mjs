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
import { fileURLToPath } from 'node:url'
import {
  chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync,
} from 'node:fs'

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
    // Spelled out in full rather than leaning on `undefined` for the new fields: omitting them
    // makes them falsy, which happens to be what this test wants — a pass for an accidental reason.
    /* eslint-disable-next-line unicorn/no-null -- mirrors RunResult, whose `null`s are the
       probe's JSON contract (see the module-level disable in beads-probe.mjs); `undefined` would
       drop the keys and stop this stub from standing in for a real run. */
    const cliDown = () => ({ ok: false, ran: false, complete: false, out: '', err: '', code: null, signal: null, error: 'ENOENT' })
    const m = probeMigration(dir, cliDown)
    assert('diarie NOT runnable → verifyFailed, NOT malformed, NOT trusted',
      m.verifyFailed === true && m.malformed === false && m.trusted === false)
  } finally { rmSync(dir, { recursive: true, force: true }) }
}
{
  // `'code' in parsed` THROWS on a JSON primitive — measured: `'code' in 5` is a TypeError, and
  // BOTH envelope reads use `in`. So a CLI that ever printed a bare scalar on stdout took the whole
  // probe down, migration gate included. Injected because diarie 0.2.x never emits one; the point
  // is that a reconnaissance tool must not be one output-shape change away from crashing.
  const dir = makeRepo()
  try {
    writeStore(dir, ONE_TASK)
    commitAll(dir)
    /* eslint-disable-next-line unicorn/no-null -- mirrors RunResult; see the note on `cliDown` above. */
    const scalar = () => ({ ok: true, ran: true, complete: true, out: '5', err: '', code: 0, signal: null, error: null })
    let threw = false
    let m
    try { m = probeMigration(dir, scalar) } catch { threw = true }
    assert('a bare JSON SCALAR from the CLI does not crash the probe', threw === false)
    assert('...and reads as could-not-verify, never as a verdict on the store',
      m?.verifyFailed === true && m.malformed === false && m.trusted === false)
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
  // THE SECOND ASSERTION IN THIS SUITE'S DANGEROUS DIRECTION (`safeToSignal === true`), and it
  // pins what actually authorises the SIGTERM. SKILL.md claimed the probe proves ownership "by
  // matching `.beads/dolt-server.port` against the `-P <port>` in its args" — the criterion this
  // code explicitly REJECTS, because a pid and its port are freed together when a daemon dies, so
  // a sibling repo's dolt can inherit both. The real gate is `alive && isDolt && cwdInTarget`, and
  // there is deliberately NO PORT FILE here: anyone who "fixes" the code to match that prose
  // reddens this. A real `dolt sql-server` cannot be run in a test, so stand up a process with the
  // only two properties the probe reads — a matching `ps args` line and a cwd inside the target.
  const dir = realpathSync(makeRepo())
  const binDir = mkdtempSync(join(tmpdir(), 'vp-probe-dolt-'))
  mkdirSync(join(dir, '.beads'), { recursive: true })
  writeFileSync(join(binDir, 'dolt'), '#!/bin/sh\nsleep 30\n', { mode: 0o755 })
  const fake = spawn(join(binDir, 'dolt'), ['sql-server'], {
    detached: true, stdio: 'ignore', cwd: join(dir, '.beads'),
  })
  fake.unref()
  try {
    writeFileSync(join(dir, '.beads', 'dolt-server.pid'), `${fake.pid}\n`)
    const d = probeDaemon(dir)
    assert('cwd inside the target authorises the signal with NO port file — the port is not the gate',
      d.owned?.isDolt === true && d.owned.cwdInTarget === true &&
      d.owned.portMatches === false && d.safeToSignal === true)
  } finally {
    if (fake.pid) { try { process.kill(fake.pid) } catch { /* already gone */ } }
    rmSync(binDir, { recursive: true, force: true })
    rmSync(dir, { recursive: true, force: true })
  }
}
{
  // AN UNREADABLE PID FILE TOOK DOWN THE WHOLE PROBE — measured: `probe()` throws EACCES, so the
  // MIGRATION GATE never runs either. `readFileSync` was called bare behind an `existsSync`, which
  // answers "is it there", not "can I read it". Same class as the corrupt port file pinned below,
  // and the same class `d55ee7c` fixed one level down for `.git/hooks/*` bodies — the hook bodies
  // got a guarded read, the pid file did not.
  const dir = makeRepo()
  const pidFile = join(dir, '.beads', 'dolt-server.pid')
  mkdirSync(join(dir, '.beads'), { recursive: true })
  try {
    writeFileSync(pidFile, '12345\n')
    chmodSync(pidFile, 0o000)
    let threw = false
    let d
    try { d = probeDaemon(dir) } catch { threw = true }
    assert('an UNREADABLE pid file does not crash the probe', threw === false)
    assert('...and is reported rather than read as "no daemon recorded"',
      d?.pidError?.includes('could not be read') === true && d.owned === null)
  } finally {
    try { chmodSync(pidFile, 0o600) } catch { /* never created */ }
    rmSync(dir, { recursive: true, force: true })
  }
}
{
  // A CORRUPT pid was dropped with NO report — the human line printed a bare `pid ?`. Worse, `pid`
  // stays null so the `others` filter excludes nothing, and THE TARGET'S OWN DAEMON gets listed
  // under "other dolt process (do not touch)". A guard that drops a value must name the
  // consequence (CLAUDE.md `### Reader conventions`); every other drop in this file now does.
  const dir = makeRepo()
  mkdirSync(join(dir, '.beads'), { recursive: true })
  try {
    writeFileSync(join(dir, '.beads', 'dolt-server.pid'), 'not-a-pid\n')
    const d = probeDaemon(dir)
    assert('a NON-NUMERIC pid is reported, not silently dropped',
      d.pidError?.includes('not-a-pid') === true && d.safeToSignal === false)
  } finally { rmSync(dir, { recursive: true, force: true }) }
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
{
  // A FALSE ALL-CLEAR ABOUT THE WHOLE MACHINE. `ps ax` was read as `run(...).out` with no check,
  // under spawnSync's 1 MiB default maxBuffer. Measured 2026-07-29: on overflow node SIGTERMs the
  // child and hands back a TRUNCATED stdout (1,114,112 bytes) with `error: ENOBUFS` — not an empty
  // one — so every `dolt sql-server` past the cut vanishes from the "do not touch" list while the
  // report presents it as complete. The stub emits padding past the buffer and puts the dolt line
  // AFTER it, so the loss is the thing being asserted, not merely the flag.
  const dir = makeRepo()
  const binDir = mkdtempSync(join(tmpdir(), 'vp-probe-bin-'))
  const realPath = process.env.PATH
  try {
    mkdirSync(join(dir, '.beads'), { recursive: true })
    writeFileSync(
      join(binDir, 'ps'),
      // PATH is stripped to `binDir` below so the probe finds THIS `ps`; the stub therefore has to
      // restore a PATH for its own `awk`. Without this the stub emitted only the echo, no overflow
      // happened, and the test failed for a reason unrelated to the bug — caught by the second
      // assertion, which is there to prove the fixture reproduces the harm.
      '#!/bin/sh\nPATH=/usr/bin:/bin\n' +
      'awk \'BEGIN{for(i=0;i<40000;i++) printf "%d /usr/bin/pad-%030d\\n", 90000+i, i}\'\n' +
      'echo "99999 /usr/local/bin/dolt sql-server --beyond-the-buffer"\n',
      { mode: 0o755 }
    )
    process.env.PATH = binDir
    const d = probeDaemon(dir)
    assert('a `ps` list truncated by ENOBUFS is reported as INCOMPLETE, not as a clean machine',
      typeof d.processListError === 'string' && d.processListError.includes('TRUNCATED'))
    assert('...and the truncation really does lose a dolt process (the fixture proves the harm)',
      d.otherDoltProcesses.every(l => !l.includes('beyond-the-buffer')))
  } finally {
    process.env.PATH = realPath
    rmSync(binDir, { recursive: true, force: true })
    rmSync(dir, { recursive: true, force: true })
  }
}
{
  // `lsof` ABSENT reads exactly like "the process was proven to live somewhere else". Both give
  // `cwd: null`, `cwdInTarget: false`, and the report line "NOT proven to be this target's dolt" —
  // a determination, where the truth is that ownership could not be examined at all. It fails in
  // the SAFE direction, which is why it survived; it is still a could-not-determine rendered as
  // determined, on the function that authorises a SIGTERM.
  const dir = realpathSync(makeRepo())
  const binDir = mkdtempSync(join(tmpdir(), 'vp-probe-bin-'))
  const realPath = process.env.PATH
  mkdirSync(join(dir, '.beads'), { recursive: true })
  const proc = spawn('sleep', ['30'], { detached: true, stdio: 'ignore', cwd: join(dir, '.beads') })
  proc.unref()
  try {
    writeFileSync(join(dir, '.beads', 'dolt-server.pid'), `${proc.pid}\n`)
    // `ps` must still resolve — only `lsof` goes missing, so this isolates the one call.
    symlinkSync('/bin/ps', join(binDir, 'ps'))
    process.env.PATH = binDir
    const d = probeDaemon(dir)
    assert('`lsof` MISSING → cwd UNKNOWN, distinct from a cwd proven to be elsewhere',
      d.owned?.alive === true && d.owned.cwd === null &&
      d.owned.cwdError?.includes('could not run `lsof`') === true)
    assert('an undetermined cwd still never authorises a signal', d.safeToSignal === false)
  } finally {
    process.env.PATH = realPath
    if (proc.pid) { try { process.kill(proc.pid) } catch { /* already gone */ } }
    rmSync(binDir, { recursive: true, force: true })
    rmSync(dir, { recursive: true, force: true })
  }
}

console.log('\nprobeHooks (shape, ownership, and what unsetting would ARM)')

{
  // Also pins the OTHER side of the exit-code split below: an unset key really does exit 1, and
  // that is a determinate answer. If `none` ever collapsed into `unknown`, this goes red.
  const dir = makeRepo()
  try {
    const h = probeHooks(dir)
    assert('no hooks at all → shape=none, nothing to re-arm', h.shape === 'none' && h.reArmCommand === null)
  } finally { rmSync(dir, { recursive: true, force: true }) }
}
{
  // THE DANGEROUS DIRECTION FOR HOOKS, and the reason `ran` exists. `git config --get` was read as
  // `raw.ok ? raw.out : null`, and `ok: false` covers BOTH "the key is unset" (exit 1 — a real
  // answer, and the common one) and "git could not be asked at all". So an unrunnable git produced
  // `value: null` → `shape: 'none'`, from which the skill concludes there is no hook machinery to
  // disarm — while bd's hooksPath is set here and would stay fully armed. Measured: unset is 1, a
  // broken repo is 128, an absent binary is ENOENT with a null status.
  const dir = makeRepo()
  const realPath = process.env.PATH
  try {
    const abs = join(dir, '.beads', 'hooks')
    mkdirSync(abs, { recursive: true })
    spawnSync('git', ['-C', dir, 'config', 'core.hooksPath', abs])
    process.env.PATH = '/nonexistent'
    const h = probeHooks(dir)
    assert('git UNRUNNABLE with bd hooksPath SET → shape UNKNOWN, never the determinate "none"',
      h.shape === 'unknown' && h.hooksPath.error?.includes('could not run `git config`') === true)
  } finally {
    process.env.PATH = realPath
    rmSync(dir, { recursive: true, force: true })
  }
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
  // A SYMLINKED ROOT FLIPPED THE ARMED REPO TO "SOMEONE ELSE'S". bd stores a canonical absolute
  // hooksPath, and `resolve()` only cleans a path up — it does not follow symlinks. So reaching
  // the same repo through a symlink made the two strings differ, `isBeads` went false, `shape`
  // went 'none', and SKILL.md workflow 2 step 2 says "the path belongs to someone else — leave it
  // alone and say so". bd stays fully armed. This suite ALREADY learned this exact lesson on macOS
  // (`/var` vs `/private/var`, in the daemon block) and applied it as TEST hygiene rather than
  // fixing the probe.
  const real = realpathSync(makeRepo())
  const linkParent = mkdtempSync(join(tmpdir(), 'vp-probe-ln-'))
  const link = join(linkParent, 'link')
  try {
    const abs = join(real, '.beads', 'hooks')
    mkdirSync(abs, { recursive: true })
    spawnSync('git', ['-C', real, 'config', 'core.hooksPath', abs])
    symlinkSync(real, link)
    const h = probeHooks(link)
    assert('a root reached through a SYMLINK is still recognised as bd\'s',
      h.hooksPath.isBeads === true && h.shape === 'hooksPath')
  } finally {
    rmSync(linkParent, { recursive: true, force: true })
    rmSync(real, { recursive: true, force: true })
  }
}
{
  // `reArmCommand` is what SKILL.md calls the guarantee of reversibility, and it was built by
  // wrapping the value in bare single quotes. Measured: a hooksPath containing an apostrophe emits
  // unbalanced quoting — `sh` answers "unexpected EOF while looking for matching `''" — so the one
  // artifact promising the change is undoable does not run. `root` was unquoted entirely, so a
  // space in the repo path did the same.
  const dir = makeRepo()
  try {
    const abs = join(dir, "it's dir", '.beads', 'hooks')
    mkdirSync(abs, { recursive: true })
    spawnSync('git', ['-C', dir, 'config', 'core.hooksPath', abs])
    const h = probeHooks(dir)
    // RUN IT, do not pattern-match it. Asserting the `'\''` idiom appears would pass for a command
    // still broken elsewhere — `root` was unquoted too, and this fixture's path also has a space.
    // The claim being tested is "this command restores what bd set", so restore and compare.
    spawnSync('git', ['-C', dir, 'config', '--unset', 'core.hooksPath'])
    const rearm = spawnSync('sh', ['-c', h.reArmCommand ?? 'exit 9'], { encoding: 'utf8' })
    const after = spawnSync('git', ['-C', dir, 'config', '--get', 'core.hooksPath'], { encoding: 'utf8' })
    assert('the re-arm command RUNS and restores a path containing an apostrophe and a space',
      rearm.status === 0 && (after.stdout ?? '').trim() === abs)
  } finally { rmSync(dir, { recursive: true, force: true }) }
}
{
  // RESTORING A GLOBAL hooksPath AS LOCAL UN-RESTORES EVERY OTHER REPO. The command carried no
  // scope flag, and `git config` writes LOCAL by default — so a probe that correctly REPORTS
  // `scope=global` handed back a command that silently moves the setting into this one repo and
  // drops it everywhere else. GIT_CONFIG_GLOBAL keeps the real user config untouched.
  const dir = makeRepo()
  const fakeGlobal = join(dir, 'fake-global-config')
  const realGlobal = process.env.GIT_CONFIG_GLOBAL
  try {
    const abs = join(dir, '.beads', 'hooks')
    mkdirSync(abs, { recursive: true })
    writeFileSync(fakeGlobal, `[core]\n\thooksPath = ${abs}\n`)
    process.env.GIT_CONFIG_GLOBAL = fakeGlobal
    const h = probeHooks(dir)
    assert('a GLOBAL hooksPath re-arms at --global, not silently at local',
      h.hooksPath.scope === 'global' && h.reArmCommand?.includes('config --global core.hooksPath') === true)
  } finally {
    if (realGlobal === undefined) delete process.env.GIT_CONFIG_GLOBAL
    else process.env.GIT_CONFIG_GLOBAL = realGlobal
    rmSync(dir, { recursive: true, force: true })
  }
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
  // AN UNREADABLE HOOK WAS CLASSIFIED AS SOMEONE ELSE'S. The marker test was
  // `try { …includes(BD_MARKER) } catch { return false }`, so "could not read" became the
  // determinate "not bd's" — and the file then lands in `otherGitHooks`, which the report prints
  // under "(dormant, re-enabled by unset)" and the skill calls a restoration. With no OTHER bd
  // hook present, `shape` flips `git-hooks` → `none` and the skill concludes there is no hook
  // machinery at all: precisely the "a naive disarm can leave bd MORE armed than it found it"
  // outcome this module's header names as its reason for existing. Root-owned hooks,
  // read-protected hooks and a DIRECTORY named `pre-commit` (EISDIR) all reach it.
  const dir = makeRepo()
  const hook = join(dir, '.git', 'hooks', 'pre-commit')
  try {
    writeFileSync(hook, '#!/bin/sh\n# --- BEGIN BEADS INTEGRATION v1.0.3 ---\nbd hooks run pre-commit\n')
    chmodSync(hook, 0o000)
    const h = probeHooks(dir)
    assert('an UNREADABLE .git/hooks file is a third bucket, never "someone else\'s"',
      h.gitHooks.unreadableGitHooks.includes('pre-commit') &&
      !h.gitHooks.otherGitHooks.includes('pre-commit') &&
      !h.gitHooks.dormantBdHooks.includes('pre-commit'))
    assert('...and it does NOT read as "no hook machinery" — this one IS bd\'s', h.shape === 'unknown')
  } finally {
    try { chmodSync(hook, 0o600) } catch { /* never created */ }
    rmSync(dir, { recursive: true, force: true })
  }
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
{
  // THE HARM `gitAvailable`'s OWN COMMENT NAMES, at the site that causes it. `ls-files` was read as
  // `run(...).out` with no check, so an unrunnable `git` produced `trackedCount: 0` and the report
  // line ".beads/ tracked in git: 0 file(s) — nothing tracked" — from which the skill concludes
  // `rm -rf .beads/` merely frees disk. Here the store IS tracked and would be staged as deletions.
  // Asserted in the dangerous direction: what must hold is that 0 is NOT claimed.
  const dir = makeRepo()
  const realPath = process.env.PATH
  try {
    mkdirSync(join(dir, '.beads'), { recursive: true })
    writeFileSync(join(dir, '.beads', 'config.yaml'), 'x: 1\n')
    commitAll(dir)
    // A bare command name resolves through PATH, so this is ENOENT on every shelled-out fact —
    // measured, and the same shape as `git` genuinely not being installed.
    process.env.PATH = '/nonexistent'
    const r = probeResidue(dir)
    assert('git UNRUNNABLE → tracked files UNKNOWN, never "nothing tracked"',
      r.trackedCount === null && r.trackedError?.includes('could not run `git ls-files`') === true)
  } finally {
    process.env.PATH = realPath
    rmSync(dir, { recursive: true, force: true })
  }
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
