# Tracker-migration synthesis — 12-agent research round (2026-06-09)

> **Status:** durable evidence base for the bd→flat-file migration. This is the
> citation source `DESIGN-tracker-exploration.md` (v3) and `ROADMAP.md` reference
> instead of restating evidence inline. Supersedes
> `RESEARCH-ai-issue-tracker-ultimate-solution.md` as the live basis (that doc is
> retained as archived prior art — its Gemini-Deep-Research catalogue is still useful,
> but several of its premises are corrected below).
>
> **Provenance:** a 12-agent research round (5 validate+enrich, 3 grounded analysis,
> 4 visionary, 1 forensic reliability, 2 thesis-check) re-examined two prior designs —
> the committed `DESIGN-tracker-exploration.md` v2 (verdict: MIXED → adopt Backlog.md)
> and an external document proposing a hone-ai amnesiac flat-file loop. The agents
> validated against primary sources, corrected several load-bearing premises, and
> resolved the substrate + unit-of-work questions. The verdict **overturns the committed
> MIXED→Backlog.md spike** in favour of a lean flat-YAML substrate.

## TL;DR

- **Substrate verdict: Option C — lean flat-YAML + a `ready-walker`** (three-way bakeoff,
  ~85% confidence). One `tasks-<slug>.yml` per epic/slug + a ~150 LOC `ready-walker.mjs`
  (deterministic transitive-unblock) + a `validate-tasks.mjs` integrity linter cloning the
  existing `validate-plugin.mjs` idiom. **Zero new runtime deps** (`js-yaml` already
  present), no process, no vendor, no SQLite index in v1.
- **Decline Backlog.md** (its MCP server is another daemon/vendor; it can't block on deps
  so it structurally cannot reproduce `bd ready`) and **decline the hone-ai three-stage
  loop** (an opinionated plan→approve→execute→finalize workflow that violates
  substrate-not-opinion). **Borrow** hone-ai's `progress.txt` + `AGENTS.md` accretion
  *discipline* and a *fresh-context reviewer* — take the file shape, reject the loop.
- **Real driver: the operational complexity-delta of bd-on-Dolt**, not data loss and not
  the memory tax (both dormant/paid-down here). Lead the rationale with that.
- **Unit of work: wave/sprint, not feature.** The per-feature PRD triplet over-fits a repo
  whose p50 issue lifespan is one hour.

## 1. Corrected technical premises (primary-source)

The two prior designs rested on premises that are now known false or stale. Each must be
struck or rewritten wherever it appears.

| # | Premise (as written) | Verdict | Primary source |
|---|---|---|---|
| 1 | "`node:sqlite` ships without FTS5 — needs a custom build or better-sqlite3" | **STALE** | FTS5 ships in `node:sqlite` since **Node v24.0 / v22.16** (May 2025), PR `nodejs/node#57621`, tracking issue `#56476`. Issue `#56951` was a same-day duplicate. |
| 2 | "`openclaw#65033` documents Node-24 extension-loading tightening (re: FTS5)" | **MISAPPLIED** | The issue exists but concerns **sqlite-vec extension loading**, not FTS5. Extension loading has been opt-in via `allowExtension: true` since v23.5/v22.13 — not a regression. Read correctly, it *undercuts* the FTS5 premise. |
| 3 | "Reuse liggare's FTS5+WASM SQLite build / extend it with a second source adapter" | **REJECTED** | `voxpelli/liggare-mcp` is **private, ~1 week old, v0.1.0**, uses **native better-sqlite3 (not WASM)**, **deleted** its WASM ripgrep, has **no source-adapter seam** (`conductPosting` hard-imports a single comment scanner), and opens its DB read-**write** (no read-only-from-skill path). "Add an adapter" = a **400–700 LOC refactor of someone else's unstable private project**. |
| 4 | "An FTS5/vector SQLite index is needed for the query layer" | **DEFERRED to v2** | Ripgrep over the canonical YAML/markdown covers keyword search with zero index/schema/sync. sqlite-vec (vectors) is independent of FTS5. An index is a *triggered v2* (revival: >500 tasks **and** measured ripgrep latency pain). |
| 5 | "hone-ai reviews with a different LLM (generation/evaluation separation, inherited)" | **NET-NEW** | Both `/hone:review` and run-phase-2 are **same-agent self-review of its own diff**. A fresh-context / escalated-tier reviewer must be *added*. It is empirically essential — self-grading skews positive (self-preference: arXiv:2404.13076, 2410.21819; generate≠judge: arXiv:2509.19880; self-refinement amplifies bias: arXiv:2402.11436). |

