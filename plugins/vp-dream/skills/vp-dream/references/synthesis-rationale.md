# Synthesis rationale — best-of-the-best provenance

This skill deliberately combines four approaches. Each row is what that source
contributes and why it was kept.

| Source | Contribution kept | Why |
| --- | --- | --- |
| **Native `autoDream`** (in the binary; see `native-autodream-contract.md`) | The dream framing, the Consolidate + Prune-and-index phases, the do-NOT-edit-CLAUDE.md reconciliation rule, the "brief summary / say if nothing changed" close, the one-fact-per-file contract | It is the authoritative, shipping behavior. Mirroring it is how the skill stays true to the live contract by construction, and avoids fighting the background feature. |
| **`jl-cmd/claude-dream`** (community plugin) | The explicit Audit → Propose → **approve** → Execute → Verify loop, the index-integrity check, dedup/rename/staleness flags | Turns the native pass into an *inspectable, approval-gated, manual* pass. Good hygiene checklist. |
| **Verify-before-persist** (manual practice) | **Fact-verification of volatile memories against primary sources** before keeping/updating them; exclusion-by-derivability; built-in expiry triggers | The one thing native dream and claude-dream both lack. "Tidy ≠ true." This is the skill's reason to exist. |
| **`session-reflect`** (vp-knowledge) | Candidate taxonomy (`decision/lesson/gotcha/pattern/limitation/breaking`), grouped preview, scope-leak/portability scan, and **routing to the right store** | Keeps cross-project engineering knowledge flowing to Basic Memory (via session-reflect), not duplicated into file-based memory. |

## The load-bearing principle: tidy ≠ true

Native autoDream and claude-dream both optimize **format/organization**. Neither
re-checks whether a stored fact is still **correct**. A memory that says
"govulncheck latest = v1.6.0" or "PAT needs scope X" or "env config lives at URL
Y" can be perfectly formatted and completely stale. This skill's distinctive
step is Verify: for every *volatile* memory, re-confirm against a primary source
(live API, `gh`, registry, the file itself) and mark CONFIRMED / UPDATED / STALE
/ UNVERIFIABLE before the tidy pass runs.

Volatile (verify): API-derived config/state, version pins & IDs, external URLs,
in-flight status, anything with a date or "current" claim.
Stable (skip): preferences, decisions, rationale, lessons — true by authorship.

**Why native dream cannot do this — it is sandboxed, not merely un-instructed.**
The dream fork's tool permissions are restricted to read-only shell plus `.md`
writes/deletes inside the memory dir (see `native-autodream-contract.md` → "The
sandbox"). It **cannot invoke `gh`, `curl`, a package registry, or any MCP
tool**, so it is architecturally unable to re-verify a fact against a live
external source. This manual skill, invoked in a normal session with the full
tool list, can. Verification is not a nicety bolted on — it is the one capability
the native pass structurally lacks.

**Empirical validation (real native bugs each map to one safeguard):**
- **#38493** — native dream asserted a fact "without re-reading the source to
  verify it." → our **Verify** phase.
- **#47959** — silently deleted 23 memory files, no changelog, no recovery. → our
  **approval gate** + delete-with-reason + summary.
- **#40806** — prunes on structural staleness only, so a critical-but-rare rule
  looks prunable. → our **conservative pruning** of `user`/`feedback`/reinforced
  memories.
Every capability the skill adds corresponds to a documented native failure mode;
none contradicts the native contract.

## Coordination with the ecosystem (do not overlap)

- **Native autoDream** runs in the background automatically. This skill is the
  *manual, verification-augmented* trigger. If native autoDream is enabled and
  recently ran, say so and keep the manual pass light (verify + integrity only).
- **`session-reflect`** owns capture of new cross-project insights → Basic Memory.
  This skill does NOT capture new BM notes; when it finds a file-memory that
  really belongs cross-project, it recommends routing via session-reflect.
- **`/memory`** is the native review/prune UI — point the user there for manual
  entry edits rather than reimplementing it.

## Hard requirement: stay true to the live contract

The contract is injected into the system prompt each session and CHANGES across
builds (evidence: v2.1.211 uses nested `metadata.type` + injects `node_type` /
`originSessionId`; `jl-cmd/claude-dream` hardcoded a *flat* `type`, a 200-line
cap, and a 14-day rule that this build's prompt does not state). Therefore the
skill treats the **active system prompt as authoritative** and everything in
these references as *fallback illustration that may be stale*. When they
conflict, the live prompt wins — always.
