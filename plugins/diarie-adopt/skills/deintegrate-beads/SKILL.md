---
name: deintegrate-beads
description: "De-integrate beads (bd) from a project after its tracker has been migrated. Use when the user says 'remove beads', 'uninstall bd', 'get rid of beads', 'clean up beads', 'de-beads', 'beads is still hooked in', or asks what beads left behind. Runs AFTER /migrate-tracker, once the flat-YAML store is trusted. It disarms beads' machinery — git hooks, the Dolt daemon, git config, injected CLAUDE.md blocks and Claude hooks — and NEVER deletes `.beads/` or any data."
argument-hint: "[path-to-project]"
user-invocable: true
paths:
  - ".beads/**"
allowed-tools:
  - Bash
  - Read
  - Edit
  - Grep
  - AskUserQuestion
---

# De-integrate Beads

Takes beads' hands off a project that has already migrated to the flat-YAML
tracker. **This is a de-integration tool, not a deletion tool** — it disarms the
machinery and leaves every byte of data where it is. That is why it is safe to
run, and why it is deliberately *not* called "remove".

**Why a separate skill.** `/migrate-tracker` deliberately leaves `.beads/` alone —
its job is to move the *work*, and leaving the old tracker readable is what makes
the cutover safe to attempt. But it also leaves the *live machinery*, which keeps
acting on the repo long after the tracker is dead:

- **`bd` installs git hooks and hides them.** It sets `git config core.hooksPath`
  → `<abs>/.beads/hooks`, so `.git/hooks/` looks pristine while five shims
  (`pre-commit`, `post-merge`, `pre-push`, `post-checkout`, `prepare-commit-msg`)
  intercept every git operation. `pre-commit` shells out to `bd` and
  **propagates its exit code** (300 s timeout). In vp-beads' own repo, every commit
  was still routing through the dead binary weeks after the migration.
- **A `dolt sql-server` daemon per repo**, which outlives the session and orphans
  itself (upstream `#4282`).
- **Injected instructions**: `bd setup claude` writes a managed block into
  `CLAUDE.md`/`AGENTS.md` and `SessionStart` hook entries into
  `.claude/settings.json`.

The failure mode is not "a doc is stale" — it is "commits start failing", quietly,
on a tool nobody is maintaining any more.

> **Pin every command to the target.** This skill takes a `[path-to-project]` and
> mutates **git config, running processes, and another repo's `CLAUDE.md`**. Use
> `git -C <target>` on every git call and prefix every path with `<target>/`. An
> unpinned `git config --unset core.hooksPath` run from *this* repo de-integrates
> *this* repo — silently, and while reporting success on the other one. When no
> path is given, `<target>` is the current project; say which one you are about to
> act on before you act.

**What it never does:** delete `.beads/`, uninstall the binary, or touch anything
outside the project. Those are the user's calls, and workflow 5 (Report what is
left) tells them exactly how.

## Cross-skill boundaries

`/migrate-tracker` moves the work and leaves bd standing. `/deintegrate-beads`
runs afterwards and takes bd's hands off the wheel. Neither deletes data.

Like `/migrate-tracker`, this skill is **exempt** from the tiering in CLAUDE.md
`### Files-availability convention`: its precondition is a *present, committed*
tracker plus a *present* `.beads/`, which is the inverse of a degradation.

## Prerequisites

**All detection is done by `scripts/beads-probe.mjs` — a read-only probe. Do not
re-derive it in prose.** Every check it performs was a prose bug first, and every one
of those bugs failed *silently while reporting success*. The probe is tested
(`npm run check` → `check:beads-probe`); prose is not.

```bash
node "$CLAUDE_PLUGIN_ROOT/scripts/beads-probe.mjs" --root <target>          # human
node "$CLAUDE_PLUGIN_ROOT/scripts/beads-probe.mjs" --root <target> --json   # to act on
```

The probe imports **no** npm packages — it shells out to `npx diarie` for the migration check — so it
always runs, even from a marketplace plugin cache with no `node_modules` (it no longer crashes with
`ERR_MODULE_NOT_FOUND`). If diarie itself is not resolvable (offline, no npx cache), the probe reports
`migration.verifyFailed: true` — see the verify gate in workflow 1 (Probe, verify, and confirm the whole plan), step 3.

## Workflows

### 1. Probe, verify, and confirm the whole plan

**Everything destructive is gated here.** The later workflows only *execute* what the
user approves in this one.

