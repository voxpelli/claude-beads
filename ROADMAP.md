# ROADMAP — vp-beads tracker (long arc)

> **Lead motif** *(the test every deferred-or-revival decision below defers to):*
>
> **Sprint workflow choreography for solo developers running Claude Code agent swarms — with constitutional safety middleware and Basic Memory graph integration.**

> Long-arc roadmap for the tracker substrate underneath vp-beads. Covers horizons (H1–H4), the deferred-feature backlog, the M1→M4 migration milestones, evolving strategic position, and the explicit not-doing list. Companion to `DESIGN-tracker-exploration.md` (architecture) and to whatever immediate-sprint roadmap surfaces in parallel.
>
> **Template precedents:** mirrors the shape of `/Users/pelle/nollfyranoll/ai/harvmcp/ROADMAP.md` (per-feature what / why / trigger / effort tables) and `/Users/pelle/yikesable/weft-ai/VISION.md` (three-horizon framing, explicit "What X Is Not", open-core boundary). The user has now written this kind of doc three times; this is template-following, not novel framing.
>
> **Status:** drafted 2026-05-18, immediately after `DESIGN-tracker-exploration.md` v2 stripped four material errors from v1 and landed the Backlog.md substrate spike as Phase 2a. The tracker name is unsettled and handled at M4 — implementation is name-agnostic.

---

## Section 1: Horizons

Four horizons. **Only H1 is committed.** H2 is conditional on H1 dogfooding findings. H3 is aspirational and requires a triggering constraint. H4 is the research-doc speculative end-state and may never advance past "documented possibility."

### H1 — Personal use, dogfood (months)

**Scope.** Whichever of (a) Backlog.md substrate + vp-beads supplements [Phase 2b] or (b) from-scratch `@voxpelli/<tracker-name>` standalone package [Phase 3] wins the Phase 2a spike. Single-host, single-user (pelle). Markdown canonical, optional SQLite projection, lockfile concurrency, Constitutional Guardrail middleware. 6–7 MCP tools, no resources, no sampling. Skill shells out to CLI; degraded path uses direct markdown reads.

**Success criterion (mirrors weft-ai H1).** Does using the tracker through vp-beads make sprint workflow noticeably better than bd did? Measured by: zero parallel-agent concurrency crashes over 4 swarm-wave sprints; first six-month skill-rework cost <2 sprints; the user does not voluntarily look sideways at bd again.

**What gets built.**
- Phase 2a spike (1 sprint)
- Phase 2b OR Phase 3 build-out (4 sprints if Backlog.md substrate; 8+ if from-scratch)
- vp-beads 7-skill refactor against the new substrate
- Constitutional Guardrail (either as PreToolUse hook on Backlog.md MCP, or as in-tree middleware in the from-scratch tracker — same ~50 LOC, different attachment point)
- Migration tool: `bd export → tracker import`, lossless within the 9→4 type collapse

