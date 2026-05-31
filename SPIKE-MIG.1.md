# SPIKE-MIG.1 — Phase 2a verdict synthesis

**Bead:** `vp-beads-l9i.1` (spike, P1, parent: `vp-beads-l9i`)
**Sprint:** SWARM-15 (2026-05-18)
**Scope:** Empirically evaluate `MrLesk/Backlog.md` as the bd substrate replacement against the 5 evaluation criteria in `DESIGN-tracker-exploration.md`. Produce a documented verdict (adopt ≥85% / mixed 50–85% / rebuild <50%) that gates Sprint 16+ scope.

## Verdict: **MIXED — adopt Backlog.md + layer vp-beads-side supplements**

Phase 2b path per `DESIGN-tracker-exploration.md` Phase 2b section. ~4 sprints. Total vp-beads-side LOC budget: ~680–775 (skill rework + shim + claim-guard + Constitutional Guardrail + migration script).

## Per-criterion summary

| # | Criterion | Bead | Verdict | Evidence file |
|---:|---|---|---|---|
| 1 | bd JSONL → backlog/tasks/ migration cleanness | `vp-beads-l9i.1.1` | ~88–92% lossless (with 5 script behaviors); ~65% without | `SPIKE-MIG.1.1-findings.md` |
| 2 | 9→4 type collapse audit | `vp-beads-l9i.1.2` | **Viable** — zero `bd list -t <type>` query-time usage in skills | `SPIKE-MIG.1.2-findings.md` |
| 3 | swarm-wave concurrency smoke test | `vp-beads-l9i.1.3` | **STRONG PASS** for swarm-wave patterns; FAIL on single-task contention (mitigated by single-owner rule + ~30 LOC claim-guard) | `SPIKE-MIG.1.3-findings.md` (+ `/tmp/spike-mig-1.3-logs/`) |
| 4 | Skill rework cost (subsumes MCP tool-surface diff) | `vp-beads-l9i.1.4` | **MIXED** — 65% charitable / 79% architecturally-adjusted coverage; ~410–485 LOC rework + ~150 LOC shim recommended | `SPIKE-MIG.1.4-findings.md` |
| 5 | Threat model fit (Constitutional Guardrail compatibility) | `vp-beads-l9i.1.5` | **CONDITIONAL PASS** — composes cleanly with one HIGH net-new threat (`onStatusChange` Clinejection vector) requiring explicit Guardrail handling | `SPIKE-MIG.1.5-findings.md` |

## Synthesis: why MIXED and not REBUILD

Agent A (Criterion 4) declared the swing-factor: *"if concurrency fails, verdict flips to REBUILD."* Concurrency did **not** fail for swarm-wave's actual usage patterns:

- `task create` parallelism: PASS up to N=100 (no ID collisions, no malformed files, 16-25× design point headroom)
- `task edit` to distinct tasks: PASS up to N=16 (perfect 1:1 task→agent mapping)
- Subtask creation race: PASS — atomic dot-notation child IDs
- Torn-read during writes: PASS — strictly monotonic across 90 reads
- Kill -9 mid-write durability: PASS — zero debris, clean recovery
- Full realistic swarm-wave simulation (5 agents × claim+3 subtasks+close): PASS — 20/20 files, all state correct

The single-task contention failures (lost-update, multi-field edit race, stale-claim overwrite) all share one behavior fingerprint: **last-write-wins, silent**. swarm-wave's existing workflow 1 rule 4g ("Single owner per issue") already prevents the contention scenarios in practice. A ~30 LOC claim-guard wrapper (read-after-write, fail loudly on assignee mismatch) closes the class as defense-in-depth.

Therefore: Phase 2a does not trigger the REBUILD flip. MIXED stands.

## Synthesis: surprises that revise the design

### Backlog.md has more existing security defenses than expected

Agent E refuted the pre-spike baseline of "Backlog.md is markdown-first, not security-first." Empirical:

- **JSON schema validation** on MCP inputs
- **Length caps:** title 200 / description 10 KB / notes 20 KB / labels 50 chars
- **`sanitizeString`:** null-byte and CRLF normalization
- **`sanitizeFilename`:** path-traversal hardening
- **No MCP path arguments** — tools don't accept arbitrary paths
- **45 releases in 11 months** — actively maintained

Implication: the Constitutional Guardrail composes on top of an existing syntactic-defense layer rather than being the only defense. Almost no conflict surface. One length-cap mismatch (Guardrail 8 KB vs Backlog.md 10–20 KB per field) resolves by keeping 8 KB on the Guardrail side and forcing agents to split long writes — strictly tighter, no conflict.

