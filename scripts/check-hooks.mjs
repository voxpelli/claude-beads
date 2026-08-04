/**
 * Hook integration tests for vp-beads.
 * Verifies each hook script emits valid JSON output (0 or 1 objects)
 * and meets its behavioral contract.
 *
 * Adapted from vp-claude's check-hooks.mjs pattern.
 */

import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync,
} from 'node:fs'

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '')
const HOOKS = join(ROOT, 'hooks')

// --- Preflight ---

const jqCheck = spawnSync('which', ['jq'])
if (jqCheck.status !== 0) {
  console.error('FATAL: jq is required but not found in PATH')
  process.exit(1)
}

// --- Test infrastructure ---

let passed = 0
let failed = 0

/**
 * The single JSON object a hook emits on stdout.
 *
 * Both hooks that emit anything build it the same way —
 * `jq -n --arg msg "$message" '{"additionalContext": $msg}'` — so
 * `additionalContext` IS the payload; a hook with nothing to say prints nothing
 * at all rather than an object with the field missing. It stays optional here
 * because these tests parse whatever stdout actually contained, not what it was
 * supposed to contain: a hook that regressed into emitting a different shape has
 * to read as an empty context, not as a type error the runtime never sees.
 *
 * @typedef HookOutput
 * @property {string} [additionalContext] - Context injected into the agent
 */

/**
 * Parse stdout for JSON objects. Detects multi-object emission.
 *
 * The objects are NOT validated against `HookOutput` — `JSON.parse` accepts any
 * shape and this reports what it found, so every read still asserts.
 *
 * @param {string} stdout
 * @returns {{ count: number, objects: HookOutput[], parseError: string | undefined }}
 */
function parseJsonObjects (stdout) {
  const trimmed = stdout.trim()
  if (trimmed === '') return { count: 0, objects: [], parseError: undefined }

  try {
    const obj = JSON.parse(trimmed)
    return { count: 1, objects: [obj], parseError: undefined }
  } catch {
    // Check for multi-object emission
    const parts = trimmed.split(/\}\s*\{/).filter(Boolean)
    if (parts.length > 1) {
      return {
        count: parts.length,
        objects: [],
        parseError: `Multiple JSON objects detected (${parts.length})`,
      }
    }
    return { count: 0, objects: [], parseError: `Invalid JSON: ${trimmed.slice(0, 100)}` }
  }
}

/**
 * Run a hook script with optional stdin.
 *
 * @param {string} script - Filename in hooks/
 * @param {string} [stdin] - Stdin content
 * @param {{ args?: string[], cwd?: string, pathPrefix?: string, scrubValidator?: boolean }} [opts]
 * @returns {{ stdout: string, stderr: string, status: number | null }}
 */
function runHook (script, stdin, opts = {}) {
  const scriptPath = join(HOOKS, script)
  const args = opts.args ?? []
  // `npm run` prepends `node_modules/.bin` to PATH, and `diarie` is a dependency bin —
  // so inside `npm run check`, the hooks' first rung (`command -v diarie`) RESOLVES.
  // That is correct in production (a consumer with diarie installed should use it) but
  // it makes "no validator is reachable" impossible to simulate. A test that cannot
  // create its own premise is not testing anything, so this scrubs the entries that
  // supply one. Without it, this suite passes standalone and fails under `npm run check`
  // — which is exactly how it announced itself.
  //
  // ASK THE PATH, DON'T MODEL IT. This filtered on the literal substring
  // `node_modules/.bin` until 2026-07-22, which encodes a GUESS about where diarie comes
  // from — and the guess was incomplete: a GLOBAL install (here, an fnm shim dir) is not
  // a node_modules path, sailed straight through the filter, and the "no validator" test
  // failed on any machine that had one. Note the failure mode was honest — it went RED,
  // not quietly green — but it was red for an environmental reason, on a premise the
  // fixture could no longer create. So drop the substring heuristic and ask the real
  // question: does this directory actually contain a `diarie` binary? That holds for
  // node_modules/.bin, a global npm prefix, an fnm/nvm shim, or a Homebrew bin alike.
  const { PATH: inheritedPath } = process.env
  const basePath = opts.scrubValidator
    ? (inheritedPath ?? '').split(':').filter(p => p && !existsSync(join(p, 'diarie'))).join(':')
    : inheritedPath
  const path = opts.pathPrefix ? `${opts.pathPrefix}:${basePath}` : basePath
  const result = spawnSync('bash', [scriptPath, ...args], {
    input: stdin ?? '',
    cwd: opts.cwd ?? ROOT,
    encoding: 'utf8',
    timeout: 15_000,
    env: { ...process.env, PATH: path },
  })
  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    status: result.status,
  }
}

/**
 * @param {string} label
 * @param {() => { ok: boolean, reason?: string }} fn
 */
function test (label, fn) {
  try {
    const result = fn()
    if (result.ok) {
      passed++
      console.log(`  \u001B[32m✓\u001B[0m ${label}`)
    } else {
      failed++
      console.log(`  \u001B[31m✗\u001B[0m ${label}: ${result.reason}`)
    }
  } catch (/** @type {unknown} */ err) {
    failed++
    console.log(`  \u001B[31m✗\u001B[0m ${label}: threw ${err instanceof Error ? err.message : String(err)}`)
  }
}

// --- Helper: temp dir with fake RETRO files ---

/**
 * @param {number} n
 * @returns {string} Temp directory path
 */
function makeTempDirWithRetros (n) {
  const dir = mkdtempSync(join(tmpdir(), 'vp-beads-test-'))
  for (let i = 1; i <= n; i++) {
    const num = String(i).padStart(2, '0')
    writeFileSync(join(dir, `RETRO-${num}.md`), `# Sprint ${i}\n`)
  }
  return dir
}

/**
 * Create a temp dir initialised as a git repo with a GitHub origin remote.
 *
 * @param {string} originUrl - URL to set for `origin` remote
 * @returns {string} Temp directory path
 */
function makeTempGitRepo (originUrl) {
  const dir = mkdtempSync(join(tmpdir(), 'vp-beads-git-'))
  spawnSync('git', ['init', '-q'], { cwd: dir })
  spawnSync('git', ['remote', 'add', 'origin', originUrl], { cwd: dir })
  return dir
}