1. Run the probe (`--json`) against `<target>`.
2. **`residue.beadsDirExists` must be `true`, or STOP** — there is no beads to
   de-integrate. Without this check the whole skill runs as a chain of no-ops and
   reports a cleanup that never happened.
3. **`migration.trusted` must be `true`, or STOP** and point at `/migrate-tracker`.
   It requires all of: the store exists, it holds **at least one task**, it is **committed**, and
   the check actually **ran** (`migration.verifyFailed` is `false`). Disarming bd against a store
   that fails any of these leaves the project with **neither** tracker.

   **Distinguish the STOP reason.** `migration.verifyFailed: true` means diarie could not be *run*
   to check the store (offline / unresolvable) — that is *unverified*, NOT *a bad store*. Say which,
   so the user fixes the right thing: make diarie runnable and re-probe, versus finish the migration.
   Never conflate "I couldn't check" with "the store is untrustworthy".

   **`diarie validate` cannot substitute for this gate, even now.** A missing store is
   an error today (`ENOSTORE`, non-zero exit) — that half is fixed. But a store that
   exists and holds `tasks: []` is *legitimately* `clean` at exit 0, and rightly so: an
   empty backlog is a valid state. So `clean` proves the store is **well-formed**, never
   that the migration actually moved anything into it. Hence the probe counts tasks
   rather than trusting `clean` — see `scripts/beads-probe.mjs`, where this reasoning is
   pinned in the code.
4. **Show the full destructive plan and confirm once** (a single `AskUserQuestion`,
   `header: "Cleanup"`). The user consented to "de-integrate beads", not to a
   particular set of edits in a repo they may not even have open. Show:
   - the exact `core.hooksPath` value to be unset, its scope, and the **re-arm command**
     the probe printed (`hooks.reArmCommand`) — verbatim; bd stores an *absolute* path
     and a guessed relative one will not restore it
   - the pid to be signalled, and the `ps` line proving it is *this* target's daemon
   - any hook files to be stripped, and the `beads.*` config keys to be cleared
   - anything the probe flagged under `hooks.otherHookManagers` or
     `hooks.gitHooks.dormantBdHooks` (see workflow 2 (Disarm the git hooks))

### 2. Disarm the git hooks

**Before stopping the daemon.** The armed `pre-commit` shim runs `bd hooks run
pre-commit`, and any `bd` command that touches the database **re-spawns `dolt
sql-server`** — so a daemon stopped first simply comes back on the user's very next
commit, including the one recording this cleanup.

Act on `hooks` from the probe.

**Shape A (`hooks.shape == "hooksPath"`)** — what `bd init` does by default.

1. **`hooks.hooksPath.scope` must be `local`.** If it is not, `git config --local
   --unset` **cannot clear it** — and `--unset` exits 5 either way, so treating exit 5
   as a benign no-op would leave the hooks armed while reporting success. Unset at the
   scope the probe reports, or stop and tell the user.
2. If `hooks.hooksPath.isBeads` is `false`, the path belongs to someone else (husky,
   lefthook, their own `hooks/`). **Leave it alone and say so.**
3. `git -C <target> config --local --unset core.hooksPath`.
4. **Re-poll and prove it.** `git -C <target> config --show-origin --get
   core.hooksPath` must now print nothing containing `.beads`. Nothing else in this
   skill proves its own effect; this does.

**Then handle what the unset just re-enabled** — bd's hooksPath was overriding
`.git/hooks/` *entirely*, so everything there was dormant and now fires:

- **`hooks.gitHooks.dormantBdHooks`** — bd's own hooks, sitting in `.git/hooks/` from
  an earlier `bd hooks install`. **Unsetting ARMS them.** Run the Shape-B strip on each
  before declaring the hooks disarmed, or the skill ends with bd *more* armed than it
  found it.
- **`hooks.gitHooks.otherGitHooks`** — third-party hooks that start firing again. List
  them; that is a restoration, not a break.
- **`hooks.otherHookManagers`** — read the probe's `effect` field, because **the remedy
  inverts**:
  - `clobbered-by-bd` (**husky** — its mechanism *is* `core.hooksPath`): bd overwrote
    their setting on install, so unsetting leaves them with no hook manager. **Tell them
    to re-run their installer** (`npx husky`, or `npm install` to re-run `prepare`).
    **Never hand-write a `core.hooksPath`** — husky v8 uses `.husky`, v9 uses `.husky/_`,
    and a guess is a fresh silent breakage introduced by a cleanup tool.
  - `dormant-rearms-on-unset` (**lefthook**, **pre-commit**): these install into
    `.git/hooks/` and were merely suppressed. Unsetting *restores* them. **Nothing to do.**