### One HIGH net-new threat: `onStatusChange` shell-callback

Per-task and global YAML-frontmatter-configured shell commands fire on status change, templated with `$TASK_TITLE` (and other agent-controllable fields), executed via `bun.spawn(sh -c ...)`. Backlog.md project itself acknowledges the risk (task-321 implementation notes: *"Commands run with user's shell permissions. Document that users should be careful with repos from untrusted sources"*).

This is a textbook **Clinejection precedent** vector. The Constitutional Guardrail must:

- Block `task_edit ... --status` when any `onStatusChange` is configured anywhere in the repo or globally, OR
- Validate that no agent-controllable string interpolates into `onStatusChange` templates

Phase 2b must implement explicit handling. Allowlist of expected vp-heddle MCP calls is the recommended shape.

### Response-side wrapping required (not just input validation)

Agent E flagged: `task_view` / `task_list` return content verbatim — no provenance wrapping, no boundary markers. Stored prompt injections from prior writes reach agent context unmarked.

This expands the Constitutional Guardrail's 60 LOC estimate slightly — layers 2 (structural wrap) and 4 (markdown-mimicry strip) must apply to MCP **responses**, not just requests. Adds ~10–15 LOC.

### "75+ MCP tools" claim is wrong

Agent A: DeepWiki returns ~20 registered MCP tools (`task_*`, `document_*`, `milestone_*`, `decision_create`, `get_workflow_*`). The "75+" figure in the brew-backlog-md BM note conflated CLI subcommands with MCP tools. The actual MCP surface is leaner than advertised — which is good for the coverage math, bad for users assuming Backlog.md exposes everything via MCP.

### 9→4 type collapse is forced, not stylistic

Agent D confirmed: Backlog.md has 4 categories (`task / doc / decision / milestone`), no `epic`. So the plan's correction #2 ("epic → `task + label:epic`") is empirically the only viable path. The earlier (pre-corrected) design that kept `epic` as a distinct type was wrong. Type-collapse design is forced by Backlog.md's data model, not just preference.

## Phase 2b implementation budget

| Component | LOC estimate | Source |
|---|---:|---|
| Skill rework (3 substantive: backlog-groomer, retrospective, swarm-wave + 1 hook) | 410–485 | Agent A |
| vp-beads-side shim (`ready` / `blocked` / `stale` / `stats` / `dedup` computed over `task_list` MCP) | ~150 | Agent A |
| Claim-guard wrapper (read-after-write, fail loudly on assignee mismatch) | ~30 | Agent B |
| Constitutional Guardrail PreToolUse hook | ~60–75 | Plan + Agent E (response wrapping bump) |
| Migration script (`scripts/migrate-from-bd.mjs`) — 5 behaviors per Agent C | ~80–120 | Agent C |
| **Total** | **~680–860** | |

Plan budget for Phase 2b was ~4 sprints. This LOC volume comfortably fits — most of it is mechanical text-rename in skills.

## Phase 2b critical risks (priority-ordered for sprint planning)

1. **`onStatusChange` Clinejection vector (HIGH, net-new)** — Constitutional Guardrail must block `task_edit --status` when any `onStatusChange` is configured. Hard blocker — if not addressed, Phase 2b ships with a known prompt-injection vulnerability.
2. **Identity break across the knowledge ecosystem (HIGH)** — all 102 IDs shift from `vp-beads-{slug}` to `task-N`. Cross-references in BM `## Upstream Friction` lists, RETRO/SWARM markdown, and git commit messages can't auto-rewrite. Migration script must emit `id-map.json` + embed `_Original ID:_` in every migrated body. Without this, every cross-reference in the knowledge graph becomes a dangling pointer.
3. **AC double-source split (HIGH, silent data loss)** — 37/102 issues store acceptance criteria EXCLUSIVELY in bd's standalone `acceptance_criteria` frontmatter field (not in description). Migration script must detect-and-pick or 37% of issues silently lose their AC.
4. **Allowlist-shape MCP tool gate (MEDIUM)** — `agents --update-instructions` writes `CLAUDE.md`/`AGENTS.md` (auto-loaded next SessionStart); `board_export --readme` writes outside `backlog/`. Both are CLI-confirmed; MCP exposure uncrossverified. Recommend per-tool allowlist of expected vp-heddle MCP calls.
5. **Spike Findings placeholder pattern (MEDIUM, bespoke)** — 6 spike records use `## Findings\n(fill in when complete)` placeholders with actual findings in bd's `notes` field. Universal field-mapping breaks this class; migration script needs a find-and-replace.
6. **Response-side prompt-injection wrapping (MEDIUM)** — `task_view` / `task_list` return content verbatim. Guardrail must apply structural wrap + markdown-mimicry strip to MCP **responses**, not just requests. Adds ~10–15 LOC.
7. **Dependency edge-type info is lost (LOW)** — bd has typed deps (`parent-child`, `blocks`, `related`, `tracks`, `discovered-from`); Backlog.md's `dependencies` is flat. Either accept the loss (swarm-wave's `bd dep tree` / `bd blocked` queries lose precision) or prototype a custom-frontmatter `parent:` field early.
8. **`deferred` status has no native Backlog.md equivalent (LOW)** — 3 records affected. Recommend extending `backlog/config.yml` statuses rather than collapsing to a label.

