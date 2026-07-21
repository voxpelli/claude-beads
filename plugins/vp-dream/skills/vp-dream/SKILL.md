---
name: vp-dream
description: This skill should be used when the user asks to "dream", "vp-dream", "auto dream", "consolidate memory", "consolidate my memory files", "clean up memory", "tidy my memory files", or "prune stale memory". It runs a manual, approval-gated, fact-verifying pass over Claude Code's file-based auto-memory (the per-project memory/ directory and its MEMORY.md index), mirroring the native autoDream phases while adding the verification and consent that the sandboxed native pass cannot.
user-invocable: true
allowed-tools:
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - Bash
  - WebFetch
  - WebSearch
  - Skill
  - mcp__basic-memory__search_notes
  - mcp__basic-memory__read_note
  - mcp__basic-memory__build_context
---

# vp-dream — memory consolidation ("dream, but verified and consented")

Run a manual pass over the file-based auto-memory that **mirrors Claude Code's
native `autoDream`** (Orient → Gather → Consolidate → Prune & index) and adds the
two things the native pass structurally cannot do: **verify volatile facts
against primary sources**, and **get user approval before deleting anything**.

## Hard rule — the live system prompt is authoritative

The file-based memory contract is injected into the system prompt each session
and **changes across builds**. Before anything else:

1. Locate the memory instructions in the **active system prompt** (the block
   stating the memory directory path, "each memory is one file holding one
   fact", the frontmatter format, and the valid `type:` values).
2. Treat that block as the single source of truth for directory path, frontmatter
   shape, valid types, index rules, and any size limit. Restate it before acting.
3. Everything in `references/` is a **point-in-time snapshot that may be stale**.
   When it conflicts with the live prompt, the live prompt wins.
4. If no memory block is present, STOP — file-based memory is not enabled here;
   do not invent a directory or contract.

Never guess the contract from these references. Read it live.

## Coordinate; do not fight native autoDream

Native `autoDream` consolidates memory automatically as a background fork
(cadence, gating, and a paraphrased description of the native prompt are in
`references/native-autodream-contract.md`). This skill is the **manual,
verification-augmented, approval-gated** trigger. Therefore:

- Native dream runs **sandboxed** (read-only shell + `.md` writes inside the
  memory dir only); it **cannot call `gh`, `curl`, a registry, or MCP tools**, so
  it cannot re-verify a fact against a live source. This skill runs with the full
  tool list and can — that is its reason to exist.
- Do NOT capture brand-new cross-project insights here — that is
  `session-reflect`'s job (it writes to Basic Memory). When a file-memory really
  belongs cross-project, recommend routing it there instead.
- For manual per-entry review/prune, point the user at the native `/memory` UI.

## The pass

Phases 1–4 mirror native; the **Verify** step and the **approval gate** are the
additions. Nothing is deleted or rewritten before the gate.

### Phase 0 — Load contract
Restate the live contract (see Hard rule). Resolve the memory directory path.

### Phase 1 — Orient
- `ls` the memory dir; read the index (`MEMORY.md`) to learn the current shape.
- Run the descriptive audit — it surfaces facts, enforces nothing:
  `scripts/audit-memory.sh <memory-dir>`
  It reports per file: declared `type`, `name`, subsystem-`injected=[…]` fields,
  line count, and flags (`NO_FRONTMATTER`, `SESSION-DATED`, `NOT-IN-INDEX`); plus
  the index line count and any dangling index entries.
- Skim topic files so you improve them rather than duplicate. If a `logs/`
  directory exists, review recent entries.

### Phase 2 — Gather signal, then VERIFY
Native gather: look for new signal worth persisting — recent session logs,
memories that have drifted from current reality, narrow transcript greps. Then
the step native cannot do:

**Verify volatile memories against primary sources.** For every memory holding a
volatile fact — API-derived config/state, version pins, IDs, external URLs,
in-flight status, anything dated or claiming "current" — re-confirm against a
primary source (live API, `gh`, package registry, the referenced file). Classify
each: **CONFIRMED / UPDATED(→new value) / STALE(delete or correct) /
UNVERIFIABLE**. Skip stable facts (preferences, decisions, rationale — true by
authorship). Also flag: portability leaks (absolute paths, machine-specific env
vars, `localhost:port`), content the repo/git/CLAUDE.md/Basic Memory already
records (exclude-by-derivability), and orphaned or stale-project-named files.

### Gate — Propose & approve
Present ONE grouped preview, an explicit action per item: KEEP / UPDATE(→new
value) / MERGE / RENAME(session-dated→semantic) / DELETE(reason + revival
trigger) / ROUTE-ELSEWHERE (Basic Memory via session-reflect, or code/git). Wait
for approval. **Make no deletions or rewrites before it** — native dream's silent
mass-deletion (issue #47959: 23 files, no changelog) is the failure this gate
exists to prevent.

### Phase 3 — Consolidate (on approval)
Apply approved merges, updates, renames:
- Merge new signal into existing topic files rather than creating near-duplicates.
- Convert relative dates ("yesterday") to absolute dates.
- Correct or delete contradicted facts at the source.
- **Preserve subsystem-injected frontmatter** (`node_type`, `originSessionId`,
  `permalink`) and keep the contract's frontmatter shape exactly. One fact/file.
- **Prune conservatively.** Do not delete a `user`/`feedback`/reinforced memory
  just because it looks structurally stale — those are the ones native over-prunes
  (#40806). Delete only with a stated reason; give in-flight memories a revival
  trigger, or remove them if their trigger already fired.

### Phase 4 — Prune and index
Rebuild `MEMORY.md` as a pure **index, not a dump**: one line per memory,
`- [Title](file.md) — one-line hook`, each under ~150 chars. Move any line over
~200 chars' worth of detail back into its topic file. Keep the whole index under
the contract's line limit AND under ~25KB. Remove pointers to stale/superseded
memories; add pointers to newly important ones; resolve index/file mismatches.

### Reconcile against CLAUDE.md
For each `feedback`/`project` memory that touches the same topic as a CLAUDE.md
instruction: if the **memory is stale**, delete or rewrite it (CLAUDE.md is the
checked-in source); if **CLAUDE.md may be stale**, **do NOT edit CLAUDE.md** —
annotate the memory ("contradicts CLAUDE.md — verify which is current") and list
it in the summary; if **not a conflict**, leave it. A `feedback` memory's "the
user corrected me" framing is not proof it postdates CLAUDE.md.

### Close
Return a brief summary of what was verified, consolidated, updated, renamed, or
**deleted (name each)**. If nothing changed (memories already tight and true),
say so.

## Additional Resources

- **`references/native-autodream-contract.md`** — a paraphrased functional
  description of the native prompt (no verbatim proprietary text — see its
  Provenance & copyright note), plus gating/cadence, the sandbox, materialized
  frontmatter, documented failure modes, and the one-command re-extract for newer
  builds. Mirror it; re-verify against the live build.
- **`references/synthesis-rationale.md`** — what each source contributes, the
  tidy-≠-true principle, and the failure-mode→safeguard mapping.
- **`scripts/audit-memory.sh`** — descriptive audit; surfaces facts, enforces nothing.