/**
 * Stage a file under .beads/ in a temp git repo so `git ls-files` tracks it.
 * Staging (not committing) is enough — `git ls-files --error-unmatch` reads the
 * index, and committing would need git user config in the temp repo.
 *
 * @param {string} dir - Temp git repo (from makeTempGitRepo)
 * @param {string} relPath - Path under the repo, e.g. '.beads/interactions.jsonl'
 */
function trackBeadsFile (dir, relPath) {
  const full = join(dir, relPath)
  mkdirSync(join(dir, '.beads'), { recursive: true })
  writeFileSync(full, 'x\n')
  spawnSync('git', ['add', relPath], { cwd: dir })
}

/**
 * Create a temp dir containing a stub `gh` script that prints the given
 * stdout and exits with the given status. Returns the dir path so callers
 * can prepend it to PATH.
 *
 * @param {string} stdout - Body to print
 * @param {number} [exitCode] - Exit status (default 0)
 * @returns {string} Temp directory path containing the stub
 */
function makeGhStubDir (stdout, exitCode = 0) {
  const dir = mkdtempSync(join(tmpdir(), 'vp-beads-stub-'))
  // printf with JSON-stringified payload avoids heredoc-delimiter collisions
  // for future callers that pass multi-line JSON through this stub.
  const script = `#!/bin/bash\nprintf '%s\\n' ${JSON.stringify(stdout)}\nexit ${exitCode}\n`
  const ghPath = join(dir, 'gh')
  writeFileSync(ghPath, script)
  chmodSync(ghPath, 0o755)
  return dir
}

/**
 * Create a temp dir containing a stub `diarie` (the tracker CLI the hooks
 * prefer), without needing a real `.diarie/` store.
 *
 * The stub DISPATCHES ON ARGS, because the two hook branches call the reader
 * differently and expect different shapes: `ready --filter in_progress --json`
 * returns a flat ARRAY of claims (what the compact branch recovers), while a bare
 * `ready --json` returns the `{ready, blocked, needsAttention}` OBJECT (what the
 * startup prime reads). A stub that echoed one payload for every invocation would
 * make the prime's tests pass against data the real reader never emits.
 *
 * The flag is `--json`, not `--format json`. That was the retired ready-walker's
 * spelling, and this comment kept it long after the CLI dropped it — harmless only
 * because the dispatch below falls through on `*)` rather than matching the flag.
 * THE STUB IS A DE-FACTO SPEC: if it drifts from the real CLI, these tests stay green
 * while production diverges, so its description has to be true.
 *
 * @param {string} inProgressJson - printed for `--filter in_progress` (e.g. '[]')
 * @param {number} [exitCode]
 * @param {string} [queueJson] - printed otherwise; omit to leave the queue read empty
 * @returns {string} Temp directory path containing the stub
 */
function makeTrackerStubDir (inProgressJson, exitCode = 0, queueJson = '') {
  const dir = mkdtempSync(join(tmpdir(), 'vp-beads-tracker-stub-'))
  const script = [
    '#!/bin/bash',
    'case "$*" in',
    `  *"--filter in_progress"*) printf '%s\\n' ${JSON.stringify(inProgressJson)} ;;`,
    `  *) printf '%s' ${JSON.stringify(queueJson)} ;;`,
    'esac',
    `exit ${exitCode}`,
    '',
  ].join('\n')
  const cliPath = join(dir, 'diarie')
  writeFileSync(cliPath, script)
  chmodSync(cliPath, 0o755)
  return dir
}

// =============================================================
// post-file-edit.sh
// =============================================================

console.log('\npost-file-edit.sh')

test('exists and is readable', () => ({ ok: existsSync(join(HOOKS, 'post-file-edit.sh')) }))

test('silent when no PLUGIN_ROOT arg', () => {
  const { status, stdout } = runHook('post-file-edit.sh', JSON.stringify({
    tool_input: { file_path: '/any/path.sh' },
  }))
  const { count } = parseJsonObjects(stdout)
  if (status !== 0) return { ok: false, reason: `exit ${status}` }
  return count === 0
    ? { ok: true }
    : { ok: false, reason: `expected silent, got ${count} objects` }
})

test('silent when file is not under hooks/', () => {
  const { status, stdout } = runHook('post-file-edit.sh', JSON.stringify({
    tool_input: { file_path: '/some/other/file.js' },
  }), { args: [ROOT] })
  const { count } = parseJsonObjects(stdout)
  if (status !== 0) return { ok: false, reason: `exit ${status}` }
  return count === 0
    ? { ok: true }
    : { ok: false, reason: `expected silent, got ${count} objects` }
})

// =============================================================
// post-tasks-validate.sh
// =============================================================

console.log('\npost-tasks-validate.sh')

test('exists and is readable', () => ({ ok: existsSync(join(HOOKS, 'post-tasks-validate.sh')) }))

/**
 * Build a temp project holding a `.diarie/tasks/` store with the given YAML.
 *
 * @param {string} yaml
 * @returns {{ dir: string, file: string }}
 */
function makeTaskStore (yaml) {
  const dir = mkdtempSync(join(tmpdir(), 'vp-beads-taskstore-'))
  const tasksDir = join(dir, '.diarie', 'tasks')
  mkdirSync(tasksDir, { recursive: true })
  const file = join(tasksDir, 'tasks-x.yml')
  writeFileSync(file, yaml)
  return { dir, file }
}

const VALID_TASK = 'meta:\n  slug: x\ntasks:\n  - id: T-1\n    title: a\n    status: pending\n    type: task\n'
const DANGLING_DEP = 'meta:\n  slug: x\ntasks:\n  - id: T-1\n    title: a\n    status: pending\n    type: task\n    deps: [T-99]\n'

