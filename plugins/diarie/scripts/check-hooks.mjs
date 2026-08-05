/**
 * Hook integration tests for the `diarie` plugin.
 *
 * Workspace-owned per decision vp-beads-gow: lint/test/type travel with the
 * package, audit stays at the root. This file must remain runnable from inside
 * this directory alone — the plugin is destined for voxpelli/diarie-skills, and
 * a gate the root reaches in to run is a gate re-acquired at extraction.
 */

import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync,
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
 * The envelope Claude Code actually reads.
 *
 * Both fields stay optional in the type because these tests parse whatever stdout
 * actually contained, not what it was supposed to contain — `deliveredContext` is
 * what turns a wrong shape into a named failure rather than a type error the
 * runtime never sees.
 *
 * @typedef HookSpecificOutput
 * @property {string} [hookEventName] - Required by Claude Code; names the event
 * @property {string} [additionalContext] - Context injected into the agent
 */

/**
 * The single JSON object a hook emits on stdout.
 *
 * `additionalContext` is typed at the top level ONLY so the discarded bare shape
 * can be recognised and named. Never read it.
 *
 * @typedef HookOutput
 * @property {HookSpecificOutput} [hookSpecificOutput] - The delivered envelope
 * @property {string} [additionalContext] - The discarded bare shape; diagnostic only
 */

/**
 * Parse stdout for JSON objects. Detects multi-object emission.
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
 * The context a hook actually DELIVERS to the model.
 *
 * Reads only through the envelope, and THROWS on any other shape rather than
 * reading through to it. A suite that reads the discarded top-level key asserts
 * in detail against an interface Claude Code never consults, and certifies a hook
 * that delivers nothing.
 *
 * A silent hook (no stdout) is a legitimate answer and yields ''.
 *
 * @param {HookOutput[]} objects - As returned by `parseJsonObjects`
 * @returns {string} The delivered context, or '' when the hook stayed silent
 */
function deliveredContext (objects) {
  if (objects.length === 0) return ''
  const obj = objects[0] ?? {}
  const envelope = obj.hookSpecificOutput

  if (envelope === undefined) {
    throw new Error(obj.additionalContext === undefined
      ? 'emitted object has no hookSpecificOutput'
      : 'emitted a BARE {"additionalContext": …}, which Claude Code discards — wrap it in hookSpecificOutput')
  }
  if (typeof envelope !== 'object' || envelope === null) {
    throw new Error(`hookSpecificOutput is ${typeof envelope}, expected an object`)
  }
  if (typeof envelope.hookEventName !== 'string' || envelope.hookEventName === '') {
    throw new Error('hookSpecificOutput.hookEventName is required, and is missing or empty')
  }

  return String(envelope.additionalContext ?? '')
}

/**
 * Run a hook script with optional stdin.
 *
 * @param {string} script - Filename in hooks/
 * @param {string} [stdin] - Stdin content
 * @param {{ cwd?: string, pathPrefix?: string, scrubValidator?: boolean }} [opts]
 * @returns {{ stdout: string, stderr: string, status: number | null }}
 */
function runHook (script, stdin, opts = {}) {
  // ASK THE PATH, DON'T MODEL IT. `npm run` prepends node_modules/.bin, and a
  // global install lives somewhere else entirely — so "no validator is reachable"
  // is simulated by dropping every PATH entry that actually holds a `diarie`
  // binary, not by matching a path substring. A test that cannot create its own
  // premise is not testing anything.
  const { PATH: inheritedPath } = process.env
  const basePath = opts.scrubValidator
    ? (inheritedPath ?? '').split(':').filter(p => p && !existsSync(join(p, 'diarie'))).join(':')
    : inheritedPath
  const path = opts.pathPrefix ? `${opts.pathPrefix}:${basePath}` : basePath
  const result = spawnSync('bash', [join(HOOKS, script)], {
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
      console.log(`  [32m✓[0m ${label}`)
    } else {
      failed++
      console.log(`  [31m✗[0m ${label}: ${result.reason}`)
    }
  } catch (/** @type {unknown} */ err) {
    failed++
    console.log(`  [31m✗[0m ${label}: threw ${err instanceof Error ? err.message : String(err)}`)
  }
}

// --- Fixtures ---

/**
 * Build a temp project holding a `.diarie/tasks/` store with the given YAML.
 *
 * @param {string} yaml
 * @returns {{ dir: string, file: string }}
 */
