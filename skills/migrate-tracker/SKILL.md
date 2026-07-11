---
name: migrate-tracker
description: "Migrate a project's issue tracker off beads (bd) onto the flat-YAML tracker. Use when the user says 'migrate off beads', 'migrate the tracker', 'bd is broken', 'bd writes fail', 'get off bd', 'move to flat-YAML', 'cut over from beads', or when a project's `bd` writes fail with a schema-migration panic. Also use when a sibling project needs the same cutover this repo already made. Do NOT use on a project that already has a `.diarie/tasks/` store (including vp-beads itself) — the cutover is one-way, and re-running the migrator replays the bd export over hand-edited task files."
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
| 9 issue types | **4** — `task` / `doc` / `decision` / `milestone`. `bug`/`feature`/`chore`/`story`/`spike` are *framings* that move into `labels:`; `epic` becomes `task` + `parent:` nesting **and** keeps an `epic` label. |
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

**Only if the project wants the readers permanently** (recommended — it is how it
finds ready work afterwards), copy them with the layout they expect:
`validate-tasks.mjs` → the project **root** (it imports `./scripts/task-schema.mjs`
and derives the tracker dir from its own location, so it silently validates
*nothing* from anywhere else); `ready-walker.mjs` + `task-schema.mjs` →
`<target>/scripts/`. Add `js-yaml` to the project's dependencies. The standalone
tracker CLI will replace this copy step once it ships.

## Workflows

### 1. Detect and assess

1. Confirm the target project actually uses bd: `.beads/` exists and
   `command -v bd` succeeds. If not, stop — there is nothing to migrate.
2. Confirm the target has **no** `.diarie/tasks/` store already. If it does, it
   has migrated; stop and say so rather than risk overwriting hand-edited work.
3. Confirm reads work: `bd list --status=open --json | head`. If reads ALSO
   fail, stop and report; this skill cannot proceed without an export.
4. Take the census:

   ```bash
   bd export -o /tmp/bd-export.jsonl
   jq -s 'map(select(._type == "issue")) | group_by(.status)
          | map({status: .[0].status, n: length})' /tmp/bd-export.jsonl
   ```

   The `_type` filter matters — the export can carry non-issue records, and the
   migrator counts only issues. Report live (non-`closed`) vs closed counts; the
   live set is what migrates.
5. Check whether `.beads/` is gitignored (it usually is). If so, say clearly:
   **nothing about bd history is currently in git**, and the archive written in
   workflow 2 (Export and archive) will be the only surviving record.

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
   bd ready --json | jq -r '.[].id' | sort > /tmp/bd-ready
   TASKS_ROOT=<target> node "$CLAUDE_PLUGIN_ROOT/scripts/ready-walker.mjs" --format json \
     | jq -r '.ready[].id' | sed 's|.*/||' | sort > /tmp/yaml-ready
   diff /tmp/bd-ready /tmp/yaml-ready
   ```

   **Expect exactly one class of divergence:** bd lists **non-`task` types
   (`decision`, `milestone`)** as ready. That is a bd bug — its ready-walk is
   type-blind, and a decision is a record while a milestone is a marker; neither
   is workable. The flat-YAML walker correctly excludes them.
   **Any other difference is a migration bug** — investigate it, do not wave it
   through.
3. **Count:** migrated tasks + decisions == the live census from workflow 1
   (Detect and assess).

### 5. Cut over

1. **Doc-grep first, then edit.** Operating instructions are loaded into every
   session, so a stale `bd` pointer does damage on every run — and these edits
   routinely expand beyond the file you expect. Enumerate before drafting:

   Sweep the target's `CLAUDE.md`, `AGENTS.md`, `README.md` and `.claude/` for
   `\bbd\b` (the `Grep` tool, or `grep -rni`). The sweep is the authority on
   scope, not your initial guess at it.
2. Retarget what the grep found — editing those files, or **creating** a
   `CLAUDE.md` if the project has none: how to find ready work
   (`node scripts/ready-walker.mjs`), how to claim (`status: in_progress` +
   `agent:`), how to close (`status: completed`), how to validate
   (`node validate-tasks.mjs`). Writes are **plain `Edit`/`Write` on the YAML** —
   there is no CRUD helper, and that is deliberate (substrate-not-opinion).
3. Leave `.beads/` on disk as a frozen read-only archive. Do not delete it —
   `bd` reads still work, and the memory store may be recoverable later via a bd
   downgrade.
4. Commit the new `.diarie/` store **and** the archive JSONL together.

## Guidelines

- **The migrator refuses to overwrite an existing store.** If `<root>/.diarie/tasks/`
  already holds `tasks-*.yml`, it exits 1 rather than replay the export over
  hand-edits. `--force` overrides this — offer it only to redo a botched migration,
  and only after saying what will be lost.
- **`--root` defaults to the current directory**, never the plugin's own checkout.
  Pass it explicitly anyway; a migration that writes to the wrong project is the
  worst outcome this skill can produce.
- **Do not use a project's existing `.diarie/tasks/*.yml` as a correctness
  reference** if it has already been hand-edited — it will not reproduce from the
  export, and diffing against it produces phantom failures.
- **Report the `bd remember` store honestly.** On 1.1.0 it is unreadable. If the
  user wants it, the path is a bd downgrade to 1.0.5 — their decision, not a step
  this skill takes.
