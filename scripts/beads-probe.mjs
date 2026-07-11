/* eslint-disable unicorn/no-null -- this module's contract is its JSON output, where an
   explicit `null` means "looked, and it is absent". `undefined` would drop the key from
   JSON.stringify entirely, making "we checked and found nothing" indistinguishable from
   "we never checked" — the exact ambiguity a probe for a destructive tool must not have. */

/**
 * beads-probe.mjs — READ-ONLY reconnaissance for `/deintegrate-beads`.
 *
 * Answers, for a target repo: is the migration trustworthy, what beads machinery is
 * live, and what would break if we disarmed it. It NEVER mutates anything — the skill
 * reads this and decides.
 *
 * This exists because the skill's detection logic was pure prose, and prose cannot be
 * tested. Every check below was a *prose bug* first — each one failed silently while
 * reporting success, which is the worst failure mode a cleanup tool can have:
 *
 *   - the "is the migration trusted" gate passed for a store that did not exist
 *     (validate-tasks returns clean+exit 0 when it finds nothing) AND for a store that
 *     existed but was EMPTY (`tasks: []`). Hence `taskCount`, not `clean`.
 *   - `core.hooksPath` is stored ABSOLUTE, and may be set at global scope where a
 *     `--local --unset` silently cannot clear it. Hence `origin` + `scope`.
 *   - unsetting hooksPath RE-ENABLES `.git/hooks/`, which may hold bd's own dormant
 *     hooks — so a naive disarm can leave bd MORE armed than it found it.
 *   - husky sets `core.hooksPath`, but lefthook and pre-commit install into
 *     `.git/hooks/` — so they are not "clobbered" by bd, they REARM on unset. The
 *     remedy is the opposite for the two cases and must not be guessed.
 *   - a pid whose `comm` is `dolt` may be ANOTHER repo's daemon (pid reuse is the
 *     stated threat). Match the target's own data dir in the process args.
 *
 * Usage:
 *   node scripts/beads-probe.mjs [--root <dir>] [--json]
 */

import { spawnSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import {
  existsSync, readdirSync, readFileSync, statSync,
} from 'node:fs'
import {
  argv, cwd, exit, stdout,
} from 'node:process'

import { TRACKER_DIR } from './task-schema.mjs'

/** Hook names bd installs. */
const BD_HOOKS = new Set(['pre-commit', 'post-merge', 'pre-push', 'post-checkout', 'prepare-commit-msg'])

/** The marker bd wraps its hook content in. VERSION-STAMPED — match the prefix only. */
const BD_MARKER = 'BEGIN BEADS INTEGRATION'

/**
 * Run a command, capturing stdout. Never throws.
 *
 * @param {string} cmd
 * @param {string[]} args
 * @returns {{ ok: boolean, out: string, code: number|null }}
 */
function run (cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8' })
  return { ok: r.status === 0, out: (r.stdout ?? '').trim(), code: r.status }
}

/**
 * Is the flat-YAML migration trustworthy enough to disarm bd?
 *
 * `clean` is NOT sufficient and neither is exit 0: validate-tasks returns
 * `{clean:true, skipped:true}` when there is no store at all, and a plain
 * `{clean:true}` for a store holding `tasks: []`. Only a non-zero task count proves
 * work actually migrated.
 *
 * @param {string} root
 * @returns {any}
 */
export function probeMigration (root) {
  const tasksDir = join(root, TRACKER_DIR, 'tasks')
  const files = existsSync(tasksDir)
    ? readdirSync(tasksDir).filter(f => /^tasks-.+\.ya?ml$/.test(f))
    : []

  // Count `- id:` rows without parsing YAML — the probe stays dependency-light and a
  // malformed store should not crash reconnaissance.
  let taskCount = 0
  for (const f of files) {
    const text = readFileSync(join(tasksDir, f), 'utf8')
    taskCount += (text.match(/^\s*-\s+id:/gm) ?? []).length
  }

  const tracked = run('git', ['-C', root, 'ls-files', `${TRACKER_DIR}/tasks`]).out
  const committedFiles = tracked ? tracked.split('\n').filter(Boolean) : []

  return {
    storeExists: files.length > 0,
    files,
    taskCount,
    committed: committedFiles.length > 0,
    committedFiles,
    // The gate. All three, not any one.
    trusted: files.length > 0 && taskCount > 0 && committedFiles.length > 0,
  }
}

/**
 * What hook machinery is live, and what happens if we unset `core.hooksPath`?
 *
 * @param {string} root
 * @returns {any}
 */
export function probeHooks (root) {
  const raw = run('git', ['-C', root, 'config', '--get', 'core.hooksPath'])
  const origin = run('git', ['-C', root, 'config', '--show-origin', '--get', 'core.hooksPath'])
  const value = raw.ok ? raw.out : null
  // `--show-origin` prints `file:<path>\t<value>` — the scope is the file it came from.
  const originFile = origin.ok ? (origin.out.split('\t')[0] ?? '').replace(/^file:/, '') : null
  const scope = originFile === null
    ? null
    : (originFile.includes('.git/config') ? 'local' : 'global-or-other')

  // bd stores an ABSOLUTE path, so resolve before matching — a relative-prefix check
  // against `.beads/` misses the real value entirely and the skill silently skips the
  // one thing it exists to do.
  const resolved = value ? resolve(root, value) : null
  const isBeads = Boolean(resolved?.includes(join('.beads', 'hooks')))

  const shimDir = join(root, '.beads', 'hooks')
  const shims = existsSync(shimDir) ? readdirSync(shimDir).filter(f => BD_HOOKS.has(f)) : []

  // What is sitting in .git/hooks/? Unsetting hooksPath RE-ENABLES all of it — including
  // bd's own hooks, if the repo ever ran `bd hooks install` (Shape B). Disarming Shape A
  // without checking here can leave bd MORE armed than we found it.
  const gitHooksDir = join(root, '.git', 'hooks')
  const gitHooks = existsSync(gitHooksDir)
    ? readdirSync(gitHooksDir).filter(f => !f.endsWith('.sample'))
    : []
  const dormantBdHooks = gitHooks.filter(f => {
    try { return readFileSync(join(gitHooksDir, f), 'utf8').includes(BD_MARKER) } catch { return false }
  })
  const otherGitHooks = gitHooks.filter(f => !dormantBdHooks.includes(f))

  // Another hook manager? The REMEDY DIFFERS by mechanism, so do not lump them:
  //   husky      → uses core.hooksPath, so bd CLOBBERED it. Re-run their installer.
  //   lefthook   → installs into .git/hooks/, so it was dormant and RE-ARMS on unset.
  //   pre-commit → same; it refuses to install at all while core.hooksPath is set.
  const managers = []
  if (existsSync(join(root, '.husky'))) managers.push({ name: 'husky', mechanism: 'core.hooksPath', effect: 'clobbered-by-bd', remedy: 're-run their installer (npx husky / npm install) — do NOT hand-write a hooksPath; husky v8 uses .husky, v9 uses .husky/_' })
  for (const f of ['lefthook.yml', 'lefthook.yaml', '.pre-commit-config.yaml']) {
    if (existsSync(join(root, f))) {
      managers.push({ name: f, mechanism: '.git/hooks/', effect: 'dormant-rearms-on-unset', remedy: 'none needed — unsetting hooksPath restores it' })
    }
  }

  return {
    shape: value && isBeads ? 'hooksPath' : (dormantBdHooks.length ? 'git-hooks' : 'none'),
    hooksPath: { value, resolved, origin: originFile, scope, isBeads },
    shims,
    gitHooks: { dormantBdHooks, otherGitHooks },
    otherHookManagers: managers,
    // The exact re-arm command, so nobody guesses a relative path.
    reArmCommand: value ? `git -C ${root} config core.hooksPath '${value}'` : null,
  }
}

/**
 * Is a daemon live, and is it *this target's*?
 *
 * A pid whose `comm` is `dolt` may belong to ANOTHER repo — which is the exact hazard
 * pid-reuse creates. Require the process args to name this target's own `.beads`.
 *
 * @param {string} root
 * @returns {any}
 */
export function probeDaemon (root) {
  const pidFile = join(root, '.beads', 'dolt-server.pid')
  const portFile = join(root, '.beads', 'dolt-server.port')
  const pid = existsSync(pidFile) ? readFileSync(pidFile, 'utf8').trim() : null
  const port = existsSync(portFile) ? readFileSync(portFile, 'utf8').trim() : null

  let owned = null
  if (pid && /^\d+$/.test(pid)) {
    const args = run('ps', ['-p', pid, '-o', 'args='])
    const alive = args.ok && args.out.length > 0
    const isDolt = alive && /dolt/i.test(args.out)
    // Does the live process belong to THIS repo? The repo path is NOT in dolt's args
    // (verified: `dolt sql-server -H 127.0.0.1 -P 50426 --loglevel=warning`) — the only
    // link is the PORT, which bd records in .beads/dolt-server.port. Matching on the
    // path would fail closed forever; matching on `comm` alone would let pid-reuse
    // hand us a SIBLING repo's daemon, which is the whole hazard.
    const matchesTarget = Boolean(isDolt && port && new RegExp(`-P\\s+${port}\\b`).test(args.out))
    owned = { pid, port, alive, isDolt, matchesTarget, args: alive ? args.out : null }
  }

  const all = run('ps', ['ax', '-o', 'pid=,args=']).out.split('\n')
    .filter(l => /dolt\s+sql-server/i.test(l))
    .map(l => l.trim())
  const orphans = all.filter(l => !pid || !l.startsWith(pid))

  return {
    pidFile: existsSync(pidFile) ? pidFile : null,
    owned,
    // Safe to signal ONLY when we can prove it is a live dolt belonging to this target.
    safeToSignal: Boolean(owned?.alive && owned.isDolt && owned.matchesTarget),
    otherDoltProcesses: orphans,
  }
}

/**
 * bd's git config keys, and what is actually tracked under `.beads/`.
 *
 * `check-ignore` is the wrong question: not-ignored is not the same as tracked, and bd's
 * own `.beads/.gitignore` ignores CONTENTS while leaving config files tracked. `ls-files`
 * answers what git would actually delete.
 *
 * @param {string} root
 * @returns {any}
 */
export function probeResidue (root) {
  const cfg = run('git', ['-C', root, 'config', '--local', '--get-regexp', '^beads\\.'])
  const keys = cfg.ok && cfg.out ? cfg.out.split('\n').filter(Boolean) : []

  const beadsDir = join(root, '.beads')
  const tracked = run('git', ['-C', root, 'ls-files', '.beads']).out
  const trackedFiles = tracked ? tracked.split('\n').filter(Boolean) : []

  let size = null
  try { size = existsSync(beadsDir) ? statSync(beadsDir).isDirectory() : false } catch { /* ignore */ }

  return {
    beadsDirExists: Boolean(size),
    beadsConfigKeys: keys,
    trackedFiles,
    // Load-bearing for the report: deleting .beads/ would stage THESE as deletions.
    trackedCount: trackedFiles.length,
  }
}

/**
 * @param {string} root
 * @returns {any}
 */
export function probe (root) {
  return {
    root,
    migration: probeMigration(root),
    hooks: probeHooks(root),
    daemon: probeDaemon(root),
    residue: probeResidue(root),
  }
}

// --- CLI -------------------------------------------------------------------

if (argv[1] && fileURLToPath(import.meta.url) === argv[1]) {
  const { values } = parseArgs({
    allowPositionals: true,
    options: { root: { type: 'string' }, json: { type: 'boolean', 'default': false } },
  })
  const root = resolve(values.root ?? cwd())
  const result = probe(root)

  if (values.json) {
    stdout.write(JSON.stringify(result, null, 2) + '\n')
    exit(0)
  }

  const { daemon, hooks, migration, residue } = result
  stdout.write(`beads probe: ${root}\n\n`)

  stdout.write(`migration ${migration.trusted ? 'TRUSTED' : 'NOT TRUSTED — do not disarm bd'}\n`)
  stdout.write(`  store: ${migration.files.length} file(s), ${migration.taskCount} task(s), committed=${migration.committed}\n`)
  if (!migration.trusted) stdout.write('  (a store that is absent, EMPTY, or uncommitted all fail this gate)\n')

  stdout.write(`\nhooks: shape=${hooks.shape}\n`)
  if (hooks.hooksPath.value) {
    stdout.write(`  core.hooksPath = ${hooks.hooksPath.value}\n`)
    stdout.write(`    scope=${hooks.hooksPath.scope} origin=${hooks.hooksPath.origin} isBeads=${hooks.hooksPath.isBeads}\n`)
    if (hooks.hooksPath.scope !== 'local') stdout.write('    ! not local — `git config --local --unset` CANNOT clear this\n')
    stdout.write(`  re-arm: ${hooks.reArmCommand}\n`)
  }
  if (hooks.shims.length) stdout.write(`  shims: ${hooks.shims.join(', ')}\n`)
  if (hooks.gitHooks.dormantBdHooks.length) {
    stdout.write(`  ! .git/hooks/ holds bd hooks that would RE-ARM on unset: ${hooks.gitHooks.dormantBdHooks.join(', ')}\n`)
  }
  if (hooks.gitHooks.otherGitHooks.length) {
    stdout.write(`  .git/hooks/ (dormant, re-enabled by unset): ${hooks.gitHooks.otherGitHooks.join(', ')}\n`)
  }
  for (const m of hooks.otherHookManagers) {
    stdout.write(`  hook manager ${m.name} [${m.mechanism}] → ${m.effect}\n    remedy: ${m.remedy}\n`)
  }

  stdout.write('\ndaemon\n')
  if (!daemon.pidFile) stdout.write('  no .beads/dolt-server.pid — nothing to stop from a pid file\n')
  else if (daemon.safeToSignal) stdout.write(`  pid ${daemon.owned.pid} is this target's dolt — safe to SIGTERM\n`)
  else stdout.write(`  pid ${daemon.owned?.pid ?? '?'} NOT confirmed as this target's dolt — do NOT signal it\n`)
  for (const o of daemon.otherDoltProcesses) stdout.write(`  other dolt process (do not touch): ${o}\n`)

  stdout.write('\nresidue\n')
  for (const k of residue.beadsConfigKeys) stdout.write(`  git config: ${k}\n`)
  stdout.write(`  .beads/ tracked in git: ${residue.trackedCount} file(s)`)
  stdout.write(residue.trackedCount ? ' — deleting .beads/ would stage these as deletions\n' : ' — nothing tracked\n')
}
