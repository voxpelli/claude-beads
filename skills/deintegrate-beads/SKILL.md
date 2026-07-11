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

Run the readers from the plugin and point them at the target — the same
arrangement `/migrate-tracker` uses:

```bash
TASKS_ROOT=<target> node "$CLAUDE_PLUGIN_ROOT/validate-tasks.mjs" --json
```

If that fails with `ERR_MODULE_NOT_FOUND` (a marketplace plugin cache has no
`node_modules`, so `js-yaml` is missing), run
`npm install --prefix "$CLAUDE_PLUGIN_ROOT"` once.

## Workflows

### 1. Verify the migration is trusted

The precondition for everything else. **Refuse to continue if any check fails** —
disarming bd in a repo whose new store is not trustworthy leaves the project with
*neither* tracker.

1. `<target>/.diarie/tasks/tasks-*.yml` exists.
2. **Validation is clean AND actually ran.** `validate-tasks` returns
   `{"clean": true, "skipped": true}` **with exit 0** when there is no store —
   so "exit 0" and even `clean: true` are *vacuously* passable and prove nothing.
   Require `skipped` to be `false`:

   ```bash
   TASKS_ROOT=<target> node "$CLAUDE_PLUGIN_ROOT/validate-tasks.mjs" --json \
     | jq -e '.clean == true and (.skipped // false) == false'
   ```

3. The store is **committed** — `git -C <target> ls-files .diarie/tasks` returns
   files, and the task count is non-zero. Not merely un-ignored: *committed*. An
   uncommitted store is one `git clean` from gone, and bd would have been the only
   surviving copy.

If any fails, stop and point at `/migrate-tracker`.

### 2. Disarm the git hooks

**Do this before stopping the daemon.** The armed `pre-commit` shim runs
`bd hooks run pre-commit`, and any `bd` command that touches the database
**re-spawns `dolt sql-server`** — so a daemon stopped first would simply come back
on the user's very next commit, including the commit recording this cleanup.

Two install shapes exist; check for both.

**Shape A — `core.hooksPath` (what `bd init` does by default).**

1. Establish the value *and its scope*:
   `git -C <target> config --show-origin --get core.hooksPath`. A `--local --unset`
   cannot clear a value set at global scope.
2. **Confirm it is bd's before touching it.** The value is typically an **absolute**
   path (`/Users/…/project/.beads/hooks`), not `.beads/hooks` — so match on the
   path *containing* `/.beads/hooks` after resolving any relative value against the
   repo root. A prefix-match against `.beads/` alone fails on the real value and
   would make the skill silently skip the one thing it exists to do.
3. A project may legitimately point `core.hooksPath` at husky, lefthook, or its own
   `hooks/`. If it does not resolve into `.beads/`, **leave it alone and say so.**
4. **Record the exact old value in the report** — it is the re-arm command
   (`git -C <target> config core.hooksPath '<exact-old-value>'`), and a guessed
   relative path would not restore what bd set.
5. `git -C <target> config --local --unset core.hooksPath`. Note `--unset` **exits 5**
   when the key is already absent; that is a no-op, not a failure.
6. **Check what the unset re-enables, and what it strands.** bd's hooksPath was
   overriding `.git/hooks/` *entirely*:
   - Anything sitting in `<target>/.git/hooks/` (non-`.sample`) has been dormant and
     **starts firing again** — list it.
   - If the project has `.husky/`, `lefthook.y*ml`, or `.pre-commit-config.yaml`,
     then **bd clobbered their hook manager when it installed**, and unsetting leaves
     them with *no* hook manager at all. Tell the user to restore *their*
     `core.hooksPath`, and give the command.

The five shims stay on disk under `.beads/hooks/` — inert, and untouched per the
never-delete rule.

**Shape B — hooks written into `.git/hooks/` (`bd hooks install` without
`--beads`).** Each is delimited:

```
# --- BEGIN BEADS INTEGRATION v1.0.3 ---
…
# --- END BEADS INTEGRATION v1.0.3 ---
```

**The marker is version-stamped** — a target on 1.0.5 or 1.1.0 carries a different
string. Match the **prefix** `BEGIN BEADS INTEGRATION` (any trailing version), never
the literal `v1.0.3`, or the strip silently finds nothing and reports success.

**Strip the marked block; do not delete the file** — a project may have its own hook
content wrapped around bd's. Delete the file (`rm -f`) only if nothing but a shebang
remains.

**Do not use `bd hooks uninstall`.** Its own `--help` says it removes hooks "from
`.git/hooks/`" — so it cannot clean shape A, which is the default. More generally:
do not ask a binary whose writes are broken to uninstall itself.

**Both shapes:** clear bd's git config. There may be more keys than `role`:

