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
pending schema migrations`). The binary is installed globally, so *every* repo
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
> export *vp-beads'* issues into the project you meant to migrate. The migrator's
> overwrite guard cannot catch that: the target has no store, so nothing trips.
> This is the read-side half of "writing to the wrong project", and it is the
> single easiest way to ruin a migration.

## Cross-skill boundaries

migrate-tracker runs **once, before** the sprint cycle a project's other skills
operate in. It is the only skill that creates a `.diarie/` store; from then on
`/backlog-groomer` owns triage of it and ordinary `Edit`/`Write` own the rows.
It never grooms, prioritizes, or closes work — it only moves it.

It is also the one skill exempt from the tiering in CLAUDE.md
`### Files-availability convention`: that convention describes how a component
degrades when the tracker is *absent*, but an absent tracker plus a present
`.beads/` is precisely this skill's **precondition**, not a degradation.

## What the migration preserves, and what it drops

| bd concept | Becomes |
| --- | --- |
| 9 issue types | **3 of the schema's 4** — `task`, `decision`, `milestone`. (`doc` exists in the schema but nothing in bd maps to it, so a migration never produces one.) `bug`/`feature`/`chore`/`story`/`spike` are *framings* that move into `labels:`; `epic` becomes `task` + `parent:` nesting **and** keeps an `epic` label. |
| `## Acceptance Criteria` body section | An `acceptance_criteria:` list |
| The rest of the body | A `description:` field (lossless) |
| `blocks` dependency | `deps:` — but only when the blocker is still live (see below) |
| `parent-child` dependency | `parent:` — but only when the epic is still live |
| P0–P4 priorities | `critical` / `high` / `medium` / `low` / `backlog` |
| `deferred` status | **Preserved** as `deferred` |
| Closed issues | **Not migrated.** Frozen to `.diarie/_archive/bd-final-export.jsonl` |
| `bd remember` memories | **Unrecoverable on 1.1.0** — `bd memories` hits the same write-gate. Say so plainly; do not claim to have evacuated them. |

**Edges to closed issues are dropped, not carried.** A `blocks` dep on a closed
issue is already satisfied; a `parent` pointing at a completed epic is history.
Carrying either would dangle and fail `validate-tasks`. The migrator drops them
and **reports each one** — the original edges survive in the archive JSONL.

## Prerequisites

Everything runs from the plugin — **nothing needs to be copied into the target
project to perform or verify the migration.** Use `${CLAUDE_PLUGIN_ROOT}` for the
plugin path, and the `TASKS_ROOT` env var to point the readers at the target:

```bash
# migrate INTO the target (--root), read/verify the target (TASKS_ROOT)
node "$CLAUDE_PLUGIN_ROOT/scripts/bootstrap-tasks.mjs" <export.jsonl> --root <target>
TASKS_ROOT=<target> node "$CLAUDE_PLUGIN_ROOT/validate-tasks.mjs"
TASKS_ROOT=<target> node "$CLAUDE_PLUGIN_ROOT/scripts/ready-walker.mjs" --format json
```

**Preflight:** these scripts import `js-yaml`, which is a *devDependency*. A
marketplace-installed plugin cache has no `node_modules`, so the first run may
fail with `ERR_MODULE_NOT_FOUND`. If it does, run
`npm install --prefix "$CLAUDE_PLUGIN_ROOT"` once.

The target gets its own copy of the readers at the end, in workflow 5 (Cut over)
step 1 — that is what lets it find ready work once the plugin is out of the
picture. Until then, `TASKS_ROOT` is all you need.

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
node "$CLAUDE_PLUGIN_ROOT/scripts/bootstrap-tasks.mjs" /tmp/bd-export.jsonl --root /tmp/dry

# Route a big epic into its own file (repeatable):
node "$CLAUDE_PLUGIN_ROOT/scripts/bootstrap-tasks.mjs" /tmp/bd-export.jsonl --root /tmp/dry \
  --epic <epic-id>=<slug> --title <slug>='Human title' --default-slug backlog
```

**`--root` is not optional in practice.** It defaults to the *current directory*.
Always pass it explicitly and always name the target you intend.

Show the user the dropped-edge report and the per-file tallies. **Read the
dropped-edge lines aloud in the summary** — they are the only lossy step, and a
user who does not see them cannot object to them.

When the dry-run looks right, re-run with `--root <target-project>`.

### 4. Verify (the step that actually proves the migration)

Three checks, in order. Do not skip the dual-run — it is what catches a
mis-projection.

1. **Integrity:** `TASKS_ROOT=<target> node "$CLAUDE_PLUGIN_ROOT/validate-tasks.mjs"`
   → clean.
2. **Dual-run:** compare the new reader against bd itself. The reader namespaces
   ids as `<slug>/<id>`, so strip the slug before comparing or **every** line will
   appear to differ:

   ```bash
   # --limit 0 = unlimited. bd's default is 100; on a big backlog the truncated
   # tail would show up as dozens of phantom "yaml-only" ids and bury the real signal.
   bd -C <target> --readonly ready --limit 0 --json | jq -r '.[].id' | sort > /tmp/bd-ready
   TASKS_ROOT=<target> node "$CLAUDE_PLUGIN_ROOT/scripts/ready-walker.mjs" --format json \
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