**Shape B (`hooks.shape == "git-hooks"`)** — hooks written into `.git/hooks/`. Each is
wrapped in `# --- BEGIN BEADS INTEGRATION <version> ---` … `# --- END … ---`.

**The marker is version-stamped, and the stamp records the bd version that *installed*
the hook — not the one installed now.** (This repo runs bd 1.1.0 with a `v1.0.3` marker
on disk.) Match the **prefix**; a literal `v1.0.3` silently strips nothing.

**Strip the marked block; do not delete the file** — a project may wrap its own content
around bd's. Delete (`rm -f`) only if nothing but a shebang remains.

**Do not use `bd hooks uninstall`.** Its own `--help` says it removes hooks "from
`.git/hooks/`" — so it cannot clean Shape A, the default. More generally: do not ask a
binary whose writes are broken to uninstall itself.

**Both shapes:** clear the `beads.*` keys the probe listed
(`git -C <target> config --local --unset <key>`), then re-poll to prove they are gone.

### 3. Stop the daemon

Now that the hooks are disarmed, nothing will re-spawn it.

1. **`daemon.safeToSignal` must be `true`.** The probe proves the pid is a live `dolt`
   process **belonging to this target** by matching `.beads/dolt-server.port` against
   the `-P <port>` in its args. A `comm`-only check is not enough: on a machine where
   *every* repo's beads broke at once, the process most likely to have inherited a
   reused pid **is a sibling repo's dolt daemon**. If `safeToSignal` is false — including
   when there is no pid file at all — **do not signal anything**; say so and move on.
2. **`kill <pid>` (SIGTERM). Then poll `kill -0 <pid>` about ten times, one second
   apart.** The daemon holds `.beads/dolt/` — the entire issue history — open. **Never
   `kill -9`**: a SIGKILL can corrupt the Dolt store, destroying the very archive this
   skill's never-delete invariant exists to protect.
3. **If it survives, leave it running and report that.** An orphaned daemon is a
   nuisance; a corrupt store is unrecoverable. Carry this outcome into workflow 5
   (Report what is left) — do not report "no daemon" when one is still up.
4. **`daemon.otherDoltProcesses`** — report them with their pids and **do not touch
   them**. They belong to other repos.

### 4. De-colonize the docs and Claude config

Absent in a project that never ran `bd setup claude`; present in one that did. This
rides the confirmation taken in workflow 1 (Probe, verify, and confirm the whole plan).

1. **`CLAUDE.md` / `AGENTS.md`** — do not assume the marker exists.
   `grep -n 'BEADS INTEGRATION' <target>/CLAUDE.md <target>/AGENTS.md`, **show the
   matched block**, then strip only between `BEGIN` and `END`. **Never regex-guess at
   surrounding prose.** If the grep finds nothing, **say it found nothing** — do not
   report the docs de-colonized.
2. **Back up before editing JSON**: `cp -f <file> <file>.bak`. There is otherwise
   nothing to restore from — `.claude/settings.local.json` is gitignored by convention,
   so a git checkout will not save you.
3. **`.claude/settings.json`** — remove bd's `SessionStart`/`PreCompact` hook entries
   (they run `bd prime`). Edit the JSON directly; do not trust the broken binary's own
   `--remove`. **`.claude/settings.local.json`** — prune `Bash(bd …)` permission entries.
4. **Validate each edit twice.** `jq . <file> >/dev/null` proves *syntax* — but an edit
   that drops the whole `hooks` key also parses fine. So also assert **the bd entries are
   gone AND the sibling entries survived**. On any failure, restore from the `.bak` and
   report. A corrupt `settings.json` silently disables the target's *entire* Claude Code
   config.
5. **Doc-grep, then report.** Sweep the target for `\bbd\b` across `CLAUDE.md`,
   `AGENTS.md`, `README.md` and `.claude/`. Report what prose still instructs the agent
   to use bd; **do not mass-rewrite it.** The grep is the authority on scope; an assumed
   edit list is not.

