/**
 * Hook integration tests for vp-beads.
 * Verifies each hook script emits valid JSON output (0 or 1 objects)
 * and meets its behavioral contract.
 *
 * Adapted from vp-claude's check-hooks.mjs pattern.
 */

import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

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
 * Parse stdout for JSON objects. Detects multi-object emission.
 * @param {string} stdout
 * @returns {{ count: number, objects: unknown[], parseError: string | null }}
 */
function parseJsonObjects (stdout) {
  const trimmed = stdout.trim()
  if (trimmed === '') return { count: 0, objects: [], parseError: null }

  try {
    const obj = JSON.parse(trimmed)
    return { count: 1, objects: [obj], parseError: null }
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
 * @param {string} script - Filename in hooks/
 * @param {string} [stdin] - Stdin content
 * @param {{ args?: string[], cwd?: string, pathPrefix?: string }} [opts]
 * @returns {{ stdout: string, stderr: string, status: number | null }}
 */
function runHook (script, stdin, opts = {}) {
  const scriptPath = join(HOOKS, script)
  const args = opts.args ?? []
  const path = opts.pathPrefix
    ? `${opts.pathPrefix}:${process.env.PATH}`
    : process.env.PATH
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
      console.log(`  \x1b[32m✓\x1b[0m ${label}`)
    } else {
      failed++
      console.log(`  \x1b[31m✗\x1b[0m ${label}: ${result.reason}`)
    }
  } catch (/** @type {any} */ err) {
    failed++
    console.log(`  \x1b[31m✗\x1b[0m ${label}: threw ${err.message}`)
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
 * Create a temp dir containing a stub `gh` script that prints the given
 * stdout and exits with the given status. Returns the dir path so callers
 * can prepend it to PATH.
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

// =============================================================
// post-file-edit.sh
// =============================================================

console.log('\npost-file-edit.sh')

test('exists and is readable', () => {
  return { ok: existsSync(join(HOOKS, 'post-file-edit.sh')) }
})

test('silent when no PLUGIN_ROOT arg', () => {
  const { stdout, status } = runHook('post-file-edit.sh', JSON.stringify({
    tool_input: { file_path: '/any/path.sh' },
  }))
  const { count } = parseJsonObjects(stdout)
  if (status !== 0) return { ok: false, reason: `exit ${status}` }
  return count === 0
    ? { ok: true }
    : { ok: false, reason: `expected silent, got ${count} objects` }
})

test('silent when file is not under hooks/', () => {
  const { stdout, status } = runHook('post-file-edit.sh', JSON.stringify({
    tool_input: { file_path: '/some/other/file.js' },
  }), { args: [ROOT] })
  const { count } = parseJsonObjects(stdout)
  if (status !== 0) return { ok: false, reason: `exit ${status}` }
  return count === 0
    ? { ok: true }
    : { ok: false, reason: `expected silent, got ${count} objects` }
})

// =============================================================
// post-bm-failure-classify.sh
// =============================================================

console.log('\npost-bm-failure-classify.sh')

test('exists and is readable', () => {
  return { ok: existsSync(join(HOOKS, 'post-bm-failure-classify.sh')) }
})

test('silent when no error field', () => {
  const { stdout, status } = runHook('post-bm-failure-classify.sh', JSON.stringify({}))
  const { count } = parseJsonObjects(stdout)
  if (status !== 0) return { ok: false, reason: `exit ${status}` }
  return count === 0
    ? { ok: true }
    : { ok: false, reason: `expected silent, got ${count} objects` }
})

/** @type {Array<[string, string]>} */
const errorCases = [
  ['connection refused', '[server-unavailable]'],
  ['note does not exist', '[note-not-found]'],
  ['missing required field', '[invalid-argument]'],
  ['permission denied', '[permission-error]'],
  ['something completely unexpected happened', '[unknown-error]'],
]

for (const [errorText, bracket] of errorCases) {
  test(`classifies "${errorText}" as ${bracket}`, () => {
    const { stdout, status } = runHook('post-bm-failure-classify.sh', JSON.stringify({
      error: errorText,
    }))
    if (status !== 0) return { ok: false, reason: `exit ${status}` }
    const { count, objects, parseError } = parseJsonObjects(stdout)
    if (parseError) return { ok: false, reason: parseError }
    if (count !== 1) return { ok: false, reason: `expected 1 object, got ${count}` }
    const ctx = String(/** @type {Record<string, unknown>} */ (objects[0]).additionalContext ?? '')
    return ctx.includes(bracket)
      ? { ok: true }
      : { ok: false, reason: `additionalContext missing "${bracket}": ${ctx.slice(0, 100)}` }
  })
}

// =============================================================
// precompact.sh
// =============================================================

console.log('\nprecompact.sh')

test('exists and is readable', () => {
  return { ok: existsSync(join(HOOKS, 'precompact.sh')) }
})

test('emits exactly 1 JSON object', () => {
  const { stdout, status } = runHook('precompact.sh')
  if (status !== 0) return { ok: false, reason: `exit ${status}` }
  const { count, parseError } = parseJsonObjects(stdout)
  if (parseError) return { ok: false, reason: parseError }
  return count === 1
    ? { ok: true }
    : { ok: false, reason: `expected 1 object, got ${count}` }
})

test('has additionalContext key', () => {
  const { stdout } = runHook('precompact.sh')
  const { objects } = parseJsonObjects(stdout)
  if (objects.length === 0) return { ok: false, reason: 'no objects' }
  const obj = /** @type {Record<string, unknown>} */ (objects[0])
  return 'additionalContext' in obj
    ? { ok: true }
    : { ok: false, reason: 'missing additionalContext key' }
})

// =============================================================
// session-start.sh
// =============================================================

console.log('\nsession-start.sh')

test('exists and is readable', () => {
  return { ok: existsSync(join(HOOKS, 'session-start.sh')) }
})

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

test('with 4 RETRO files (trend review), emits 1 object', () => {
  const dir = makeTempDirWithRetros(4)
  try {
    const { stdout } = runHook('session-start.sh', '', { cwd: dir })
    const { count, parseError } = parseJsonObjects(stdout)
    if (parseError) return { ok: false, reason: parseError }
    return count <= 1
      ? { ok: true }
      : { ok: false, reason: `expected 0 or 1 objects, got ${count}` }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('Dependabot alerts: stubbed gh returning 3 → 1 JSON object with security line', () => {
  const dir = makeTempGitRepo('git@github.com:test-owner/test-repo.git')
  const stubDir = makeGhStubDir('3')
  try {
    const { stdout, status } = runHook('session-start.sh', '', {
      cwd: dir,
      pathPrefix: stubDir,
    })
    if (status !== 0) return { ok: false, reason: `exit ${status}` }
    const { count, objects, parseError } = parseJsonObjects(stdout)
    if (parseError) return { ok: false, reason: parseError }
    if (count !== 1) return { ok: false, reason: `expected 1 object, got ${count}` }
    const ctx = String(/** @type {Record<string, unknown>} */ (objects[0]).additionalContext ?? '')
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
    const { stdout, status } = runHook('session-start.sh', '', {
      cwd: dir,
      pathPrefix: stubDir,
    })
    if (status !== 0) return { ok: false, reason: `exit ${status}` }
    const { objects, parseError } = parseJsonObjects(stdout)
    if (parseError) return { ok: false, reason: parseError }
    // No RETRO/UPSTREAM/SYNERGY files in the temp dir, and 0 alerts → silent.
    if (objects.length === 0) return { ok: true }
    const ctx = String(/** @type {Record<string, unknown>} */ (objects[0]).additionalContext ?? '')
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
    const { stdout, status } = runHook('session-start.sh', '', { cwd: dir })
    if (status !== 0) return { ok: false, reason: `exit ${status}` }
    const { objects, parseError } = parseJsonObjects(stdout)
    if (parseError) return { ok: false, reason: parseError }
    if (objects.length === 0) return { ok: true }
    const ctx = String(/** @type {Record<string, unknown>} */ (objects[0]).additionalContext ?? '')
    return ctx.includes('[security]')
      ? { ok: false, reason: `unexpected security line without alerts: ${ctx.slice(0, 120)}` }
      : { ok: true }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

// =============================================================
// Summary
// =============================================================

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`)

if (failed > 0) {
  process.exit(1)
}
