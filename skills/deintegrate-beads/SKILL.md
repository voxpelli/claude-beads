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
  → `.beads/hooks/`, so `.git/hooks/` looks pristine while five shims
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

**What it never does:** delete `.beads/`, uninstall the binary, or touch anything
outside the project. Those are the user's calls, and workflow 5 (Report what is
left) tells them exactly how.

## Cross-skill boundaries

`/migrate-tracker` moves the work and leaves bd standing. `/deintegrate-beads` runs
afterwards and takes bd's hands off the wheel. Neither deletes data.

Like `/migrate-tracker`, this skill is **exempt** from the tiering in CLAUDE.md
`### Files-availability convention`: its precondition is a *present* tracker plus a
*present* `.beads/`, which is the inverse of a degradation.

## Workflows

### 1. Verify the migration is trusted

The precondition for everything else. **Refuse to continue if any of these fail** —
disarming bd in a repo whose new store is not yet trustworthy leaves the project
with neither tracker.

1. `.diarie/tasks/tasks-*.yml` exists.
2. `validate-tasks` is clean.
3. The store is **committed** — `git ls-files .diarie/tasks` returns files. Not
   merely un-ignored: *committed*. An uncommitted store is one `git clean` from
   gone, and bd would have been the only surviving copy.

If any fails, stop and point at `/migrate-tracker`.

### 2. Stop the daemon

1. Read `<target>/.beads/dolt-server.pid`.
2. **Confirm the pid is actually a `dolt` process before signalling it** —
   `ps -p <pid> -o comm=` must contain `dolt`. Pids are reused; killing a stale one
   from a `.pid` file that outlived its process is how a cleanup tool ends up
   terminating something else entirely.
3. Stop it, then confirm it is gone.
4. Sweep for **orphaned** `dolt sql-server` processes
   (`ps ax | grep 'dolt sql-server'`) and **report** them with their pids. Do not
   blind-kill: another repo's beads may legitimately own one. Say which pid belongs
   to this repo (it matches the `.pid` file) and which do not.

### 3. Disarm the git hooks

Two install shapes exist; check for both.

**Shape A — `core.hooksPath` (what `bd init` does by default).**

1. Read `git config --local --get core.hooksPath`.
2. **Confirm it points inside `.beads/` before touching it.** A project may
   legitimately point `core.hooksPath` at husky, lefthook, or its own `hooks/`
   directory — unsetting that would silently disable *their* tooling. If it points
   anywhere else, leave it alone and say so.
3. `git config --local --unset core.hooksPath`.
4. Note in the report that **default `.git/hooks/` resolution is now restored**.
   bd's hooksPath was overriding `.git/hooks/` entirely, so anything that was
   sitting there has been dormant and will start firing again. Check
   `.git/hooks/` for non-`.sample` files and mention what is now live.

The five shims stay on disk under `.beads/hooks/` — inert, and untouched per the
never-delete rule.

**Shape B — hooks written into `.git/hooks/` (`bd hooks install` without
`--beads`).** Each is delimited:

```
# --- BEGIN BEADS INTEGRATION v1.0.3 ---
…
# --- END BEADS INTEGRATION v1.0.3 ---
```

**Strip the marked block; do not delete the file** — a project may have its own
hook content wrapped around bd's. Delete the file only if nothing but a shebang
remains.

**Do not use `bd hooks uninstall`.** Its own `--help` says it removes hooks "from
`.git/hooks/`" — so it cannot clean shape A, which is the default. More generally:
do not ask a binary whose writes are broken to uninstall itself.

**Then:** `git config --local --unset beads.role`.

### 4. De-colonize the docs and Claude config

Absent in a project that never ran `bd setup claude` — present in one that did.

1. **`CLAUDE.md` / `AGENTS.md`** — strip the managed block between
   `<!-- BEGIN BEADS INTEGRATION -->` and `<!-- END BEADS INTEGRATION -->`.
   Marker-delimited, so this is surgical. **Never regex-guess at surrounding prose.**
2. **`.claude/settings.json`** — remove bd `SessionStart`/`PreCompact` hook entries
   (they run `bd prime`). Edit the JSON directly rather than trusting
   `bd setup claude --remove`.
3. **`.claude/settings.local.json`** — prune `Bash(bd …)` permission entries.
4. **Doc-grep, then report.** Sweep the project for `\bbd\b` (the `Grep` tool, or
   `grep -rni`) across `CLAUDE.md`, `AGENTS.md`, `README.md` and `.claude/`, and
   report what prose still instructs the agent to use bd. Do not mass-rewrite it —
   surface it and let the user decide. The grep is the authority on scope; an
   assumed edit list is not.

### 5. Report what is left (touch nothing)

Close by telling the user exactly what remains and what it would take to remove it.
Nothing in this workflow mutates anything.

- **`.beads/`** — report its size and *what is in it*: the Dolt database (all issue
  history), the `bd remember` memory store (**unreadable on 1.1.0** — it hits the
  same write-gate), and `.beads-credential-key` (a per-machine federation key that
  must never be committed).
- **State plainly that `.beads/` is now inert**: no hooks, no daemon, gitignored.
  Leaving it costs nothing but disk. If the user later wants it gone, it is
  `rm -rf .beads/` — their call, not this skill's.
- **Machine-global leftovers**, with the exact command for each, and an explicit
  note that this skill did **not** touch them:
  - the binary — `brew uninstall beads`
  - `Bash(bd …)` permission entries in `~/.claude/settings.json`
  - the telemetry spool — `~/.beads/eventsData/` (bd ships metrics enabled by
    default; the spool is pure phone-home data and is safe to delete)

## Guidelines

- **Never delete `.beads/`, and never offer to.** The whole reason this skill is
  safe to run is that it cannot lose data. Deletion is a separate, manual decision
  the user makes with full sight of what is in there.
- **Everything here is reversible.** Re-arming is
  `git config core.hooksPath .beads/hooks`. Say so — it is what makes the change
  easy to accept.
- **Check before you unset.** `core.hooksPath` and the `.git/hooks/` files may not
  be bd's. Verify ownership (the `.beads/` path, the `BEADS INTEGRATION` markers)
  before touching either.
- **Report the memory store honestly.** `bd remember` content is unreachable on
  1.1.0. Do not imply it was migrated or preserved — it was not. Recovering it
  needs a downgrade to 1.0.5, which is the user's decision.
