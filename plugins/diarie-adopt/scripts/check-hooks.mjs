/**
 * Hook integration tests for the `diarie-adopt` plugin.
 *
 * Workspace-owned per decision vp-beads-gow: lint/test/type travel with the
 * package, audit stays at the root. Runnable from inside this directory alone.
 */

import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync,
} from 'node:fs'

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '')
const HOOKS = join(ROOT, 'hooks')

const jqCheck = spawnSync('which', ['jq'])
if (jqCheck.status !== 0) {
  console.error('FATAL: jq is required but not found in PATH')
  process.exit(1)
}

let passed = 0
let failed = 0

/**
 * The envelope Claude Code actually reads.
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
    return { count: 1, objects: [JSON.parse(trimmed)], parseError: undefined }
  } catch {
    const parts = trimmed.split(/\}\s*\{/).filter(Boolean)
    if (parts.length > 1) {
      return { count: parts.length, objects: [], parseError: `Multiple JSON objects detected (${parts.length})` }
    }
    return { count: 0, objects: [], parseError: `Invalid JSON: ${trimmed.slice(0, 100)}` }
  }
}

/**
 * The context a hook actually DELIVERS to the model.
 *
 * Reads only through the envelope, and THROWS on any other shape rather than
 * reading through to it. A suite that reads the discarded top-level key asserts in
 * detail against an interface Claude Code never consults, and certifies a hook that
 * delivers nothing. A silent hook is a legitimate answer and yields ''.
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
 * @param {{ cwd?: string }} [opts]
 * @returns {{ stdout: string, stderr: string, status: number | null }}
 */
function runHook (script, stdin, opts = {}) {
  const result = spawnSync('bash', [join(HOOKS, script)], {
    input: stdin ?? '',
    cwd: opts.cwd ?? ROOT,
    encoding: 'utf8',
    timeout: 15_000,
  })
  return { stdout: result.stdout ?? '', stderr: result.stderr ?? '', status: result.status }
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
      console.log(`  [32m✓[0m ${label}`)
    } else {
      failed++
      console.log(`  [31m✗[0m ${label}: ${result.reason}`)
    }
  } catch (/** @type {unknown} */ err) {
    failed++
    console.log(`  [31m✗[0m ${label}: threw ${err instanceof Error ? err.message : String(err)}`)
  }
}

// --- Fixtures ---

/**
 * A temp git repo. Staging is enough for `git ls-files --error-unmatch`, which
 * reads the index — committing would additionally need user config in the repo.
 *
 * @param {string[]} tracked - Paths under `.beads/` to create and stage
 * @returns {string} Temp directory path
 */
function makeBeadsRepo (tracked) {
  const dir = mkdtempSync(join(tmpdir(), 'vp-adopt-'))
  spawnSync('git', ['init', '-q'], { cwd: dir })
  for (const rel of tracked) {
    mkdirSync(join(dir, '.beads'), { recursive: true })
    writeFileSync(join(dir, rel), 'x\n')
    spawnSync('git', ['add', '-f', rel], { cwd: dir })
  }
  return dir
}

/** @type {string} A startup event payload */
const STARTUP = JSON.stringify({ source: 'startup' })

// =============================================================
// session-start.sh
// =============================================================

console.log('\nsession-start.sh')

test('exists and is readable', () => ({ ok: existsSync(join(HOOKS, 'session-start.sh')) }))

