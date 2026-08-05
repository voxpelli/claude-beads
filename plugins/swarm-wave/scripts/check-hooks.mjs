/**
 * Hook integration tests for the `swarm-wave` plugin.
 *
 * Workspace-owned per decision vp-beads-gow: lint/test/type travel with the
 * package, audit stays at the root. Runnable from inside this directory alone.
 */

import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync,
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
 * A temp dir holding sprint files. `find -mmin -60` reads mtime, and a file just
 * written is inside that window — so freshness needs no clock manipulation.
 *
 * @param {string[]} names - Filenames to create, e.g. ['SWARM-01.md']
 * @returns {string} Temp directory path
 */
function makeSprintDir (names) {
  const dir = mkdtempSync(join(tmpdir(), 'vp-swarm-'))
  for (const name of names) writeFileSync(join(dir, name), '# x\n')
  return dir
}

/** @type {string} A compaction event payload */
const COMPACT = JSON.stringify({ source: 'compact' })

// =============================================================
// session-start.sh
// =============================================================

console.log('\nsession-start.sh')

test('exists and is readable', () => ({ ok: existsSync(join(HOOKS, 'session-start.sh')) }))

test('compact: names the recently-touched SWARM file', () => {
  const dir = makeSprintDir(['SWARM-01.md'])
  try {
    const { status, stdout } = runHook('session-start.sh', COMPACT, { cwd: dir })
    if (status !== 0) return { ok: false, reason: `exit ${status}` }
    const { count, objects, parseError } = parseJsonObjects(stdout)
    if (parseError) return { ok: false, reason: parseError }
    if (count !== 1) return { ok: false, reason: `expected 1 object, got ${count}` }
    const ctx = deliveredContext(objects)
    if (!ctx.includes('SWARM-01.md')) return { ok: false, reason: `file not named: ${ctx.slice(0, 200)}` }
    if (!ctx.includes('swarm-wave')) return { ok: false, reason: 'output is not labelled with the owning plugin' }
    return { ok: true }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('compact: RETRO files count too', () => {
  const dir = makeSprintDir(['RETRO-07.md'])
  try {
    const ctx = deliveredContext(parseJsonObjects(runHook('session-start.sh', COMPACT, { cwd: dir }).stdout).objects)
    return ctx.includes('RETRO-07.md') ? { ok: true } : { ok: false, reason: `not named: ${ctx.slice(0, 200)}` }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('compact with nothing in flight → silent, exit 0', () => {
  // Silence is the common case and deserves to stay silent. A hook that speaks on
  // every compaction to say it has nothing to say gets tuned out.
  const dir = makeSprintDir([])
  try {
    const { status, stdout } = runHook('session-start.sh', COMPACT, { cwd: dir })
    if (status !== 0) return { ok: false, reason: `exit ${status}` }
    return stdout.trim() === '' ? { ok: true } : { ok: false, reason: `expected silence, got: ${stdout.slice(0, 120)}` }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('startup → silent even with sprint files present (compact-only hook)', () => {
  // The branch guard is the whole reason this hook is cheap to have installed.
  // If it leaks into startup it becomes a line in every session.
  const dir = makeSprintDir(['SWARM-01.md'])
  try {
    const { status, stdout } = runHook('session-start.sh', JSON.stringify({ source: 'startup' }), { cwd: dir })
    if (status !== 0) return { ok: false, reason: `exit ${status}` }
    return stdout.trim() === '' ? { ok: true } : { ok: false, reason: `leaked into startup: ${stdout.slice(0, 120)}` }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('absent/garbage stdin → silent, exit 0 (never aborts under errexit)', () => {
  const dir = makeSprintDir(['SWARM-01.md'])
  try {
    const { status, stdout } = runHook('session-start.sh', 'not json at all', { cwd: dir })
    if (status !== 0) return { ok: false, reason: `exit ${status}` }
    return stdout.trim() === '' ? { ok: true } : { ok: false, reason: `unexpected output: ${stdout.slice(0, 120)}` }
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
    const dir = makeSprintDir(['SWARM-01.md'])
    return { cleanup: () => rmSync(dir, { recursive: true, force: true }), cwd: dir, stdin: COMPACT }
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
