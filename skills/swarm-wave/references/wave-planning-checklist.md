# Wave Planning Checklist

Reference material for swarm-wave workflows. See `SKILL.md` for the workflow
steps.

## Pre-Wave Gate

Five checks before launching any wave:

1. **Working tree clean** — `git status` must show no uncommitted changes.
   Stale staged files get swept into agent commits via `git commit -a`.
2. **Previous wave committed** — the prior wave's status in the SWARM file
   must be `committed`. Never interleave uncommitted waves.
3. **Memory pressure acceptable** — run the Phase 3 pressure check from
   `agent-concurrency-limits.md`. Reduce agent count or switch to sequential
   mode if pressure is HIGH or CRITICAL.
4. **File ownership reviewed** — no file appears in more than one agent's
   scope within the same wave. Cross-check the SWARM file's per-agent file
   list before launching.
5. **Issue descriptions complete** — each issue in the wave has a description
   the agent can act on. Run `bd show <id>` for each; flag any that are
   empty or ambiguous.

## Wave Execution Flow

Each wave follows this cycle:

```
plan-sprint (workflow 1) produces SWARM-NN.md with wave assignments
  |
  v
execute-wave (workflow 2) claims issues, launches agents, waits
  |
  v
post-wave-gate (workflow 3) reviews, checks, tests, commits
  |
  v
next wave or sprint close
```

Repeat the execute-wave + post-wave-gate cycle for each wave in the plan.

## Post-Wave Gate Sequence

Six steps, all blocking — the gate must fully pass before proceeding.

1. **Parallel launch**: 2 review agents (code-reviewer + domain-specific)
   alongside `npm run check` as a Bash command.
2. **Wait**: all three parallel tasks complete.
3. **Sequential tests**: run `npm test` (or workspace-scoped tests if the
   project uses workspaces — workspace-first, root-last).
4. **Tally**: `npm run check` must pass (P0). Code reviewer confidence
   must reach the threshold. Domain reviewer confidence must reach the
   threshold. See `review-gate-protocol.md` for thresholds.
5. **Fix**: address failures. Lint/type errors: fix inline. HIGH-severity
   review findings: launch a targeted fix agent. Re-gate from step 1 if
   any HIGH-severity fix was made.
6. **Commit**: `git commit --no-gpg-sign -m "feat: wave N — [theme]"`.
   Close completed wave issues with `bd close`. Update wave status to
   `committed` in the SWARM file.

## Retrospective Frequency

- **Every wave**: post-wave gate (mandatory, non-negotiable).
- **5+ waves in a sprint**: offer a mid-sprint retrospective before context
  is lost. Use `/retrospective` via the Skill tool.
- **Every sprint close**: offer `/retrospective` after the final wave.
- **Every 4th sprint**: trend-review retrospective (the `/retrospective`
  skill detects this automatically).

## Anti-Patterns

| Anti-Pattern | Why It Fails | Fix |
|---|---|---|
| Shared file in same wave | Agents clobber each other's changes | Split to separate waves |
| Launching before pressure check | OOM mid-wave kills agents | Phase 3 check first |
| Committing before gate passes | Broken code lands in main | Gate is non-negotiable |
| Skipping `bd close` in agent prompt | Issues stay `in_progress` forever | Always include completion instruction |
| Research agents writing source files | Non-deterministic mutations | Research agents get read-only source access |
| >6 code agents on 32GB | Context window thrash | Use the ceiling table in `agent-concurrency-limits.md` |
| Opening next wave before prior committed | Interleaved git history | Serial wave commits |
| Fat agent prompts (>3 issues per agent) | Incomplete work, scope creep | 1-3 issues per agent |
| No file-scope constraint in prompt | Agent wanders outside scope | Exhaustive file list required |
| Parallelizing tests | Test interference, flaky results | Sequential tests after gate |
| Closing sprint with open in\_progress issues | Phantom work, stale claims | Verify with `bd list --status in_progress` |