## Evidence-quality caveats (to address before Phase 2b kickoff)

- Both Agent A and Agent E were sub-agent-sandbox-blocked from `gh api`. They ran **DeepWiki-only** for Backlog.md source inspection. DeepWiki is known to hallucinate (Agent A spot-check refuted the "75+ tools" claim). **Recommendation:** Phase 2b opens with a ~30-min `gh api` verification pass from main thread to confirm: (a) `board_export` and `agents` MCP exposure, (b) `onStatusChange` execution model details, (c) YAML loader safety mode (not audited at all). These are pre-conditions for the Constitutional Guardrail design.
- Agent B's concurrency tests cover the CLI surface. The MCP-side `task_edit` semantics may differ slightly (same backend code, but unverified empirically). A ~1–2 hr MCP-side concurrency test (standing up the Backlog.md MCP server + driving it from a test harness) would close the gap. Optional, not blocking.
- All findings are gitignored (`SPIKE-*.md`). The synthesis (this file) and per-criterion findings are ephemeral evidence — only the MIG.2 decision bead is the durable verdict artifact in git history.

## Alternatives considered (closed by this verdict)

- **Stick with bd:** rejected upstream of this spike (strategic-incoherence reasoning in plan section "Why this matters now")
- **Move to br (beads_rust):** rejected at exploration phase (user explicit: not evaluating br while needs are still being characterized)
- **Move to neul-labs/grite:** rejected at exploration phase (CRDT-rigorous but 6 stars; too risky)
- **Rebuild from harvmcp template (standalone `@voxpelli/<tracker>` npm package):** still viable as fallback if Phase 2b runs into a blocker not surfaced by this spike. The harvmcp template work would build on the Constitutional Guardrail design (which ships either way).

## Recommendation for MIG.2 decision bead

File `vp-beads-l9i.2` with:

- **Decision:** MIXED — adopt Backlog.md + layer vp-beads-side supplements per `DESIGN-tracker-exploration.md` Phase 2b
- **Rationale:** the 5-criterion synthesis above; cite this file
- **Alternatives Considered:** as above

Sprint 16 opens with:
1. ~30-min `gh api` verification pass (closes evidence-quality caveats)
2. Constitutional Guardrail PreToolUse hook (~75 LOC; ships first since it's substrate-independent and the Clinejection threat needs handling regardless of timing)
3. Migration script (`scripts/migrate-from-bd.mjs`) with the 5 behaviors from Agent C
4. Begin skill rework (text-rename portion can run as a swarm-wave wave; substantive portion is sequential)

## Artifacts

In project root (gitignored via `SPIKE-*.md`):
- `SPIKE-MIG.1.md` — this file (synthesis)
- `SPIKE-MIG.1.1-findings.md` — migration cleanness
- `SPIKE-MIG.1.2-findings.md` — type collapse
- `SPIKE-MIG.1.4-findings.md` — skill rework cost + MCP coverage
- `SPIKE-MIG.1.5-findings.md` — threat model

In `/tmp/`:
- `SPIKE-MIG.1.3-findings.md` — concurrency (written from main thread, not sub-agent sandbox)
- `spike-mig-1.3-logs/` — 15 evidence logs (6 create runs + 3 edit runs + 6 devious runs)
- `backlog-concurrency-harness.sh` — re-runnable concurrency harness
- `backlog-edit-concurrency-harness.sh` — re-runnable edit-concurrency harness
- `backlog-devious-tests.sh` — re-runnable adversarial test suite
- `backlog-scratch/` — final state of last devious test (5 Done parents + 15 subtasks, full realistic wave simulation)

Total spike execution time: ~2.5 hours (2 waves, 5 agents + 1 main-thread takeover, ~22 KB of findings + ~21 KB of synthesis).
