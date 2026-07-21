# Native `autoDream` — the contract, described (not reproduced)

Ground truth for Claude Code's native memory-consolidation feature, established by
inspecting the binary (Homebrew cask `claude-code`, **v2.1.211**, arm64). The
skill *mirrors* native behavior so it stays true to the contract rather than
fighting or duplicating it.

**Provenance & copyright.** The native dream prompt is Anthropic's proprietary
text. It is **intentionally NOT reproduced verbatim here** — this file describes
its *structure and rules* (facts and functional behavior, which are not
copyrightable) and gives the command to regenerate the exact current text
**locally, for your own reference**. Do not paste Anthropic's verbatim prompt into
this skill or anywhere it would be redistributed (e.g. if this skill is ever
published). Regenerating locally is also more correct: it always reflects *your*
installed build, not a snapshot that rots.

## Re-extract the live prompt (one command, local reference only)

ripgrep reads the binary as text (`-a`), spans newlines (`-U` multiline), and a
non-greedy `.*?` bounded by the prompt's first/last lines keeps neighboring
minified code out:

```sh
BIN="$(readlink -f "$(command -v claude)")"   # the Mach-O behind the launcher
rg -aU -oP '(?s)# Dream: Memory Consolidation.*?are already tight\), say so\.' "$BIN"
```

Pitfalls (learned the slow way): slicing wide `strings` line-ranges pulls in huge
unrelated minified blobs; line numbers differ between `strings -n` widths; and
`${…}` interpolations (e.g. the index line-limit) are runtime values, absent from
the binary. Always defer to the memory block in the **live system prompt** over
anything extracted — the live prompt wins.

## Two distinct subsystems

- **`extractMemories`** — the *writer*: a fork that runs after user prose (gated on
  a feature flag, auto-memory enabled, a minimum prose length) and writes/updates
  memory files incrementally as you work.
