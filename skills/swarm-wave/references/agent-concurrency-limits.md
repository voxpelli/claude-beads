# Agent Concurrency Limits

Reference material for swarm-wave workflow 2 (Execute a wave) and workflow 5
(Research wave). See `SKILL.md` for the workflow steps.

## Memory Pressure Levels

| Level | Indicator | Action |
|---|---|---|
| LOW | >40% RAM free | Launch planned agent count |
| MEDIUM | 20-40% RAM free | Reduce agent count by 1 |
| HIGH | 10-20% RAM free | Reduce agent count by 2; consider sequential |
| CRITICAL | <10% RAM free | Do not launch. Stop and report to user. |

## Agent Count Ceilings

| RAM | Code Agents | Research (Read-Only) | BM Write Agents |
|---|---|---|---|
| 8 GB | 3 | 5 | 3 |
| 16 GB | 5 | 10 | 8 |
| 32 GB | 6 | 20 | 12 |
| 64 GB+ | 6 | 37 | 15 |

Code agent ceiling is 6 regardless of RAM. The constraint is coordination
overhead (file contention, merge complexity), not memory.

## 4-Phase Backpressure Sequence

Run before launching any wave.

### Phase 1 — Kill orphaned processes

Check for agent processes abandoned from a prior wave:

```bash
ps aux | grep -E "(claude|mcp-server)" | grep -v grep
```

If orphaned processes are found from a previous wave, kill them. Orphaned
agents consume RAM and context quota without contributing work.

### Phase 2 — GC cooldown

After killing orphans, wait 5 seconds before measuring memory. The Node.js
garbage collector needs time to reclaim freed pages. Skip this phase for
waves with fewer than 5 agents (pressure readings stabilize during the
kill phase for small waves).

### Phase 3 — Pressure check

```bash
# macOS
memory_pressure
# or: vm_stat | grep "Pages free:"
```

Classify as LOW/MEDIUM/HIGH/CRITICAL per the table above. Adjust agent
count accordingly.

### Phase 4 — Sequential fallback

If pressure is CRITICAL or the wave previously crashed with OOM:

- Run agents sequentially (one at a time, wait for completion before
  launching the next)
- Do not switch back to parallel mid-wave
- Sequential mode applies to the full wave

## Sequential Test Rationale

Tests always run sequentially after the gate, not in parallel:

- Tests may share file fixtures or ports
- Parallel test results are harder to diagnose when failures occur
- A failing test in one agent's scope should not mask a pass in another's
- For workspaced projects: run workspace tests first, root tests last
  (`npm run test:node --workspace=X`, then `npm run test:node`)
