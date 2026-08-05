---
name: migrate-tracker
description: "Migrate a project's issue tracker off beads (bd) onto the flat-YAML tracker. Use when the user says 'migrate off beads', 'migrate the tracker', 'bd is broken', 'bd writes fail', 'get off bd', 'move to flat-YAML', 'cut over from beads', or when a project's `bd` writes fail with a schema-migration panic. Also use when a sibling project needs the same cutover this repo already made. Do NOT use on a project that already has a `.diarie/tasks/` store (including vp-beads itself) — the cutover is one-way, and re-running replays the bd export over hand-edited task files; the sole exception is deliberately redoing a botched migration, which requires `--force`."
argument-hint: "[path-to-project]"
user-invocable: true
paths:
  - ".beads/**"
allowed-tools:
  - Bash
  - Read
  - Edit
  - Write
  - Grep
  - AskUserQuestion
---

# Migrate Tracker (bd → flat-YAML)

A guided, one-way cutover from beads (`bd`) to the flat-YAML tracker. Reads the
project's `bd export`, projects it into `.diarie/tasks/*.yml`, freezes the full
bd history to a committed archive, and retargets the project's own operating
instructions.

**Why this exists.** beads 1.1.0's schema-migration gate panics on **every
write** (`bd create`/`update`/`close` fail with `refusing to auto-apply N
pending schema migrations`). The binary is installed globally, so _every_ repo
on beads broke at once — this is not a per-project problem to work around but a
substrate to leave. vp-beads made this cutover first; this skill is the path it
paved.

**The one piece of good news:** bd **reads still work** (`bd export`, `bd list`,
`bd ready`, `bd show`). A migration needs nothing but reads. Do not let a
project conclude its data is lost — it is not.

**This skill targets OTHER projects.** vp-beads has already migrated. Its own
store is protected by a hard stop in the migrator (see Guidelines), but do not
rely on that — always confirm which project is being migrated before running
anything.

> **Pin every `bd` call to the target with `-C <target>`** (bd's `git -C`
> equivalent), and add `--readonly` — a migration only ever reads. `bd`
> auto-discovers `.beads/` from the **current directory**, and this repo still has
> its own `.beads/` on disk, so a bare `bd export` run from here would happily
> export _vp-beads'_ issues into the project you meant to migrate. The migrator's
> overwrite guard cannot catch that: the target has no store, so nothing trips.
> This is the read-side half of "writing to the wrong project", and it is the
> single easiest way to ruin a migration.

## Cross-skill boundaries

migrate-tracker runs **once, before** the sprint cycle a project's other skills
operate in. It is the only skill that creates a `.diarie/` store; from then on
the user triages it by editing `.diarie/tasks/tasks-*.yml` directly.
It never grooms, prioritizes, or closes work — it only moves it.

It is also the one skill exempt from the tiering in CLAUDE.md
`### Files-availability convention`: that convention describes how a component
degrades when the tracker is _absent_, but an absent tracker plus a present
`.beads/` is precisely this skill's **precondition**, not a degradation.

## What the migration preserves, and what it drops

| bd concept                            | Becomes                                                                                                                                                                                                                                                                                                            |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 9 issue types                         | **3 of the schema's 4** — `task`, `decision`, `milestone`. (`doc` exists in the schema but nothing in bd maps to it, so a migration never produces one.) `bug`/`feature`/`chore`/`story`/`spike` are _framings_ that move into `labels:`; `epic` becomes `task` + `parent:` nesting **and** keeps an `epic` label. |
| `## Acceptance Criteria` body section | An `acceptance_criteria:` list                                                                                                                                                                                                                                                                                     |
| The rest of the body                  | A `description:` field (lossless)                                                                                                                                                                                                                                                                                  |
| `blocks` dependency                   | `deps:` — but only when the blocker is still live (see below)                                                                                                                                                                                                                                                      |
| `parent-child` dependency             | `parent:` — but only when the epic is still live                                                                                                                                                                                                                                                                   |
| P0–P4 priorities                      | `critical` / `high` / `medium` / `low` / `backlog`                                                                                                                                                                                                                                                                 |
| `deferred` status                     | **Preserved** as `deferred`                                                                                                                                                                                                                                                                                        |
| Closed issues                         | **Not migrated.** Frozen to `.diarie/_archive/bd-final-export.jsonl`                                                                                                                                                                                                                                               |
| `bd remember` memories                | **Unrecoverable on 1.1.0** — `bd memories` hits the same write-gate. Say so plainly; do not claim to have evacuated them.                                                                                                                                                                                          |

