# Command Patterns

Reference material for swarm-wave workflow 2 (Execute a wave) and
workflow 5 (Research wave). See `SKILL.md` for the workflow steps.

## Research Agent Intent Matching

Match the research goal to an agent configuration:

| Intent | Description | Recommended Agents | Agent Focus |
|---|---|---|---|
| `explore` | Survey a technology or pattern domain | 5-10 | Broad coverage, entity creation |
| `deepen` | Targeted investigation of one API or technique | 3-5 | Depth over breadth |
| `validate` | Verify a proposed approach before implementation | 3-5 | Confirm or disprove |
| `audit` | Scan the codebase for a class of issue | 5-37 | Read-only, no source mutations |
| `bm-enrichment` | Enrich Basic Memory notes for dependencies | 5-15 | Knowledge graph writes |

For `audit` agents: read-only tools only — no Write, no Edit.
For `bm-enrichment` agents: cap at 15 to avoid write contention.

## Research Sprint Caps

| Cap | Threshold | When Exceeded |
|---|---|---|
| Beads issues from research | 15 | Narrow scope or split into multiple sessions |
| Write agents per sprint | 15 | Batch in sequential waves |
| Read-only agents per sprint | 37 | Batch in sequential waves |
| Findings files before dedup | 20 | Run dedup pass before launching more |

## bd CLI Patterns

Common patterns used during swarm sprints:

```bash
# Wave planning — list all ready issues
bd ready

# Agent prompt construction — full issue detail
bd show <id>

# Pre-wave — claim issues before launch
bd update <id> --claim

# Post-wave — close completed issues
bd close <id>

# Post-wave — check for unclosed stragglers
bd list --status in_progress

# Sprint summary
bd stats

# Dependency-aware ordering (find blocking chains)
bd blocked
```

## Batch Issue Creation from Research

When workflow 5 (Research wave) produces findings for issue creation:

1. Write merged findings to a file (e.g., the SWARM research summary)
2. Hand off to `/backlog-groomer workflow 5 (Create issues from findings)`
   via the Skill tool — reference the findings file
3. Backlog-groomer deduplicates against existing issues, proposes structured
   issues, and runs `bd create` with user approval

Do not create issues directly from swarm-wave. Backlog-groomer owns `bd
create` for research findings (it has dedup logic and title conventions).

## Agent Prompt Template

Canonical form for task agents launched by workflow 2 (Execute a wave):

```
Task: [issue title from bd show]
Issue: [issue ID]

Scope — you may ONLY modify these files:
  - [file1]
  - [file2]
  - [test file for file1]

Constraint: Do not modify any file outside the scope list above.
Other files in the same directory are owned by other agents in this wave.

Instructions: Run `bd show [id]` to read the full issue description.
Implement the requested change within your file scope.

Validation: Run `npm run check` before finishing. If it fails, fix the
issues within your scope.

Completion: Run `bd close [id]` when the issue is done.
```

Key requirements:

- **Exhaustive file list** — never use directory globs; agents interpret
  globs liberally and wander outside scope
- **Explicit isolation constraint** — the "do not modify" line prevents
  cross-agent file contention
- **`bd close` instruction** — without it, issues remain `in_progress`
  after the agent finishes
- **`npm run check`** — catches lint/type errors before the post-wave gate

## Pre-Sprint Research Pattern

Run before workflow 1 (Plan a swarm sprint) when the backlog has items with
unclear scope:

1. Identify under-specified issues (`bd ready` + scan descriptions)
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