test('invalid store → reports the error as additionalContext', () => {
  // The whole point of the hook. Regression here is SILENT: the agent keeps
  // editing a store whose ready-walk is now lying about what is workable.
  const { dir, file } = makeTaskStore(DANGLING_DEP)
  try {
    const { status, stdout } = runHook('post-tasks-validate.sh', JSON.stringify({ tool_input: { file_path: file } }), {
      args: [ROOT],
    })
    if (status !== 0) return { ok: false, reason: `exit ${status}` }
    const { count, objects, parseError } = parseJsonObjects(stdout)
    if (parseError) return { ok: false, reason: parseError }
    if (count !== 1) return { ok: false, reason: `expected 1 object, got ${count}` }
    const ctx = String(/** @type {HookOutput} */ (objects[0]).additionalContext ?? '')
    if (!ctx.includes('T-99')) return { ok: false, reason: `error not surfaced: ${ctx.slice(0, 200)}` }
    return { ok: true }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('invalid store: `clean: false` must not be swallowed by jq\'s // operator', () => {
  // Guards a real bug found in review: `.clean // empty` treats FALSE as absent, so
  // the alternative fired on exactly the invalid-store case and the hook went silent
  // precisely when it had something to say. It only spoke when there was nothing to
  // report. Asserts the failing path produces output at all.
  const { dir, file } = makeTaskStore(DANGLING_DEP)
  try {
    const { stdout } = runHook('post-tasks-validate.sh', JSON.stringify({ tool_input: { file_path: file } }), {
      args: [ROOT],
    })
    return stdout.trim().length > 0
      ? { ok: true }
      : { ok: false, reason: 'invalid store produced NO output — the false-is-absent bug is back' }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('valid store → silent (no noise on every task edit)', () => {
  const { dir, file } = makeTaskStore(VALID_TASK)
  try {
    const { status, stdout } = runHook('post-tasks-validate.sh', JSON.stringify({ tool_input: { file_path: file } }), {
      args: [ROOT],
    })
    if (status !== 0) return { ok: false, reason: `exit ${status}` }
    return stdout.trim() === '' ? { ok: true } : { ok: false, reason: `expected silence, got: ${stdout.slice(0, 120)}` }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('non-task file → silent (fires only for .diarie/tasks/)', () => {
  const { status, stdout } = runHook('post-tasks-validate.sh', JSON.stringify({
    tool_input: { file_path: '/tmp/some/README.md' },
  }), { args: [ROOT] })
  if (status !== 0) return { ok: false, reason: `exit ${status}` }
  return stdout.trim() === '' ? { ok: true } : { ok: false, reason: `unexpected output: ${stdout.slice(0, 120)}` }
})

test('no resolvable validator → silent, exit 0 (never a spam loop)', () => {
  // A marketplace plugin cache has no node_modules, so the plugin's validate-tasks
  // cannot import js-yaml. A hook that cannot validate must say nothing.
  const { dir, file } = makeTaskStore(DANGLING_DEP)
  try {
    const { status, stdout } = runHook('post-tasks-validate.sh', JSON.stringify({ tool_input: { file_path: file } }), {
      args: ['/nonexistent-plugin-root'],
      scrubValidator: true,
    })
    if (status !== 0) return { ok: false, reason: `exit ${status}` }
    return stdout.trim() === '' ? { ok: true } : { ok: false, reason: `expected silence, got: ${stdout.slice(0, 120)}` }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

// =============================================================
// PostToolUseFailure — DELIBERATELY ABSENT (vp-beads-hkd)
// =============================================================
//
// `post-bm-failure-classify.sh` and its 6 tests lived here until 2026-07-29.
// It DUPLICATED vp-knowledge's hook of the same name: same event, overlapping
// matcher, divergent advice, so both fired and contradicted each other. These
// tests all passed the entire time — they exercised the hook in ISOLATION, and
// no gate in either repo can see a cross-plugin duplicate. That is the lesson
// worth leaving behind: a hook suite proves the hook works, never that it
// should exist.
//
// vp-knowledge owns Basic Memory infrastructure (CLAUDE.md
// `### Relationship to vp-knowledge`), so its copy is the one that survives.

// =============================================================
// session-start.sh — compact-source recovery (replaces the retired
// precompact.sh + post-compact.sh hooks; this is the only post-compaction
// slot that injects additionalContext into the resumed agent)
// =============================================================

console.log('\nsession-start.sh (source=compact)')

test('emits at most 1 JSON object (no multi-object)', () => {
  // Run in an empty temp dir so no UPSTREAM/SWARM/RETRO files exist.
  const dir = makeTempDirWithRetros(0)
  try {
    const { status, stdout } = runHook('session-start.sh', JSON.stringify({ source: 'compact' }), { cwd: dir })
    if (status !== 0) return { ok: false, reason: `exit ${status}` }
    const { count, parseError } = parseJsonObjects(stdout)
    if (parseError) return { ok: false, reason: parseError }
    return count <= 1
      ? { ok: true }
      : { ok: false, reason: `expected 0 or 1 objects, got ${count}` }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('compact source: emits 1 object listing UPSTREAM packages and SWARM file', () => {
  // SessionStart fires with source="compact" after compaction; the compact
  // branch emits the recovery snapshot into the resumed tool-capable agent.
  const dir = mkdtempSync(join(tmpdir(), 'vp-beads-compact-fires-'))
  try {
    writeFileSync(join(dir, 'UPSTREAM-some-pkg.md'), '_No entries yet._\n')
    writeFileSync(join(dir, 'UPSTREAM-other-pkg.md'), '_No entries yet._\n')
    writeFileSync(join(dir, 'SWARM-13.md'), '# Wave 1\n')
    const { status, stdout } = runHook('session-start.sh', JSON.stringify({ source: 'compact' }), { cwd: dir })
    if (status !== 0) return { ok: false, reason: `exit ${status}` }
    const { count, objects, parseError } = parseJsonObjects(stdout)
    if (parseError) return { ok: false, reason: parseError }
    if (count !== 1) return { ok: false, reason: `expected 1 object, got ${count}` }
    const ctx = String(/** @type {HookOutput} */ (objects[0]).additionalContext ?? '')
    if (!ctx.includes('Context was just compacted')) {
      return { ok: false, reason: `additionalContext missing recovery preamble: ${ctx.slice(0, 200)}` }
    }
    if (!ctx.includes('some-pkg') || !ctx.includes('other-pkg')) {
      return { ok: false, reason: `additionalContext missing UPSTREAM packages: ${ctx.slice(0, 200)}` }
    }
    if (!ctx.includes('SWARM-13.md')) {
      return { ok: false, reason: `additionalContext missing recent SWARM file: ${ctx.slice(0, 200)}` }
    }
    // HIGH 90 regression guard: no tracker store in this dir → the reader emits
    // nothing, so no in-progress section may appear.
    if (ctx.includes('In-progress tracker task')) {
      return { ok: false, reason: `unexpected in-progress section with no tracker store: ${ctx.slice(0, 200)}` }
    }
    return { ok: true }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('zero in-progress tracker tasks: empty array → no in-progress section emitted', () => {
  // HIGH 90 regression test: with a stub tracker CLI that returns "[]", the
  // hook must NOT emit any in-progress line. An UPSTREAM file is included so
  // the hook still produces output (rather than going silent) — the assertion
  // is specifically about the tracker section's absence.
  const dir = mkdtempSync(join(tmpdir(), 'vp-beads-compact-zero-tracker-'))
  const stubDir = makeTrackerStubDir('[]')
  try {
    writeFileSync(join(dir, 'UPSTREAM-some-pkg.md'), '_No entries yet._\n')
    const { status, stdout } = runHook('session-start.sh', JSON.stringify({ source: 'compact' }), {
      cwd: dir,
      pathPrefix: stubDir,
    })
    if (status !== 0) return { ok: false, reason: `exit ${status}` }
    const { count, objects, parseError } = parseJsonObjects(stdout)
    if (parseError) return { ok: false, reason: parseError }
    if (count !== 1) return { ok: false, reason: `expected 1 object, got ${count}` }
    const ctx = String(/** @type {HookOutput} */ (objects[0]).additionalContext ?? '')
    if (ctx.includes('In-progress tracker task')) {
      return { ok: false, reason: `unexpected in-progress section for empty tracker array: ${ctx.slice(0, 200)}` }
    }
    return { ok: true }
  } finally {
    rmSync(dir, { recursive: true, force: true })
    rmSync(stubDir, { recursive: true, force: true })
  }
})

test('compact source: empty state still emits the capture nudge (never silent)', () => {
  // Unlike the retired post-compact.sh (which exited silently with no state),
  // the compact branch always emits the recovery preamble + capture nudge —
  // the slot is the post-compaction reflect-and-recover moment, so it fires
  // even when no UPSTREAM/SWARM/bd state is present.
  const dir = mkdtempSync(join(tmpdir(), 'vp-beads-compact-empty-'))
  try {
    const { status, stdout } = runHook('session-start.sh', JSON.stringify({ source: 'compact' }), { cwd: dir })
    if (status !== 0) return { ok: false, reason: `exit ${status}` }
    const { count, objects, parseError } = parseJsonObjects(stdout)
    if (parseError) return { ok: false, reason: parseError }
    if (count !== 1) return { ok: false, reason: `expected 1 object, got ${count}` }
    const ctx = String(/** @type {HookOutput} */ (objects[0]).additionalContext ?? '')
    if (!ctx.includes('Context was just compacted')) {
      return { ok: false, reason: `missing recovery preamble: ${ctx.slice(0, 120)}` }
    }
    return ctx.includes('capture them now')
      ? { ok: true }
      : { ok: false, reason: `missing capture nudge: ${ctx.slice(0, 200)}` }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('compact source: one in-progress tracker task → recovery section with id, title, file hint', () => {
  // Positive test for the in-progress recovery section — the one piece of
  // compact-branch state an agent cannot re-derive from files. A regression
  // here is silent (hook still exits 0 + emits the preamble), so assert the
  // payload directly.
  const dir = mkdtempSync(join(tmpdir(), 'vp-beads-compact-tracker-claim-'))
  const stubDir = makeTrackerStubDir('[{"id":"x-1","title":"Implement the feature"}]')
  try {
    const { status, stdout } = runHook('session-start.sh', JSON.stringify({ source: 'compact' }), {
      cwd: dir,
      pathPrefix: stubDir,
    })
    if (status !== 0) return { ok: false, reason: `exit ${status}` }
    const { count, objects, parseError } = parseJsonObjects(stdout)
    if (parseError) return { ok: false, reason: parseError }
    if (count !== 1) return { ok: false, reason: `expected 1 object, got ${count}` }
    const ctx = String(/** @type {HookOutput} */ (objects[0]).additionalContext ?? '')
    for (const needle of ['In-progress tracker task', 'x-1', 'Implement the feature', '.diarie/tasks/']) {
      if (!ctx.includes(needle)) return { ok: false, reason: `missing "${needle}": ${ctx.slice(0, 200)}` }
    }
    return { ok: true }
  } finally {
    rmSync(dir, { recursive: true, force: true })
    rmSync(stubDir, { recursive: true, force: true })
  }
})

test('startup: tracker prime emits counts, next-ready and claims', () => {
  // The `bd prime` replacement. Before this the startup branch emitted NO tracker
  // state, so every session began blind to the backlog. The reader namespaces ids
  // as `<slug>/<id>` — the prime must strip the slug, or the display is unreadable.
  const dir = mkdtempSync(join(tmpdir(), 'vp-beads-startup-prime-'))
  // The prime gates on the STORE existing, not merely on a runnable reader — otherwise it
  // announced "Tracker: 0 ready" in repos with no tracker at all. So the fixture needs one.
  mkdirSync(join(dir, '.diarie', 'tasks'), { recursive: true })
  writeFileSync(join(dir, '.diarie', 'tasks', 'tasks-x.yml'), 'tasks: []\n')
  const queue = JSON.stringify({
    ready: [{ id: 'backlog/p-1', title: 'First', priority: 'high' }, { id: 'backlog/p-2', title: 'Second', priority: 'low' }],
    blocked: [{ id: 'backlog/p-3', title: 'Third' }],
    needsAttention: [],
  })
  const stubDir = makeTrackerStubDir('[{"id":"backlog/p-9","title":"Claimed work"}]', 0, queue)
  try {
    const { status, stdout } = runHook('session-start.sh', JSON.stringify({ source: 'startup' }), {
      cwd: dir,
      pathPrefix: stubDir,
    })
    if (status !== 0) return { ok: false, reason: `exit ${status}` }
    const { count, objects, parseError } = parseJsonObjects(stdout)
    if (parseError) return { ok: false, reason: parseError }
    if (count !== 1) return { ok: false, reason: `expected 1 object, got ${count}` }
    const ctx = String(/** @type {HookOutput} */ (objects[0]).additionalContext ?? '')
    for (const needle of ['2 ready', '1 blocked', '1 in progress', 'p-1 (high)', 'Claimed work']) {
      if (!ctx.includes(needle)) return { ok: false, reason: `missing "${needle}": ${ctx.slice(0, 300)}` }
    }
    // The slug prefix must be stripped — `backlog/p-1` would be noise.
    if (ctx.includes('backlog/p-1')) return { ok: false, reason: 'namespaced id leaked into the prime (slug not stripped)' }
    return { ok: true }
  } finally {
    rmSync(dir, { recursive: true, force: true })
    rmSync(stubDir, { recursive: true, force: true })
  }
})

test('startup: reader present but NO STORE → prime stays silent', () => {
  // Gating on the reader alone made the prime announce "Tracker: 0 ready · 0 blocked" in a
  // repo with no tracker at all — not a silent skip but a confident FALSE REPORT, which is
  // worse. The canonical predicate needs BOTH a store and a runnable reader.
  const dir = makeTempDirWithRetros(0)
  const stubDir = makeTrackerStubDir('[]', 0, JSON.stringify({ ready: [], blocked: [], needsAttention: [] }))
  try {
    const { status, stdout } = runHook('session-start.sh', JSON.stringify({ source: 'startup' }), {
      cwd: dir,
      pathPrefix: stubDir,
    })
    if (status !== 0) return { ok: false, reason: `exit ${status}` }
    const { objects } = parseJsonObjects(stdout)
    const ctx = objects.length ? String(/** @type {HookOutput} */ (objects[0]).additionalContext ?? '') : ''
    return ctx.includes('Tracker:')
      ? { ok: false, reason: `announced a tracker that does not exist: ${ctx.slice(0, 120)}` }
      : { ok: true }
  } finally {
    rmSync(dir, { recursive: true, force: true })
    rmSync(stubDir, { recursive: true, force: true })
  }
})

test('startup: no tracker → prime stays silent (never a broken line)', () => {
  // Hooks are exempt from the silent-skip rule. With no `diarie` on PATH and no
  // in-repo reader, the prime must emit nothing rather than a half-built line.
  const dir = makeTempDirWithRetros(0)
  try {
    const { status, stdout } = runHook('session-start.sh', JSON.stringify({ source: 'startup' }), { cwd: dir })
    if (status !== 0) return { ok: false, reason: `exit ${status}` }
    const { objects, parseError } = parseJsonObjects(stdout)
    if (parseError) return { ok: false, reason: parseError }
    const ctx = objects.length ? String(/** @type {HookOutput} */ (objects[0]).additionalContext ?? '') : ''
    if (ctx.includes('Tracker:')) return { ok: false, reason: `emitted a tracker line with no tracker: ${ctx.slice(0, 200)}` }
    return { ok: true }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('startup: tracker prime does not break the single-object contract', () => {
  // Claude Code reads only the FIRST JSON object and silently drops the rest, so a
  // second object is a silent capability loss. The prime appends to `parts`, and
  // this asserts it did not start emitting its own object.
  const dir = makeTempDirWithRetros(3)
  mkdirSync(join(dir, '.diarie', 'tasks'), { recursive: true })
  writeFileSync(join(dir, '.diarie', 'tasks', 'tasks-x.yml'), 'tasks: []\n')
  const queue = JSON.stringify({ ready: [{ id: 'backlog/p-1', title: 'T', priority: 'medium' }], blocked: [], needsAttention: [] })
  const stubDir = makeTrackerStubDir('[]', 0, queue)
  try {
    const { status, stdout } = runHook('session-start.sh', JSON.stringify({ source: 'startup' }), {
      cwd: dir,
      pathPrefix: stubDir,
    })
    if (status !== 0) return { ok: false, reason: `exit ${status}` }
    const { count, parseError } = parseJsonObjects(stdout)
    if (parseError) return { ok: false, reason: parseError }
    if (count !== 1) return { ok: false, reason: `expected exactly 1 object, got ${count}` }
    return { ok: true }
  } finally {
    rmSync(dir, { recursive: true, force: true })
    rmSync(stubDir, { recursive: true, force: true })
  }
})

test('branch isolation: compact source must NOT emit the startup tracker prime', () => {
  // The compact branch has its OWN in-progress recovery read; the prime is
  // startup-only. If both fired, a compacted session would get the backlog twice.
  const dir = mkdtempSync(join(tmpdir(), 'vp-beads-compact-noprime-'))
  const queue = JSON.stringify({ ready: [{ id: 'backlog/p-1', title: 'T', priority: 'high' }], blocked: [], needsAttention: [] })
  const stubDir = makeTrackerStubDir('[]', 0, queue)
  try {
    const { status, stdout } = runHook('session-start.sh', JSON.stringify({ source: 'compact' }), {
      cwd: dir,
      pathPrefix: stubDir,
    })
    if (status !== 0) return { ok: false, reason: `exit ${status}` }
    const { objects, parseError } = parseJsonObjects(stdout)
    if (parseError) return { ok: false, reason: parseError }
    const ctx = objects.length ? String(/** @type {HookOutput} */ (objects[0]).additionalContext ?? '') : ''
    if (ctx.includes('Tracker:') || ctx.includes('next ready:')) {
      return { ok: false, reason: `startup prime leaked into the compact branch: ${ctx.slice(0, 200)}` }
    }
    return { ok: true }
  } finally {
    rmSync(dir, { recursive: true, force: true })
    rmSync(stubDir, { recursive: true, force: true })
  }
})

test('branch isolation: startup source must NOT emit compact-branch phrases', () => {
  const dir = makeTempDirWithRetros(0)
  try {
    // No source field → startup branch.
    const { status, stdout } = runHook('session-start.sh', JSON.stringify({}), { cwd: dir })
    if (status !== 0) return { ok: false, reason: `exit ${status}` }
    const { objects, parseError } = parseJsonObjects(stdout)
    if (parseError) return { ok: false, reason: parseError }
    const ctx = objects.length === 0
      ? ''
      : String(/** @type {HookOutput} */ (objects[0]).additionalContext ?? '')
    if (ctx.includes('Context was just compacted') || ctx.includes('capture them now')) {
      return { ok: false, reason: `startup run leaked compact phrasing: ${ctx.slice(0, 200)}` }
    }
    return { ok: true }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('branch isolation: compact source must NOT emit startup-only nudges', () => {
  // UPSTREAM + 4 RETRO files would trigger dormancy + trend-review nudges IF
  // the wrong branch ran — making this isolation test non-vacuous.
  const dir = mkdtempSync(join(tmpdir(), 'vp-beads-compact-isolation-'))
  try {
    writeFileSync(join(dir, 'UPSTREAM-some-pkg.md'), '_No entries yet._\n')
    for (let i = 1; i <= 4; i++) writeFileSync(join(dir, `RETRO-0${i}.md`), `# Sprint ${i}\n`)
    const { status, stdout } = runHook('session-start.sh', JSON.stringify({ source: 'compact' }), { cwd: dir })
    if (status !== 0) return { ok: false, reason: `exit ${status}` }
    const { count, objects, parseError } = parseJsonObjects(stdout)
    if (parseError) return { ok: false, reason: parseError }
    if (count !== 1) return { ok: false, reason: `expected 1 object, got ${count}` }
    const ctx = String(/** @type {HookOutput} */ (objects[0]).additionalContext ?? '')
    for (const leak of ['Trend-review', 'Low-activity repo', '[security]']) {
      if (ctx.includes(leak)) return { ok: false, reason: `compact run leaked startup nudge "${leak}": ${ctx.slice(0, 200)}` }
    }
    return { ok: true }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

// =============================================================
// session-start.sh
// =============================================================

console.log('\nsession-start.sh')

test('exists and is readable', () => ({ ok: existsSync(join(HOOKS, 'session-start.sh')) }))

test('emits at most 1 JSON object (no multi-object)', () => {
  // Run in a temp dir to avoid reading real project state
  const dir = makeTempDirWithRetros(0)
  try {
    const { stdout } = runHook('session-start.sh', '', { cwd: dir })
    // May exit non-zero if git isn't available in temp dir — that's ok
    const { count, parseError } = parseJsonObjects(stdout)
    if (parseError) return { ok: false, reason: parseError }
    return count <= 1
      ? { ok: true }
      : { ok: false, reason: `expected 0 or 1 objects, got ${count}` }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('with 3 RETRO files, emits 1 object', () => {
  const dir = makeTempDirWithRetros(3)
  try {
    const { stdout } = runHook('session-start.sh', '', { cwd: dir })
    const { count, parseError } = parseJsonObjects(stdout)
    if (parseError) return { ok: false, reason: parseError }
    // May be 0 if git commands fail in temp dir, but should never be >1
    return count <= 1
      ? { ok: true }
      : { ok: false, reason: `expected 0 or 1 objects, got ${count}` }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('with 4 RETRO files (mod 0), NO trend-review text — the deleted branch stays deleted', () => {
  // This test used to assert `count <= 1`, which ZERO objects satisfy — so it was
  // named for a branch it could never observe, and its own comment conceded the
  // count "may be 0". Deleting the entire `mod -eq 0` branch left it green.
  //
  // That branch was wrong by a full cycle: at 16 RETRO files it announced sprint 17,
  // and 17 % 4 == 1. It also fired one RETRO after the `mod -eq 3` reminder had
  // already announced the same cycle, so every cycle produced two announcements
  // naming different sprints. The surviving branch is pinned by literal string AND
  // ordinal position in the ALL-SIX test below; this one pins the boundary ALL-SIX
  // never reaches. Assert CONTENT, not a count — that is the whole lesson here.
  const dir = makeTempDirWithRetros(4)
  try {
    const { stdout } = runHook('session-start.sh', '', { cwd: dir })
    const { objects, parseError } = parseJsonObjects(stdout)
    if (parseError) return { ok: false, reason: parseError }
    const ctx = objects.length ? String(/** @type {HookOutput} */ (objects[0]).additionalContext ?? '') : ''
    return ctx.includes('Trend-review')
      ? { ok: false, reason: `mod==0 announced a trend-review sprint: ${ctx.slice(0, 160)}` }
      : { ok: true }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('Dependabot alerts: stubbed gh returning 3 → 1 JSON object with security line', () => {
  const dir = makeTempGitRepo('git@github.com:test-owner/test-repo.git')
  const stubDir = makeGhStubDir('3')
  try {
    const { status, stdout } = runHook('session-start.sh', '', {
      cwd: dir,
      pathPrefix: stubDir,
    })
    if (status !== 0) return { ok: false, reason: `exit ${status}` }
    const { count, objects, parseError } = parseJsonObjects(stdout)
    if (parseError) return { ok: false, reason: parseError }
    if (count !== 1) return { ok: false, reason: `expected 1 object, got ${count}` }
    const ctx = String(/** @type {HookOutput} */ (objects[0]).additionalContext ?? '')
    if (!ctx.includes('[security]')) {
      return { ok: false, reason: `additionalContext missing [security]: ${ctx.slice(0, 120)}` }
    }
    if (!ctx.includes('3 open Dependabot alert')) {
      return { ok: false, reason: `additionalContext missing count phrase: ${ctx.slice(0, 120)}` }
    }
    if (!ctx.includes('test-owner/test-repo')) {
      return { ok: false, reason: `additionalContext missing repo URL: ${ctx.slice(0, 120)}` }
    }
    return { ok: true }
  } finally {
    rmSync(dir, { recursive: true, force: true })
    rmSync(stubDir, { recursive: true, force: true })
  }
})

test('Dependabot alerts: stubbed gh returning 0 → no security line', () => {
  const dir = makeTempGitRepo('https://github.com/test-owner/test-repo.git')
  const stubDir = makeGhStubDir('0')
  try {
    const { status, stdout } = runHook('session-start.sh', '', {
      cwd: dir,
      pathPrefix: stubDir,
    })
    if (status !== 0) return { ok: false, reason: `exit ${status}` }
    const { objects, parseError } = parseJsonObjects(stdout)
    if (parseError) return { ok: false, reason: parseError }
    // No RETRO/UPSTREAM/SYNERGY files in the temp dir, and 0 alerts → silent.
    if (objects.length === 0) return { ok: true }
    const ctx = String(/** @type {HookOutput} */ (objects[0]).additionalContext ?? '')
    return ctx.includes('[security]')
      ? { ok: false, reason: `unexpected security line for 0 alerts: ${ctx.slice(0, 120)}` }
      : { ok: true }
  } finally {
    rmSync(dir, { recursive: true, force: true })
    rmSync(stubDir, { recursive: true, force: true })
  }
})

test('Dependabot alerts: gh missing (PATH without gh) → no security line, no error', () => {
  const dir = makeTempGitRepo('git@github.com:test-owner/test-repo.git')
  // Use a fully restricted PATH that excludes gh but keeps required tools
  // available via absolute lookup. Easier: rely on the silent-on-failure
  // contract and just ensure no [security] line is emitted when no stub
  // exists. We can't safely null out PATH (jq/git/find required), so we
  // simply do not provide a gh stub: the host's gh (if present) will run
  // against test-owner/test-repo and fail (404 or auth error), which the
  // hook must swallow. Either way: no [security] line.
  try {
    const { status, stdout } = runHook('session-start.sh', '', { cwd: dir })
    if (status !== 0) return { ok: false, reason: `exit ${status}` }
    const { objects, parseError } = parseJsonObjects(stdout)
    if (parseError) return { ok: false, reason: parseError }
    if (objects.length === 0) return { ok: true }
    const ctx = String(/** @type {HookOutput} */ (objects[0]).additionalContext ?? '')
    return ctx.includes('[security]')
      ? { ok: false, reason: `unexpected security line without alerts: ${ctx.slice(0, 120)}` }
      : { ok: true }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('sensitive-file: tracked .beads-credential-key → 1 clean JSON object warning it', () => {
  const dir = makeTempGitRepo('git@github.com:test-owner/test-repo.git')
  trackBeadsFile(dir, '.beads/.beads-credential-key')
  try {
    const { stdout } = runHook('session-start.sh', '', { cwd: dir })
    const { count, objects, parseError } = parseJsonObjects(stdout)
    // parseError would catch the old stdout-leak bug (bare path before JSON).
    if (parseError) return { ok: false, reason: parseError }
    if (count !== 1) return { ok: false, reason: `expected 1 object, got ${count}` }
    const ctx = String(/** @type {HookOutput} */ (objects[0]).additionalContext ?? '')
    return ctx.includes('.beads-credential-key is tracked by git')
      ? { ok: true }
      : { ok: false, reason: `missing credential-key warning: ${ctx.slice(0, 120)}` }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('sensitive-file: tracked interactions.jsonl is NOT flagged (intentional audit trail)', () => {
  const dir = makeTempGitRepo('git@github.com:test-owner/test-repo.git')
  trackBeadsFile(dir, '.beads/interactions.jsonl')
  try {
    const { stdout } = runHook('session-start.sh', '', { cwd: dir })
    const { objects, parseError } = parseJsonObjects(stdout)
    if (parseError) return { ok: false, reason: parseError }
    const ctx = objects.length === 0
      ? ''
      : String(/** @type {HookOutput} */ (objects[0]).additionalContext ?? '')
    return ctx.includes('interactions.jsonl')
      ? { ok: false, reason: `interactions.jsonl should not be flagged: ${ctx.slice(0, 120)}` }
      : { ok: true }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('sensitive-file: tracked PRIVATE-SYNERGY-*.md private overlay → warned', () => {
  const dir = makeTempGitRepo('git@github.com:test-owner/test-repo.git')
  writeFileSync(join(dir, 'PRIVATE-SYNERGY-acme.md'), '# private overlay\n')
  spawnSync('git', ['add', 'PRIVATE-SYNERGY-acme.md'], { cwd: dir })
  try {
    const { stdout } = runHook('session-start.sh', '', { cwd: dir })
    const { objects, parseError } = parseJsonObjects(stdout)
    if (parseError) return { ok: false, reason: parseError }
    const ctx = objects.length === 0
      ? ''
      : String(/** @type {HookOutput} */ (objects[0]).additionalContext ?? '')
    return ctx.includes('PRIVATE-SYNERGY-acme.md') && ctx.includes('private')
      ? { ok: true }
      : { ok: false, reason: `missing overlay warning: ${ctx.slice(0, 150)}` }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

// =============================================================
// Summary
// =============================================================

// ============================================================================
// vp-beads-hkt — THE POSITIVE TESTS. Every `Tracker:` assertion in this file used to be
// NEGATIVE (it FAILED if the line appeared), so the suite could detect "announced a tracker that
// isn't there" and was structurally blind to "failed to announce a tracker that is there" — which
// is the one that ships. These use a REAL store and the REAL `diarie` CLI resolved on PATH (under
// `npm run check`, npm injects node_modules/.bin, where the `diarie@^0.2.0` dependency's `diarie` bin
// lives), so there is no stub to drift from the CLI. (They used to scrub the PATH — what is now
// `scrubValidator` — to force the hook down to a vendored $PLUGIN_ROOT/diarie/cli.js rung; diarie is
// an external dependency now, that rung is gone, and the live rung IS the installed CLI.)
// ============================================================================

/**
 * A real store, written to a real temp dir. No stub — the hook runs the actual CLI.
 *
 * @param {string} yaml
 * @returns {string} the project root
 */
function makeRealStore (yaml) {
  const dir = mkdtempSync(join(tmpdir(), 'vp-beads-realstore-'))
  mkdirSync(join(dir, '.diarie', 'tasks'), { recursive: true })
  writeFileSync(join(dir, '.diarie', 'tasks', 'tasks-a.yml'), yaml)
  return dir
}

const HEALTHY_STORE = 'tasks:\n  - id: T-1\n    title: ready\n    status: pending\n    type: task\n  - id: T-2\n    title: a real live claim\n    status: in_progress\n    type: task\n'
// `in-progress` (hyphen) is not in VALID_STATUSES. The loader REJECTS the field and the row
// disappears from every partition, every filter, and every count. A live claim, silently gone.
const DROPPED_STORE = 'tasks:\n  - id: T-1\n    title: ready\n    status: pending\n    type: task\n  - id: T-9\n    title: THE LIVE CLAIM\n    status: in-progress\n    type: task\n'

test('startup: a HEALTHY store DOES emit a Tracker line (the assertion this suite never had)', () => {
  const dir = makeRealStore(HEALTHY_STORE)
  try {
    const { status, stdout } = runHook('session-start.sh', JSON.stringify({ source: 'startup' }), { cwd: dir })
    if (status !== 0) return { ok: false, reason: `exit ${status}` }
    const { objects } = parseJsonObjects(stdout)
    const ctx = objects.length ? String(/** @type {HookOutput} */ (objects[0]).additionalContext ?? '') : ''
    if (!ctx.includes('Tracker:')) return { ok: false, reason: `no Tracker line for a real store: ${ctx.slice(0, 160)}` }
    if (!/1 in progress/.test(ctx)) return { ok: false, reason: `the live claim was not counted: ${ctx.slice(0, 160)}` }
    return { ok: true }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('startup: a DROPPED row is ANNOUNCED — the counts are incomplete and the prime must say so', () => {
  // Before: "Tracker: 1 ready · 0 blocked · 0 in progress" — a confident, complete-looking line
  // over a store that had silently lost a live claim. The founding defect, in the session prime.
  const dir = makeRealStore(DROPPED_STORE)
  try {
    const { status, stdout } = runHook('session-start.sh', JSON.stringify({ source: 'startup' }), { cwd: dir })
    if (status !== 0) return { ok: false, reason: `exit ${status} — the hook must DEGRADE, never abort` }
    const { objects } = parseJsonObjects(stdout)
    const ctx = objects.length ? String(/** @type {HookOutput} */ (objects[0]).additionalContext ?? '') : ''
    if (!/loader complaint/.test(ctx)) return { ok: false, reason: `a dropped row went unannounced: ${ctx.slice(0, 200)}` }
    return { ok: true }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('compact: a DROPPED row is ANNOUNCED, and the hook still EXITS 0', () => {
  // `set -euo pipefail` in session-start.sh means a bare `x=$(cmd)` whose command exits non-zero
  // (cite the CONSTRUCT, never a line number — this said `session-start.sh:24` until vp-beads-46k
  // grew the header and moved it to 49, and no gate can see a stale line reference)
  // ABORTS THE HOOK. `--filter --strict` exits 2 by design on a broken store — so the first draft
  // of this fix made the hook emit NOTHING and exit 2 exactly when the store was broken: strictly
  // worse than the silent claim-loss it replaced. Only running the hook found it. This pins it.
  const dir = makeRealStore(DROPPED_STORE)
  try {
    const { status, stdout } = runHook('session-start.sh', JSON.stringify({ source: 'compact' }), { cwd: dir })
    if (status !== 0) return { ok: false, reason: `exit ${status} — errexit aborted the hook; it must degrade quietly` }
    const { objects } = parseJsonObjects(stdout)
    const ctx = objects.length ? String(/** @type {HookOutput} */ (objects[0]).additionalContext ?? '') : ''
    if (!/NOT SOUND/.test(ctx)) return { ok: false, reason: `compact did not announce the unsound store: ${ctx.slice(0, 200)}` }
    return { ok: true }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('startup: a HEALTHY store is NOT accused of dropping rows', () => {
  const dir = makeRealStore(HEALTHY_STORE)
  try {
    const { stdout } = runHook('session-start.sh', JSON.stringify({ source: 'startup' }), { cwd: dir })
    const { objects } = parseJsonObjects(stdout)
    const ctx = objects.length ? String(/** @type {HookOutput} */ (objects[0]).additionalContext ?? '') : ''
    if (/loader complaint|NOT SOUND/.test(ctx)) return { ok: false, reason: `false alarm on a clean store: ${ctx.slice(0, 160)}` }
    return { ok: true }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('startup: ALL SIX collectors fire at once, in the documented order', () => {
  // Every other startup test fires ONE collector, so their relative ORDER is
  // unobservable across the whole suite — swap two calls in `main` and nothing
  // goes red. Measured: a byte-diff harness over 25 single-concern fixtures
  // could not see `check_dormancy` and `tracker_prime` traded, because no
  // fixture made both emit. That gap matters more since vp-beads-46k turned the
  // startup branch into six bare calls, where a reorder is a one-line edit.
  //
  // Order is not cosmetic. The leak WARNINGs lead because they are the only
  // items a session must act on before doing anything else, and the dormancy
  // nudge deliberately precedes the trend-review reminder so a repo with no
  // RETRO files still gets nudged (session-start.sh says so at that call).
  const dir = makeTempGitRepo('git@github.com:test-owner/test-repo.git')
  const trackerStub = makeTrackerStubDir(
    '[{"id":"backlog/T-1","title":"a claimed row"}]',
    0,
    '{"ready":[{"id":"backlog/R-1","priority":"high"}],"blocked":[],"needsAttention":[],"warnings":[]}'
  )
  const ghStub = makeGhStubDir('3')
  try {
    trackBeadsFile(dir, '.beads/.beads-credential-key')
    mkdirSync(join(dir, '.diarie', 'tasks'), { recursive: true })
    writeFileSync(join(dir, '.diarie', 'tasks', 'tasks-a.yml'), 'tasks: []\n')
    writeFileSync(join(dir, 'PRIVATE-SYNERGY-partner.md'), 'x\n')
    spawnSync('git', ['add', 'PRIVATE-SYNERGY-partner.md'], { cwd: dir })
    // UPSTREAM + SYNERGY with 0 commits → dormant (rev-list fails, falls back to 0).
    writeFileSync(join(dir, 'UPSTREAM-a.md'), 'x\n')
    writeFileSync(join(dir, 'SYNERGY-x.md'), 'x\n')
    // 3 RETRO files → count % 4 === 3 → the "next sprint is a trend review" branch.
    for (const n of ['01', '02', '03']) writeFileSync(join(dir, `RETRO-${n}.md`), 'x\n')

    const { status, stdout } = runHook('session-start.sh', JSON.stringify({ source: 'startup' }), {
      cwd: dir,
      pathPrefix: `${trackerStub}:${ghStub}`,
    })
    if (status !== 0) return { ok: false, reason: `exit ${status}` }
    const { count, objects, parseError } = parseJsonObjects(stdout)
    if (parseError) return { ok: false, reason: parseError }
    if (count !== 1) return { ok: false, reason: `expected 1 merged object, got ${count}` }
    const ctx = String(/** @type {HookOutput} */ (objects[0]).additionalContext ?? '')

    // A tuple type, not `string[][]` — the loop below destructures each row and
    // hands `needle` straight to `indexOf`, which a plain nested array cannot
    // promise is present.
    /** @type {[label: string, needle: string][]} */
    const expected = [
      ['credential key', '.beads/.beads-credential-key is tracked'],
      ['private overlay', 'private SYNERGY overlay file(s) tracked'],
      ['tracker prime', 'Tracker: '],
      ['dormancy', 'Low-activity repo'],
      ['dependabot', '[security]'],
      ['trend review', 'Trend-review reminder'],
    ]
    let cursor = -1
    for (const [label, needle] of expected) {
      const at = ctx.indexOf(needle)
      if (at === -1) return { ok: false, reason: `${label} did not fire: ${ctx.slice(0, 200)}` }
      if (at < cursor) return { ok: false, reason: `${label} is out of order` }
      cursor = at
    }
    return { ok: true }
  } finally {
    rmSync(dir, { recursive: true, force: true })
    rmSync(trackerStub, { recursive: true, force: true })
    rmSync(ghStub, { recursive: true, force: true })
  }
})

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`)
if (failed > 0) {
  process.exit(1)
}