**Implication:** the entire "Stage 0 substrate verification" of the external document
(resolve the FTS5 gap, reuse liggare) is **moot** — the gap doesn't exist and the reuse
target isn't reusable. The query layer is ripgrep; the `ready` computation is a small
deterministic walk (§4).

## 2. The reframed driver — operational complexity-delta

The migration's two *nominal* motivations are dormant at this repo's scale; the real
driver is the operational tax of bd-on-Dolt.

**Dormant nominal pains (empirical, this repo):**
- **Dependency enforcement does zero live work.** 121 issues, 55 dep edges, but only **1
  net-blocked** issue; every open-issue blocker is already closed; `bd ready` returns all
  13 open issues; max chain depth 4 (mostly closed); **p50 issue lifespan = 1 hour** (fast
  solo churn — issues born and closed in one session). A flat-file `ready = open ∧
  no-open-blocker` would behave identically today.
- **The `bd remember` tax is paid down.** 2 entries, 354 chars (~90 tokens); already
  disciplined by `/harden-memories`. Upstream `#3961` (uncapped injection) is real but a
  *solved problem here*.

**The real driver — the complexity-delta (forensic ledger, §3):** bd-on-Dolt imposes a
daemon + dynamic ports + 4 runtime files + 2 binary DB trees + a dual-store JSONL↔Dolt
sync + binary-schema migrations + orphan-process reaping. Flat-files-on-git add **zero**
new surface (git is already present). The delta is large, one-directional, and
**unredeemed** by anything a solo single-host dev consumes — bd's reason-to-exist
(cross-machine Dolt merge) is the exact feature this repo turns off (`export.auto=false`,
gitignored `.beads/`, no `bd dolt push`).

