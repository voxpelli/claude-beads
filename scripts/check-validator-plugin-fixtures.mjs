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

// 7. THE VACUITY CASE — the one this harness could not see.
//
// Every case above plants a violation and asserts a RED. None asserted anything about what a
// GREEN means. Measured before the fix: `Plugin validation passed.` over a directory holding
// nothing but a manifest was BYTE-IDENTICAL to the real run over 6 skills and 18 reference
// files, because every check is `existsSync`-gated or a `for` over a discovered list, and an
// empty tree satisfies all of them vacuously.
//
// This is `vp-beads-exf`, which was CANCELLED with a recorded trigger — "a gate found green
// over zero inputs again" — and the trigger then fired verbatim on this very validator.
runCase(
  'manifest-only tree → still exit 0, but the output SAYS it audited nothing',
  { 'plugins/hollow/.claude-plugin/plugin.json': manifest({ name: 'hollow', version: '0.0.0', description: 'no skills at all' }) },
  (r) => r.status === 0 && r.stdout.includes('0 skill(s)') && r.stdout.includes('NONE FOUND')
)

// 8. …and the control that makes case 7 mean something: a populated tree must NOT claim zero.
// Without this pair, case 7 would pass against a validator that printed "NONE FOUND" always.
runCase(
  'populated tree → names the skill it audited, never the vacuity wording',
  {
    'plugins/populated/.claude-plugin/plugin.json': manifest({ name: 'populated', version: '0.0.0', description: 'has a skill' }),
    'plugins/populated/skills/demo/SKILL.md': validSkill(),
  },
  (r) => r.status === 0 &&
    r.stdout.includes('1 skill(s)') &&
    r.stdout.includes('plugins/populated/skills/demo') &&
    !r.stdout.includes('NONE FOUND')
)

// --- Nested hooks.json (vp-beads-vgp) ---
//
// Until these existed, `plugins/*/hooks/hooks.json` was NEVER READ: the validator hardcoded one
// root path, so a byte-identical garbage file exited 1 at `hooks/` and 0 at `plugins/x/hooks/`.
// vp-beads-sss creates exactly these files, so the gap would have landed the whole shard
// unvalidated while the validator reported success.

// The literal token Claude Code substitutes at runtime. Held in a const so the fixtures below can
// build commands with real template strings instead of scattering `no-template-curly-in-string`
// suppressions at every use.
// eslint-disable-next-line no-template-curly-in-string -- that literal token is the point
const PLUGIN_ROOT = '${CLAUDE_PLUGIN_ROOT}'

/**
 * @param {Record<string, unknown>} hooksMap
 * @returns {string}
 */
function hooksFile (hooksMap) {
  return JSON.stringify({ hooks: hooksMap })
}

/**
 * One well-formed command hook, so each case plants only the ONE defect it is about.
 *
 * @param {string} [cmd]
 * @returns {Record<string, unknown>}
 */
function okHook (cmd = `bash ${PLUGIN_ROOT}/hooks/run.sh`) {
  return { matcher: '', hooks: [{ type: 'command', command: cmd, timeout: 5 }] }
}

/**
 * A plugin workspace with a manifest and a real target script, plus the caller's files.
 *
 * @param {Record<string, string>} files
 * @returns {Record<string, string>}
 */
function withPlugin (files) {
  return {
    'plugins/hooked/.claude-plugin/plugin.json': manifest({ name: 'hooked', version: '0.0.0', description: 'has hooks' }),
    'plugins/hooked/hooks/run.sh': '#!/bin/bash\ntrue\n',
    ...files,
  }
}

// 9. the founding gap: a nested hooks.json is read at all
runCase(
  'NESTED hooks.json with a bogus hook type → RED, and names the nested file',
  withPlugin({
    'plugins/hooked/hooks/hooks.json': hooksFile({
      PostToolUse: [{ matcher: '', hooks: [{ type: 'banana', command: 'x', timeout: 5 }] }],
    }),
  }),
  (r) => r.status === 1 && r.stderr.includes('plugins/hooked/hooks/hooks.json') && r.stderr.includes('banana')
)

// 10. a null element must be a positioned error, not a crash that loses every prior finding
runCase(
  'NESTED hooks.json with a `null` entry → clean error, NOT a TypeError crash',
  withPlugin({
    'plugins/hooked/hooks/hooks.json': '{"hooks":{"PostToolUse":[null]}}',
  }),
  (r) => r.status === 1 && r.stderr.includes('must be an object') && !r.stderr.includes('TypeError')
)