function makeTaskStore (yaml) {
  const dir = mkdtempSync(join(tmpdir(), 'vp-diarie-taskstore-'))
  const tasksDir = join(dir, '.diarie', 'tasks')
  mkdirSync(tasksDir, { recursive: true })
  const file = join(tasksDir, 'tasks-x.yml')
  writeFileSync(file, yaml)
  return { dir, file }
}

const VALID_TASK = 'meta:\n  slug: x\ntasks:\n  - id: T-1\n    title: a\n    status: pending\n    type: task\n'
const DANGLING_DEP = 'meta:\n  slug: x\ntasks:\n  - id: T-1\n    title: a\n    status: pending\n    type: task\n    deps: [T-99]\n'

/**
 * @param {string} filePath
 * @returns {string} A PostToolUse event payload naming the edited file
 */
function editEvent (filePath) {
  return JSON.stringify({ tool_input: { file_path: filePath } })
}

/**
 * A temp project whose `.diarie/tasks/` exists — enough to satisfy the prime's
 * store half of the canonical availability predicate.
 *
 * @returns {string} Temp directory path
 */
function makeStoreDir () {
  const dir = mkdtempSync(join(tmpdir(), 'vp-diarie-store-'))
  mkdirSync(join(dir, '.diarie', 'tasks'), { recursive: true })
  writeFileSync(join(dir, '.diarie', 'tasks', 'tasks-x.yml'), VALID_TASK)
  return dir
}

/**
 * A temp dir containing a stub `diarie`, without needing a real store.
 *
 * The stub DISPATCHES ON ARGS, because the two branches call the reader differently
 * and expect different shapes: `ready --filter in_progress --json` returns a flat
 * ARRAY of claims (what the compact branch recovers), while a bare `ready --json`
 * returns the `{ready, blocked, needsAttention}` OBJECT (what the startup prime
 * reads). A stub that echoed one payload for every invocation would make the prime's
 * tests pass against data the real reader never emits.
 *
 * THE STUB IS A DE-FACTO SPEC: if it drifts from the real CLI these tests stay green
 * while production diverges, so its description has to stay true.
 *
 * @param {string} inProgressJson - printed for `--filter in_progress` (e.g. '[]')
 * @param {number} [exitCode]
 * @param {string} [queueJson] - printed otherwise; omit to leave the queue read empty
 * @returns {string} Temp directory path containing the stub
 */
