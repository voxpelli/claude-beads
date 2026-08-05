/**
 * Tests for `scripts/format-shell-on-edit.sh`, this repo's shfmt-on-edit hook.
 *
 * It is repo dev tooling registered in the committed `.claude/settings.json`, not a
 * shipped plugin hook — the plugins each own their own `hooks/` and their own suite
 * under their own `check:` key, per decision vp-beads-gow.
 *
 * ASSERT THE DIRECTION A FALSE POSITIVE LIVES IN. The suite this replaces had two
 * assertions and both were negative (the hook stayed silent), so it could see a hook
 * that spoke when it should not and was structurally blind to a hook that never
 * formatted anything at all — which is the failure that ships. Both directions are
 * asserted here: it formats what it should, and it leaves alone what it must not.
 */

import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync,
} from 'node:fs'

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '')
const SCRIPT = join(ROOT, 'scripts', 'format-shell-on-edit.sh')

// --- Preflight ---

for (const bin of ['jq', 'shfmt']) {
  if (spawnSync('which', [bin]).status !== 0) {
    console.error(`FATAL: ${bin} is required but not found in PATH`)
    process.exit(1)
  }
}

let passed = 0
let failed = 0

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

/**
 * Run the hook with a PostToolUse payload naming `filePath`.
 *
 * @param {string} filePath
 * @param {string[]} [args] - Positional PROJECT_ROOT override
 * @returns {{ stdout: string, status: number | null }}
 */
function run (filePath, args = []) {
  const result = spawnSync('bash', [SCRIPT, ...args], {
    input: JSON.stringify({ tool_input: { file_path: filePath } }),
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 15_000,
  })
  return { stdout: result.stdout ?? '', status: result.status }
}

/**
 * A temp "repo" containing one badly-formatted shell script at `rel`.
 *
 * `realpathSync` FIRST: on macOS `tmpdir()` is `/var/folders/…` while the resolved
 * path is `/private/var/folders/…`, so a prefix comparison between the two shares no
 * prefix at all and the fixture would pass (or fail) for a reason unrelated to what
 * it names.
 *
 * @param {string} rel - Path within the fake repo, e.g. 'plugins/x/hooks/a.sh'
 * @returns {{ root: string, file: string }}
 */
function makeRepoWithScript (rel) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'vp-fmt-')))
  const file = join(root, rel)
  mkdirSync(join(file, '..'), { recursive: true })
  // Spaces where shfmt wants tabs — the difference it will rewrite.
  writeFileSync(file, '#!/bin/bash\nif true; then\n  echo hi\nfi\n')
  return { root, file }
}

const UNFORMATTED = '#!/bin/bash\nif true; then\n  echo hi\nfi\n'

console.log('\nformat-shell-on-edit.sh')

test('exists and is readable', () => ({ ok: existsSync(SCRIPT) }))

test('FORMATS a .sh under the project root', () => {
  // The positive direction, and the one the previous suite never asserted. A hook
  // that silently formatted nothing passed every test it had.
  const { file, root } = makeRepoWithScript('scripts/thing.sh')
  try {
    const { status } = run(file, [root])
    if (status !== 0) return { ok: false, reason: `exit ${status}` }
    const after = readFileSync(file, 'utf8')
    return after !== UNFORMATTED
      ? { ok: true }
      : { ok: false, reason: 'file is byte-identical — the hook formatted nothing' }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('FORMATS a .sh under plugins/*/hooks/ (where the shell scripts now live)', () => {
  // The regression a directory allow-list would have caused when the hooks sharded
  // out of `hooks/` — and it would have caused it silently.
  const { file, root } = makeRepoWithScript('plugins/ledger/hooks/session-start.sh')
  try {
    const { status } = run(file, [root])
    if (status !== 0) return { ok: false, reason: `exit ${status}` }
    return readFileSync(file, 'utf8') !== UNFORMATTED
      ? { ok: true }
      : { ok: false, reason: 'a plugin hook was not formatted — the bound has narrowed' }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('leaves a .sh OUTSIDE the project root untouched', () => {
  // The dangerous direction. This hook rewrites files in place, so a bound that fails
  // open reformats whatever the agent happens to edit anywhere on disk.
  const inside = makeRepoWithScript('scripts/thing.sh')
  const outside = makeRepoWithScript('elsewhere.sh')
  try {
    const { status } = run(outside.file, [inside.root])
    if (status !== 0) return { ok: false, reason: `exit ${status}` }
    return readFileSync(outside.file, 'utf8') === UNFORMATTED
      ? { ok: true }
      : { ok: false, reason: 'rewrote a file outside the project root' }
  } finally {
    rmSync(inside.root, { recursive: true, force: true })
    rmSync(outside.root, { recursive: true, force: true })
  }
})

test('leaves a non-.sh file untouched', () => {
  const { root } = makeRepoWithScript('scripts/thing.sh')
  const other = join(root, 'notes.md')
  try {
    writeFileSync(other, '#  heading\n')
    const { status } = run(other, [root])
    if (status !== 0) return { ok: false, reason: `exit ${status}` }
    return readFileSync(other, 'utf8') === '#  heading\n'
      ? { ok: true }
      : { ok: false, reason: 'rewrote a non-shell file' }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('no project root → silent, exit 0, nothing rewritten', () => {
  const { file, root } = makeRepoWithScript('scripts/thing.sh')
  try {
    // No positional arg, and CLAUDE_PROJECT_DIR is not set in this process.
    const { status, stdout } = run(file)
    if (status !== 0) return { ok: false, reason: `exit ${status}` }
    if (stdout.trim() !== '') return { ok: false, reason: `unexpected output: ${stdout.slice(0, 120)}` }
    return readFileSync(file, 'utf8') === UNFORMATTED
      ? { ok: true }
      : { ok: false, reason: 'formatted without knowing the project root' }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('garbage stdin → silent, exit 0 (never aborts under errexit)', () => {
  const result = spawnSync('bash', [SCRIPT, ROOT], {
    input: 'not json at all',
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 15_000,
  })
  if (result.status !== 0) return { ok: false, reason: `exit ${result.status}` }
  return (result.stdout ?? '').trim() === ''
    ? { ok: true }
    : { ok: false, reason: `unexpected output: ${(result.stdout ?? '').slice(0, 120)}` }
})

test('is registered in the committed .claude/settings.json', () => {
  // The script and its registration are two files that can drift apart, and a hook
  // nothing invokes is indistinguishable from one that works.
  const settingsPath = join(ROOT, '.claude', 'settings.json')
  if (!existsSync(settingsPath)) return { ok: false, reason: '.claude/settings.json is missing' }
  const raw = readFileSync(settingsPath, 'utf8')
  return raw.includes('scripts/format-shell-on-edit.sh')
    ? { ok: true }
    : { ok: false, reason: 'settings.json does not reference scripts/format-shell-on-edit.sh' }
})

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`)
if (failed > 0) {
  process.exit(1)
}
