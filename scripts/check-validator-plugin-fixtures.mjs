// Fixture-based RED test for validate-plugin.mjs's plugins/* discovery + manifest validation.
//
// vp-beads-gtd was marked completed asserting "Proven RED on planted violations" — but no such proof
// was ever built (scripts/check-validator.mjs only unit-tests auditSilentSkips). This harness closes
// that hole (vp-beads-vph): it builds a THROWAWAY plugin tree, points the validator at it via
// VALIDATE_PLUGIN_ROOT, and asserts the validator EXITS NON-ZERO and NAMES the fixture for each
// planted violation — and stays GREEN on a clean control (a harness that always reported red would
// prove nothing; "self-test first", per check-prose-commands).
//
// The env override redirects only join(ROOT, …) file lookups; the validator still runs from its real
// location, so its own imports resolve and a fixture needs no node_modules of its own.

import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import {
  mkdirSync, mkdtempSync, rmSync, writeFileSync,
} from 'node:fs'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const VALIDATOR = join(REPO_ROOT, 'validate-plugin.mjs')
const ROOT_MANIFEST = JSON.stringify({ name: 'fixture-root', version: '0.0.0', description: 'fixture root' })

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
 * Build a throwaway fixture root with a CLEAN root plugin.json (so any failure is attributable to the
 * planted fixture, not the root), then write the given `{ relativePath: content }` files.
 *
 * @param {Record<string, string>} files
 * @returns {string}
 */
function buildFixture (files) {
  const dir = mkdtempSync(join(tmpdir(), 'vp-beads-validator-fixture-'))
  mkdirSync(join(dir, '.claude-plugin'), { recursive: true })
  writeFileSync(join(dir, '.claude-plugin', 'plugin.json'), ROOT_MANIFEST)
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true })
    writeFileSync(join(dir, rel), content)
  }
  return dir
}

/**
 * @param {string} root
 * @returns {{ status: number|null, stderr: string, stdout: string }}
 */
function runValidator (root) {
  const r = spawnSync(process.execPath, [VALIDATOR], {
    env: { ...process.env, VALIDATE_PLUGIN_ROOT: root },
    encoding: 'utf8',
  })
  return { status: r.status, stderr: r.stderr ?? '', stdout: r.stdout ?? '' }
}

/**
 * A minimal valid SKILL.md.
 *
 * @param {string} [extraBody]
 * @returns {string}
 */
function validSkill (extraBody = '') {
  return `---
name: demo
description: A demo skill for the fixture harness with enough trigger phrases to look real.
user-invocable: true
allowed-tools:
  - Read
---

# Demo

Body.
${extraBody}`
}

/**
 * @param {string} name
 * @param {Record<string, string>} files
 * @param {(r: { status: number|null, stderr: string, stdout: string }) => boolean} check
 */
function runCase (name, files, check) {
  const dir = buildFixture(files)
  try {
    assert(name, check(runValidator(dir)))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const manifest = (/** @type {Record<string, unknown>} */ obj) => JSON.stringify(obj)

console.log('validate-plugin plugins/* discovery — planted violations must go RED')

// 1. manifest missing a required field
runCase(
  'manifest missing `description` → non-zero + names the manifest',
  {
    'plugins/bad-manifest/.claude-plugin/plugin.json': manifest({ name: 'bad-manifest', version: '0.0.0' }),
    'plugins/bad-manifest/skills/demo/SKILL.md': validSkill(),
  },
  (r) => r.status === 1 && r.stderr.includes('bad-manifest') && r.stderr.includes('description')
)

// 2. non-object manifest — must ERROR cleanly, not crash with a TypeError (the isRecord fix)
runCase(
  'non-object plugin.json (`null`) → clean error, NOT a TypeError crash',
  {
    'plugins/scalar-manifest/.claude-plugin/plugin.json': 'null',
    'plugins/scalar-manifest/skills/demo/SKILL.md': validSkill(),
  },
  (r) => r.status === 1 && r.stderr.includes('scalar-manifest') && !r.stderr.includes('TypeError')
)

// 3. an mcp__ tool named in prose but absent from allowed-tools
runCase(
  'SKILL.md mentions an mcp__ tool absent from allowed-tools → RED',
  {
    'plugins/mcp-gap/.claude-plugin/plugin.json': manifest({ name: 'mcp-gap', version: '0.0.0', description: 'x' }),
    'plugins/mcp-gap/skills/demo/SKILL.md': validSkill('\nThis skill calls mcp__basic-memory__search_notes to read.\n'),
  },
  (r) => r.status === 1 && r.stderr.includes('mcp-gap')
)

// 4. a naked `workflow N` reference (missing the `(Name)`)
runCase(
  'naked `workflow 6` (no `(Name)`) → RED',
  {
    'plugins/wf-gap/.claude-plugin/plugin.json': manifest({ name: 'wf-gap', version: '0.0.0', description: 'x' }),
    'plugins/wf-gap/skills/demo/SKILL.md': validSkill('\nSee workflow 6 for details.\n'),
  },
  (r) => r.status === 1 && r.stderr.includes('wf-gap')
)

// 5. manifest-LESS plugin dir WITH skills → positive flag (not a silent skip)
runCase(
  'plugins/* dir with skills but NO manifest → positive error, not a silent skip',
  {
    'plugins/no-manifest/skills/demo/SKILL.md': validSkill(),
  },
  (r) => r.status === 1 && r.stderr.includes('no-manifest') && r.stderr.includes('manifest')
)

// 6. clean control — SELF-TEST FIRST: the harness must be able to go GREEN
runCase(
  'a fully-valid plugin → exit 0 (control: prove the harness is not always-red)',
  {
    'plugins/clean/.claude-plugin/plugin.json': manifest({ name: 'clean', version: '0.0.0', description: 'a clean plugin' }),
    'plugins/clean/skills/demo/SKILL.md': validSkill(),
  },
  (r) => r.status === 0 && r.stdout.includes('Plugin validation passed')
)

console.log(`\n${passed + failed} fixture cases: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
