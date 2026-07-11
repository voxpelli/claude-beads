# Command Patterns

Reference material for swarm-wave workflow 2 (Execute a wave) and
workflow 5 (Research wave). See `SKILL.md` for the workflow steps.

## Research Agent Intent Matching

Match the research goal to an agent configuration:

| Intent          | Description                                      | Recommended Agents | Agent Focus                     |
| --------------- | ------------------------------------------------ | ------------------ | ------------------------------- |
| `explore`       | Survey a technology or pattern domain            | 5-10               | Broad coverage, entity creation |
| `deepen`        | Targeted investigation of one API or technique   | 3-5                | Depth over breadth              |
| `validate`      | Verify a proposed approach before implementation | 3-5                | Confirm or disprove             |
| `audit`         | Scan the codebase for a class of issue           | 5-37               | Read-only, no source mutations  |
| `bm-enrichment` | Enrich Basic Memory notes for dependencies       | 5-15               | Knowledge graph writes          |

For `audit` agents: read-only tools only — no Write, no Edit.
For `bm-enrichment` agents: cap at 15 to avoid write contention.

## Research Sprint Caps

| Cap                         | Threshold | When Exceeded                                |
| --------------------------- | --------- | -------------------------------------------- |
| Tasks from research         | 15        | Narrow scope or split into multiple sessions |
| Write agents per sprint     | 15        | Batch in sequential waves                    |
| Read-only agents per sprint | 37        | Batch in sequential waves                    |
| Findings files before dedup | 20        | Run dedup pass before launching more         |

## Tracker CLI Patterns

Common patterns used during swarm sprints. The reader is `diarie ready`; the store is
`.diarie/tasks/tasks-<slug>.yml`, edited directly (plain Edit/Write — there is
no CRUD helper) and validated with `diarie validate`:

```bash
# Wave planning — list all ready issues (add --json to parse)
diarie ready

# Agent prompt construction — full issue detail
# read the task entry in .diarie/tasks/tasks-<slug>.yml

# Pre-wave — claim issues before launch
# edit the task row: status: in_progress + agent: <name>, then:
diarie validate

# Post-wave — close completed issues
# edit the task row: status: completed, then:
diarie validate

# Post-wave — check for unclosed stragglers
diarie ready --filter in_progress

# Sprint summary
diarie stats

# Dependency-aware ordering (find blocking chains)
diarie ready --blocked
```

### Tracker-less run-state equivalents

When swarm-wave sources waves from a `ROADMAP.md` or a manual list (tracker
absent — no `.diarie/tasks/tasks-*.yml` file, or the reader is not runnable),
the `SWARM-NN.md` `### Item Status` table replaces the tracker lifecycle edits.
The orchestrator owns every write:

| Tracker action (tracker source)             | Tracker-less equivalent (Item Status table)    |
| ------------------------------------------- | ---------------------------------------------- |
| `diarie ready`             | the work items parsed from ROADMAP / supplied  |
| edit task row → `status: in_progress`       | set the item's row to `claimed`                |
| edit task row → `status: completed`         | set the item's row to `done`                   |
| `diarie ready --filter in_progress`     | rows still `claimed` (not `done`) are unclosed |

Items deferred to a later wave are marked `carried`. Agent prompts omit the
completion-edit line in this mode (see below).

## Batch Issue Creation from Research

When workflow 5 (Research wave) produces findings for issue creation:

1. Write merged findings to a file (e.g., the SWARM research summary)
2. Hand off to `/backlog-groomer workflow 5 (Create issues from findings)`
   via the Skill tool — reference the findings file
3. Backlog-groomer deduplicates against existing issues, proposes structured
   issues, and appends task entries to `.diarie/tasks/tasks-<slug>.yml`
   (via Edit/Write — no CRUD helper) with user approval

Do not create tasks directly from swarm-wave. Backlog-groomer owns task
creation for research findings (it has dedup logic and title conventions).

## Agent Prompt Template

Canonical form for task agents launched by workflow 2 (Execute a wave):

```
Task: [issue title from the task entry]
Issue: [issue ID]

Scope — you may ONLY modify these files:
  - [file1]
  - [file2]
  - [test file for file1]

Constraint: Do not modify any file outside the scope list above.
Other files in the same directory are owned by other agents in this wave.

Instructions: Read the task entry in `.diarie/tasks/tasks-<slug>.yml` for
the full issue description. Implement the requested change within your file
scope.

Validation: Run `npm run check` before finishing. If it fails, fix the
issues within your scope.

Completion: Edit your task row to `status: completed` (then run
`diarie validate`) when the issue is done.
```

Key requirements:

- **Exhaustive file list** — never use directory globs; agents interpret
  globs liberally and wander outside scope
- **Explicit isolation constraint** — the "do not modify" line prevents
  cross-agent file contention
- **completion instruction** — without it, tasks remain `in_progress`
  after the agent finishes. **Tracker-less source:** omit the read-task/
  completion-edit lines; inline the issue description into the prompt and let
  the agent report completion in its final message — the orchestrator marks the
  Item Status row `done`.
- **`npm run check`** — catches lint/type errors before the post-wave gate

## Pre-Sprint Research Pattern

Run before workflow 1 (Plan a swarm sprint) when the backlog has items with
unclear scope:

1. Identify under-specified issues (`diarie ready` + scan
   descriptions)
2. Run workflow 5 (Research wave) with intent `validate` scoped to those
   issues
3. Hand off enriched findings to `/backlog-groomer workflow 6 (Enrich an
   existing issue)`
4. Then run workflow 1 (Plan a swarm sprint) with the enriched backlog

## Post-Sprint Research Pattern

Run after the final wave when the sprint surfaced new unknowns:

1. Collect unanswered questions from wave review findings
2. Run workflow 5 (Research wave) with intent `explore` or `deepen`
3. Hand off significant findings to `/backlog-groomer workflow 5 (Create
   issues from findings)` for the next sprint's backlog
