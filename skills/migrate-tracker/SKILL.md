---
name: migrate-tracker
description: "Migrate a project's issue tracker off beads (bd) onto the flat-YAML tracker. Use when the user says 'migrate off beads', 'migrate the tracker', 'bd is broken', 'bd writes fail', 'get off bd', 'move to flat-YAML', 'migrate to the flat-file tracker', 'cut over from beads', or when a project's `bd` writes fail with a schema-migration panic. Also use when a sibling project needs the same cutover this repo already made."
argument-hint: "[path-to-project]"
user-invocable: true
paths:
  - ".beads/**"
  - ".diarie/**"
allowed-tools:
  - Bash
  - Read
  - Edit
  - Write
  - Glob
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

## What the migration preserves, and what it drops

| bd concept | Becomes |
| --- | --- |
| 9 issue types | **4** — `task` / `doc` / `decision` / `milestone`. `bug`/`feature`/`chore`/`story`/`spike` are *framings*, carried in `labels:`; `epic` is `task` + `parent:`. |
| `## Acceptance Criteria` body section | An `acceptance_criteria:` list |
| The rest of the body | A `description:` field (lossless) |
| `blocks` dependency | `deps:` — but only when the blocker is still live (see below) |
| `parent-child` dependency | `parent:` — but only when the epic is still live |
| P0–P4 priorities | `critical` / `high` / `medium` / `low` / `backlog` |
| Closed issues | **Not migrated.** Frozen to `.diarie/_archive/bd-final-export.jsonl` |
| `bd remember` memories | **Unrecoverable on 1.1.0** — `bd memories` hits the same write-gate. Say so plainly; do not claim to have evacuated them. |

**Edges to closed issues are dropped, not carried.** A `blocks` dep on a closed
issue is already satisfied; a `parent` pointing at a completed epic is history.
Carrying either would dangle and fail `validate-tasks`. The migrator drops them
and **reports each one** — the original edges survive in the archive JSONL.

## Prerequisites

The migrator lives in this plugin, not in the target project. Run it with an
explicit `--root`:

```
node <plugin>/scripts/bootstrap-tasks.mjs <export.jsonl> --root <target-project>
```

The target project also needs the *readers* to be useful afterwards
(`scripts/ready-walker.mjs`, `validate-tasks.mjs`, `scripts/task-schema.mjs`).
Until the standalone `diarie` CLI ships, copy those three files into the target
project's `scripts/` (they have one dependency, `js-yaml`). Tell the user this
is the interim arrangement and that the CLI will replace it.

## Workflows

### 1. Detect and assess

1. Confirm the target project actually uses bd: `.beads/` exists and
   `command -v bd` succeeds. If not, stop — there is nothing to migrate.
2. Confirm reads work: `bd list --status=open --json | head`. If reads ALSO
   fail, stop and report; this skill cannot proceed without an export.
3. Take the census:

   ```bash
   bd export -o /tmp/bd-export.jsonl
   jq -s 'group_by(.status) | map({status: .[0].status, n: length})' /tmp/bd-export.jsonl
   ```

   Report live (non-`closed`) vs closed counts. The live set is what migrates.
4. Check whether `.beads/` is gitignored (it usually is). If so, say clearly:
   **nothing about bd history is currently in git**, and the archive written in
   workflow 2 (Export and archive) will be the only surviving record.

### 2. Export and archive

The migrator does the archiving itself — it copies the full snapshot (ALL
statuses) to `.diarie/_archive/bd-final-export.jsonl` before writing anything
else. Do not hand-roll this. Just confirm afterwards that the file exists, is
committed (`git check-ignore` returns nothing for it), and has the expected line
count.

### 3. Migrate (dry-run first, always)

Decide the file grouping with the user. The default — everything in one
`tasks-backlog.yml` — is right for most projects. Offer a per-epic split only if
the census shows a large epic whose family would dominate the file:

```bash
# Dry-run into a scratch dir; nothing in the project is touched.
node <plugin>/scripts/bootstrap-tasks.mjs /tmp/bd-export.jsonl --root /tmp/dry

# Group a big epic into its own file (repeatable):
node <plugin>/scripts/bootstrap-tasks.mjs /tmp/bd-export.jsonl --root /tmp/dry \
  --epic <epic-id>=<slug> --title <slug>='Human title' --default-slug backlog
```

Show the user the dropped-edge report and the per-file tallies. **Read the
dropped-edge lines aloud in the summary** — they are the only lossy step, and a
user who does not see them cannot object to them.

When the dry-run looks right, re-run with `--root <target-project>`.

### 4. Verify (the step that actually proves the migration)

Three checks, in order. Do not skip the dual-run — it is what catches a
mis-projection.

1. **Integrity:** `node validate-tasks.mjs` in the target → clean.
2. **Dual-run:** compare the new reader against bd itself.

   ```bash
   bd ready --json | jq -r '.[].id' | sort > /tmp/bd-ready
   node scripts/ready-walker.mjs --format json | jq -r '.ready[].id' | sort > /tmp/yaml-ready
   diff /tmp/bd-ready /tmp/yaml-ready
   ```

   **Expect exactly one class of divergence:** bd lists `decision`-type issues as
   ready. That is a bd bug — bd's ready-walk is type-blind, and a decision is a
   record, not workable. The flat-YAML walker correctly excludes them.
   **Any other difference is a migration bug** — investigate it, do not wave it
   through.
3. **Count:** the migrated task count + decision count == the live census from
   workflow 1 (Detect and assess).

### 5. Cut over

1. Retarget the project's **own operating instructions** (`CLAUDE.md` /
   `AGENTS.md`) off bd: how to find ready work (`node scripts/ready-walker.mjs`),
   how to claim (`status: in_progress` + `agent:`), how to close
   (`status: completed`), and how to validate (`node validate-tasks.mjs`).
   This matters more than any design doc — operating instructions are loaded
   into every session, so a stale pointer does damage on every run.
2. Note that writes are **plain `Edit`/`Write` on the YAML**. There is no CRUD
   helper and that is deliberate (substrate-not-opinion).
3. Leave `.beads/` on disk as a frozen read-only archive. Do not delete it —
   `bd` reads still work, and the memory store may be recoverable later via a bd
   downgrade.
4. Commit the new `.diarie/` store **and** the archive JSONL together.

## Guidance

- **The migrator is not idempotent-by-accident.** Re-running it overwrites
  `.diarie/tasks/*.yml` from the export, discarding any hand-edits made since.
  After the first successful run the store is hand-maintained; only re-run to
  redo a botched migration, and say so before you do.
- **Do not use a project's existing `.diarie/tasks/*.yml` as a correctness
  reference** if it has already been hand-edited — it will not reproduce from the
  export, and diffing against it will produce phantom failures.
- **Report the `bd remember` store honestly.** On 1.1.0 it is unreadable. If the
  user wants it, the path is a bd downgrade to 1.0.5 — their decision, not a step
  this skill takes.