**What is deliberately NOT built at H1.**
- Multi-host coordination
- MCP resources (deferred per harvmcp "Don'ts" precedent)
- MCP sampling
- MCP Tasks primitive (experimental in 2025-11-25 spec; evaluate at H2)
- Vector embeddings / hybrid semantic search
- Ed25519 signed events
- Web UI
- AGENTS.md handshake (revisit if a second tracker-aware tool emerges)
- bd-style `bd remember` (Claude Code memory mechanisms already cover this)
- GitHub Issues bridge
- **CLAUDE.md auto-injection / `setup-claude` colonization** (this is bd's signature anti-pattern — see Section 6)

**Regression failure modes** (would force a fall-back to bd or to a smaller scope):
- Markdown-per-issue produces unworkable swarm-wave conflict rates (>10% of parallel claims collide)
- Backlog.md upstream pivots in an incompatible direction during the 4-sprint Phase 2b window
- Constitutional Guardrail false-positive rate >5% on real issue bodies (the injection-marker regex over-fires on legitimate `system:` prefixes etc.)

### H2 — Multi-project / generic (~1 year)

**Trigger conditions to advance.**
1. H1 has dogfooded for ≥4 sprints without architectural regression.
2. weft-ai (the user's second bd-using project) wants to migrate off bd and the tracker is a viable target without weft-specific code branches.
3. The 7 skills + Constitutional Guardrail + migration tool are stable enough that documentation can be written for an external user.

**Scope.** The tracker stops being implicitly vp-beads-specific. Concrete deliverables:
- Public README with quickstart that doesn't reference vp-beads
- `@voxpelli/<tracker-name>` on npm with semver discipline
- weft-ai adopts (proves genericity)
- MCP resources land (`<scheme>://issues/ready`, `<scheme>://issues/blocked`) — agent loop benefits from off-budget reads
- MCP Tasks primitive evaluated; adopt if stable in 2026-11 spec window
- Schema migration tooling (`schema_evolve` analog) for v0 → v1 schema bumps
- CRDT-curious research wave (no commitment to ship)

**What stays NOT built.**
- Federation / cross-host sync
- Built-in semantic search (still deferred; LLM-side RAG suffices)
- LLM dependency inside the tracker (open-core boundary holds)
- Comments / threaded discussion (CLAUDE.md / RETRO-NN.md cover this)
- Team-oriented features (assignment notifications, RBAC, audit reports)

**Regression failure modes.**
- weft-ai adoption surfaces deep vp-beads-isms that force a fork
- Tasks primitive ships in an incompatible shape and forces a wire-protocol break
- A second user (not just pelle + weft-ai) emerges and immediately demands team features → trigger to either commit to H3 federation or politely decline (see Section 6)

### H3 — Cross-instance / federation (~2 years, aspirational)

**Trigger conditions to advance.** All of:
1. A team (≥2 humans, or ≥1 human + ≥1 long-running shared agent across machines) forms around any vp-* tool — and the tracker is the bottleneck.
2. CRDT tooling in the JS ecosystem has matured to the point where adopting yjs/automerge/loro is not a research project.
3. The user explicitly decides federation is desirable (not "merely tolerable"). Default posture: **decline** and recommend that the team adopt git-bug or Linear instead.

**Scope (if advanced).**
- Per-issue CRDT state (Grite's pattern, but on top of the existing markdown substrate — markdown remains the human-editable surface; CRDT layer is for conflict-free concurrent agent writes)
- `refs/<scheme>/wal` or equivalent: state travels with the repo but stays out of the working tree
- Ed25519 signed events (Layer 1 of GBCL §8 from the Drive doc)
- Multi-agent claim arbitration without lockfiles (CRDTs make lockfiles redundant)
- The Refinery role (merge-queue coordination) from Brat
- Tree-sitter symbol integration for code-aware claims ("don't let two agents edit the same symbol concurrently") — adapted from Grite

**What stays NOT built even at H3.**
- A central server
- Webhooks
- Real-time push notifications (SEP-2260 constraint: MCP forbids server-initiated push outside of the elicitation/sampling round-trip)
- Account systems

**Regression failure modes** (would force a step back to H2):
- CRDT layer makes the markdown substrate non-human-editable in practice (every manual edit corrupts the CRDT state) — the simplicity tenet wins; retreat to H2 single-host
- The team disbands or stops using the tracker — federation infrastructure rots; rip it out

### H4 — Full GBCL §8 stack (research-doc speculative end-state)

**Trigger conditions.** A specific concrete constraint forces it. Currently: none. This horizon exists in the roadmap only to be explicit that the research-doc architecture is **acknowledged but not on the path**.

**What this would mean.** The full 4-layer Git-Backed Context Lake from `RESEARCH-ai-issue-tracker-ultimate-solution.md` §8: Grite-style WAL + Beads-style SQLite projection + vector embeddings (sqlite-vss or sqlite-vec) + MCP-native Tasks/Sampling/Resources + Constitutional Guardrail as a formal middleware tier. Hybrid semantic search ("find unblocked tasks related to 'memory leaks'"). Cryptographic provenance on every state change.

**Why it stays speculative.** The research doc itself acknowledges three load-bearing citations are unverified or future-dated (see accuracy caveats in the source). Layer 2's vector store is overkill for personal scale (weft-ai's design principles explicitly defer pgvector until concrete evidence demands it; the same logic applies here at higher confidence).

If H4 ever advances, it does so by **promoting individual deferred features from Section 2** one at a time — never by adopting the GBCL stack wholesale.

---

## Section 2: Deferred-Feature Backlog

Every feature the H1 design considered and cut, plus features H1 didn't mention but that might emerge from dogfooding.

### MCP surface deferrals

| Feature | Why deferred at H1 | Revival trigger | If revived, where |
|---|---|---|---|
| **MCP resources** (`<scheme>://issues/ready`, `<scheme>://issues/blocked`, etc.) | harvmcp precedent: validate tool design with one surface before adding a second. Tool-only is simpler mental model. | Agent loop is observably slow because of tool-call budget pressure, AND tool design is validated through ≥4 sprints. | H2 |
| **MCP sampling** | weft-ai's gate rules apply: structured-output only, ≤5-line prompts, decorative (tool must work without it). Adds a closed-loop dependency on the client that complicates the degraded path. | A specific tool requires clarification mid-call that elicitation cannot cover (rare). | H2 or H3 |
| **MCP Tasks primitive** (experimental in 2025-11-25 spec) | Spec is experimental; first-mover risk. If it ships in incompatible shape we've burned wire-protocol budget. | Tasks stabilises in a 2026+ spec release AND covers the long-running-agent-work surface we need. | H2 |
| **MCP Elicitation URL mode** (per-issue OAuth-style flows) | No use case at H1 — single-user-local. | A tool emerges that needs per-issue auth (e.g., per-project Harvest tokens for issue links) AND elicitation URL mode is stable. | H2 |
| **Server-initiated push notifications** ("issue X is now ready") | SEP-2260 forbids server-initiated push outside elicitation/sampling. Permanent architectural constraint, not a deferral. | MCP spec lifts SEP-2260 (would be a major spec shift). | H3 at earliest |

### Storage and consistency deferrals

| Feature | Why deferred at H1 | Revival trigger | If revived, where |
|---|---|---|---|
| **Multi-host coordination / CRDT layer** | Single-user H1. Grite's territory. CRDT JS ecosystem (yjs/automerge/loro) adoption is its own research project. | A team forms (≥2 humans or ≥1 human + ≥1 cross-host agent) AND the user explicitly wants federation (default = decline). | H3 |
| **Ed25519 signed events** (GBCL Layer 1) | No threat model at H1 justifies cryptographic provenance. Adds key-management surface. | Multi-agent environment where claim arbitration must be auditable beyond `source` provenance field. | H3 |
| **Vector embeddings / hybrid semantic search** (GBCL Layer 2) | sqlite-vec at 50 × 384-dim is ~76 KB — overkill at personal scale (harvmcp's rejected-ideas section confirms the same calculus for its mapping problem). LLM-side RAG suffices. | Tracker grows past ~500 active issues AND issue-discovery via title/label search demonstrably fails ≥3 times. | H4 |
| **`refs/<scheme>/wal` event sourcing** | Working-tree markdown is the human-editable surface; an event log shadowing it doubles the substrate. | If H3 advances, CRDT writes naturally land in a non-working-tree ref namespace; the event log emerges as a side effect. | H3 |
| **Tree-sitter symbol integration** (Grite's feature) | The tracker is type-agnostic; code-aware claims are a different product. | H3 federation + active need to prevent two agents from editing the same symbol concurrently. | H3 |
| **`bd remember`-equivalent built-in memory** | Claude Code already has 4 memory mechanisms (global CLAUDE.md, project CLAUDE.md, MEMORY.md auto-memory, Basic Memory). Fifth tier is redundant. | Never — explicit rejection in DESIGN v2's "what v1 got wrong" §1. | Drop. Trigger to revisit: Claude Code drops 2+ of the existing memory mechanisms. |
| **9-type vocabulary** (bug/feature/chore/story/spike/epic) | Backlog.md's 4-type model (task/doc/decision/milestone) cuts at actual joints; the other 6 are framings, not kinds. | Never — explicit rejection in DESIGN v2 §2. | Drop. |
| **Hard validation (`validation.on-create=error`)** | Picoschema soft-validation with `schema_evolve` is more aligned with user's stated preference. | Never — explicit rejection in DESIGN v2 §3. | Drop. |

### User-visible feature deferrals

| Feature | Why deferred at H1 | Revival trigger | If revived, where |
|---|---|---|---|
| **Web UI / dashboard** | Backlog.md ships one; we don't need ours. JSON output + a one-shot HTML render covers visual review. | Multi-user team forms (H3 trigger). | H3 |
| **Issue templates beyond 4 schema types** | Picoschema covers per-type required sections; extra templates are sugar. | The user maintains ≥3 ad-hoc `## sections` conventions for a single type across projects. | H2 |
| **Burndown / velocity views** | Not a sprint-velocity-tracking shop; `bd stats` + RETRO files cover what's needed. | A team forms and asks. | H3 |
| **Time-tracking integration** | harvmcp owns this. Don't duplicate. | harvmcp ships an MCP-level API that the tracker could call to attach time-spent to issues. | H2 (skill-level, not tracker-level) |
| **Cross-project querying** ("issues across all my repos blocking X") | Each project has its own tracker root; cross-project is sibling-sync's territory. | Sibling-sync surfaces a query shape that's awkward to express as four sequential CLI calls. | H2 |
| **Issue archival / compaction** (bd's `bd compact`) | Markdown files don't compound the way a JSONL log does. `git rm` + restore-from-history is fine. | Active-issue count exceeds ~500 AND `task_list` becomes slow. | H2 |
| **"Find similar issues" via semantic search** | LLM-side RAG via Basic Memory or direct file reads covers this. | Tracker grows past ~500 issues AND duplicate-issue creation becomes a recurring complaint. | H4 |
| **GitHub Issues sync** (git-bug's "bridge" pattern) | The user is leaving forge-based tracking. Bridging back inverts the migration. | Forced collaboration with a team that lives on GitHub Issues. | H3 |
| **Slack / email notifications** | Single-user-local. No notification surface. | Team forms (H3). | H3 |
| **Recurring tasks** | `/loop` and `/schedule` (claude-code-setup primitives) cover the use case at the tool layer, not the tracker layer. | A specific recurring tracker-side operation emerges (rare). | Drop; revisit if a concrete case appears. |
| **Comments / threaded discussion** | RETRO-NN.md files + git commit messages are the conversation layer. Comments inside issue files invert the human-readable-markdown invariant. | Team forms AND markdown-in-frontmatter conversation feels cramped. | H3 |
| **Per-issue OAuth flows** | No auth surface at H1. | A tool emerges that needs per-issue credentials. | H2 |
| **AGENTS.md handshake** | Cut at H1 — no second tracker-aware tool exists to handshake with. Worth revisiting because the cost is ~30 lines of generated markdown. | Second tracker-aware tool (beyond Claude Code) emerges in the user's stack — e.g., Codex or Gemini wanting to discover tracker capabilities. | H2 (low cost; bring back early if any reason to). |

### Quality-of-life deferrals (most likely to surface during dogfooding)

| Feature | Why deferred at H1 | Revival trigger | If revived, where |
|---|---|---|---|
| **Inverse dependencies view** ("what blocks on this issue?") | `dep_manage` covers the forward direction; inverse is a `task_list` filter. | First time the user asks "what was waiting on this?" after closing an issue. | H1.5 |
| **Issue label autocomplete in skill prompts** | Free-text labels at H1; soft-validation catches typos via "did you mean?". | Label vocabulary stabilises and "did you mean?" suggestions feel slow. | H1.5 |
| **Skill workflow: bulk-close issues with shared resolution note** | Closing one at a time is fine for swarm-wave sprints. | First retrospective where ≥5 issues need identical resolution wording. | H1.5 |
| **`tracker export --format markdown-bundle`** | `git archive` covers it. | Migration off the tracker (the opposite direction). | H1.5 |
| **`tracker doctor`** (parity with harvmcp doctor) | Few things to check at H1 (lockfile health, SQLite projection sync). | Substrate issues surface during dogfooding that a `doctor` command would catch. | H1.5 — likely the **single feature most likely revived first**; see Section 8. |

### Process / governance deferrals

| Feature | Why deferred at H1 | Revival trigger | If revived, where |
|---|---|---|---|
| **Constitutional Guardrail Layer 2** (LLM-based prompt-injection classifier) | The regex-based markers + length cap catch the obvious cases. ML-based classifier adds dependency and false-positive surface. | A real prompt-injection incident slips past Layer 1. | H2 |
| **Audit log writer** (harvmcp pattern: NDJSON of every state-changing operation) | Git history is the audit log for markdown-canonical state. | A non-git-tracked mutation path emerges (e.g., SQLite-only operations during a future projection-write feature). | H2 |
| **Schema migration tooling** | Picoschema soft-validation handles drift naturally. | First time a v0 → v1 schema bump strands ≥3 existing issues in the old shape. | H2 |
| **Cross-tracker bridge** (this tracker ↔ Backlog.md) | If Phase 2a chose Backlog.md substrate, no bridge is needed (same storage). If Phase 2a chose from-scratch, both use markdown — `cp` is the bridge. | The tracker forks substantially from Backlog.md's storage layout and a real migration path becomes valuable. | H2 |

---

## Section 3: Migration Milestones (M1–M4)

Per `DESIGN-tracker-exploration.md` §"Graduation roadmap (Phase 3 only)" but applies equally to Phase 2b (Backlog.md substrate path). Phase identifier swapped where relevant.

| Milestone | Trigger | Public ship action |
|---|---|---|
| **M1: working prototype** — code in standalone repo (Phase 3) or vp-beads supplements stable (Phase 2b); npm-installable; dogfooded by vp-beads | Tracker handles the 5 Phase-2a evaluation criteria (migration cleanness; 9→4 collapse; concurrency under swarm-wave; skill-rework cost; threat-model fit) | CHANGELOG entry; vp-beads marketplace bump; no blog post (too early) |
| **M2: vp-beads migrates off bd** | Phase 2b supplementary skills work against tracker as well as they did against the Backlog.md spike (Phase 3) OR Constitutional Guardrail + skill refactor stable for 2 sprints (Phase 2b) | CHANGELOG `0.x.0 — substrate migration`; vp-beads marketplace bump; blog post optional; **MEMORY.md and CLAUDE.md updated to drop bd references** |
| **M3: weft-ai adopts** | Tracker proves generic enough for the user's second bd-using project | npm publish at 1.0.0; README quickstart that doesn't reference vp-beads; cross-post to weft-ai docs |
| **M4: standalone identity** | External users beyond the user's own projects (signals: ≥1 GitHub issue from non-pelle; ≥1 organic install) | Name change settled (per DESIGN §"Naming"); GitHub org transfer if applicable; semver discipline tightened; CONTRIBUTING.md; H2 trigger conditions re-evaluated |

Notes:
- M1 ships under `@voxpelli/<placeholder-name>`. The name is settled at M4, not M1 — early renames are cheap; later renames are expensive.
- M2 ships an irreversible vp-beads-side change (`bd` shell-outs deleted). Test against the M1 prototype in a worktree before merging.
- M3 ≠ M4. Adopting a second of the user's own projects is not "external users." Two distinct triggers.
- M4 is the trigger to **reconsider H2 specifically**. External users may surface H2 features earlier than dogfooding would.

---

## Section 4: Strategic position over time

How the tracker's relationship to existing players evolves across horizons.

### bd / gastownhall (Beads, Gas Town, Wasteland)

- **H1**: divergence. The tracker is a deliberate exit from bd's substrate layer. vp-beads's workflow choreography stays — same skills, different substrate. The strategic incoherence (vp-beads competes with Gas Town while depending on its substrate) resolves.
- **H2**: deliberate non-overlap. bd's ecosystem is acquiring Gas Town, Wasteland, Gas City SDK; the tracker stays single-host and resists those surfaces. Wave to bd users in passing; don't pretend to compete on multi-host.
- **H3**: if H3 advances, the tracker's CRDT layer enters bd-adjacent territory (Wasteland is bd's federation play). Stay differentiated by the open-core boundary: tracker = computation only, never narration; bd is whole-stack.
- **Permanent stance**: friendly. bd is genuinely good for its target audience (single-agent vibe-coding sessions, teams comfortable with binary blobs in working trees). The tracker exists because that audience is not us.

### Backlog.md

- **H1**: possibly substrate (Phase 2a/2b path) or independent (Phase 3 path). Either way, storage layouts stay symmetric so re-evaluation is cheap.
- **H2**: if substrate at H1, monitor upstream alignment. If diverged at H1, evaluate again as the tracker matures — does Backlog.md's MCP server cover enough that a substrate-swap is rational?
- **H3**: only relevant if H3 advances and Backlog.md adds CRDT support (currently no signals it would).
- **Permanent stance**: friendly, possibly substrate-dependent. MIT license + 5.6k stars + 38 contributors makes it a low-risk dependency relative to a one-person upstream.

### Grite / Brat (neul-labs)

- **H1**: inspiration only. The research doc recommends building on Grite; DESIGN v2 explicitly declines that recommendation (Grite has 6 stars and 1 effective contributor — adoption risk is unacceptable).
- **H2**: inspiration only. Same calculus.
- **H3**: if H3 advances, Grite's CRDT layer + Brat's role taxonomy (Mayor/Witness/Refinery/Deacon) are the **architectural reference**, not the dependency. Re-implement the patterns; don't fork the code.
- **Permanent stance**: cite as prior art; never depend on.

### Basis Nexus (user's BM-aggregation MCP, in design)

- **H1**: separate. Basis Nexus is BM-side; tracker is its own substrate.
- **H2**: integration via shared MCP-test patterns (the harvmcp `InMemoryTransport.createLinkedPair()` BM note applies to both); shared Constitutional Guardrail middleware potentially extracted to a shared package.
- **H3**: both projects on shared substrate would be ideal but requires Basis Nexus to reach M1 first; no commitment.

### weft-ai

- **H1**: observe. weft-ai is on bd; tracker is in dogfood phase. Don't push adoption.
- **H2**: adopt (this is M3's trigger). weft-ai's migration validates the tracker is generic.
- **H3**: both projects on shared substrate. Open-core boundary holds: weft-ai proprietary, tracker MIT.

### harvmcp

- **H1**: template precedent. The tracker's `lib/` structure, three-facade pattern, MCP test approach, and ROADMAP shape all clone harvmcp.
- **H2**: cross-tool integration. Skill-level: attach harvmcp time entries to tracker issues. Tracker-level: no direct dependency.
- **H3**: same.

### Jira / Linear / GitHub Issues

- **All horizons**: non-competitor. Different audience (teams, browser-based workflow). See Section 6.

---

## Section 5: Known unknowns

Things explicitly unresolved that will need to resolve at some point.

- **Does the MCP spec stabilize the Tasks primitive in 2026?** If yes, H2 adopts. If it churns or is dropped, H2 ships without it.
- **Does Backlog.md upstream stay aligned with the tracker's philosophy?** The Phase 2a spike answers H1's version of this. H2 needs a fresh re-evaluation if the substrate path was chosen.
- **Does AGPL evolve in a way that changes BM's licensing posture?** Basic Memory's AGPL+CLA model is unusual; if Basic Memory ever relicenses or splits open-core differently, the tracker's BM-integration assumptions shift.
- **What's the user's tolerance for multi-host complexity if a team forms around any vp-* tool?** Currently: explicitly low. May change. H3 advances only if this changes; recheck at every M4 review.
- **Does Claude Code drop one of its four memory mechanisms?** Triggers revisiting the `bd remember`-equivalent question (currently dropped).
- **Does sqlite-vec / sqlite-vss reach the point where 50 × 384-dim is cheap enough that the "overkill" calculus inverts?** Triggers re-evaluating the vector-search deferral (currently H4-or-never).
- **Does the user's `harvmcp` ROADMAP precedent inspire a similar "Things explicitly NOT on the roadmap" graveyard section here?** Section 6 below is the first draft of that; expect it to grow.

---

## Section 6: Strategic constraints (the not-doing list)

Mirrors weft-ai's VISION.md "What Weft AI Is Not" hard rules. Each constraint has a reason — if a constraint is broken, the reason is the test of whether the break is justified.

The tracker is explicitly **not**:

- **An issue tracker for teams.** Single-user-first. Reason: the design tradeoffs (markdown canonical, lockfile concurrency, no notifications, no RBAC) optimise for single-user clarity; team features inherently invert these. Substitute path: recommend Linear, Jira, or git-bug.
- **A Jira / Linear replacement.** Different audience. Reason: those tools exist because product managers, sprint reports, and stakeholder visibility are real needs the tracker does not serve.
- **A SaaS product.** Local-first. Reason: no hosting, no auth, no billing, no abuse vector. Substitute path: if hosting is needed, the user runs the tracker on their own server.
- **LLM-dependent.** No provider SDK in the tracker. Reason: open-core boundary (weft-ai's hard rule). Substitute path: MCP sampling/elicitation spends the **client's** budget against the client's provider.
- **A narrator.** The tracker returns structured records. Reason: open-core boundary; narration is vp-beads's language layer. Substitute path: skills narrate the structured output.
- **A workspace manager.** Gas Town's territory. Reason: workspace state (clones, branches, worktrees) is a separate concern from issue state.
- **A federation protocol.** Wasteland's territory. Reason: H3 is aspirational; H3 federation is per-issue CRDT, not protocol design.
- **A code-aware tracker.** Grite's Tree-sitter territory. Reason: H1 through H3 the tracker is type-agnostic; code awareness is a different product even if it reuses the substrate.
- **A vendor for the gastownhall ecosystem.** Reason: strategic coherence (vp-beads claims to compete; depending on Gas Town substrate undermines that claim).
- **A fifth memory mechanism.** No `bd remember`-equivalent. Reason: Claude Code has four; a fifth fragments. Substitute path: MEMORY.md, CLAUDE.md, Basic Memory.
- **A daemon.** No long-running process. Reason: simplicity tenet; platform-proximity tenet; debuggability. Substitute path: stdio MCP server lifecycle owned by Claude Code.
- **A Rust application.** Node/JavaScript per harvmcp + weft-ai template. Reason: ESM-only tenet; one toolchain across the user's stack; platform-proximity. Substitute path: if Rust is ever genuinely needed, it's a sign the design is wrong, not a sign Rust is right.
- **A migration target for non-bd trackers.** Reason: scope creep. Substitute path: if Linear → tracker is ever desired, write a one-off import script — don't build a generic bridge.
- **A platform.** The tracker is a tool, not infrastructure for other people's tools. Reason: H1 success is dogfooded usefulness, not ecosystem growth. Substitute path: if a tool wants to integrate, it uses the MCP surface like any other client.
- **A tool that colonizes project `CLAUDE.md` files.** Reason: bd's `bd setup claude` injects ~50 lines per project including directives that tell Claude Code to *avoid* its own task and memory systems (`TodoWrite`, `TaskCreate`, `MEMORY.md`). That's the portability-tax-from-the-inside view: a tool that doesn't trust the host imposes its own primitives AND tells the host's primitives to stand down. We don't do this. The tracker lives *alongside* Claude Code's primitives, not in tension with them. Any project-level documentation that ships ships *once* (no `BEGIN/END managed-block` markers), in a user-editable form, and never instructs the host to disable its own systems. Substitute path: ship a `<tracker> docs --print` command for users who want to paste guidance into their own README/CLAUDE.md — with full editorial control.

---

## Section 7: Revisions and revival

**Review cadence.** Every 4th sprint (the existing vp-beads trend-review sprint boundary). The retrospective skill's trend-review pass naturally covers UPSTREAM, beads health, and BM graph health; the ROADMAP joins that review as the substrate-level diagnostic.

**Out-of-cadence review signals.** Any of:
- A horizon trigger fires (advance to next horizon)
- A horizon regression fires (step back)
- A deferred feature's revival trigger fires
- A "not on the roadmap" item gets re-litigated (move to deferred backlog with explicit revival trigger, OR re-affirm rejection with new rationale)
- The MCP spec ships a primitive the roadmap assumed wouldn't land in the current window
- A second user emerges (forces M4 re-evaluation)

**First revision** scheduled: end of Phase 2a spike (1–2 sprints out). That's when the H1 scope crystallises into either Phase 2b or Phase 3 and the M1 trigger becomes concrete.

**Last revision** anticipated: at M4. After M4, this ROADMAP may need to fork into a project-level ROADMAP (tracker repo) and a meta-level one (vp-beads repo) — or this single file may move to the tracker repo and vp-beads may keep its own thinner roadmap focused on skill workflows. That decision is M4 work, not now.

---

## Section 8: The one feature most likely to be wanted first

**Most-likely-to-be-wanted deferred feature, in the first 6 months:**

> **`tracker doctor`** — a parity-with-harvmcp doctor command that runs the tracker's invariant checks (lockfile health, SQLite projection in sync with markdown, no orphaned heartbeats, no stale claims, schema validation pass on all issues, guardrail false-positive sample).

**Why this one.** Two reinforcing signals:

1. **harvmcp pattern.** Every iteration of the user's MCP-server template ends up needing a doctor. harvmcp ships one; weft-ai will probably need one. Tracker will follow.
2. **Substrate-migration distrust.** The first 6 months of dogfooding will surface "is the tracker actually right?" anxiety — the same anxiety `harvmcp doctor` was built to resolve. The user will want a single command that returns green-or-actionable-red.

**Why deferred at H1.** Few things to check yet; the substrate behaviour is unproven, so doctor checks would be largely speculative.

**Criteria that would advance it to v1.5 / H1.5:**
- ≥2 substrate-related bugs surface during M1 dogfooding (lockfile leak, projection drift, schema parse failure, etc.)
- OR the user runs `git status` / `ls .locks/` / SQL `SELECT * FROM ...` three times in a single session to manually diagnose a tracker hiccup
- OR Phase 2a chose Backlog.md substrate AND Backlog.md doesn't ship a doctor equivalent (it doesn't, as of 2026-05) AND the substrate has any unexpected state of its own

**Estimated effort when revived:** S–M. ~150 LOC + ~80 LOC tests, modelled on `harvmcp doctor`'s check-ladder pattern. Most of the checks are filesystem inspections (one read each); the SQLite projection sync check is the only non-trivial one.

**Where it lands:** `lib/commands/doctor.js` + `cli.js` subcommand + MCP tool. The MCP tool variant should match harvmcp's hippocratic-invariant pattern: read-only tools that mutate (`--sync` style flags) live in CLI only, never in the MCP surface.

---

## See also

- `DESIGN-tracker-exploration.md` — current (v2) architecture exploration; this ROADMAP is the long-arc companion
- `RESEARCH-ai-issue-tracker-ultimate-solution.md` — Gemini Deep Research document; H4 territory; treat with the accuracy caveats noted in the archived file
- `/Users/pelle/nollfyranoll/ai/harvmcp/ROADMAP.md` — template precedent for per-feature what/why/trigger/effort tables and the "explicitly NOT on the roadmap" graveyard pattern
- `/Users/pelle/yikesable/weft-ai/VISION.md` — template precedent for the three-horizon framing, the open-core boundary, and the "What X Is Not" hard-rules list
- Basic Memory:
  - `engineering/agents/basis-nexus-design-document` — sibling architectural template
  - `engineering/agents/agent-issue-tracker-and-mcp-server-territory-map-2026-05` — ecosystem catalog applied during the 2026-05 verification round
  - `brew/brew-backlog-md` — Backlog.md audit
  - `engineering/testing/mcp-server-integration-testing-via-inmemorytransport` — MCP test pattern lifted from harvmcp