6. **Then grep for the BEHAVIOURAL residue, which the sweep above structurally cannot
   find.** bd's deepest mark on a project is not the string `bd`; it is a *habit* written
   in prose that never names the tool. The canonical one is a **blanket ban on the agent's
   own task list**:

   ```bash
   grep -rniE 'markdown TODO|ad-hoc task list|do not use .*task list|TodoWrite' \
     <target>/CLAUDE.md <target>/AGENTS.md <target>/.claude/
   ```

   **A `\bbd\b` sweep returns nothing for it** — the sentence contains no `bd` — so a
   de-integration that greps only the command name reports the docs clean while the ban
   keeps steering every future session toward a tracker that is gone. This is the same
   blindness CLAUDE.md's own `### Doc-grep the VOCABULARY, not just the command name`
   describes, one level up: from data vocabulary to *behavioural* vocabulary.

   **Report it; offer the seam; do not impose it.** The ban is usually wrong (Claude
   Code's built-in tracker is *ephemeral* — it complements a durable file-backed tracker
   rather than competing with it; see the vp-beads decision `vp-beads-tdo` in the vp-skills
   repo root's `.diarie/decisions/` — this plugin ships no store of its own), but it is the
   target project's call, and a skill that silently
   rewrites a user's operating instructions is doing the very thing it was invoked to undo.
   Show the matched lines and the one-line replacement rule:

   > An ephemeral todo may never be the ONLY home of a commitment. If it must outlive the
   > session, it belongs in the tracker.

   **We shipped this bug ourselves**, which is why it is written down: vp-beads' own
   cutover commit — the one whose stated job was retargeting the operating instructions
   *off* bd — carried the ban forward and **broadened** it. Nobody had to colonize us; the
   convention was absorbed and then renewed by the very commit meant to remove it.

### 5. Report what is left (touch nothing)

- **What `rm -rf .beads/` would actually do** — use `residue.trackedCount` from the
  probe, which is `git ls-files .beads`. **Not** `check-ignore`: not-ignored is not the
  same as tracked, and bd's own `.beads/.gitignore` ignores *contents* while leaving
  `config.yaml` and `metadata.json` **tracked**. So in a stock bd project, deleting
  `.beads/` **stages file deletions in git** — it does not merely free disk. (vp-beads
  looks otherwise only because its *own* root `.gitignore` adds a blanket rule.)
- **What is in `.beads/`**: the Dolt database (all issue history), the `bd remember`
  memory store (**unreadable on 1.1.0** — same write-gate), and `.beads-credential-key`
  (a per-machine federation key that must never be committed).
- **State the inertness truthfully, from what actually happened.** "No hooks, no daemon"
  is a claim, not a template: if the daemon survived SIGTERM in workflow 3 (Stop the
  daemon), **say it is still running.** And even a stopped daemon returns the moment
  anyone runs `bd` in that repo again.
- **Machine-global leftovers** — name them, give the command, and state plainly that this
  skill did **not** touch them:
  - the binary — `brew uninstall beads`
  - `Bash(bd …)` permission entries in `~/.claude/settings.json`, **and** any global
    `bd prime` SessionStart hook there (`bd setup claude --global` installs one — a user
    can finish this skill, be told the project is inert, and still have `bd prime` fire
    in *every* repo)
  - `~/.beads/` — **`ls` it and report what is there.** Do not assume its contents and do
    not recommend deleting it: a skill whose thesis is "I never delete anything" has no
    business advising deletion of a path it has not inspected.

## Guidelines

- **Never delete `.beads/`, and never offer to.** The whole reason this skill is safe
  to run is that it cannot lose data. Deletion is a separate, manual decision the user
  makes with full sight of what is in there.
- **Everything here is reversible** — but only if you captured the *exact* old
  `core.hooksPath`. Report it verbatim; a guessed relative path will not restore what
  bd set.
- **Check before you unset.** `core.hooksPath` and the `.git/hooks/` files may not be
  bd's. Verify ownership (the resolved `.beads/hooks` path; the `BEGIN BEADS
  INTEGRATION` markers) before touching either.
- **Silence is the failure mode to fear here.** Every wrong assumption in this skill —
  a relative hooksPath, a hardcoded marker version, an unchecked `clean: true` — fails
  by doing *nothing* while reporting success. When a check finds nothing, say it found
  nothing.
- **Report the memory store honestly.** `bd remember` content is unreachable on 1.1.0.
  Do not imply it was migrated or preserved — it was not. Recovering it needs a
  downgrade to 1.0.5, which is the user's decision.