function makeTrackerStubDir (inProgressJson, exitCode = 0, queueJson = '') {
  const dir = mkdtempSync(join(tmpdir(), 'vp-diarie-stub-'))
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

const ONE_CLAIM = '[{"id":"slug/T-7","title":"a claimed row","status":"in_progress"}]'
const HEALTHY_QUEUE = '{"ready":[{"id":"slug/T-1","priority":"high"}],"blocked":[],"needsAttention":[],"warnings":[]}'

/** @type {string} A compaction event payload */
const COMPACT = JSON.stringify({ source: 'compact' })
/** @type {string} A startup event payload */
const STARTUP = JSON.stringify({ source: 'startup' })

// =============================================================
// post-tasks-validate.sh
// =============================================================

console.log('\npost-tasks-validate.sh')

test('exists and is readable', () => ({ ok: existsSync(join(HOOKS, 'post-tasks-validate.sh')) }))

test('invalid store → reports the error as additionalContext', () => {
  // The whole point of the hook. Regression here is SILENT: the agent keeps
  // editing a store whose ready-walk is now lying about what is workable.
  const { dir, file } = makeTaskStore(DANGLING_DEP)
  try {
    const { status, stdout } = runHook('post-tasks-validate.sh', editEvent(file))
    if (status !== 0) return { ok: false, reason: `exit ${status}` }
    const { count, objects, parseError } = parseJsonObjects(stdout)
    if (parseError) return { ok: false, reason: parseError }
    if (count !== 1) return { ok: false, reason: `expected 1 object, got ${count}` }
    const ctx = deliveredContext(objects)
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
    const { stdout } = runHook('post-tasks-validate.sh', editEvent(file))
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
    const { status, stdout } = runHook('post-tasks-validate.sh', editEvent(file))
    if (status !== 0) return { ok: false, reason: `exit ${status}` }
    return stdout.trim() === '' ? { ok: true } : { ok: false, reason: `expected silence, got: ${stdout.slice(0, 120)}` }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('non-task file → silent (fires only for .diarie/tasks/)', () => {
  const { status, stdout } = runHook('post-tasks-validate.sh', editEvent('/tmp/some/README.md'))
  if (status !== 0) return { ok: false, reason: `exit ${status}` }
  return stdout.trim() === '' ? { ok: true } : { ok: false, reason: `unexpected output: ${stdout.slice(0, 120)}` }
})

test('no resolvable validator → silent, exit 0 (never a spam loop)', () => {
  // A marketplace plugin cache has no node_modules of its own, and a consumer
  // project may have no diarie at all. A hook that cannot validate must say nothing.
  const { dir, file } = makeTaskStore(DANGLING_DEP)
  try {
    const { status, stdout } = runHook('post-tasks-validate.sh', editEvent(file), { scrubValidator: true })
    if (status !== 0) return { ok: false, reason: `exit ${status}` }
    return stdout.trim() === '' ? { ok: true } : { ok: false, reason: `expected silence, got: ${stdout.slice(0, 120)}` }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

// =============================================================
// session-start.sh
// =============================================================

console.log('\nsession-start.sh')

test('exists and is readable', () => ({ ok: existsSync(join(HOOKS, 'session-start.sh')) }))

test('compact: a live claim is recovered with id and title', () => {
  // What the hook exists for. A summarised conversation forgets the claim; silence
  // here is how a claimed row gets abandoned mid-flight.
  const stub = makeTrackerStubDir(ONE_CLAIM)
  try {
    const { status, stdout } = runHook('session-start.sh', COMPACT, { pathPrefix: stub })
    if (status !== 0) return { ok: false, reason: `exit ${status}` }
    const { count, objects, parseError } = parseJsonObjects(stdout)
    if (parseError) return { ok: false, reason: parseError }
    if (count !== 1) return { ok: false, reason: `expected 1 object, got ${count}` }
    const ctx = deliveredContext(objects)
    if (!ctx.includes('T-7')) return { ok: false, reason: `claim id missing: ${ctx.slice(0, 200)}` }
    if (!ctx.includes('a claimed row')) return { ok: false, reason: 'claim title missing' }
    if (!ctx.includes('tracker state')) return { ok: false, reason: 'output is not labelled with the owning plugin' }
    return { ok: true }
  } finally {
    rmSync(stub, { recursive: true, force: true })
  }
})

test('compact: zero claims → silent (no line saying there is nothing to say)', () => {
  const stub = makeTrackerStubDir('[]')
  try {
    const { status, stdout } = runHook('session-start.sh', COMPACT, { pathPrefix: stub })
    if (status !== 0) return { ok: false, reason: `exit ${status}` }
    return stdout.trim() === '' ? { ok: true } : { ok: false, reason: `expected silence, got: ${stdout.slice(0, 120)}` }
  } finally {
    rmSync(stub, { recursive: true, force: true })
  }
})

test('compact: a DROPPED row is ANNOUNCED, and the hook still EXITS 0', () => {
  // `--strict` exits 2 when the loader threw a row away. The list is then INCOMPLETE
  // and must say so — and the hook must survive it. Under errexit a bare assignment
  // from an exit-2 command kills the hook, which would emit NOTHING precisely when
  // the store is broken: strictly worse than the silent loss it replaced.
  const stub = makeTrackerStubDir(ONE_CLAIM, 2)
  try {
    const { status, stdout } = runHook('session-start.sh', COMPACT, { pathPrefix: stub })
    if (status !== 0) return { ok: false, reason: `hook exited ${status} — errexit killed it` }
    const ctx = deliveredContext(parseJsonObjects(stdout).objects)
    return ctx.includes('NOT SOUND')
      ? { ok: true }
      : { ok: false, reason: `incompleteness not announced: ${ctx.slice(0, 200) || '(silent)'}` }
  } finally {
    rmSync(stub, { recursive: true, force: true })
  }
})

test('startup: a HEALTHY store emits a Tracker line with counts and next-ready', () => {
  const stub = makeTrackerStubDir(ONE_CLAIM, 0, HEALTHY_QUEUE)
  const dir = makeStoreDir()
  try {
    const { status, stdout } = runHook('session-start.sh', STARTUP, { cwd: dir, pathPrefix: stub })
    if (status !== 0) return { ok: false, reason: `exit ${status}` }
    const ctx = deliveredContext(parseJsonObjects(stdout).objects)
    if (!ctx.includes('Tracker: 1 ready')) return { ok: false, reason: `counts missing: ${ctx.slice(0, 200)}` }
    if (!ctx.includes('next ready: T-1')) return { ok: false, reason: 'next-ready line missing' }
    return { ok: true }
  } finally {
    rmSync(stub, { recursive: true, force: true })
    rmSync(dir, { recursive: true, force: true })
  }
})

test('startup: reader present but NO STORE → prime stays silent', () => {
  // Gating on the reader alone made the prime announce "Tracker: 0 ready · 0 blocked"
  // in a repo with no tracker at all. That is not a silent skip, it is a confident
  // false report — worse. The predicate needs BOTH halves.
  const stub = makeTrackerStubDir('[]', 0, HEALTHY_QUEUE)
  const dir = mkdtempSync(join(tmpdir(), 'vp-diarie-nostore-'))
  try {
    const { status, stdout } = runHook('session-start.sh', STARTUP, { cwd: dir, pathPrefix: stub })
    if (status !== 0) return { ok: false, reason: `exit ${status}` }
    return stdout.trim() === '' ? { ok: true } : { ok: false, reason: `invented a backlog: ${stdout.slice(0, 160)}` }
  } finally {
    rmSync(stub, { recursive: true, force: true })
    rmSync(dir, { recursive: true, force: true })
  }
})

test('startup: STORE present but NO reader → silent (never a broken line)', () => {
  const dir = makeStoreDir()
  try {
    const { status, stdout } = runHook('session-start.sh', STARTUP, { cwd: dir, scrubValidator: true })
    if (status !== 0) return { ok: false, reason: `exit ${status}` }
    return stdout.trim() === '' ? { ok: true } : { ok: false, reason: `unexpected output: ${stdout.slice(0, 160)}` }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('startup: an ENOSTORE error payload is NOT rendered as an empty backlog', () => {
  // `null | length` is 0 — a number, which sails straight through a numeric guard and
  // prints a confident "Tracker: 0 ready · 0 blocked" reconstructed out of an error
  // message. `has("ready")` is what stops it; `jq -e` would not, since 0 is not falsy.
  const stub = makeTrackerStubDir('[]', 0, '{"error":"no store here","code":"ENOSTORE"}')
  const dir = makeStoreDir()
  try {
    const { status, stdout } = runHook('session-start.sh', STARTUP, { cwd: dir, pathPrefix: stub })
    if (status !== 0) return { ok: false, reason: `exit ${status}` }
    return stdout.includes('Tracker:')
      ? { ok: false, reason: `rendered an error payload as counts: ${stdout.slice(0, 200)}` }
      : { ok: true }
  } finally {
    rmSync(stub, { recursive: true, force: true })
    rmSync(dir, { recursive: true, force: true })
  }
})

test('branch isolation: compact must NOT emit the startup tracker prime', () => {
  const stub = makeTrackerStubDir(ONE_CLAIM, 0, HEALTHY_QUEUE)
  const dir = makeStoreDir()
  try {
    const ctx = deliveredContext(
      parseJsonObjects(runHook('session-start.sh', COMPACT, { cwd: dir, pathPrefix: stub }).stdout).objects
    )
    return ctx.includes('Tracker:')
      ? { ok: false, reason: `startup prime leaked into compact: ${ctx.slice(0, 200)}` }
      : { ok: true }
  } finally {
    rmSync(stub, { recursive: true, force: true })
    rmSync(dir, { recursive: true, force: true })
  }
})

test('branch isolation: startup must NOT emit the compact preamble', () => {
  const stub = makeTrackerStubDir(ONE_CLAIM, 0, HEALTHY_QUEUE)
  const dir = makeStoreDir()
  try {
    const ctx = deliveredContext(
      parseJsonObjects(runHook('session-start.sh', STARTUP, { cwd: dir, pathPrefix: stub }).stdout).objects
    )
    return ctx.includes('just compacted')
      ? { ok: false, reason: `compact preamble leaked into startup: ${ctx.slice(0, 200)}` }
      : { ok: true }
  } finally {
    rmSync(stub, { recursive: true, force: true })
    rmSync(dir, { recursive: true, force: true })
  }
})

// =============================================================
// wiring: the emitted event name must match the event it is REGISTERED under
// =============================================================
//
// `deliveredContext` asserts the envelope exists and names SOME event; it cannot
// know which event a given hook is wired to. That gap was harmless while one hook
// existed. Sharding copies `emit_context` into every plugin (vp-beads-sss), so a
// SessionStart emitter pasted into a PostToolUse hook now satisfies every other
// assertion in this file — and is silently dropped by Claude Code at runtime.
//
// So this reads THE HOOKS.JSON, not a hardcoded list: each wired script is driven
// by its registered stimulus and the emitted `hookEventName` is compared to the key
// it sits under. A wired script with no stimulus here is a FAILURE, not a skip —
// that is what stops a newly-sharded hook from arriving untested.

/**
 * How to make each hook speak, keyed by script filename.
 *
 * The payload has to be one the hook actually acts on: a hook driven by a stimulus
 * it ignores stays silent, and silence would pass an event-name check vacuously.
 *
 * @type {Record<string, () => { cleanup?: () => void, opts?: { cwd?: string, pathPrefix?: string }, stdin: string }>}
 */
const STIMULI = {
  'post-tasks-validate.sh': () => {
    const { dir, file } = makeTaskStore(DANGLING_DEP)
    return { cleanup: () => rmSync(dir, { recursive: true, force: true }), stdin: editEvent(file) }
  },
  'session-start.sh': () => {
    const stub = makeTrackerStubDir(ONE_CLAIM)
    return {
      cleanup: () => rmSync(stub, { recursive: true, force: true }),
      opts: { pathPrefix: stub },
      stdin: COMPACT,
    }
  },
}

console.log('\nwiring (hooks.json ↔ emitted hookEventName)')

/**
 * Every `(event, script)` pair declared in this plugin's hooks.json.
 *
 * @returns {{ event: string, script: string }[]}
 */
function declaredWiring () {
  /** @type {unknown} */
  const parsed = JSON.parse(readFileSync(join(HOOKS, 'hooks.json'), 'utf8'))
  const hooks = (parsed && typeof parsed === 'object' && 'hooks' in parsed) ? parsed.hooks : undefined
  if (!hooks || typeof hooks !== 'object') return []

  /** @type {{ event: string, script: string }[]} */
  const pairs = []
  for (const [event, matchers] of Object.entries(hooks)) {
    // Match the script name out of the command however it is nested or quoted.
    for (const name of JSON.stringify(matchers).match(/hooks\/[\w.-]+\.sh/g) ?? []) {
      pairs.push({ event, script: name.replace(/^hooks\//, '') })
    }
  }
  return pairs
}

const wiring = declaredWiring()

test('hooks.json declares at least one hook', () => (
  wiring.length > 0
    ? { ok: true }
    : { ok: false, reason: 'hooks.json declares no hook scripts — that is not a green, it is an empty read' }
))

for (const { event, script } of wiring) {
  test(`${script} emits hookEventName "${event}"`, () => {
    const stimulus = STIMULI[script]
    if (!stimulus) {
      return { ok: false, reason: 'no stimulus registered in STIMULI — this hook is wired but never exercised' }
    }
    const { cleanup, opts, stdin } = stimulus()
    try {
      const { stdout } = runHook(script, stdin, opts)
      const { objects, parseError } = parseJsonObjects(stdout)
      if (parseError) return { ok: false, reason: parseError }
      if (objects.length === 0) {
        return { ok: false, reason: 'hook stayed silent on its own stimulus — the event name cannot be checked' }
      }
      const emitted = objects[0]?.hookSpecificOutput?.hookEventName
      return emitted === event
        ? { ok: true }
        : { ok: false, reason: `emits ${JSON.stringify(emitted)} but is registered under "${event}"` }
    } finally {
      cleanup?.()
    }
  })
}

// =============================================================
// inventory
// =============================================================

console.log('\nhook inventory')

test('every hooks.json-wired script and every hooks/*.sh has at least one test here', () => {
  const wired = new Set(wiring.map((w) => w.script))
  const onDisk = new Set(readdirSync(HOOKS).filter((f) => f.endsWith('.sh')))
  const self = readFileSync(new URL(import.meta.url).pathname, 'utf8')
  const tested = new Set((self.match(/runHook\('([\w.-]+\.sh)'/g) ?? [])
    .map((m) => m.replace(/^runHook\('/, '').replace(/'$/, '')))

  const untested = [...new Set([...wired, ...onDisk])].filter((s) => !tested.has(s)).toSorted()
  if (untested.length > 0) {
    return { ok: false, reason: `wired or on-disk but never exercised by runHook(): ${untested.join(', ')}` }
  }

  // The other direction: a test naming a script that is neither wired nor on disk is
  // a fossil, and would otherwise sit here passing forever against nothing.
  const orphaned = [...tested].filter((s) => !wired.has(s) && !onDisk.has(s)).toSorted()
  if (orphaned.length > 0) {
    return { ok: false, reason: `tested but neither wired in hooks.json nor present on disk: ${orphaned.join(', ')}` }
  }

  const unwired = [...onDisk].filter((s) => !wired.has(s)).toSorted()
  if (unwired.length > 0) {
    return { ok: false, reason: `on disk but not wired in hooks.json: ${unwired.join(', ')}` }
  }

  console.log(`    (${wired.size} wired, ${onDisk.size} on disk, ${tested.size} tested — all three agree)`)
  return { ok: true }
})

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`)
if (failed > 0) {
  process.exitCode = 1
}
