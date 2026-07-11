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
 *     (validate-tasks used to return clean+exit 0 when it found nothing — that is now
 *     ENOSTORE) AND for a store that existed but was EMPTY (`tasks: []` — still clean,
 *     still exit 0, and rightly so). Hence `taskCount`, not `clean`.
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

import { TRACKER_DIR } from 'diarie/schema'
import yaml from 'js-yaml'

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
 * `clean` is NOT sufficient and neither is exit 0. An ABSENT store is now an
 * error (ENOSTORE) rather than a cheerful `{clean:true, skipped:true}` — but an
 * EMPTY store still validates clean at exit 0, exactly as it should. So a green
 * validate still proves nothing about whether work was migrated. Only a non-zero
 * task count does, which is why this parses the YAML itself.
 *
 * @param {string} root
 * @returns {any}
 */
export function probeMigration (root) {
  const tasksDir = join(root, TRACKER_DIR, 'tasks')
  const files = existsSync(tasksDir)
    ? readdirSync(tasksDir).filter(f => /^tasks-.+\.ya?ml$/.test(f))
    : []

  // PARSE the YAML; do not pattern-match it. Counting `/^\s*-\s+id:/` looked
  // "dependency-light" and was simply wrong: the migration preserves every bd body as a
  // `description:` block scalar, and bd bodies routinely quote YAML — so a `- id:` inside
  // prose inflated the count, and a store holding `tasks: []` reported as trusted. That is
  // the exact vacuous gate this function exists to close, reintroduced one layer down.
  let taskCount = 0
  let malformed = false
  for (const f of files) {
    try {
      const doc = /** @type {any} */ (yaml.load(readFileSync(join(tasksDir, f), 'utf8')))
      if (Array.isArray(doc?.tasks)) taskCount += doc.tasks.length
    } catch {
      // A store we cannot parse is a store we cannot vouch for.
      malformed = true
    }
  }

  // `ls-files` reads the INDEX, so a `git add`-ed but never-committed store answered
  // "committed: true" — in a repo with no commits at all. `ls-tree HEAD` asks history.
  const inHead = run('git', ['-C', root, 'ls-tree', '-r', '--name-only', 'HEAD', '--', `${TRACKER_DIR}/tasks`])
  const committedFiles = inHead.ok && inHead.out ? inHead.out.split('\n').filter(Boolean) : []

  return {
    storeExists: files.length > 0,
    files,
    taskCount,
    malformed,
    committed: committedFiles.length > 0,
    committedFiles,
    // The gate. All of them, not any one.
    trusted: files.length > 0 && taskCount > 0 && !malformed && committedFiles.length > 0,
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
  const value = raw.ok ? raw.out : null

  // `--show-scope` (git >= 2.26) returns git's OWN answer: local | global | system |
  // worktree | command. Do NOT infer it by string-matching the origin path — that call
  // reported `global-or-other` for a submodule (whose config lives in
  // `.git/modules/<name>/config` yet IS local), so the skill would refuse to disarm a repo
  // it safely could. Worse, "global-or-other" is not a git scope, and an agent told to
  // "unset at the scope the probe reports" could reach for `--global --unset` and delete
  // the user's unrelated global hooksPath.
  const scopeRun = run('git', ['-C', root, 'config', '--show-scope', '--get', 'core.hooksPath'])
  const scope = scopeRun.ok && scopeRun.out ? (scopeRun.out.split(/\s+/)[0] ?? null) : null

  // bd stores an ABSOLUTE path, so resolve before matching — a relative-prefix check
  // against `.beads/` misses the real value entirely and the skill silently skips the
  // one thing it exists to do. Compare against THIS root's .beads/hooks: a `includes()`
  // test would claim another repo's `.beads/hooks` as our own.
  const resolved = value ? resolve(root, value) : null
  const isBeads = resolved === resolve(root, '.beads', 'hooks')

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
    hooksPath: { value, resolved, scope, isBeads },
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
  const rawPid = existsSync(pidFile) ? readFileSync(pidFile, 'utf8').trim() : null
  const rawPort = existsSync(portFile) ? readFileSync(portFile, 'utf8').trim() : null
  // Only ever trust digits. A half-dead daemon can leave a truncated port file, and that
  // string used to be interpolated straight into `new RegExp` — `5042(6` threw
  // "Unterminated group" and took the WHOLE probe down, migration gate and all.
  const pid = rawPid && /^\d+$/.test(rawPid) ? rawPid : null
  const port = rawPort && /^\d+$/.test(rawPort) ? rawPort : null

  const beadsDir = resolve(root, '.beads')

  let owned = null
  if (pid) {
    const args = run('ps', ['-p', pid, '-o', 'args='])
    const alive = args.ok && args.out.length > 0
    // `/dolt/i` over the whole command line was far too loose — ANY process with "dolt"
    // somewhere in argv passed. Require the actual `dolt sql-server` invocation.
    const isDolt = alive && /dolt\s+sql-server/i.test(args.out)

    // Ownership, in order of strength:
    //  1. the process CWD. dolt runs *inside* `<root>/.beads/dolt`, so this is direct
    //     proof, not a correlation. (An earlier comment claimed the repo path was
    //     unavailable and settled for the port — that was simply wrong.)
    //  2. the port, as corroboration only. It is WEAK on its own: a pid and its port are
    //     freed together when a daemon dies, so a sibling repo's dolt can inherit BOTH —
    //     which is precisely the pid-reuse hazard we are defending against.
    const cwdOut = run('lsof', ['-p', pid, '-a', '-d', 'cwd', '-Fn']).out
    const cwdLine = cwdOut.split('\n').find(l => l.startsWith('n'))?.slice(1) ?? null
    const cwdInTarget = Boolean(cwdLine && resolve(cwdLine).startsWith(beadsDir))
    const portMatches = Boolean(port && new RegExp(String.raw`-P\s+${port}\b`).test(args.out))

    owned = { pid, port, alive, isDolt, cwd: cwdLine, cwdInTarget, portMatches, args: alive ? args.out : null }
  }

  // Parse the pid FIELD; `line.startsWith(pid)` was a prefix match, so our pid 4443
  // silently hid a genuinely different daemon at 44430 from the do-not-touch list.
  const all = run('ps', ['ax', '-o', 'pid=,args=']).out.split('\n')
    .map(l => l.trim())
    .filter(l => /dolt\s+sql-server/i.test(l))
  const others = all.filter(l => (l.split(/\s+/)[0] ?? '') !== pid)

  return {
    pidFile: existsSync(pidFile) ? pidFile : null,
    owned,
    // Signal ONLY on proof: a live `dolt sql-server` whose cwd is inside THIS target's
    // .beads/. Falling closed costs an orphaned daemon; falling open kills someone else's.
    safeToSignal: Boolean(owned?.alive && owned.isDolt && owned.cwdInTarget),
    otherDoltProcesses: others,
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
  // Without git, every git-derived answer below degrades to a benign-looking DEFAULT
  // rather than an error: "nothing tracked", "no hooksPath", "not committed". The skill
  // would then tell the user that `rm -rf .beads/` merely frees disk. Say so explicitly.
  const gitAvailable = run('git', ['-C', root, 'rev-parse', '--git-dir']).ok
  return {
    root,
    gitAvailable,
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
    stdout.write(`    scope=${hooks.hooksPath.scope} isBeads=${hooks.hooksPath.isBeads}\n`)
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
  else if (daemon.safeToSignal) stdout.write(`  pid ${daemon.owned.pid} — cwd is ${daemon.owned.cwd} → this target's dolt, safe to SIGTERM\n`)
  else stdout.write(`  pid ${daemon.owned?.pid ?? '?'} NOT proven to be this target's dolt — do NOT signal it\n`)
  for (const o of daemon.otherDoltProcesses) stdout.write(`  other dolt process (do not touch): ${o}\n`)

  stdout.write('\nresidue\n')
  for (const k of residue.beadsConfigKeys) stdout.write(`  git config: ${k}\n`)
  stdout.write(`  .beads/ tracked in git: ${residue.trackedCount} file(s)`)
  stdout.write(residue.trackedCount ? ' — deleting .beads/ would stage these as deletions\n' : ' — nothing tracked\n')
}