1. **Install the readers into the target — before documenting them.** Everything
   so far ran from the plugin; the target itself still has no way to find ready
   work. Copy `validate-tasks.mjs` to the target **root** and `ready-walker.mjs` +
   `task-schema.mjs` to `<target>/scripts/`, then add `js-yaml` to the target's
   dependencies (`npm install js-yaml`). The layout is not negotiable —
   `validate-tasks.mjs` imports `./scripts/task-schema.mjs` and resolves the
   tracker dir from its own location, so anywhere but the root makes it validate
   nothing and **exit 0**. Skipping this step means step 3 commits a `CLAUDE.md`
   documenting two commands the project does not have.

   ```bash
   cp -f "$CLAUDE_PLUGIN_ROOT/validate-tasks.mjs" <target>/
   cp -f "$CLAUDE_PLUGIN_ROOT/scripts/ready-walker.mjs" \
         "$CLAUDE_PLUGIN_ROOT/scripts/task-schema.mjs" <target>/scripts/
   ```

   Confirm: `node validate-tasks.mjs` from the target root reports the real file
   count, not "skipping". (The standalone tracker CLI will retire this step.)
2. **Doc-grep, then edit.** Operating instructions are loaded into every
   session, so a stale `bd` pointer does damage on every run — and these edits
   routinely expand beyond the file you expect. Enumerate before drafting:

   Sweep the target's `CLAUDE.md`, `AGENTS.md`, `README.md` and `.claude/` for
   `\bbd\b` (the `Grep` tool, or `grep -rni`). The sweep is the authority on
   scope, not your initial guess at it.
3. Retarget what the grep found — editing those files, or **creating** a
   `CLAUDE.md` if the project has none: how to find ready work
   (`node scripts/ready-walker.mjs`), how to claim (`status: in_progress` +
   `agent:`), how to close (`status: completed`), how to validate
   (`node validate-tasks.mjs`). Writes are **plain `Edit`/`Write` on the YAML** —
   there is no CRUD helper, and that is deliberate (substrate-not-opinion).
4. Leave `<target>/.beads/` on disk as a frozen read-only archive. Do not delete
   it — `bd` reads still work, and the memory store may be recoverable later via a
   bd downgrade.
5. **Fix the target's `.gitignore` before committing.** Two directions, both easy to
   get wrong:
   - **`.diarie/` must NOT be ignored.** It is dotted but tracked, and it sits right
     next to the ephemeral `.beads/` — the instinct to pattern-match is strong and
     wrong. The migrator already refuses to finish if any file it wrote is ignored
     (it asks `git check-ignore`, not the layout); if it stopped, add a negation
     (`!.diarie/`) or narrow the offending rule. Watch for innocuous pre-existing
     lines like `*.jsonl` or `_archive/` — either one silently swallows the bd
     archive, and `git add -A` will not say a word.
   - **The plugin's ephemeral and private artifacts must BE ignored** — if the
     project will use vp-beads' other skills, add the stanza from the README's
     "What to gitignore" section. `PRIVATE-SYNERGY-*.md` is the load-bearing line:
     it is the only thing keeping a private sibling's name out of a public repo,
     and vp-beads' validator that enforces it does not run in the target.
6. Commit the new `.diarie/` store **and** the archive JSONL together.

## Error handling

- **`ERR_MODULE_NOT_FOUND: js-yaml`** — the plugin cache has no `node_modules`.
  Run `npm install --prefix "$CLAUDE_PLUGIN_ROOT"` once. (Post-cutover, the same
  error from the *target* means step 1 of workflow 5 (Cut over) skipped the
  dependency add.)
- **`unmapped bd status for <id>`** — the migrator refuses rather than emit a
  task with no status. bd has statuses beyond the four it maps (`reopened`, …).
  Add the mapping to `STATUS_MAP` in `scripts/migrate-from-bd.mjs`; do not work
  around it, and do not hand-patch the YAML.
- **`refusing to overwrite an existing task store`** — the target has already
  migrated. Stop and confirm with the user; reach for `--force` only to redo a
  botched migration, and say what it will discard.
- **`--epic <id> is not a live issue`** (a warning, not a stop) — the epic is
  closed or misspelled, and its slug file will be written empty. Fix the id or
  drop the flag.
- **The dual-run diverges beyond `decision`/`milestone`** — do not proceed. Check
  first that the store is freshly migrated (a hand-edited one diverges
  legitimately) and that `bd` was pinned with `-C <target>`; then treat it as a
  migration bug.
- **`validate-tasks` fails after migration** — a real projection bug. The
  likeliest causes are a dangling edge (should be impossible — edges to non-live
  issues are dropped) or a status-less row (should now throw). Report it; do not
  hand-edit the YAML to make the error go away, or the archive and the store will
  disagree about what happened.
- **An empty or issue-less export** — the target's `.beads/` is empty, or `bd` was
  pointed at the wrong directory. Re-check the id-prefix sanity assert in
  workflow 1 (Detect and assess).

## Guidelines

- **The migrator refuses to overwrite an existing store.** If `<root>/.diarie/tasks/`
  already holds `tasks-*.yml`, it exits 1 rather than replay the export over
  hand-edits. `--force` overrides this — offer it only to redo a botched migration,
  and only after saying what will be lost. Note `--force` *overwrites, it does not
  clean*: redoing with a different `--epic` grouping leaves the previous run's
  `tasks-<old-slug>.yml` behind. Delete stale slug files by hand.
- **`--root` defaults to the current directory**, never the plugin's own checkout.
  Pass it explicitly anyway; a migration that writes to the wrong project is the
  worst outcome this skill can produce.
- **Do not use a project's existing `.diarie/tasks/*.yml` as a correctness
  reference** if it has already been hand-edited — it will not reproduce from the
  export, and diffing against it produces phantom failures.
- **Report the `bd remember` store honestly.** On 1.1.0 it is unreadable. If the
  user wants it, the path is a bd downgrade to 1.0.5 — their decision, not a step
  this skill takes.
