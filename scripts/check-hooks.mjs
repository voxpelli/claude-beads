/**
 * Hook integration tests for the ROOT plugin's hooks only.
 *
 * Verifies each hook script emits valid JSON output (0 or 1 objects) and meets
 * its behavioral contract. Scope is `hooks/` — a `plugins/*` workspace owns its
 * own hook suite under its own `check:` key, per decision vp-beads-gow, so that
 * it travels with the package rather than being reached in from here.
 *
 * The envelope-shape helpers (`deliveredContext` and the tracker/git fixtures)
 * live in the plugin suites now, because the root's remaining hook emits no JSON
 * at all — it shells out to `shfmt` and says nothing.
 *
 * Adapted from vp-claude's check-hooks.mjs pattern.
 */

import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

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
 * Claude Code delivers `hookSpecificOutput.additionalContext` and DISCARDS a bare
 * top-level `additionalContext`: bare JSON is still valid JSON, so it takes the
 * JSON branch rather than the "any non-JSON text on stdout is added as context"
 * branch, and an unrecognised top-level key is dropped. A hook emitting the bare
 * shape delivers NOTHING while exiting 0 and printing output that looks correct in
 * a terminal.
 *
 * @typedef HookOutput
 * @property {object} [hookSpecificOutput] - The delivered envelope
 * @property {string} [additionalContext] - The discarded bare shape; diagnostic only
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
 * @param {{ args?: string[], cwd?: string }} [opts]
 * @returns {{ stdout: string, stderr: string, status: number | null }}
 */
function runHook (script, stdin, opts = {}) {
  const result = spawnSync('bash', [join(HOOKS, script), ...(opts.args ?? [])], {
    input: stdin ?? '',
    cwd: opts.cwd ?? ROOT,
    encoding: 'utf8',
    timeout: 15_000,
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

// ============================================================================
// Inventory — the direction this suite could not see
// ============================================================================
//
// Every test above hardcodes a script name behind its own `existsSync` gate, so a DELETED
// hook goes red. The reverse was unasserted: a hook ADDED to hooks.json, or a new
// `hooks/*.sh` on disk, got zero tests here with nothing going red — and hooks are the
// plugin's only always-on surface.
//
// Deliberately an INVENTORY, not a count floor. "The suite ran nothing" prints a literal
// `0 tests` that a human sees — that failure is already loud. "A hook exists that no test
// knows about" is silent, which is the one worth a guard. And a count cannot see a SWAP.
//
// The wired list is read from hooks.json, never hardcoded — a second hardcoded list would
// be a second model of the same config, which is the failure `check-prose-commands` exists
// to prevent. The tested list is read from this file's own source: a runHook call naming a
// script IS what "there is a test for that script" means here.
//
// Do NOT write an example runHook call in a comment above — the scan reads this file, so a
// prose illustration becomes a phantom entry in the tested set. That happened on the first
// run of this very check, and it is the reason the orphan branch below exists at all.
//
// Each `plugins/*` workspace runs this same three-way agreement over its OWN hooks/, and
// additionally compares each hook's emitted `hookEventName` against the event key it is
// wired under — a check that only becomes possible once one plugin owns one hook.

console.log('\nhook inventory')

test('every hooks.json-wired script and every hooks/*.sh has at least one test here', () => {
  /** @type {unknown} */
  let parsed
  try {
    parsed = JSON.parse(readFileSync(join(HOOKS, 'hooks.json'), 'utf8'))
  } catch (err) {
    return { ok: false, reason: `could not read hooks/hooks.json: ${err instanceof Error ? err.message : String(err)}` }
  }

  // Pull every `.../hooks/<name>.sh` out of the declared commands, whatever the nesting.
  const commands = JSON.stringify(parsed).match(/hooks\/[\w.-]+\.sh/g) ?? []
  const wired = new Set(commands.map((c) => c.replace(/^hooks\//, '')))
  if (wired.size === 0) {
    return { ok: false, reason: 'hooks.json declares no hook scripts — that is not a green, it is an empty read' }
  }

  const onDisk = new Set(readdirSync(HOOKS).filter((f) => f.endsWith('.sh')))
  const self = readFileSync(new URL(import.meta.url).pathname, 'utf8')
  const tested = new Set((self.match(/runHook\('([\w.-]+\.sh)'/g) ?? [])
    .map((m) => m.replace(/^runHook\('/, '').replace(/'$/, '')))

  const untested = [...new Set([...wired, ...onDisk])].filter((s) => !tested.has(s)).toSorted()
  if (untested.length > 0) {
    return { ok: false, reason: `wired or on-disk but never exercised by runHook(): ${untested.join(', ')}` }
  }

  // The other direction: a test naming a script that is neither wired nor on disk is a
  // fossil, and would otherwise sit here passing forever against nothing.
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
  process.exit(1)
}