**Honesty guard (do not overclaim):** bd's read path is fast (`bd stats` ~0.38s, `bd
doctor` 70/72, 0 errors), 105 issues closed cleanly, and its **9-type vocabulary is
genuinely good** — so good the migration target keeps it. "Half-broken" is fair to the
*daemon layer*, unfair to the *data layer*. Lead the rationale with the complexity-delta,
not data-loss horror stories (the data-loss bugs are config-gated and already neutralized
here — see §3, class C).

## 3. Reliability incident ledger (forensic)

Twelve incidents, classified **F** (fundamental — architectural, can't config away),
**C** (configurable/self-inflicted), **M** (misuse/mismatch for solo-single-host).

| # | Incident | Class | Severity | Recency | Upstream |
|---|---|---|---|---|---|
| 1 | Dolt daemon **port flapping** — 22 restarts across 9 ports; this session warned port 51925→53274 | F | annoyance (auto-recovers) | **live** | #3516, #3709 open |
| 2 | Daemon **dies before "ready"** — 5 of 22 starts (23%) | F | blocks (transient) | **live** | #2559 open |
| 3 | **Orphaned `dolt sql-server` daemons** — 2 running now (28+69MB); upstream reports 7 @ ~2GB/67W | F | resource drain | **live** | #4282 open |
| 4 | **60s export-throttle silently drops writes** (rapid scripted writes = agents) | C→F | silent data-loss | mitigated (`export.auto=false`) | #3948/#4245/#4239/#4304 open |
| 5 | **Concurrency-crash ceiling** under parallel-agent swarms | F | blocks | live (latent; batch-mitigated) | #4128/#3878 open |
| 6 | **`bd close` silently reverts** when `.beads/` gitignored | C | silent data-loss | NOT live here (`export.auto=false`) | #4038 closed; #3948 open |
| 7 | JSONL import-export bug fired 5× in one sprint (claim/close drops) | C/F | silent data-loss | historical (v1.0.4) | #4/#6 family |
| 8 | **migration-0043 breaks cross-machine Dolt sync** (v1.0.5 gated) | F (M here) | blocks (cross-machine) | live upstream; N/A here | #4259 open |
| 9 | Migration 28 **fatal "nothing to commit"** on fresh DB | F | warning spam | **live** | #4137 open |
| 10 | `bd close` exits 1 without `--reason` | C (by design) | annoyance | live (config) | working-as-configured |
| 11 | Doctor false-positives / drift | C/M | annoyance | live | UPSTREAM-tracked |
| 12 | CLAUDE.md colonization (`bd setup claude` double-inject) | C (declined) | annoyance | mitigated | working-as-designed |

**Split:** ~half F, half C/M. The scariest class (data-loss #4/#6/#7) is **C and already
neutralized** — but the *reason* it's neutralized is that this repo **defeats bd's core
sync architecture** (gitignore `.beads/`, disable auto-export, never `dolt push`). At that
point bd runs a multi-writer versioned-SQL daemon, with its full F-class tax (#1/#2/#3/#9
observed live), to serve a single-host issue list flat-files-on-git would serve with zero
surface. **Upstream context:** `gastownhall/beads` has 236 open issues (63% mention Dolt),
145 commits/14 days; the maintainer has himself churned the storage substrate (removed the
SQLite/daemon, then reverted to embedded Dolt).

## 4. The structural insights

- **The four decisions are separable** (stop fusing them): **A1** amnesiac loop
  (independent — you can adopt it while keeping any substrate), **A2** flat-file substrate
  (the real bet), **A3** index (one-way derived from A2; deferrable), **A4** drop-beads
  (coupled to A2 only by *narrative*, not mechanism — you could keep `bd` as a dep-graph
  oracle while files hold canonical state). The migration is fundamentally an **A2**
  decision; A1/A3/A4 ride along only by choice.
- **The `ready`-walker is THE load-bearing primitive.** A ~150 LOC deterministic
  transitive-unblock walk over parsed YAML: `ready ⇔ status==todo ∧ ∀dep done`. BM's Task
  type, git-bug, and backlog.md **all lack** a `ready` computation; beads has it trapped in
  Dolt. Reproduce that one computation and querying / BM projection / the draft spec all
  compose around it. It is *also* the one primitive the whole ralph/hone/Anthropic/
  backlog.md ecosystem has never standardized (§6, draft-spec).
- **Anti-bit-rot is a check-time gate, honestly scoped.** A `validate-tasks.mjs` (mirroring
  `validate-plugin.mjs`: per-file structural → cross-file dep-graph via Kahn's cycle/orphan
  check → status-transition sanity → test-ratchet) wired as a `check:tasks` stage + a
  PostToolUse hook catches dep-graph rot at `npm run check` time. This is the *same*
  guarantee `bd graph check` gave — a snapshot, not a structural invariant. **Do not
  overclaim it as enforcement** (the biggest honest risk: the dep graph is only as correct
  as the agent's edits — but enforcement is dormant at this scale, and the markdown-per-task
  fallback exists if big-YAML edits prove fragile).
- **Don't over-unify the 3 memory systems.** `bd remember` (always-injected core),
  MEMORY.md auto-memory (capped bridge), Basic Memory (retrieved cross-project graph) are
  **load-bearing tiers** (hierarchical memory with explicit eviction — a hand-built
  MemGPT/Letta core-vs-archival paging). Merging them forces one policy onto opposite
  workloads. **But** Basic Memory shipped a native **`Task` type (v0.19.0)** — so make the
  `tasks-<slug>.yml` frontmatter a **BM-parseable superset** for a near-free *read-only*
  BM projection (the lead motif's "BM graph integration", cheapest version; BM is the lens,
  the ready-walker stays the engine).
- **The flywheel's return edge is missing.** `retrospective` step 7 *writes*
  `engineering/agents/*` orchestration lessons; `swarm-wave` workflow 1 *never reads* them.
  Closing that one edge (wave-planning reads prior contention/gate lessons; measure **rework
  ratio** = fix-iterations per wave) is the cheapest compounding win. Evidence it compounds:
  Voyager (arXiv:2305.16291, library accretion + external feedback transfers); reflection on
  external error signals (arXiv:2405.06682, p<0.001); Mem0 selective forgetting (+10%). It
  *rots* only if an edge grades against the model's own opinion — every edge must be
  externally grounded.

## 5. Substrate bakeoff — the decision

Three live options, scored on the user's top tenets given the real driver.

| Criterion | A — Backlog.md | B — hone triplet | **C — lean flat-YAML + ready-walker** |
|---|---|---|---|
| Lock-in resistance | weak (vendor + MCP server + forced 9→4) | ok (skills-only but couples to hone shape; index → liggare) | **strong (plain YAML + node:fs + git + js-yaml)** |
| Op. simplicity / new deps | weak (reintroduces an MCP server *process* — the daemon being fled) | ok (no daemon; but index drags in SQLite) | **strong (0 new runtime deps, no process)** |
| Fit to 1-hr churn | ok (heavy create→claim→close round-trip) | weak (PRD+tasks+progress per feature = absurd overhead) | **strong (append a YAML entry; walk; edit status)** |
| Substrate-not-opinion | weak (ships a plan→approve→execute→finalize workflow) | weak (the three-stage loop is the prescribed workflow) | **strong (primitives only; skills supply workflow)** |
| Migration cost | ok→weak (4 HIGH risks; ~680–860 LOC + shim + Guardrail) | weak (biggest conceptual rewrite) | **ok (one YAML/epic + two ~150 LOC scripts)** |
| BM-Task projection | weak (own frontmatter shape) | ok (per-feature ≠ per-task) | **strong (one YAML task ≈ one BM Task)** |
| Anti-bit-rot | ok (external write-schema, rot moves to the shim) | weak (Yegge's critique applies verbatim) | **strong (validate-tasks.mjs in `npm run check`)** |
| Query without index | ok (back to the tool) | weak (the FTS5 index path is dead) | **strong (ripgrep, zero index)** |

**Decisive criteria** (not all weigh equally given the real driver): operational simplicity
/ zero-new-deps, lock-in resistance, substrate-not-opinion, and **the `ready`-walker** —
Backlog.md *structurally cannot* reproduce `bd ready` (it doesn't block on deps), B defers
it to a now-dead index, **only C reproduces it**. The repo's existing `validate-plugin.mjs`
*is already* C's idiom (`node:fs` + `js-yaml` + errors/warnings linter + `scripts/*.mjs` +
`run-p check:*`), and `js-yaml` is already a dependency — C clones a file that already
exists and adds nothing.

**Winner: Option C.** Hybrid: **C as substrate**, **borrow B's `progress.txt`/`AGENTS.md`
accretion + the fresh-context reviewer as execution discipline**, **decline A's external
tool and B's PRD-triplet-as-unit + three-stage loop.** The document (Option B) is
**superseded as the substrate recommendation, survives-in-part as execution discipline.**
The committed SPIKE verdict (Option A, MIXED→Backlog.md) is **superseded** — its
concurrency-PASS evidence stays valid but is no longer decisive.

**Unit of work: wave/sprint, not feature.** 0 of the last ~20 closed issues would have
warranted a PRD triplet (`l82` closed in 3.5 min; the 6-task `3mn` epic born-and-closed in
~25 min). The per-feature triplet is hone-ai's app-feature granularity, a category mismatch
for hour-scale wave-batched markdown edits, and it contradicts the *sprint*-choreography
lead motif. The rare epic-scale initiative (this migration) is the only "feature" — already
modelled as **epic→children**, so no third hierarchy is added. As a meta-tool, vp-beads
stays **granularity-agnostic**: the substrate is a CRUD store over typed items at any size;
the skills decide bundling (preserving the format-agnostic stance
`roadmap-interpretation.md` already enforces for downstream projects).

## 6. Vision-level expansions

- **Calm-sovereign positioning.** vp-beads is the deliberate antithesis of Gas Town's
  maximalist/federated pole (Dolt SQL server :3307, `gt daemon`, a Mayor coordinating
  20–30 agents, `wasteland` federation). Its pole: **plain text + git, no daemon, one human
  amplified, zero lock-in.** The intellectual canon — local-first (Ink & Switch), calm tech
  (Weiser), small tech (Balkan), indieweb/POSSE, Worse-is-Better (Gabriel), convivial tools
  (Illich) — is ~90% already an *intentional cluster* in the user's library and distilled
  in the 13 Knowledge-Graph Axioms. Owning the pole turns scope-NOs into **doctrine** (no
  daemon / no SQL store / no dashboard / no fleet roles become automatic refusals). The
  move is **one VISION.md sentence**, not a manifesto. (The two poles are *fair*: fleet-scale
  federation genuinely wins for teams running continuous autonomous agents — that is Gas
  Town's correct audience; the calm pole is the answer for sovereign solo builders.)
- **Draft-spec optionality.** The in-repo `ready` computation is the one primitive the
  ecosystem (ralph `prd.json`, Anthropic `feature-list.json`, hone triplet, backlog.md,
  AGENTS.md/AAIF, MCP Tasks SEP-1686) has converged toward but never standardized
  (backlog.md validates deps but doesn't block; Anthropic Tasks blocks but stores state in
  `~/.claude`, not in-repo). A one-page `SPEC.md` ("Draft v0 — reference implementation:
  this repo", status vocab mapped to MCP Tasks SEP-1686) makes the migration *be* the
  reference impl for ~zero cost. **Survivorship-honest:** LOW odds as an evangelized
  standard (AGENTS.md/MCP are now under the Linux Foundation's Agentic AI Foundation — a
  solo dev does not out-standardize a foundation), HIGH odds as a draft that disciplines the
  migration and gives the vp-* fleet one shape. Promote only on external adoption signal.
- **Strategic incoherence with Gas Town is real and fast-moving but positioning, not
  technical forcing** (beads is MIT, stable). Keep the rename (`vp-beads`→`vp-heddle`)
  gated at M4, **decoupled** from the substrate migration — the rename must not do
  argumentative work the engineering should do.

## 7. Prior-art map (primary-source, for attribution)

| Source | Person | What we take / how it relates |
|---|---|---|
| **hone-ai** (`oskarhane/hone-ai`, MIT-in-manifest, no root LICENSE) | Oskar Hane | The amnesiac-loop file shape. **Keep** its `progress-<slug>.txt` + `AGENTS.md` accretion *discipline*; **decline** its three-stage loop and per-feature PRD triplet. |
| **Ralph loop** (ghuntley.com) | Geoffrey Huntley | The canonical "amnesiac agent in a bash loop; state on disk" technique. |
| **`snarktank/ralph`** (MIT, 20k★) | Ryan Carson | The `prd.json`→`progress.txt` lineage hone-ai generalizes. |
| **"Long-running Agents"** (addyosmani.com) | Addy Osmani | "State lives outside the agent's context… the agent is amnesiac, the filesystem isn't." |
| **"Effective harnesses for long-running agents"** | Anthropic | `feature-list.json` + `claude-progress.txt` + test-ratchet shape; planner/generator/evaluator triad (independently converged on gen/eval separation). |
| **beads** (`gastownhall/beads`, MIT) | Steve Yegge & maintainers | The substrate built-on and migrating-from. **Keep** the 9-type issue vocabulary (genuinely good); leave the Dolt substrate. Yegge's bit-rot critique (markdown plans "not queryable", "bit-rot fast") is the steelman the anti-bit-rot linter answers. |
| **Backlog.md** (`MrLesk/Backlog.md`, MIT) | MrLesk | Evaluated as a substrate candidate (Phase 2a spike); declined (vendor + MCP-server daemon; can't do `ready`). |
| **Cursor "Scaling agents"** | Cursor | Non-coordinating scoped workers + per-cycle judge + fresh restart beats locks/OCC — validates file-disjoint + post-wave gate. |

## 8. Confidence & residual risks

- **High confidence:** the corrected premises (§1, all primary-source); the reliability
  ledger F/C/M split (§3, live-observed + `gh`-verified); the empirical dormancy (§2,
  live `bd` data); the bakeoff (§5, over-determined by corrected facts + tenets + the repo's
  own validator idiom).
- **The single biggest risk in Option C:** the ready-walker is only as correct as the
  agent's `dependencies` edits (trades structural enforcement for recomputed readiness +
  a CI linter). **Mitigant:** enforcement is dormant at this scale; `validate-tasks.mjs`
  catches cycles/orphans/dangling-deps in `npm run check`; markdown-per-task is the
  shelf-fallback if big-YAML edits prove fragile. Don't build the fallback speculatively.
- **Open thread (carry, don't resolve):** whether the independent reviewer should be lifted
  out of swarm-wave into a standalone substrate-level primitive — route into the
  skill-rework scope, decide with execution evidence.
- **Empirical unknowns deferred to execution:** can N fresh-context loops run concurrently
  safely (spike, not assumption); does fresh-context-same-model review recover the
  different-model benefit (test in-repo before claiming the per-loop reviewer substitutes
  for a cross-model judge).