```bash
git -C <target> config --local --get-regexp '^beads\.'   # show what exists
git -C <target> config --local --unset beads.role        # …then unset each (exit 5 = absent, fine)
```

### 3. Stop the daemon

Now that the hooks are disarmed, nothing will re-spawn it.

1. Read `<target>/.beads/dolt-server.pid`.
2. **Confirm the pid is actually a `dolt` process before signalling it** —
   `ps -p <pid> -o comm=` must contain `dolt`. Pids are reused; a `.pid` file that
   outlived its process is how a cleanup tool ends up killing something else.
3. **Send SIGTERM (`kill <pid>`), wait, and re-poll. NEVER `kill -9`.** The daemon
   holds `.beads/dolt/` — the entire issue history — open. A SIGKILL can leave the
   Dolt store corrupt, destroying the very archive this skill's never-delete
   invariant exists to protect. If it survives SIGTERM, **leave it running and
   report it**: an orphaned daemon is a nuisance; a corrupt store is unrecoverable.
4. Sweep for **orphaned** `dolt sql-server` processes (`ps ax | grep 'dolt sql-server'`)
   and **report** them with their pids. Do not blind-kill — another repo's beads may
   legitimately own one. Say which pid matches this target's `.pid` file and which do
   not.

### 4. De-colonize the docs and Claude config

Absent in a project that never ran `bd setup claude` — present in one that did.
**Show what you are about to change and confirm once** (a single `AskUserQuestion`,
`header: "Cleanup"`) before editing another project's files.

1. **`CLAUDE.md` / `AGENTS.md`** — do not assume the marker exists. Grep first, show
   the matched block, then strip:

   ```bash
   grep -n 'BEADS INTEGRATION' <target>/CLAUDE.md <target>/AGENTS.md 2>/dev/null
   ```

   Strip only between the matched `BEGIN`/`END` markers. **Never regex-guess at
   surrounding prose.** If the grep finds nothing, say so — do not report the docs
   de-colonized when nothing was found.
2. **`.claude/settings.json`** — remove bd `SessionStart`/`PreCompact` hook entries
   (they run `bd prime`). Edit the JSON directly rather than trusting
   `bd setup claude --remove`.
3. **`.claude/settings.local.json`** — prune `Bash(bd …)` permission entries.
4. **Validate every JSON edit**: `jq . <file> >/dev/null`. Dropping an entry from a
   JSON array is the classic trailing-comma break, and a corrupt `settings.json`
   silently disables the target's *entire* Claude Code config. If it fails to parse,
   restore and report.
5. **Doc-grep, then report.** Sweep the target for `\bbd\b` (the `Grep` tool, or
   `grep -rni`) across `CLAUDE.md`, `AGENTS.md`, `README.md` and `.claude/`, and
   report what prose still instructs the agent to use bd. Do not mass-rewrite it —
   surface it and let the user decide. The grep is the authority on scope; an assumed
   edit list is not.

### 5. Report what is left (touch nothing)

Close by telling the user exactly what remains and what removing it would take.
Nothing in this workflow mutates anything.

- **Is `.beads/` even ignored? Ask git, do not assume.**
  `git -C <target> check-ignore -q .beads/ && echo ignored || echo TRACKED`.
  bd ships its own `.beads/.gitignore` which explicitly leaves `config.yaml`,
  `metadata.json` **and the hook shims tracked by default** — so in a stock bd
  project, parts of `.beads/` are **committed**. (vp-beads only looks otherwise
  because its *own* root `.gitignore` adds a blanket `.beads/` rule.) Report what is
  actually tracked, because it changes what a later `rm -rf .beads/` would do: stage
  file *deletions* in git, not merely free disk.
- **What is in `.beads/`**: the Dolt database (all issue history), the `bd remember`
  memory store (**unreadable on 1.1.0** — it hits the same write-gate), and
  `.beads-credential-key` (a per-machine federation key that must never be
  committed).
- **State the inertness precisely**: no hooks, no daemon — **until someone runs `bd`
  in that repo again**, which re-spawns the daemon. Leaving `.beads/` costs nothing
  but disk. If the user later wants it gone, that is theirs to decide, not this
  skill's to offer.
- **Machine-global leftovers** — name them, give the command, and state plainly that
  this skill did **not** touch them:
  - the binary — `brew uninstall beads`
  - `Bash(bd …)` permission entries in `~/.claude/settings.json`
  - `~/.beads/` — list what is under it (on this machine it is an `eventsData/`
    telemetry spool; bd ships metrics enabled by default). **Report it; do not
    recommend deleting it** — a skill whose thesis is "I never delete anything" has
    no business advising deletion of a path it has not inspected.

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