// 11. a null hook DEFINITION, one level deeper than case 10
runCase(
  'a `null` hook definition → clean error, NOT a TypeError crash',
  withPlugin({
    'plugins/hooked/hooks/hooks.json': '{"hooks":{"PostToolUse":[{"matcher":"","hooks":[null]}]}}',
  }),
  (r) => r.status === 1 && r.stderr.includes('hook definition must be an object') && !r.stderr.includes('TypeError')
)

// 12. QUOTED path — correct practice for a path that may contain spaces, and previously skipped
runCase(
  'quoted nonexistent command path → RED (the old guard matched only bare tokens)',
  withPlugin({
    'plugins/hooked/hooks/hooks.json': hooksFile({ PostToolUse: [okHook(`bash "${PLUGIN_ROOT}/hooks/NOPE.sh"`)] }),
  }),
  (r) => r.status === 1 && r.stderr.includes('does not exist')
)

// 13. RELATIVE path — broken at runtime regardless of existence, because hooks run with the
//     USER'S project as cwd. The file below EXISTS, so only a cwd-aware check can go red.
runCase(
  'relative command path → RED even though the file exists (hooks run in the user\'s cwd)',
  withPlugin({
    'plugins/hooked/hooks/hooks.json': hooksFile({ PostToolUse: [okHook('bash hooks/run.sh')] }),
  }),
  (r) => r.status === 1 && r.stderr.includes('RELATIVE')
)

// 14. a misspelled event registers cleanly and never fires — silent and permanent
runCase(
  'misspelled hook event (`SesionStart`) → RED, and suggests the real one',
  withPlugin({
    'plugins/hooked/hooks/hooks.json': hooksFile({ SesionStart: [okHook()] }),
  }),
  (r) => r.status === 1 && r.stderr.includes('SessionStart')
)

// 15. …and the control that keeps case 14 honest: an event that is merely UNKNOWN (Claude Code
//     keeps adding them) must warn, not fail. Without this, the typo check would be indistinguishable
//     from a rule that rejects every event not on a list someone has to remember to update.
runCase(
  'wholly unknown event → warns but stays GREEN, so a new Claude Code event cannot false-red',
  withPlugin({
    'plugins/hooked/hooks/hooks.json': hooksFile({ QuantumFlux: [okHook()] }),
  }),
  (r) => r.status === 0 && r.stderr.includes('QuantumFlux')
)

// 16. …and the control that keeps discovery from being vacuous: a valid nested file must be
//     COUNTED. Cases 9-15 all assert on failure text, which a validator that never found the file
//     could not produce — but a validator that found it and counted zero would still look fine.
runCase(
  'a valid nested hooks.json is COUNTED in the inventory, not silently skipped',
  withPlugin({
    'plugins/hooked/hooks/hooks.json': hooksFile({ PostToolUse: [okHook()] }),
  }),
  (r) => r.status === 0 && r.stdout.includes('1 hooks.json')
)

// --- Presence-only checks, and one more crash (vp-beads-vgp) ---

// 17. `field in manifest` is not the check it looks like
runCase(
  'manifest with `name: ""` → RED (presence is not the check)',
  {
    '.claude-plugin/plugin.json': manifest({ name: '', version: '0.0.0', description: 'empty name' }),
  },
  (r) => r.status === 1 && r.stderr.includes('non-empty string')
)

// 18. …and its YAML-null twin, which behaved identically
runCase(
  'manifest with `description: null` → RED, and says what it got',
  {
    '.claude-plugin/plugin.json': '{"name":"x","version":"0.0.0","description":null}',
  },
  (r) => r.status === 1 && r.stderr.includes('null')
)

// 19. same crash class as the hooks arrays, one level out
runCase(
  'marketplace.json with a `null` plugins[] entry → clean error, NOT a TypeError crash',
  {
    '.claude-plugin/marketplace.json': '{"name":"m","plugins":[null]}',
  },
  (r) => r.status === 1 && r.stderr.includes('must be an object') && !r.stderr.includes('TypeError')
)

// 20. the directory is what gets invoked; the frontmatter name is what the skill calls itself
runCase(
  'skill directory name disagreeing with its frontmatter `name` → RED',
  {
    'plugins/named/.claude-plugin/plugin.json': manifest({ name: 'named', version: '0.0.0', description: 'name mismatch' }),
    'plugins/named/skills/actual-dir/SKILL.md': validSkill().replace('name: demo', 'name: something-else'),
  },
  (r) => r.status === 1 && r.stderr.includes('actual-dir') && r.stderr.includes('something-else')
)

console.log(`\n${passed + failed} fixture cases: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
