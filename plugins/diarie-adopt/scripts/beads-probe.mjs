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
import { join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import {
  existsSync, readdirSync, readFileSync, realpathSync, statSync,
} from 'node:fs'
import {
  argv, cwd, stdout,
} from 'node:process'

/** Hook names bd installs. */
const BD_HOOKS = new Set(['pre-commit', 'post-merge', 'pre-push', 'post-checkout', 'prepare-commit-msg'])

/** The marker bd wraps its hook content in. VERSION-STAMPED — match the prefix only. */
const BD_MARKER = 'BEGIN BEADS INTEGRATION'

/**
 * @typedef {{
 *   ok: boolean,
 *   ran: boolean,
 *   complete: boolean,
 *   out: string,
 *   err: string,
 *   code: number|null,
 *   signal: string|null,
 *   error: string|null
 * }} RunResult
 */

/**
 * Run a command, capturing stdout. Never throws.
 *
 * `ok` alone cannot carry this file's central distinction. It used to be the only signal, and
 * `ok: false` is FOUR different situations — measured 2026-07-29, not inferred:
 *
 *   | situation                  | status | signal  | error   | stdout    |
 *   | -------------------------- | ------ | ------- | ------- | --------- |
 *   | binary absent              | null   | null    | ENOENT  | ''        |
 *   | ran, answered no (exit 1)  | 1      | null    | —       | ''        |
 *   | ran, failed (exit 127)     | 127    | null    | —       | ''        |
 *   | killed by a signal         | null   | SIGTERM | —       | partial   |
 *   | stdout > 1 MiB (ENOBUFS)   | null   | SIGTERM | ENOBUFS | TRUNCATED |
 *
 * Only the second is an ANSWER (`git config --get` exits 1 for an unset key). The rest are
 * could-not-determine wearing the same `ok: false`, which is the conflation this whole module
 * exists to delete — and it had it at its own foundation.
 *
 * `ran` is false only when the process never started: BOTH `status` and `signal` null with an
 * `error` set. ENOBUFS also sets `error`, but node had to START the child in order to kill it,
 * so `signal` is SIGTERM there and `ran` stays true.
 *
 * `complete` additionally means we hold ALL of its output. This is not theoretical: on overflow
 * spawnSync returns a TRUNCATED string, not an empty one, so a caller that splits `out` into
 * lines gets a short list with nothing marking it short.
 *
 * @param {string} cmd
 * @param {string[]} args
 * @returns {RunResult}
 */
function run (cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8' })
  const ran = !(r.error && r.status === null && r.signal === null)
  return {
    ok: r.status === 0,
    ran,
    complete: ran && !r.error && r.signal === null,
    out: (r.stdout ?? '').trim(),
    err: (r.stderr ?? '').trim(),
    code: r.status,
    signal: r.signal ?? null,
    error: r.error ? ('code' in r.error ? String(r.error.code) : r.error.message) : null,
  }
}

/**
 * Why a run did not yield a usable answer — the string that goes in the JSON and the report.
 *
 * A guard that DROPS a value must also REPORT it, naming the consequence (CLAUDE.md
 * `### Reader conventions`). "unknown" on its own sends a user looking for a broken store; "could
 * not run git (ENOENT)" sends them to install git.
 *
 * @param {string} cmd
 * @param {RunResult} r
 * @returns {string}
 */
function whyNot (cmd, r) {
  if (!r.ran) return `could not run \`${cmd}\` (${r.error ?? 'spawn failed'})`
  if (r.error === 'ENOBUFS') return `\`${cmd}\` produced more than 1 MiB and its output was TRUNCATED`
  if (r.signal) return `\`${cmd}\` was killed by ${r.signal}`
  return `\`${cmd}\` exited ${r.code}${r.err ? `: ${r.err.split('\n')[0]}` : ''}`
}

// diarie's PUBLISHED, stable store-dir contract: the store lives at `<root>/.diarie/` — which is
// exactly what the `diarie --root` flag means. Kept as a LOCAL constant, NOT imported from
// `diarie/schema`, so this probe carries NO npm import to resolve at runtime: Claude Code does not
// `npm install` a git-source plugin, so a `node_modules`-resolved `import` (diarie/schema, js-yaml)
// throws `ERR_MODULE_NOT_FOUND` the moment the plugin is installed, and the skill's documented
// `npm install --prefix` recovery cannot help (there is nothing to install).
//
// DO NOT "fix" this by importing `TRACKER_DIR` — and do NOT extend the `no-hardcoded-tracker-dir`
// ast-grep rule (root `scripts/*.mjs`) to cover `plugins/*/scripts/`: that rule EXISTS to force the
// import, and forcing it here would reintroduce the install bug above. A root dev-tool can import
// diarie (node_modules present); an installed plugin runtime script cannot. The clean long-term fix
// is for diarie to expose its store-dir in `stats --json` so consumers neither import nor hardcode
// it — until then this literal is the sanctioned exception (diarie's `.diarie` is a published,
// stable contract, not a co-development internal).
// The store is not ONE name. diarie renames it to a PAIR — visible `diarium/` or dotted
// `.diarium/`, whichever is on disk IS the choice — while `.diarie/` remains as the legacy name
// this plugin's own migration produced. A probe that knows only one of them is not merely
// incomplete, it is WRONG in the dangerous direction: pointed at a repo that already uses another
// form it reports "no store", and `/migrate-tracker` (whose precondition is exactly that) would
// migrate a second time, leaving two backlogs and nothing pointing at the full one.
//
// Ordered legacy-first so an in-place `.diarie/` still wins on a repo mid-rename.
const TRACKER_DIRS = ['.diarie', 'diarium', '.diarium']

/**
 * Best-effort canonical path — symlinks followed where possible, lexical otherwise.
 *
 * `realpathSync` THROWS on a path that does not exist (measured: ENOENT), and `<root>/.beads/hooks`
 * legitimately does not exist in a Shape-B repo, a husky repo, or a repo with no hooks at all. A
 * bare swap would therefore turn a probe whose header promises it never throws into one that does,
 * on three currently-green cases. The lexical fallback is exactly the old behaviour, so this can
 * only ever make a comparison MORE correct: it fixes the symlinked-root flip, and a
 * hooksPath still pointing at a `.beads/hooks` that has since been deleted keeps matching
 * textually on both sides.
 *
 * @param {string} p
 * @returns {string}
 */
function canonical (p) {
  try { return realpathSync(p) } catch { return p }
}

/**
 * Read a small state file, or `null` if it cannot be read for ANY reason.
 *
 * `existsSync` answers "is it there", not "can I read it" — and a bare `readFileSync` behind it
 * meant a root-owned or mode-000 pid file threw EACCES out of `probeDaemon` and took `probe()`
 * with it, MIGRATION GATE INCLUDED (measured). A reconnaissance tool for a destructive operation
 * must not die on a file it merely wanted to look at.
 *
 * @param {string} p
 * @returns {string | null}
 */
function readIfPossible (p) {
  try { return readFileSync(p, 'utf8').trim() } catch { return null }
}

/**
 * List a directory, or `null` if it cannot be listed.
 *
 * `existsSync` says the path is there; it does not say the directory can be READ. Four sites
 * crashed the whole probe on this — measured: EACCES on a mode-000 `.git/hooks/` or store
 * `tasks/`, and ENOTDIR when either path is a regular file. The hook-BODY read was hardened and
 * this, one line above it, was not: so when the permission problem is on the directory rather than
 * the file, the third bucket never fires and `probe()` dies instead, migration gate included.
 *
 * @param {string} p
 * @returns {string[] | null}
 */
function readdirIfPossible (p) {
  try { return readdirSync(p) } catch { return null }
}

/**
 * POSIX single-quote a shell argument.
 *
 * `reArmCommand` is the artifact SKILL.md calls the guarantee of reversibility, and it was built
 * as `'${value}'` with no escaping. Measured: a hooksPath containing an apostrophe emits
 * unbalanced quoting and `sh` answers "unexpected EOF while looking for matching `''" — so the
 * one command promising the change is undoable does not run. `root` was not quoted at all, so a
 * space anywhere in the repo path did the same.
 *
 * @param {string} s
 * @returns {string}
 */
function shellQuote (s) {
  return `'${s.replaceAll("'", String.raw`'\''`)}'`
}

/**
 * git's own scope words -> the flag that WRITES at that scope.
 *
 * `git config` writes LOCAL when given no scope flag, and the re-arm command gave none. So a
 * hooksPath the probe correctly reported as `global` was handed back as a command that moves the
 * setting into this one repo and silently drops it from every OTHER repo — the opposite of
 * restoring. `command` scope is deliberately absent: a value from `git -c` on the command line was
 * never persisted, so there is nothing to re-arm.
 */
const SCOPE_WRITE_FLAGS = new Map([
  ['local', '--local'], ['global', '--global'], ['system', '--system'], ['worktree', '--worktree'],
])

/**
 * Which store directories actually hold a `tasks/` dir under `root`.
 *
 * Returns ALL of them, not the first: two stores present is a real state diarie itself treats as an
 * error (`ETWOSTORES`), and a probe that silently picked one would make the loser a file nobody
 * reads and everybody keeps editing.
 *
 * @param {string} root
 * @returns {string[]} store dir names, in `TRACKER_DIRS` order
 */
function trackerDirsIn (root) {
  return TRACKER_DIRS.filter(d => existsSync(join(root, d, 'tasks')))
}

/**
 * @typedef {{
 *   name: string,
 *   mechanism: 'core.hooksPath' | '.git/hooks/',
 *   effect: 'clobbered-by-bd' | 'dormant-rearms-on-unset',
 *   remedy: string
 * }} HookManager
 */

/**
 * @typedef {{
 *   shape: 'hooksPath' | 'git-hooks' | 'none' | 'unknown',
 *   hooksPath: {
 *     value: string | null,
 *     resolved: string | null,
 *     scope: string | null,
 *     isBeads: boolean,
 *     error: string | null
 *   },
 *   shims: string[],
 *   gitHooks: {
 *     dormantBdHooks: string[],
 *     otherGitHooks: string[],
 *     unreadableGitHooks: string[],
 *     error: string | null
 *   },
 *   otherHookManagers: HookManager[],
 *   reArmCommand: string | null,
 *   reArmError: string | null
 * }} HooksProbe
 */

/**
 * @typedef {{
 *   pid: string,
 *   port: string | null,
 *   alive: boolean,
 *   isDolt: boolean,
 *   cwd: string | null,
 *   cwdError: string | null,
 *   cwdInTarget: boolean,
 *   portMatches: boolean,
 *   args: string | null
 * }} DaemonOwner
 */

/**
 * @typedef {{
 *   pidFile: string | null,
 *   pidError: string | null,
 *   portError: string | null,
 *   owned: DaemonOwner | null,
 *   safeToSignal: boolean,
 *   processListError: string | null,
 *   otherDoltProcesses: string[]
 * }} DaemonProbe
 */

/**
 * @typedef {{
 *   beadsDirExists: boolean,
 *   beadsConfigKeys: string[],
 *   configKeysError: string | null,
 *   trackedFiles: string[],
 *   trackedError: string | null,
 *   trackedCount: number | null
 * }} ResidueProbe
 */

/**
 * @typedef {{
 *   root: string,
 *   migration: unknown,
 *   hooks: HooksProbe,
 *   daemon: DaemonProbe,
 *   residue: ResidueProbe
 * }} Probe
 */

/**
 * Is the flat-YAML migration trustworthy enough to disarm bd?
 *
 * `clean` is NOT sufficient and neither is exit 0. An ABSENT store is now an error (ENOSTORE) rather
 * than a cheerful `{clean:true, skipped:true}` — but an EMPTY store still validates clean at exit 0,
 * exactly as it should. So a green validate still proves nothing about whether work was migrated. Only
 * a non-zero task count does — which we get from `diarie stats --json`, the store's OWN authority on
 * its count, rather than by re-parsing its YAML here. `diarie stats` reports an unparseable file as a
 * `warnings[]` entry (the whole file is skipped) instead of crashing, so count + malformed both come
 * from one CLI call. Invoked via `npx --no-install diarie`: this is a READ-ONLY probe, so it must
 * never network-install — `--no-install` uses whatever diarie is locally/globally/cache-resolvable and
 * FAILS FAST when none is (no prompt, no fetch, no hang in a non-TTY spawn). A fail-fast is reported as
 * `verifyFailed` (could-not-determine), NEVER as a `malformed` store — conflating "I couldn't check"
 * with "the store is bad" is the exact can't-determine-vs-determined-bad trap this repo's Reader
 * conventions forbid. (The deliberate migrate action uses `npx -y diarie`; a read-only probe must not.)
 *
 * @param {string} root
 * @param {(root: string) => RunResult} [statsRunner] Injectable diarie-stats runner (default `npx --no-install diarie`); lets a test force CLI-down.
 * @returns {unknown}
 */
export function probeMigration (root, statsRunner = (r) => run('npx', ['--no-install', 'diarie', 'stats', '--json', '--root', r])) {
  const storeDirs = trackerDirsIn(root)
  const trackerDir = storeDirs[0]
  const fileEntries = trackerDir ? readdirIfPossible(join(root, trackerDir, 'tasks')) : []
  // An unlistable `tasks/` used to give `files: []`, hence `storeExists: false` — and
  // `/migrate-tracker`'s precondition IS "no store", so it would migrate a second time over a store
  // nobody could see. "Could not look" is not "not there".
  const filesError = fileEntries === null
    ? `\`${trackerDir}/tasks\` could not be listed (permissions?) — this is NOT an absent store`
    : null
  const files = (fileEntries ?? []).filter(f => /^tasks-.+\.ya?ml$/.test(f))

  // ASK the CLI, do not re-parse the files. A store holding `tasks: []` reports total 0 (correctly
  // NOT trusted); a store with an unparseable file reports total 0 PLUS a warning (malformed → not
  // trusted). No js-yaml, no diarie/schema.
  const stats = statsRunner(root)
  // A UNION, not a flat bag of optionals. diarie's contract is exclusive — an ENOSTORE envelope XOR
  // a stats result — and modelling it as one object with every key optional let the two be read as
  // if both could hold at once. That is not academic: it produced a probe that reported
  // `storeInvisibleToCli: true` and `trusted: true` in the same object, i.e. "the CLI cannot see this
  // store" and "go ahead and disarm bd". Declaring the union is what makes `code === 'ENOSTORE'`
  // narrow `total` away instead of leaving both readable.
  /** @type {{ error: string, code: string } | { total: number, warnings?: string[] } | null} */
  let parsed = null
  try {
    const raw = stats.out ? JSON.parse(stats.out) : null
    // `in` THROWS on a primitive (measured: `'code' in 5` -> TypeError) and BOTH reads below use
    // it — so a CLI that ever printed a bare JSON scalar would take the whole probe down, the same
    // class as the `5042(6` port file. Not reachable against diarie 0.2.x; reachable the day the
    // output shape changes, which is the reasoning the envelope-vs-count note below already
    // applies. Arrays are unaffected: `typeof [] === 'object'` and `'code' in []` is false.
    parsed = raw !== null && typeof raw === 'object' ? raw : null
  } catch { parsed = null }
  const envelope = parsed && 'code' in parsed ? parsed : null
  const statsResult = parsed && 'total' in parsed && !envelope ? parsed : null

  const enostore = envelope?.code === 'ENOSTORE'
  // diarie's own diagnostic, passed through verbatim rather than paraphrased. For a legacy store it
  // already names the path AND the `git mv` to run; re-deriving that in skill prose is how a remedy
  // ends up pointing the wrong way.
  const cliError = envelope?.error ?? null
  // The CLI gave a USABLE answer iff we got a stats object (a numeric total) or a clean ENOSTORE.
  // Anything else — npx could not resolve/run diarie, no network, garbled output — is "could NOT
  // verify", which is NOT "the store is bad". `verifyFailed` keeps them distinct: it forces `trusted`
  // false (never disarm bd on a store we could not check) WITHOUT falsely labelling it malformed.
  //
  // ONE ENOSTORE IS NOT LIKE THE OTHERS. When the probe found a store on disk and the CLI still says
  // ENOSTORE, the two disagree, and the disagreement has a known cause: a CLI too old to recognise
  // the store form it is looking at (diarie <0.3.0 knows only `.diarie/`; the store may be
  // `diarium/` or `.diarium/`). Counting that as a clean answer would report `taskCount: 0` on a
  // store full of work — "absent" rendered as "empty", the exact conflation ENOSTORE exists to
  // delete, wearing a probe's clothes. It is an unreadable store, so: verify FAILED.
  //
  // AN ENVELOPE WINS OVER A COUNT, unconditionally. An earlier form of this read the two as peers —
  // `enostore && !storeInvisibleToCli || typeof parsed?.total === 'number'` — so a payload carrying
  // BOTH an ENOSTORE code and a total took the second disjunct and produced `storeInvisibleToCli:
  // true` together with `trusted: true`: "the CLI cannot see this store" and "go disarm bd", in one
  // object, on the gate that authorises a destructive operation. Not reachable against diarie 0.2.x,
  // whose envelope carries no count — reachable the day it grows one, which is an ordinary thing to
  // add. A probe whose stated principle is "ASK the CLI, do not re-parse the files" must not also
  // assume the CLI's reply shape is disjoint when nothing makes it so.
  const storeInvisibleToCli = enostore && files.length > 0
  const cliAnswered = enostore ? !storeInvisibleToCli : typeof statsResult?.total === 'number'
  const verifyFailed = !cliAnswered
  // `null`, never 0, when the CLI did not answer — per this module's opening contract, an explicit
  // null is "we looked and there is nothing to report", and 0 would be "the store is empty". The
  // JSON path is the one the skill acts on, so the distinction has to live in the DATA; patching it
  // only in the human print left `--json` emitting a bare 0 for a store full of work.
  const taskCount = cliAnswered && typeof statsResult?.total === 'number' ? statsResult.total : null
  // A store diarie DID read but flagged (an invalid-YAML file skipped) is genuinely malformed —
  // only meaningful when the CLI actually answered.
  const malformed = cliAnswered && Array.isArray(statsResult?.warnings) && statsResult.warnings.length > 0

  // `ls-files` reads the INDEX, so a `git add`-ed but never-committed store answered
  // "committed: true" — in a repo with no commits at all. `ls-tree HEAD` asks history.
  // `null` when there was nothing to ask about, NOT a synthesized `{ok: false}`. Manufacturing a
  // failed-run result for a run that never happened is this module's own anti-thesis in miniature —
  // "we never checked" must not be shaped like "we checked and it failed".
  const inHead = trackerDir
    ? run('git', ['-C', root, 'ls-tree', '-r', '--name-only', 'HEAD', '--', `${trackerDir}/tasks`])
    : null
  const committedFiles = inHead?.ok && inHead.out ? inHead.out.split('\n').filter(Boolean) : []

  // Two stores on disk is a real state, and an ambiguous one — diarie itself answers it with
  // ETWOSTORES rather than a precedence rule. Report it instead of resolving it: the caller is
  // deciding whether to disarm bd, and "which of these two is the live backlog" is not a question a
  // read-only probe should answer by picking the first.
  const ambiguousStore = storeDirs.length > 1

  return {
    storeExists: files.length > 0,
    filesError,
    storeDir: trackerDir ?? null,
    storeDirs,
    ambiguousStore,
    // The probe sees a store the installed diarie cannot read. TWO OPPOSITE CAUSES, and the remedy
    // is inverted between them, so a caller must NOT assume one:
    //   - store is `diarium/`|`.diarium/`, CLI predates the rename  -> upgrade diarie
    //   - store is `.diarie/`, CLI is NEWER than the rename         -> rename the store
    // The second is this plugin's DEFAULT case, because `/migrate-tracker` produces `.diarie/`, and
    // diarie now lists `.diarie` in LEGACY_TRACKER_DIRS ("no longer the store, never READ") rather
    // than TRACKER_DIRS. Telling that user to upgrade makes it worse. `storeDir` is what
    // discriminates; `cliError` carries diarie's own wording, which already includes the exact
    // `git mv` to run — better than any remedy re-derived here.
    storeInvisibleToCli,
    cliError,
    files,
    taskCount,
    malformed,
    verifyFailed,
    committed: committedFiles.length > 0,
    committedFiles,
    // The gate: the CLI must have RUN, and the store present, non-empty, clean, committed — and
    // unambiguous. Never disarm bd while it is unclear which store is the real one.
    trusted: !verifyFailed && !ambiguousStore && files.length > 0 && taskCount > 0 &&
      !malformed && committedFiles.length > 0,
  }
}

/**
 * What hook machinery is live, and what happens if we unset `core.hooksPath`?
 *
 * @param {string} root
 * @returns {HooksProbe}
 */
export function probeHooks (root) {
  // `ok: false` HERE IS TWO OPPOSITE THINGS, and this is the site where that mattered most.
  // Measured: `--get` on an unset key exits **1** (a real answer, and the common one), a repo git
  // cannot enter exits **128**, and an absent binary is ENOENT with a null status. Reading it as
  // `raw.ok ? raw.out : null` collapsed all three into `value: null` → `shape: 'none'` → the skill
  // concludes there is no hook machinery to disarm, on a repo where bd's hooksPath is set and
  // stays fully armed. Exit 1 is the ONLY non-zero code that answers the question.
  const raw = run('git', ['-C', root, 'config', '--get', 'core.hooksPath'])
  const hooksPathError = raw.ok || (raw.ran && raw.code === 1) ? null : whyNot('git config', raw)
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
  //
  // CANONICALISE BOTH SIDES. `resolve()` only cleans a path up; it does not follow symlinks. bd
  // writes the canonical absolute path, so reaching the same repo through a symlinked root made
  // the two strings differ, `isBeads` go false and `shape` go 'none' — and the skill's response to
  // `isBeads: false` is "the path belongs to someone else, leave it alone", i.e. bd stays armed on
  // a repo the probe was pointed at deliberately. This suite already knew the lesson from macOS
  // (`tmpdir()` is `/var/…` while `lsof` reports `/private/var/…`) and had only applied it to the
  // TESTS. Fourth outing for this class in this file, after `includes()` on hooksPath,
  // `startsWith(pid)`, and `startsWith(beadsDir)`.
  const resolved = value ? resolve(root, value) : null
  const isBeads = resolved !== null && canonical(resolved) === canonical(resolve(root, '.beads', 'hooks'))

  const shimDir = join(root, '.beads', 'hooks')
  const shims = (existsSync(shimDir) ? readdirIfPossible(shimDir) ?? [] : []).filter(f => BD_HOOKS.has(f))

  // What is sitting in .git/hooks/? Unsetting hooksPath RE-ENABLES all of it — including
  // bd's own hooks, if the repo ever ran `bd hooks install` (Shape B). Disarming Shape A
  // without checking here can leave bd MORE armed than we found it.
  const gitHooksDir = join(root, '.git', 'hooks')
  const gitHooksEntries = existsSync(gitHooksDir) ? readdirIfPossible(gitHooksDir) : []
  const gitHooksError = gitHooksEntries === null
    ? '`.git/hooks/` could not be listed (permissions?) — whether bd hooks sit there is UNKNOWN, and unsetting hooksPath would arm them'
    : null
  const gitHooks = (gitHooksEntries ?? []).filter(f => !f.endsWith('.sample'))
  // THREE buckets, because "could not read it" is not "it is not bd's". This was
  // `try { …includes(BD_MARKER) } catch { return false }`, so an unreadable hook — root-owned,
  // mode-000, or a DIRECTORY named `pre-commit` (EISDIR) — was filed under `otherGitHooks`, which
  // the report prints as "(dormant, re-enabled by unset)" and the skill treats as a restoration.
  // With no other bd hook present, `shape` then flipped `git-hooks` → `none`: the skill concludes
  // there is no hook machinery, and bd's own re-arming hook is left in place. That is verbatim the
  // "a naive disarm can leave bd MORE armed than it found it" failure in this module's header.
  /** @type {string[]} */ const dormantBdHooks = []
  /** @type {string[]} */ const otherGitHooks = []
  /** @type {string[]} */ const unreadableGitHooks = []
  for (const f of gitHooks) {
    /** @type {string | null} */
    let body = null
    try { body = readFileSync(join(gitHooksDir, f), 'utf8') } catch { /* third bucket, below */ }
    if (body === null) unreadableGitHooks.push(f)
    else if (body.includes(BD_MARKER)) dormantBdHooks.push(f)
    else otherGitHooks.push(f)
  }

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

  // `none` is a CLAIM — "there is no hook machinery here" — and the A-vs-B dispatch downstream
  // hangs entirely on the hooksPath answer. With that answer missing, `git-hooks` is no safer a
  // fallback than `none`: choosing Shape B while a live hooksPath may be overriding `.git/hooks/`
  // applies the inverted remedy, the mistake this function's `otherHookManagers` comment already
  // says must not be guessed. So an undetermined hooksPath makes the whole shape undetermined.
  const scopeFlag = scope ? SCOPE_WRITE_FLAGS.get(scope) ?? null : null
  /** @type {string | null} */ let reArmCommand = null
  /** @type {string | null} */ let reArmError = null
  if (value && scopeFlag) {
    reArmCommand = `git -C ${shellQuote(root)} config ${scopeFlag} core.hooksPath ${shellQuote(value)}`
  } else if (value && scope === 'command') {
    reArmError = 'the value came from `git -c` on the command line and was never persisted — there is nothing to re-arm'
  } else if (value) {
    reArmError = 'the config SCOPE could not be determined (`git config --show-scope` needs git >= 2.26), and re-arming at a guessed scope would write the wrong file'
  }

  /** @type {'hooksPath' | 'git-hooks' | 'none' | 'unknown'} */
  let shape = 'none'
  if (hooksPathError) shape = 'unknown'
  else if (value && isBeads) shape = 'hooksPath'
  else if (dormantBdHooks.length) shape = 'git-hooks'
  // An unreadable hook COULD be bd's — the one it would be is `pre-commit`, which re-spawns the
  // daemon. `none` here would be a claim the read never supported.
  else if (unreadableGitHooks.length || gitHooksError) shape = 'unknown'

  return {
    shape,
    hooksPath: { value, resolved, scope, isBeads, error: hooksPathError },
    shims,
    gitHooks: { dormantBdHooks, otherGitHooks, unreadableGitHooks, error: gitHooksError },
    otherHookManagers: managers,
    // The exact re-arm command, so nobody guesses a relative path — scope-bearing and
    // shell-escaped. `null` rather than a scope-less guess when we cannot name the scope: a
    // command that restores at the WRONG scope is worse than none, because it looks like it worked.
    reArmCommand,
    reArmError,
  }
}

/**
 * Is a daemon live, and is it *this target's*?
 *
 * A pid whose `comm` is `dolt` may belong to ANOTHER repo — which is the exact hazard
 * pid-reuse creates. Require the process args to name this target's own `.beads`.
 *
 * @param {string} root
 * @returns {DaemonProbe}
 */
export function probeDaemon (root) {
  const pidFile = join(root, '.beads', 'dolt-server.pid')
  const portFile = join(root, '.beads', 'dolt-server.port')
  const pidFilePresent = existsSync(pidFile)
  const rawPid = pidFilePresent ? readIfPossible(pidFile) : null
  const rawPort = existsSync(portFile) ? readIfPossible(portFile) : null
  // Only ever trust digits. A half-dead daemon can leave a truncated port file, and that
  // string used to be interpolated straight into `new RegExp` — `5042(6` threw
  // "Unterminated group" and took the WHOLE probe down, migration gate and all.
  const pid = rawPid && /^\d+$/.test(rawPid) ? rawPid : null
  const port = rawPort && /^\d+$/.test(rawPort) ? rawPort : null
  // REPORT WHAT WAS DROPPED, naming the consequence — the house rule every other drop in this
  // file now follows. A bare `pid ?` in the report was the whole diagnosis. And the consequence
  // is not cosmetic: with `pid` null the `others` filter below excludes nothing, so THE TARGET'S
  // OWN DAEMON gets printed under "other dolt process (do not touch)".
  /** @type {string | null} */
  let pidError = null
  if (pidFilePresent && rawPid === null) {
    pidError = 'the pid file exists but could not be read (permissions?) — no daemon can be identified from it'
  } else if (pidFilePresent && pid === null) {
    pidError = `the pid file holds \`${rawPid}\`, which is not a pid — no daemon can be identified from it`
  }
  const portError = rawPort !== null && port === null
    ? `the port file holds \`${rawPort}\`, which is not a port — corroboration unavailable (it is not the ownership test)`
    : null

  // CANONICAL, like the hooksPath comparison. `lsof` reports a REAL path while `resolve()` only
  // cleans one up, so a root reached through a symlink made `cwdInTarget` false and the target's own
  // daemon un-stoppable. Fourth outing for this class, and the one function that authorises SIGTERM.
  // It fails CLOSED (a missed daemon, never a wrong kill), which is why it outlived the hooks fix —
  // and both daemon fixtures called `realpathSync` first, normalising away the very condition.
  const beadsDir = canonical(resolve(root, '.beads'))

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
    // UNCHECKED, and it read as a determination. `lsof` absent produced `out: ''` → `cwd: null` →
    // `cwdInTarget: false` → the report's "NOT proven to be this target's dolt", which is the same
    // sentence a process PROVEN to live elsewhere gets. It fails in the safe direction, which is
    // exactly why it survived — but the one predicate authorising a SIGTERM must be able to say it
    // could not look. `complete`, not `ok`: lsof legitimately exits non-zero for a dead pid.
    const cwdRun = run('lsof', ['-p', pid, '-a', '-d', 'cwd', '-Fn'])
    const cwdError = cwdRun.complete ? null : whyNot('lsof', cwdRun)
    const cwdOut = cwdRun.complete ? cwdRun.out : ''
    const cwdLine = cwdOut.split('\n').find(l => l.startsWith('n'))?.slice(1) ?? null
    // BOUNDARY-ANCHORED, and it must be. A bare `startsWith(beadsDir)` also matched
    // `.beads-backup/`, `.beads2/` and `.beadsX/` — measured — so a daemon belonging to a SIBLING
    // directory satisfied the one predicate that authorises SIGTERM. Third time this exact class has
    // bitten this file: `includes()` on hooksPath claimed another repo's `.beads/hooks`, and
    // `line.startsWith(pid)` let our pid 4443 hide a different daemon at 44430. A prefix test needs
    // a terminator or it is a substring test wearing a path's clothes.
    const cwd = cwdLine ? resolve(cwdLine) : null
    const cwdInTarget = Boolean(cwd && (cwd === beadsDir || cwd.startsWith(beadsDir + sep)))
    const portMatches = Boolean(port && new RegExp(String.raw`-P\s+${port}\b`).test(args.out))

    owned = { pid, port, alive, isDolt, cwd: cwdLine, cwdError, cwdInTarget, portMatches, args: alive ? args.out : null }
  }

  // Parse the pid FIELD; `line.startsWith(pid)` was a prefix match, so our pid 4443
  // silently hid a genuinely different daemon at 44430 from the do-not-touch list.
  //
  // ALSO UNCHECKED, and this one fails OPEN: a truncated or absent `ps` yields a SHORT
  // "do not touch" list presented as the complete one — a false all-clear about the whole
  // machine, on the list whose entire purpose is to stop someone killing a stranger's daemon.
  const psRun = run('ps', ['ax', '-o', 'pid=,args='])
  const processListError = psRun.ok ? null : whyNot('ps ax', psRun)
  const all = psRun.out.split('\n')
    .map(l => l.trim())
    .filter(l => /dolt\s+sql-server/i.test(l))
  const others = all.filter(l => (l.split(/\s+/)[0] ?? '') !== pid)

  return {
    pidFile: pidFilePresent ? pidFile : null,
    pidError,
    portError,
    owned,
    // Whatever we DID see is still reported — a partial list is useful, a partial list
    // silently labelled complete is not.
    processListError,
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
 * @returns {ResidueProbe}
 */
export function probeResidue (root) {
  // The LAST `.ok`-checked-but-ambiguous read. Measured: `--get-regexp` exits 1 for no match (a
  // real answer, and the common one) and 128 when git cannot ask — both of which produced `[]`, so
  // bd's `beads.*` config survived a de-integration the skill reported as complete. Same split as
  // `git config --get` above; same shape as `trackedError` three lines below.
  const cfg = run('git', ['-C', root, 'config', '--local', '--get-regexp', '^beads\\.'])
  const configKeysError = cfg.ok || (cfg.ran && cfg.code === 1) ? null : whyNot('git config --get-regexp', cfg)
  const keys = cfg.ok && cfg.out ? cfg.out.split('\n').filter(Boolean) : []

  const beadsDir = join(root, '.beads')
  // UNCHECKED, and it caused the harm this module's git-availability check was once meant to
  // announce: without git, every git-derived answer degrades to a benign-looking DEFAULT rather
  // than an error. Here that was `out: ''` → `trackedCount: 0` → the report's "nothing tracked",
  // from which the skill concludes `rm -rf .beads/` merely frees disk — while the store may be
  // fully tracked and the deletion would stage every file. `ok` is the right gate: `ls-files`
  // exits 0 with empty output when the pathspec matches nothing (a real answer) and 128 outside
  // a repo (not one).
  //
  // This site, plus `configKeysError` above and `hooksPath.error`, is what discharged that
  // obligation — which is why `probe()` no longer carries a `gitAvailable` flag. Measured both
  // ways: git absent from PATH fires all three; git present outside a repo fires this one and
  // `configKeysError` (exit 128), while `hooksPath.error` stays null because `--get` on an unset
  // key exits 1, a legitimate answer. A whole-process flag said less than any of them and, being
  // read by nobody, said it nowhere.
  const tracked = run('git', ['-C', root, 'ls-files', '.beads'])
  const trackedError = tracked.ok ? null : whyNot('git ls-files', tracked)
  const trackedFiles = tracked.ok && tracked.out ? tracked.out.split('\n').filter(Boolean) : []

  let size = null
  try { size = existsSync(beadsDir) ? statSync(beadsDir).isDirectory() : false } catch { /* ignore */ }

  return {
    beadsDirExists: Boolean(size),
    beadsConfigKeys: keys,
    configKeysError,
    trackedFiles,
    trackedError,
    // Load-bearing for the report: deleting .beads/ would stage THESE as deletions. `null`, never
    // 0, when we could not ask — same contract as `taskCount` above, for the same reason: 0 is a
    // claim ("nothing is tracked") and this path has no basis for making it.
    trackedCount: trackedError ? null : trackedFiles.length,
  }
}

/**
 * @param {string} root
 * @returns {Probe}
 */
export function probe (root) {
  // NO `gitAvailable` FLAG. It was computed here to announce that without git every git-derived
  // answer degrades to a benign-looking DEFAULT — and nothing ever read it, so the announcement
  // never happened. The obligation is now discharged where the harm occurs, per-fact and by name:
  // `residue.trackedError`, `residue.configKeysError`, `hooks.hooksPath.error`. Measured, both
  // failure modes: git absent from PATH fires all three; git present outside a repo fires two.
  // A process-wide boolean carried strictly less than the markers that replaced it.
  return {
    root,
    migration: probeMigration(root),
    hooks: probeHooks(root),
    daemon: probeDaemon(root),
    residue: probeResidue(root),
  }
}

// --- CLI -------------------------------------------------------------------

if (argv[1] && fileURLToPath(import.meta.url) === argv[1]) main()

/**
 * The CLI. A FUNCTION, so the `--json` branch can `return` instead of `exit()`.
 *
 * `process.exit()` terminates without draining a pending stdout write, and stdout is a PIPE
 * whenever this is spawned — which is always, since the skill captures the output. Measured
 * 2026-07-29: the cut is at exactly **65536 bytes**, one pipe buffer, not "only huge payloads".
 * Reproduced end-to-end with 1200 real tracked files under `.beads/dolt/noms/` (Dolt's own chunk
 * layout, an entirely ordinary size for the repos this tool exists for): 65534 bytes of stdout,
 * `JSON.parse` throwing `Unterminated string`, and **exit status 0**.
 *
 * `trackedFiles` and `otherDoltProcesses` are both unbounded arrays, so the payload is not
 * self-limiting. This fails LOUD — truncated JSON has unbalanced braces, so a caller's parse
 * throws rather than yielding a partial verdict — which is the only reason it is not ranked with
 * the destructive-direction defects. It is still the same family as diarie's founding bug, where
 * an `exit(2)` truncated the JSON and a broken store read as an empty one.
 */
function main () {
  // `allowPositionals: false`. It was `true`, and NOTHING READ THE POSITIONALS — so
  // `beads-probe.mjs <other-repo>` silently probed the CWD and printed a verdict about THIS
  // repo under a heading naming a different one. Measured: pointed at an empty directory it
  // announced `migration TRUSTED — 85 task(s)`. The skill's mutations are all correctly pinned
  // with `git -C <target>`, so the hazard is not a mis-aimed write; it is that every DECISION
  // authorising those writes came from the wrong repository. Rejecting the argument is the whole
  // fix — a bare path is the shape every other CLI here accepts, so it must fail loudly rather
  // than be silently reinterpreted as "no --root given".
  const { values } = parseArgs({
    allowPositionals: false,
    options: { root: { type: 'string' }, json: { type: 'boolean', 'default': false } },
  })
  const root = resolve(values.root ?? cwd())
  const result = probe(root)

  if (values.json) {
    stdout.write(JSON.stringify(result, null, 2) + '\n')
    return
  }

  const { daemon, hooks, migration, residue } = result
  stdout.write(`beads probe: ${root}\n\n`)

  stdout.write(`migration ${migration.trusted ? 'TRUSTED' : 'NOT TRUSTED — do not disarm bd'}\n`)
  // NEVER print a bare `taskCount` when the CLI could not read the store. `0 task(s)` next to
  // `1 file(s)` is "absent rendered as empty" — the conflation this probe's own comments say it
  // exists to delete, reappearing on the path a human actually reads (`--json` is opt-in).
  const countText = migration.taskCount === null ? 'task count UNKNOWN' : `${migration.taskCount} task(s)`
  const whereText = migration.storeDir ? `in ${migration.storeDir}` : 'no store directory'
  stdout.write(`  store: ${migration.files.length} file(s) ${whereText}, ${countText}, committed=${migration.committed}\n`)
  if (!migration.trusted) {
    // Derive the reason from the conjuncts that ACTUALLY failed. The old line hardcoded three
    // causes and listed them unconditionally, so after `ambiguousStore` joined the gate a user could
    // read "absent, EMPTY, or uncommitted" directly under a line proving the store was present,
    // non-empty and committed — every offered explanation contradicted, and the real one absent.
    /** @type {string[]} */
    const reasons = []
    if (migration.ambiguousStore) {
      reasons.push(`TWO stores on disk (${migration.storeDirs.join(', ')}) — which one is live is not this probe's call to make`)
    }
    if (migration.storeInvisibleToCli) {
      // Which way the fix points depends on WHICH store form is on disk — see the note on
      // `storeInvisibleToCli` above. Never emit a bare "upgrade diarie".
      const remedy = migration.storeDir === '.diarie'
        ? 'the CLI is NEWER than the store name — `.diarie/` is diarie\'s legacy name and is no longer read; rename the store'
        : 'the CLI predates this store name — upgrade diarie'
      reasons.push(`the installed diarie cannot read a \`${migration.storeDir}\` store: ${remedy}, then re-probe`)
      if (migration.cliError) reasons.push(`  diarie said: ${migration.cliError}`)
    } else if (migration.verifyFailed) {
      reasons.push('diarie could not be RUN to check the store (offline / unresolvable) — this is NOT a verdict on the store')
    }
    // Two DIFFERENT absences, and saying "no store found" for both is how a user with a real
    // directory reads a line that contradicts the one above it.
    if (!migration.storeDir) reasons.push('no store directory found')
    else if (!migration.files.length) reasons.push(`\`${migration.storeDir}/tasks/\` exists but holds no \`tasks-*.yml\``)
    else if (migration.taskCount === 0) reasons.push('the store is EMPTY')
    if (migration.filesError) reasons.push(migration.filesError)
    if (migration.malformed) reasons.push('diarie read the store but reported warnings')
    if (migration.files.length && !migration.committed) reasons.push('the store is UNCOMMITTED')
    for (const r of reasons) stdout.write(`  ! ${r}\n`)
  }

  stdout.write(`\nhooks: shape=${hooks.shape}\n`)
  // `shape=none` prints as reassurance; `shape=unknown` must not be allowed to read the same way.
  if (hooks.hooksPath.error) {
    stdout.write(`  ! core.hooksPath UNDETERMINED — ${hooks.hooksPath.error}\n`)
    stdout.write('    this is NOT "no hook machinery": bd may be armed via hooksPath and would stay armed\n')
  }
  if (hooks.hooksPath.value) {
    stdout.write(`  core.hooksPath = ${hooks.hooksPath.value}\n`)
    stdout.write(`    scope=${hooks.hooksPath.scope} isBeads=${hooks.hooksPath.isBeads}\n`)
    // `scope: null` used to take this branch and print a DETERMINATE claim about where the value
    // lives. The scope-inference this function rejected was rejected precisely because an agent
    // told "not local" reaches for `--global --unset` and deletes the user's unrelated global
    // hooksPath — and the null case reintroduced exactly that. Unknown is its own branch now.
    if (hooks.hooksPath.scope === null) {
      stdout.write('    ! scope UNKNOWN — do NOT guess one to unset at; `--global --unset` would clear an unrelated global hooksPath\n')
    } else if (hooks.hooksPath.scope !== 'local') {
      stdout.write(`    ! scope is ${hooks.hooksPath.scope} — \`--local --unset\` CANNOT clear this; unset at \`--${hooks.hooksPath.scope}\`\n`)
    }
    if (hooks.reArmCommand) stdout.write(`  re-arm: ${hooks.reArmCommand}\n`)
    else stdout.write(`  ! NO re-arm command — ${hooks.reArmError}\n`)
  }
  if (hooks.shims.length) stdout.write(`  shims: ${hooks.shims.join(', ')}\n`)
  if (hooks.gitHooks.dormantBdHooks.length) {
    stdout.write(`  ! .git/hooks/ holds bd hooks that would RE-ARM on unset: ${hooks.gitHooks.dormantBdHooks.join(', ')}\n`)
  }
  if (hooks.gitHooks.otherGitHooks.length) {
    stdout.write(`  .git/hooks/ (dormant, re-enabled by unset): ${hooks.gitHooks.otherGitHooks.join(', ')}\n`)
  }
  // Not listed with the others: filing these under "theirs" is what let bd's own hook pass as a
  // third party's, and unsetting hooksPath re-enables them either way.
  if (hooks.gitHooks.error) stdout.write(`  ! ${hooks.gitHooks.error}\n`)
  if (hooks.gitHooks.unreadableGitHooks.length) {
    stdout.write(`  ! .git/hooks/ files that could NOT be read: ${hooks.gitHooks.unreadableGitHooks.join(', ')}\n`)
    stdout.write('    whether these are bd\'s is UNKNOWN; unsetting hooksPath arms them regardless\n')
  }
  for (const m of hooks.otherHookManagers) {
    stdout.write(`  hook manager ${m.name} [${m.mechanism}] → ${m.effect}\n    remedy: ${m.remedy}\n`)
  }

  stdout.write('\ndaemon\n')
  if (!daemon.pidFile) stdout.write('  no .beads/dolt-server.pid — nothing to stop from a pid file\n')
  else if (daemon.safeToSignal) stdout.write(`  pid ${daemon.owned.pid} — cwd is ${daemon.owned.cwd} → this target's dolt, safe to SIGTERM\n`)
  else stdout.write(`  pid ${daemon.owned?.pid ?? '?'} NOT proven to be this target's dolt — do NOT signal it\n`)
  if (daemon.pidError) {
    stdout.write(`  ! ${daemon.pidError}\n`)
    stdout.write('    so the list below cannot exclude it: one of those may be THIS target\'s daemon\n')
  }
  if (daemon.portError) stdout.write(`  ! ${daemon.portError}\n`)
  // "could not look" and "looked, it lives elsewhere" both reach the line above. Only one of them
  // is a finding about the daemon; the other is a finding about this machine.
  if (daemon.owned?.cwdError) stdout.write(`    ! ownership UNDETERMINED, not disproven — ${daemon.owned.cwdError}\n`)
  for (const o of daemon.otherDoltProcesses) stdout.write(`  other dolt process (do not touch): ${o}\n`)
  // An absent warning here would mean "no other dolt daemons on this machine" — which is exactly
  // what a truncated or unrunnable `ps` looks like.
  if (daemon.processListError) {
    stdout.write(`  ! the other-dolt-process list is INCOMPLETE — ${daemon.processListError}\n`)
    stdout.write('    treat the list above as a lower bound; another repo\'s daemon may be running\n')
  }

  stdout.write('\nresidue\n')
  for (const k of residue.beadsConfigKeys) stdout.write(`  git config: ${k}\n`)
  // An empty list reads as "no config residue", and the skill clears exactly what is listed.
  if (residue.configKeysError) {
    stdout.write(`  ! beads.* git config keys UNKNOWN — ${residue.configKeysError}\n`)
    stdout.write('    this is NOT "no config residue"; bd config may survive the de-integration\n')
  }
  // NEVER print a bare 0 here. "0 file(s) — nothing tracked" is what an unrunnable `git` produced,
  // and it is the sentence the skill turns into "`rm -rf .beads/` merely frees disk" — the exact
  // benign-looking default the per-fact `*Error` markers exist to keep off the page.
  if (residue.trackedError) {
    stdout.write(`  .beads/ tracked in git: UNKNOWN — ${residue.trackedError}\n`)
    stdout.write('    ! do NOT read this as "nothing tracked" — deleting .beads/ may stage deletions\n')
  } else {
    stdout.write(`  .beads/ tracked in git: ${residue.trackedCount} file(s)`)
    stdout.write(residue.trackedCount ? ' — deleting .beads/ would stage these as deletions\n' : ' — nothing tracked\n')
  }
}