- **`autoDream`** — the *consolidator* (this file's subject): a periodic fork that
  reflects over the accumulated files. This skill is a manual, verification-
  augmented trigger at the consolidation layer.

## Status: undocumented (verified)

Auto-*memory* shipped in v2.1.59 (2026-02) and is documented (settings, the
200-line/25KB `MEMORY.md` limit, `/memory`). Auto-*dream* was first sighted in
**v2.1.81** (2026-03) and, as of this writing, appears in **no** official surface
— not one CHANGELOG entry across the repo's full history, nor the docs, nor the
settings reference — and no Anthropic maintainer has responded to any of the ~14
dream-related GitHub issues. Everything known comes from binary inspection and
`/memory`-UI leakage. Treat the whole feature as unannounced and subject to change.

## Gating & cadence (2.1.211; cross-validated by community reports)

- **AND-gated, two independent gates:** (1) a client setting `autoDreamEnabled` in
  `settings.json`, and (2) a **server-side rollout cohort**. The binary string says
  the client setting "overrides the server-side default," but empirically the
  client setting only takes effect once the account is already in the rollout —
  there is **no documented opt-in, waitlist, or support path** for the CLI feature.
- Server flag: confirmed `tengu_onyx_plover` in 2.1.211 (reported as `KAIROS` /
  `KAIROS_DREAM` in earlier builds — likely a rename; unconfirmed by Anthropic).
- Defaults: fires when **≥24h since last consolidation AND ≥5 sessions touched**.
  Also requires auto-memory on, no active task, a ~10-minute scan throttle, and a
  **PID lock** — `<memory-dir>/.consolidate-lock` holding the owning PID — to
  prevent concurrent runs.
- `/dream` is user-invocable (alias `learn`), gated by an `isEnabled()` check.
  Runs as a background fork, skipping the transcript. No user-facing dream log.

## Officially-shipped sibling (validates the approval gate)

Separately from the CLI, Anthropic officially launched **"Dreaming" for Claude
Managed Agents** (Claude Platform, not Claude Code) as a **research preview**
(announced 2026-05, request-access form). Near-identical mechanics — reviews past
sessions + the memory store and **produces a diff the user can approve or
auto-apply**. So an approval-gated consolidation is Anthropic's own design in the
more-mature sibling; this skill's gate aligns with it rather than departing from it.

## The sandbox (why native dream cannot verify external facts)

The dream fork's tool permissions are restricted to **read-only shell commands**
(directory listing, find, grep, cat, stat, wc, head, tail, and similar) plus
creating/editing/deleting `.md` files **inside the memory directory**. It
**cannot invoke `gh`, `curl`, a package registry, or any MCP tool** — anything
that writes elsewhere, redirects, or reaches the network is denied. So native
dream is architecturally unable to re-check a stored fact against a live external
source. That gap is this skill's reason to exist.

## What the native prompt instructs (functional summary, paraphrased)

The prompt frames the task as a "dream": a consolidation pass that turns recent
activity into durable, organized memories. It proceeds in four phases:

1. **Orient** — list the memory directory, read the index file (`MEMORY.md`), skim
   existing topic files to improve rather than duplicate them, and review recent
   activity logs.
2. **Gather recent signal** — look for new information worth persisting, in rough
   priority: recent session logs (an append-only, prefix-coded activity stream),
   existing memories that have drifted from current reality, and narrow greps of
   the JSONL transcripts for specific context. It cautions against reading
   transcripts exhaustively.
3. **Consolidate** — write/update one fact per file at the top level, merging new
   signal into existing files rather than creating near-duplicates, converting
   relative dates to absolute, and correcting/deleting contradicted facts at the
   source. It explicitly defers the format/type rules to the system prompt's
   auto-memory section as the source of truth.
4. **Prune and index** — keep `MEMORY.md` an index, not a dump: one line per entry
   (`- [Title](file.md) — one-line hook`), each well under ~150 chars, the whole
   file under a configured line limit and under ~25KB; move any over-long line's
   detail back into its topic file; remove stale pointers; resolve contradictions.

It closes by asking for a brief summary of what changed, and to say so if nothing
did.

### Reconcile-against-CLAUDE.md rule (paraphrased)

For each `feedback`/`project` memory on the same topic as a CLAUDE.md instruction:
if the **memory is stale**, delete or rewrite it (CLAUDE.md is the checked-in
source); if **CLAUDE.md may be stale**, do NOT edit CLAUDE.md — annotate the
memory as contradicting it and surface that in the summary for the user to act on;
if it is **not a conflict** (adds detail or narrows a rule with a reason), leave
it. A `feedback` memory's "the user corrected me" framing is not proof it
postdates CLAUDE.md.

## Materialized frontmatter (observed on disk)

Saved memory files carry more than the author writes — the subsystem injects
fields under `metadata:` (`node_type: memory`, `originSessionId: <uuid>`, and
possibly `permalink`). On rewrite, **preserve these**; the writer may also
re-inject them.

## Documented native failure modes (community research; mostly earlier builds)

The behaviors the manual skill guards against, reported on `anthropics/claude-code`:

- **#47959** — auto-dream **silently deleted 23 memory files** (incl. a 3×-reinforced
  `feedback` file), no consent, no changelog, no recovery. → our approval gate +
  delete-with-reason + summary.
- **#38493** — dream **asserted a fact without re-reading the source to verify it**,
  wrote under a stale project name after a rename, left orphaned folders. → our
  Verify phase (tidy ≠ true) + orphan/stale-name audit.
- **#40806** — dream prunes on **structural heuristics only**; a rarely-triggered-
  but-critical rule "looks stale." → our conservative pruning for
  `user`/`feedback`/reinforced memories.
- **#50694** — a stale lock (not checked against a live PID) **permanently disabled**
  dreams. 2.1.211 shows a PID-liveness check, which likely addresses this — if
  manual dreams seem blocked, still check for a stale lock in the memory dir.
- **#38426 / #38461 / #39135 …** — `/dream` shown in the `/memory` UI but returned
  `Unknown skill: dream` for months (the gap community `/dream` plugins fill).