test('a TRACKED credential key is warned about', () => {
  // The direction a wrong answer is dangerous in. Silence here means an irreversible
  // leak ships unremarked, so this is the assertion that has to hold.
  const dir = makeBeadsRepo(['.beads/.beads-credential-key'])
  try {
    const { status, stdout } = runHook('session-start.sh', STARTUP, { cwd: dir })
    if (status !== 0) return { ok: false, reason: `exit ${status}` }
    const { count, objects, parseError } = parseJsonObjects(stdout)
    if (parseError) return { ok: false, reason: parseError }
    if (count !== 1) return { ok: false, reason: `expected 1 object, got ${count}` }
    const ctx = deliveredContext(objects)
    return ctx.includes('.beads-credential-key')
      ? { ok: true }
      : { ok: false, reason: `key not named: ${ctx.slice(0, 200)}` }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('interactions.jsonl is NOT flagged (intentional audit trail, not a secret)', () => {
  const dir = makeBeadsRepo(['.beads/interactions.jsonl'])
  try {
    const { status, stdout } = runHook('session-start.sh', STARTUP, { cwd: dir })
    if (status !== 0) return { ok: false, reason: `exit ${status}` }
    return stdout.trim() === ''
      ? { ok: true }
      : { ok: false, reason: `false positive: ${stdout.slice(0, 160)}` }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('an untracked key is not warned about (the file existing is not the defect)', () => {
  const dir = makeBeadsRepo([])
  try {
    mkdirSync(join(dir, '.beads'), { recursive: true })
    writeFileSync(join(dir, '.beads/.beads-credential-key'), 'x\n')
    const { status, stdout } = runHook('session-start.sh', STARTUP, { cwd: dir })
    if (status !== 0) return { ok: false, reason: `exit ${status}` }
    return stdout.trim() === ''
      ? { ok: true }
      : { ok: false, reason: `warned about an untracked key: ${stdout.slice(0, 160)}` }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('outside a git repo → silent, exit 0 (never aborts under errexit)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vp-adopt-nogit-'))
  try {
    const { status, stdout } = runHook('session-start.sh', STARTUP, { cwd: dir })
    if (status !== 0) return { ok: false, reason: `exit ${status}` }
    return stdout.trim() === '' ? { ok: true } : { ok: false, reason: `unexpected output: ${stdout.slice(0, 120)}` }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('compact → silent even with a tracked key (startup-only hook)', () => {
  // A leak warning is not sprint state. Repeating it mid-session adds nothing the
  // startup emission did not already say.
  const dir = makeBeadsRepo(['.beads/.beads-credential-key'])
  try {
    const { status, stdout } = runHook('session-start.sh', JSON.stringify({ source: 'compact' }), { cwd: dir })
    if (status !== 0) return { ok: false, reason: `exit ${status}` }
    return stdout.trim() === '' ? { ok: true } : { ok: false, reason: `leaked into compact: ${stdout.slice(0, 120)}` }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('garbage stdin falls through to the startup branch, and still warns', () => {
  // Unparseable stdin must not be read as `compact` — that would silence the one
  // thing this hook exists to say.
  const dir = makeBeadsRepo(['.beads/.beads-credential-key'])
  try {
    const { status, stdout } = runHook('session-start.sh', 'not json at all', { cwd: dir })
    if (status !== 0) return { ok: false, reason: `exit ${status}` }
    const ctx = deliveredContext(parseJsonObjects(stdout).objects)
    return ctx.includes('.beads-credential-key')
      ? { ok: true }
      : { ok: false, reason: `fell through to silence: ${stdout.slice(0, 160)}` }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

// =============================================================
// wiring: the emitted event name must match the event it is REGISTERED under
// =============================================================
//
// `deliveredContext` asserts the envelope exists and names SOME event; it cannot
// know which event a given hook is wired to. Sharding copies `emit_context` into
// every plugin, so a wrong event name here satisfies every other assertion above
// and is still dropped by Claude Code at runtime. This reads THE HOOKS.JSON.

/**
 * How to make each hook speak, keyed by script filename. The payload has to be one
 * the hook acts on: a hook driven by a stimulus it ignores stays silent, and
 * silence would pass an event-name check vacuously.
 *
 * @type {Record<string, () => { cleanup?: () => void, stdin: string, cwd: string }>}
 */
const STIMULI = {
  'session-start.sh': () => {
    const dir = makeBeadsRepo(['.beads/.beads-credential-key'])
    return { cleanup: () => rmSync(dir, { recursive: true, force: true }), cwd: dir, stdin: STARTUP }
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
    const { cleanup, cwd, stdin } = stimulus()
    try {
      const { objects, parseError } = parseJsonObjects(runHook(script, stdin, { cwd }).stdout)
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
