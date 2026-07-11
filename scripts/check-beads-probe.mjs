/**
 * Unit tests for beads-probe.mjs — the read-only reconnaissance behind /deintegrate-beads.
 *
 * This suite exists because the skill's detection logic was PROSE, and prose cannot be
 * tested. Two review rounds found five critical bugs in it, and every single one failed
 * SILENTLY while reporting success — a cleanup tool's worst failure mode. Each case below
 * is one of those bugs.
 */

import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync,
} from 'node:fs'

import { probeHooks, probeMigration, probeResidue } from './beads-probe.mjs'

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
  return dir
}

/**
 * @param {string} dir
 * @param {string} body
 */
function writeStore (dir, body) {
  mkdirSync(join(dir, '.diarie', 'tasks'), { recursive: true })
  writeFileSync(join(dir, '.diarie', 'tasks', 'tasks-x.yml'), body)
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
    spawnSync('git', ['-C', dir, 'add', '-A'])
    spawnSync('git', ['-C', dir, 'commit', '-qm', 'x'])
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
    spawnSync('git', ['-C', dir, 'add', '-A'])
    spawnSync('git', ['-C', dir, 'commit', '-qm', 'x'])
    const m = probeMigration(dir)
    assert('committed store with real tasks → trusted', m.taskCount === 1 && m.committed === true && m.trusted === true)
  } finally { rmSync(dir, { recursive: true, force: true }) }
}

console.log('\nprobeHooks (shape, ownership, and what unsetting would ARM)')

{
  const dir = makeRepo()
  try {
    const h = probeHooks(dir)
    assert('no hooks at all → shape=none, nothing to re-arm', h.shape === 'none' && h.reArmCommand === null)
  } finally { rmSync(dir, { recursive: true, force: true }) }
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
    assert('the husky remedy refuses to hand-write a path (v8 vs v9 differ)', /installer/.test(husky?.remedy ?? ''))
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
    spawnSync('git', ['-C', dir, 'add', '-A'])
    spawnSync('git', ['-C', dir, 'commit', '-qm', 'x'])
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

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
if (!existsSync(join(process.cwd(), 'scripts', 'beads-probe.mjs'))) process.exit(0)