**Edges to closed issues are dropped, not carried.** A `blocks` dep on a closed
issue is already satisfied; a `parent` pointing at a completed epic is history.
Carrying either would dangle and fail `diarie validate`. The migrator drops them
and **reports each one** — the original edges survive in the archive JSONL.

## Prerequisites

Everything runs through the **published `diarie` CLI**, resolved via `npx -y diarie` (fetched from
the npm registry on demand) — **nothing is bundled with this plugin** and nothing is copied into
the target project. Every command takes `--root`, so one binary serves any repo:

```bash
DIARIE="npx -y diarie"

$DIARIE migrate <export.jsonl> --root <target>   # write the store
$DIARIE validate --root <target>                 # integrity gate
$DIARIE ready --json --root <target>             # what is workable
```

**Always pass `--root`.** It is not a convenience: without it the CLI walks up from the current
directory and could bind to the _wrong_ `.diarie/` — the session's cwd (or a parent) rather than
the migration target. A missing store is an error (`ENOSTORE`, non-zero exit), never an empty
backlog, so a wrong `--root` fails loudly rather than reporting that the target has no work.

_(`TASKS_ROOT` still works and is what the test suite uses, but `--root` is the interface.
Prose that leads with the env var is describing the readers that no longer exist.)_

**On resolution failure:** `npx -y diarie` needs the registry (or a warm npx cache / a global
`diarie` on `PATH`). If it cannot resolve — offline, no cache — install diarie once (`npm i -g
diarie`, or add it as the target's own devDep) rather than expecting a plugin-local copy: this
plugin ships none.

## Workflows

### 1. Detect and assess

1. Confirm the target project actually uses bd: `<target>/.beads/` exists and
   `command -v bd` succeeds. If not, stop — there is nothing to migrate.
2. Confirm the target has **no** `.diarie/tasks/` store already. If it does, it
   has migrated; stop and say so rather than risk overwriting hand-edited work.
3. Confirm reads work: `bd -C <target> --readonly list --status open --json | head`.
   If reads ALSO fail, stop and report; this skill cannot proceed without an export.
4. Export and take the census — **`-C <target>` on every call**, or you will
   census the wrong repo:

   ```bash
   bd -C <target> --readonly export -o /tmp/bd-export.jsonl

   # Sanity-check the ids belong to the target before going further.
   jq -r 'select(._type == "issue") | .id' /tmp/bd-export.jsonl | sed 's/-[^-]*$//' | sort -u

   # Status census (what migrates) and type census (what to group on).
   jq -s 'map(select(._type == "issue"))
          | { by_status: (group_by(.status) | map({ (.[0].status): length }) | add),
              by_type:   (group_by(.issue_type) | map({ (.[0].issue_type): length }) | add),
              epics:     (map(select(.issue_type == "epic" and .status != "closed") | .id)) }
         ' /tmp/bd-export.jsonl
   ```

   The `_type` filter matters — the export can carry non-issue records, and the
   migrator counts only issues. Report live (non-`closed`) vs closed counts; the
   live set is what migrates. The `by_type` and `epics` fields are what
   workflow 3 (Migrate) needs to propose a grouping.
5. Check whether `<target>/.beads/` is gitignored (it usually is). If so, say
   clearly: **nothing about bd history is currently in git**, and the archive
   written in workflow 2 (Export and archive) will be the only surviving record.

### 2. Export and archive

The migrator does the archiving itself — it copies the full snapshot (ALL
statuses) to `.diarie/_archive/bd-final-export.jsonl` before writing anything
else. Do not hand-roll this. Afterwards, confirm the file exists, has the
expected line count, and is **not** gitignored (`git check-ignore` prints
nothing for it) — then make sure the commit in workflow 5 (Cut over) actually
includes it. It is the only surviving copy of bd history.

### 3. Migrate (dry-run first, always)

Decide the file grouping with the user via a single `AskUserQuestion`
(`header: "Grouping"`). The default — everything in one `tasks-backlog.yml` — is
right for most projects; offer a per-epic split only when the census shows a
large epic whose family would dominate the file.

```bash
# Dry-run into a scratch dir; the project is not touched.
$DIARIE migrate /tmp/bd-export.jsonl --root /tmp/dry

# Route a big epic into its own file (repeatable):
$DIARIE migrate /tmp/bd-export.jsonl --root /tmp/dry \
  --epic <epic-id>=<slug> --title <slug>='Human title' --default-slug backlog
```

**`--root` is not optional in practice.** It defaults to the _current directory_.
Always pass it explicitly and always name the target you intend.

Show the user the dropped-edge report and the per-file tallies. **Read the
dropped-edge lines aloud in the summary** — they are the only lossy step, and a
user who does not see them cannot object to them.

When the dry-run looks right, re-run with `--root <target-project>`.

### 4. Verify (the step that actually proves the migration)

Three checks, in order. Do not skip the dual-run — it is what catches a
mis-projection.

1. **Integrity:** `$DIARIE validate --root <target>`
   → clean.
2. **Dual-run:** compare the new reader against bd itself. The reader namespaces
   ids as `<slug>/<id>`, so strip the slug before comparing or **every** line will
   appear to differ:

   ```bash
   # --limit 0 = unlimited. bd's default is 100; on a big backlog the truncated
   # tail would show up as dozens of phantom "yaml-only" ids and bury the real signal.
   bd -C <target> --readonly ready --limit 0 --json | jq -r '.[].id' | sort > /tmp/bd-ready
   $DIARIE ready --json --root <target> \
     | jq -r '.ready[].id' | sed 's|.*/||' | sort > /tmp/yaml-ready
   diff /tmp/bd-ready /tmp/yaml-ready
   ```

   **Expect exactly one class of divergence:** bd lists **non-`task` types
   (`decision`, `milestone`)** as ready. That is a bd bug — its ready-walk is
   type-blind, and a decision is a record while a milestone is a marker; neither
   is workable. The flat-YAML walker correctly excludes them. Confirm each
   bd-only id really is a non-task:

   ```bash
   comm -23 /tmp/bd-ready /tmp/yaml-ready | while read -r id; do
     echo "$id → $(jq -r --arg i "$id" 'select(.id==$i) | .issue_type' /tmp/bd-export.jsonl)"
   done
   ```

   **Any other difference is a migration bug** — investigate it, do not wave it
   through. Run this against a **freshly migrated** store only: once the store has
   been hand-edited, it legitimately diverges from the export and the comparison is
   meaningless (see Guidelines).
3. **Count:** migrated tasks + decisions == the live census from workflow 1
   (Detect and assess).

### 5. Cut over

1. **Settle how the target will reach `diarie` — before documenting it.** There is nothing
   to copy: the tracker is a package now, not three loose files, and this step used to
   `cp` them into the target. Say the true thing instead.

   `diarie` is **published on npm** (`diarie@0.2.0`, 2026-07-18). So the target no longer
   depends on THIS plugin being installed for the binary — first rung that resolves wins:

   | rung                         | when                                                    |
   | ---------------------------- | ------------------------------------------------------- |
   | `diarie` on `PATH`           | globally installed (`npm i -g diarie`)                  |
   | `npx -y diarie`              | **default — fetches from npm, no local install needed** |
   | `./node_modules/.bin/diarie` | the target installed `diarie` as a devDep               |

   The `CLAUDE.md` you write in step 3 should document the command that actually works
   _there_ — `npx -y diarie` is the portable default (the line above sets `$DIARIE` to it).

   Confirm before proceeding: `$DIARIE validate --root <target>` reports the real file
   count. An absent store errors (`ENOSTORE`); it no longer "skips" and exits 0, which is
   what used to make this step's failure invisible.
2. **Doc-grep, then edit.** Operating instructions are loaded into every
   session, so a stale `bd` pointer does damage on every run — and these edits
   routinely expand beyond the file you expect. Enumerate before drafting:

   Sweep the target's `CLAUDE.md`, `AGENTS.md`, `README.md` and `.claude/` for
   `\bbd\b` (the `Grep` tool, or `grep -rni`). The sweep is the authority on
   scope, not your initial guess at it.

   **Then sweep again for the behavioural residue the first sweep cannot see**, because
   it contains no `bd`:

   ```bash
   grep -rniE 'markdown TODO|ad-hoc task list|do not use .*task list|TodoWrite' \
     <target>/CLAUDE.md <target>/AGENTS.md <target>/.claude/
   ```

   A bd-era project very often carries a **blanket ban on the agent's own task list**.
   Retargeting the _commands_ and leaving that ban in place is how a cutover renews the
   habit it was supposed to end — **and it is exactly what vp-beads' own cutover commit
   did**, which is why the second grep exists at all. See step 3.
3. Retarget what BOTH greps found — editing those files, or **creating** a
   `CLAUDE.md` if the project has none: how to find ready work (`diarie ready`), how to
   claim (`status: in_progress` + `agent:`), how to close (`status: completed`), how to
   validate (`diarie validate`) — spelled with whichever rung from step 1 actually resolves
   in that repo. Writes are **plain `Edit`/`Write` on the YAML** —
   there is no CRUD helper, and that is deliberate (substrate-not-opinion).

   **Only document flags that exist.** Run each command you are about to write into the
   target's `CLAUDE.md` — `diarie ready --blocked`, `diarie stats --stale --days 30`, and
   so on — and confirm it does not error. vp-beads' own `CLAUDE.md` told agents to run
   `diarie ready --stats` and `diarie ready --stale` for weeks; **neither flag exists** <!-- prose-cmd-ignore: this lesson quotes the retired flags on purpose -->
   (they belong to `stats`). Prose is not checked by anything, so an invented flag survives
   indefinitely and fails silently in someone else's session.

   **If the second grep found a task-list ban, surface it and offer the seam — do not
   impose it.** The ban is usually a category error: Claude Code's built-in tracker is
   _ephemeral_ (it dies with the session, by design) while the tracker is _durable_, so
   they complement rather than compete. But it is the target project's call. Show the
   matched lines, and propose the rule that actually prevents the failure the ban was
   groping at:

   > An ephemeral todo may never be the ONLY home of a commitment. If it must outlive the
   > session, it is a task row. The todo list is one claimed row's execution made visible —
   > never a second backlog.

   Rationale and the rejected alternatives are recorded in the vp-beads decision
   `vp-beads-tdo` (in the vp-skills repo root's `.diarie/decisions/`; this plugin ships
   no store of its own).
4. Leave `<target>/.beads/` on disk as a frozen read-only archive. Do not delete
   it — `bd` reads still work, and the memory store may be recoverable later via a
   bd downgrade.
5. **Fix the target's `.gitignore` before committing.** Two directions, both easy to
   get wrong:
   * **`.diarie/` must NOT be ignored.** It is dotted but tracked, and it sits right
     next to the ephemeral `.beads/` — the instinct to pattern-match is strong and
     wrong. The migrator already refuses to finish if any file it wrote is ignored
     (it asks `git check-ignore`, not the layout); if it stopped, add a negation
     (`!.diarie/**` — the `/**` matters; `!.diarie/` alone does NOT work, since git will
     not descend into an excluded directory) or narrow the offending rule. Watch for
     innocuous pre-existing
     lines like `*.jsonl` or `_archive/` — either one silently swallows the bd
     archive, and `git add -A` will not say a word.
   * **The plugin's ephemeral and private artifacts must BE ignored** — if the
     project will use vp-beads' other skills, gitignore them: `RETRO-*.md`, `SWARM-*.md`,
     `PRIVATE-SYNERGY-*.md`, `.claude/*.local.json`, and `.liggare/` (inline here because this
     plugin ships no README of its own). `PRIVATE-SYNERGY-*.md` is the load-bearing line:
     it is the only thing keeping a private sibling's name out of a public repo,
     and vp-beads' validator that enforces it does not run in the target.
6. Commit the new `.diarie/` store **and** the archive JSONL together.

## Error handling

* **`npx -y diarie` fails to resolve / times out** — a registry or network problem, not a missing
  plugin dependency. `diarie` is **published** (`diarie@^0.2.0`); this plugin bundles no copy of its
  own, so there is no `npm install --prefix` recovery to run and nothing to "add" post-cutover. Retry,
  or provide diarie another way (`npm i -g diarie`, a warm npx cache, or the target's own devDep — see
  Prerequisites).
* **`unmapped bd status for <id>`** — the migrator refuses rather than emit a
  task with no status. bd has statuses beyond the four it maps (`reopened`, …).
  `STATUS_MAP` lives in the external **[`voxpelli/diarie`](https://github.com/voxpelli/diarie)** repo
  (`lib/migrate/bd-map.js`) — diarie is a published dependency here, so do NOT hand-edit the installed
  copy under `node_modules/diarie/` (npm overwrites it on the next install, and the fix never leaves
  this machine). Report the status upstream (issue/PR); until it lands, treat the migration as blocked
  for that id — do not hand-patch the YAML either.
* **`refusing to overwrite an existing task store`** — the target has already
  migrated. Stop and confirm with the user; reach for `--force` only to redo a
  botched migration, and say what it will discard.
* **`--epic <id> is not a live issue`** (a warning, not a stop) — the epic is
  closed or misspelled, and its slug file will be written empty. Fix the id or
  drop the flag.
* **The dual-run diverges beyond `decision`/`milestone`** — do not proceed. Check
  first that the store is freshly migrated (a hand-edited one diverges
  legitimately) and that `bd` was pinned with `-C <target>`; then treat it as a
  migration bug.
* **`diarie validate` fails after migration** — a real projection bug. The
  likeliest causes are a dangling edge (should be impossible — edges to non-live
  issues are dropped) or a status-less row (should now throw). Report it; do not
  hand-edit the YAML to make the error go away, or the archive and the store will
  disagree about what happened.
* **An empty or issue-less export** — the target's `.beads/` is empty, or `bd` was
  pointed at the wrong directory. Re-check the id-prefix sanity assert in
  workflow 1 (Detect and assess).

## Guidelines

* **The migrator refuses to overwrite an existing store.** If `<root>/.diarie/tasks/`
  already holds `tasks-*.yml`, it exits 1 rather than replay the export over
  hand-edits. `--force` overrides this — offer it only to redo a botched migration,
  and only after saying what will be lost. Note `--force` _overwrites, it does not
  clean_: redoing with a different `--epic` grouping leaves the previous run's
  `tasks-<old-slug>.yml` behind. Delete stale slug files by hand.
* **`--root` defaults to the current directory**, never the plugin's own checkout.
  Pass it explicitly anyway; a migration that writes to the wrong project is the
  worst outcome this skill can produce.
* **Do not use a project's existing `.diarie/tasks/*.yml` as a correctness
  reference** if it has already been hand-edited — it will not reproduce from the
  export, and diffing against it produces phantom failures.
* **Report the `bd remember` store honestly.** On 1.1.0 it is unreadable. If the
  user wants it, the path is a bd downgrade to 1.0.5 — their decision, not a step
  this skill takes.
