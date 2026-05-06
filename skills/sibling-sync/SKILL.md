---
name: sibling-sync
description: "Bilateral SYNERGY/UPSTREAM reconciliation across sibling projects. Use when the user wants to sync sibling SYNERGY/UPSTREAM files, compare both sides to surface drift, find reciprocation gaps (entries here but not there, or vice versa), flag stale-aligned rows, detect status drift across sides, surface friction the sibling tracks ABOUT this project (their UPSTREAM-<this>.md), or apply a reciprocation batch with --auto-reciprocate. Workflow 3 covers two UPSTREAM pairing modes: shared third-party dependencies AND reciprocal sibling-friction pairs (UPSTREAM-<sibling>.md here ↔ UPSTREAM-<this>.md there). NOT for logging entries on this side (use /synergy-tracker workflow 1 (Log a synergy entry)) — sibling-sync compares both sides without writing by default. NOT for upstream → project drift (use /vendor-sync); sibling-sync handles peer-to-peer drift between sibling vp-* projects. Trigger phrases: 'sibling sync', 'compare siblings', 'sync sibling', 'reconcile siblings', 'reciprocation gap', 'sync drift', 'bilateral sync', 'sync SYNERGY', 'sync UPSTREAM both ways', 'auto-reciprocate', 'check sibling drift', 'peer-to-peer drift', 'cross-project drift', 'sibling reconciliation', 'sibling has friction about us', 'what does the sibling say about us', 'reconcile sibling-tracked friction', 'reciprocal upstream friction', 'friction filed against this project'."
user-invocable: true
argument-hint: "[--auto-reciprocate] [sibling-name]"
paths:
  - "SYNERGY-*.md"
  - "UPSTREAM-*.md"
  - ".claude/synergy-registry.json"
  - ".claude/vendor-registry.json"
allowed-tools:
  - Bash
  - Read
  - Glob
  - Grep
  - Edit
  - Write
  - mcp__basic-memory__search_notes
  - mcp__basic-memory__read_note
---

# Sibling Sync

Bilateral reconciliation of `SYNERGY-*.md` and `UPSTREAM-*.md` files between
this project and its sibling vp-* projects. Read-only by default — surfaces
drift, reciprocal gaps, stale-aligned rows, and status drift across sides
without mutating anything. The opt-in `--auto-reciprocate` flag writes
reciprocal entries to the sibling's SYNERGY file via per-entry confirmation.

Companion to `/vendor-sync` (which handles upstream → project drift); this
skill handles peer-to-peer drift between siblings registered in
`.claude/synergy-registry.json`.

## Design Rationale

The bd v1.0.0 Integration Charter
(`gastownhall/beads@5d524cf7:docs/INTEGRATION_CHARTER.md`) explicitly punts
cross-tracker orchestration out of bd's scope: bd will never grow a feature
that routes a cross-project item from project A's tracker to project B's
tracker. `/sibling-sync` is exactly the workflow-automation layer the Charter
defers to external tools — file-based reconciliation between sibling vp-*
projects, mediated by registries and confirmation prompts rather than
synchronous tracker calls.

This mirrors the rationale already cited by `/synergy-tracker` for keeping
cross-project state in `SYNERGY-*.md` plus Basic Memory rather than in bd.

## Cross-skill boundaries

`/sibling-sync` is a *comparison and reconciliation* layer that sits alongside
the per-side logging skills. It owns nothing in Basic Memory and nothing on
this project's side of the SYNERGY/UPSTREAM files.

- **Does NOT write SYNERGY entries on this project's side.** `/synergy-tracker`
  workflow 1 (Log a synergy entry) owns logging on this side.
- **Does NOT pull upstream subtrees.** `/vendor-sync` owns subtree pulls and
  the upstream → project drift workflow.
- **Does NOT write Basic Memory notes.** `/synergy-tracker` workflow 5
  (Promote to Basic Memory, planned) owns `## Cross-Project Synergy` writes
  to sibling entity notes; `/upstream-tracker` workflow 6 (Promote to Basic
  Memory) owns `## Upstream Friction` writes. Basic Memory write tools are
  intentionally absent from this skill's `allowed-tools`.
- **Does NOT write `## Trend Reviews` entries** to SYNERGY files. Those belong
  to `/synergy-tracker` workflow 4 (Trend review (quarterly)). Even under
  `--auto-reciprocate`, /sibling-sync only mirrors content entries into
  reciprocal sections — never trend-review summaries.
- **Stale-row detection is INLINE here** for the threshold values used during
  comparison runs. The canonical staleness-threshold definition lives in
  `/synergy-tracker` workflow 4 (Trend review (quarterly)) — workflow 2 (Sync
  sibling SYNERGY) below cites it. Per RETRO-10 YAGNI guard: extract this to
  a shared helper only when a third skill needs the same logic.
- **Surfacing reciprocal-friction findings is in scope; acting on them is
  not.** Workflow 3 Mode B (see below) reads the sibling's
  `UPSTREAM-<this-project>.md` to surface friction the sibling tracks about
  this project. Filing the resulting work as bugs/features/opportunities on
  this side is `/upstream-tracker` workflow 1 (Log a new entry)'s job.
  Annotating the sibling's entry as resolved is `/upstream-tracker` workflow
  3 (Resolve an entry)'s job, performed on the sibling's side. /sibling-sync
  reports only.

## Registry and path resolution

Sibling projects are declared in `.claude/synergy-registry.json` (array of
`{name, file, remote, bm-entity, relationship, local-path?}` entries). The
optional `local-path` field gives the on-disk path to the sibling checkout
(relative paths resolve from this project root). When absent, fall back to
`../<name>/`.

`.claude/synergy-registry.local.json` is a gitignored companion that overrides
fields in the committed registry — same per-entry merge by `name` pattern as
`.claude/vendor-registry.local.json`. Resolution order:

1. Read `.claude/synergy-registry.json`.
2. If `.claude/synergy-registry.local.json` exists, merge it on top by `name`
   key. Fields in `.local.json` win; absent fields keep the base value.
   Entries in `.local.json` whose `name` is not in the base registry are
   ignored.
3. For each merged entry, resolve `local-path` (registry value or
   `../<name>/`).
4. If the resolved path does not exist on disk, report informatively and SKIP
   that sibling. Do not error out — continue with siblings that are
   accessible.

Workflow 3 (Sync sibling UPSTREAM) additionally consumes the merged
`.claude/vendor-registry.json` (+ `.local.json`) to identify shared vendor
dependencies across siblings.

## Workflows

Determine which workflow the user needs based on their request. If ambiguous,
default to running workflow 1 (Discover sibling(s)) followed by workflow 2
(Sync sibling SYNERGY) and workflow 3 (Sync sibling UPSTREAM) as a single
report. Workflow 4 (Apply reciprocation batch) only fires under explicit
`--auto-reciprocate`.

### 1. Discover sibling(s)

Resolve which siblings will participate in this run.

**Steps:**

1. Read `.claude/synergy-registry.json`. If the file does not exist, tell the
   user this project has no registered siblings and stop.
2. If `.claude/synergy-registry.local.json` exists, merge it on top per the
   per-entry merge rules in the Registry section above.
3. If the user named a specific sibling in their request or argument, filter
   the merged list to that entry. Otherwise, all merged entries participate.
4. For each entry, resolve `local-path` → `../<name>/` fallback. Probe each
   resolved path with a directory existence check.
5. Build two lists:
   - **Accessible siblings** (path exists) — proceed to workflow 2 (Sync
     sibling SYNERGY) and workflow 3 (Sync sibling UPSTREAM) for each
   - **Inaccessible siblings** (path missing) — report them so the user
     knows what was skipped, with the resolved path and a hint that
     `.claude/synergy-registry.local.json` can override the path
6. Report the participation list before continuing.

**Output:**

```
Siblings participating:
- vp-knowledge → /Users/.../vp-claude  (registry local-path)

Siblings skipped (path not accessible):
- vp-other → ../vp-other  (set local-path in synergy-registry.local.json)
```

If no siblings are accessible, stop and report. The user can either correct
the paths via `.claude/synergy-registry.local.json` or accept that this run
has no work to do.

### 2. Sync sibling SYNERGY

For each accessible sibling from workflow 1 (Discover sibling(s)), compare
the bidirectional SYNERGY files and surface drift findings. Report only —
no writes.

**Steps:**

1. Read this project's `SYNERGY-<sibling>.md`. If absent, treat as zero
   entries and proceed (the gap will surface as "Unreciprocated entries on
   sibling" if the sibling has any entries).
2. Read the sibling's `SYNERGY-<this-project>.md` at
   `<resolved-local-path>/SYNERGY-<this-project>.md`. If absent, treat as
   zero entries.
3. Parse each side's entries section-by-section (Shared Patterns,
   Divergences, Extraction Candidates, They Have / We Don't). Build a
   bidirectional entry map keyed by **title**, normalized per the rule in
   Guidelines below (2-pass matching: deterministic lead-clause pass, then
   judgment pass on residuals).

   **Section migration is its own signal — not silently merged.** Matching
   is within-section: an entry's title is paired only with same-section
   titles on the sibling. If an entry has migrated sections on one side
   (e.g., Shared Pattern here, Divergence on sibling — typical when one
   side promoted after noticing drift), it surfaces as (a) on the
   originating section and (b) on the destination section, NOT as a
   finding (d) Status drift. The section migration is itself the drift
   signal worth surfacing, and the (a)/(b) framing tells the user
   precisely which side moved. Finding (d) applies within-section only.

   **Section asymmetry — excluded from findings (a)/(b):** the
   `They Have / We Don't` section is intrinsically asymmetric. Entries here
   describe what the *sibling* has that we don't; reciprocally on the
   sibling's side, the same-named section describes what *we* have that
   they don't — a different semantic set. Bilateral title comparison is
   meaningless for this section. Skip its entries when computing findings
   (a) and (b). The user can read the section directly to act on adoption
   candidates; logging an adoption decision is `/synergy-tracker`'s job,
   not /sibling-sync's.

4. Walk the merged map and classify each entry into one of four findings:

   - **(a) Reciprocal gaps** — entries on this side with no matching title
     on the sibling. The sibling lacks the reciprocal entry. Candidates for
     workflow 4 (Apply reciprocation batch) under `--auto-reciprocate`.
     Excludes entries from `They Have / We Don't` (asymmetric — see step 3).
   - **(b) Unreciprocated entries on sibling** — entries on the sibling
     with no matching title here. The user may want to invoke
     `/synergy-tracker` workflow 1 (Log a synergy entry) to log these on
     this side. /sibling-sync does NOT write to this side automatically.
     Excludes entries from `They Have / We Don't` (asymmetric — see step 3).
   - **(c) Stale alignment claims** — entries with `Status: aligned` and
     `Last verified:` more than 8 sprints old (≈ two trend-review cycles).
     Inline threshold; canonical definition is `/synergy-tracker` workflow
     4 (Trend review (quarterly)). Treat 1 sprint ≈ 2 weeks if no other
     calibration is available; if the entry has no `Last verified:` field,
     fall back to the entry's date stamp.
   - **(d) Status drift** — matched entries whose `Status:` field differs
     across sides. Applies to two cases:
     1. **Shared Patterns** where one side records `aligned` and the other
        records `drifting` or `diverging` (or any disagreement on the
        Status value). Often signals that one side has converged or
        re-diverged without the reciprocal note being refreshed.
     2. **Divergences** with `Convergence path: adopt-theirs` or
        `Convergence path: propose-shared` where one side has moved to
        `adopted`/`converged` while the other still says `drifting` or
        similar.

     Excludes Divergences with `Convergence path: accept-difference` —
     those are intended-asymmetric and have no drift signal to flag.

5. Output a structured report grouped first by sibling, then by finding
   category. Include each entry's title, both sides' values where they
   differ, and a one-line action hint per category.

**Output format (per sibling):**

```
## SYNERGY drift — vp-knowledge

### (a) Reciprocal gaps (here, missing on sibling)
- "Hook event coverage" (Shared Patterns) — sibling has no matching entry
  → /sibling-sync --auto-reciprocate to file the reciprocal

### (b) Unreciprocated entries on sibling
- "validate-plugin tool-reference audit" (Shared Patterns) — we don't track this
  → /synergy-tracker to log on this side

### (c) Stale alignment claims (>8 sprints since Last verified)
- "PreCompact prompt command hook" — Last verified: 2026-01-15 (here),
  2026-01-15 (sibling). Re-verify now.

### (d) Status drift
- "npm-run-all2 parallel check stages" (Shared Patterns) — Status here:
  diverging. Status sibling: aligned. Sibling converged; refresh this row.
- "BM section ownership scheme" (Divergences, propose-shared) — Status
  here: drifting. Status sibling: aligned.
```

### 3. Sync sibling UPSTREAM

For each accessible sibling, build two kinds of UPSTREAM file pairs and
compare friction tracking on each. Same report-only contract as workflow 2
(Sync sibling SYNERGY).

**Two pairing modes coexist; both can fire on a single sibling:**

- **Mode A — shared-dependency pairing.** Both sides have `UPSTREAM-<dep>.md`
  with the same basename (e.g., both have `UPSTREAM-basic-memory.md`). The
  files describe the same third-party dependency `<dep>`. Findings (a)–(d).
- **Mode B — reciprocal sibling-friction pairing.** This project has
  `UPSTREAM-<sibling-name>.md` (friction we log about the sibling) AND/OR the
  sibling has `UPSTREAM-<this-name>.md` (friction the sibling logs about us).
  Different basenames; same bilateral relationship. Owner-side semantics
  invert relative to Mode A: an entry in the sibling's `UPSTREAM-<this-name>.md`
  with `Ownership: upstream` means THIS project is the upstream that must
  act. Findings (e)–(h).

**Steps:**

1. **Build Mode A pairs.** Glob this project for `UPSTREAM-*.md`. Glob the
   sibling's resolved `local-path` for `UPSTREAM-*.md`. Compute the
   intersection by basename — each match is one Mode A pair. Record both
   sides' full UPSTREAM basename lists for use in step 2.
2. **Detect Mode B pair.** Derive this project's canonical name per the
   four-tier algorithm in
   `skills/synergy-tracker/references/project-name-derivation.md` to
   compute `<this-name>`. Apply the same algorithm (tier 3 for the sibling
   subject) to the registry `name` field for `<sibling-name>`. Then check:
   - Does the sibling have `<resolved-local-path>/UPSTREAM-<this-name>.md`?
   - Does this project have `UPSTREAM-<sibling-name>.md`?

   If either file exists, this sibling has a Mode B pair (one-sided or
   two-sided). Both files absent is normal — no reciprocal friction tracked
   on either side. Skip Mode B for this sibling and continue.

   The Mode B file pair is `<this-root>/UPSTREAM-<sibling-name>.md` ↔
   `<sibling-root>/UPSTREAM-<this-name>.md`. By construction these basenames
   differ from any Mode A pair's basename (Mode A keys on shared
   third-party dep names; Mode B keys on sibling project names that appear
   in the synergy registry). No deduplication guard needed.
3. **Process Mode A pairs.** For each Mode A pair, read both copies and
   parse entries (Bugs, Feature Requests, Upstream Opportunities,
   Resolved). Build a bidirectional entry map by **title** using the same
   2-pass matching rule as workflow 2 (deterministic lead-clause Pass 1 +
   judgment Pass 2 on residuals — see Guidelines). UPSTREAM titles are
   typically more structured than SYNERGY titles, so Pass 2 fires less
   often, but the rule is identical for consistency. Classify each entry:

   - **(a) Duplicate friction** — same title on both sides. Sanity check:
     are the workarounds, dates, and status fields aligned? If not, it's a
     candidate for category (b).
   - **(b) Complementary workarounds** — same title both sides but the
     `Workaround:` field (or equivalent) differs. The sibling may have
     found a better mitigation. Flag for cross-pollination.
   - **(c) Stale entries** — entries dated more than 3 months ago without a
     Trend Review annotation since. Either side. Stale ≠ wrong, but worth
     re-verifying.
   - **(d) Sibling-only entries** — friction the sibling tracks for a
     shared dependency that we don't. Potential adoption: invoke
     `/upstream-tracker` workflow 7 (Sync from Basic Memory) or workflow 1
     (Log a new entry) to bring matching entries over here. /sibling-sync
     does NOT write here automatically.
4. **Process Mode B pair.** Read whichever side(s) of the pair exist.
   Parse entries the same way as step 3. Match titles bidirectionally with
   the same 2-pass rule. Classify each entry:

   - **(e) Sibling's unresolved friction against this project** — entries
     in `<sibling-root>/UPSTREAM-<this-name>.md` that are NOT prefixed with
     `_(Resolved ...)_` and NOT in a `## Resolved` section if one exists.
     `Ownership: upstream` on these entries means THIS project owns the
     fix (we are upstream from the sibling's perspective). Surface ALL
     unresolved entries — every one is a request directed at us. Action
     hint: file beads issues here or address inline; consider logging a
     cross-reference in our `UPSTREAM-<sibling-name>.md` if a workaround
     is built.
   - **(f) Our unresolved friction against the sibling** — entries in
     `<this-root>/UPSTREAM-<sibling-name>.md` that are unresolved on our
     side and have no corresponding `_(Resolved ...)_` annotation on
     either side. Informational: documents work blocked on the sibling.
     Action hint: check sibling release notes or changelog for shipped
     fixes the sibling forgot to annotate.
   - **(g) Cross-side staleness — our entry, sibling may have shipped.**
     Entry in `<this-root>/UPSTREAM-<sibling-name>.md` unresolved on our
     side, but the sibling shows a "shipped" signal (see "What 'shipped'
     means" below). Use 6 months as the look-back horizon for git-log
     scanning. Action hint: re-verify against the sibling's current
     release; annotate with `_(Resolved ...)_` via `/upstream-tracker`
     workflow 3 (Resolve an entry) if confirmed shipped.
   - **(h) Reverse cross-side staleness — sibling tracks us, we may have
     shipped.** Entry in `<sibling-root>/UPSTREAM-<this-name>.md` unresolved
     on the sibling's side, but this project shows a "shipped" signal
     (recent CHANGELOG entry, `_(Resolved ...)_` in our cross-reference,
     or git tag/commit subject within 6 months matching the entry title).
     Read-only finding: /sibling-sync cannot write the sibling's file.
     Action hint: notify sibling maintainer, or raise on their side via
     `/upstream-tracker` workflow 3 (Resolve an entry) so they can
     annotate.

   **What "shipped" means** (pinned definition for findings (g) and (h)):
   a fix is shipped when (1) a CHANGELOG or `_(Resolved ...)_` annotation
   exists on the owner's side, OR (2) the feature/fix is referenced in a
   git tag message or commit subject within the relevant release window
   (use `git -C <owner-path> log --oneline --since="6 months ago"` as a
   heuristic proxy — string-match the entry title or its lead clause; do
   not parse). A `Workaround: full` on the filing side without a
   corresponding shipped version on the owner's side is NOT sufficient;
   that is the filing project's mitigation, not upstream resolution.
5. **Output.** Report Mode A findings first (grouped by sibling, then by
   shared dependency, then by finding category), then Mode B findings
   (grouped by sibling) under a separate header. This ordering keeps the
   existing Mode A output shape intact and adds Mode B as an additive
   block.

**Note on UPSTREAM coverage gaps:** /sibling-sync now handles two cases:
shared third-party dependencies (Mode A, basename intersection) and
reciprocal sibling-friction pairs (Mode B, inverse-name detection).
One-sided UPSTREAM files about non-sibling, non-shared dependencies are
still out of scope — those are the sibling's responsibility to discover
via `/upstream-tracker` workflow 7 (Sync from Basic Memory) on its own.

**Output format additions for Mode B:**

```
## UPSTREAM reciprocal-friction — vp-knowledge

(Mode B: this-side UPSTREAM-vp-knowledge.md ↔ sibling-side UPSTREAM-vp-beads.md)

### (e) Sibling's unresolved friction against this project (we should action)
- "vp-beads: new /sibling-sync skill" (Feature Requests, 2026-05-04) — sibling
  marks Workaround: partial; we shipped in v0.12.0. See finding (h).
- "synergy-tracker: mandate bilateral reciprocation" (Feature Requests, 2026-05-04)
  Ownership on their side: upstream (us) · Workaround on their side: full
  → file beads issue or address inline

### (f) Our unresolved friction against the sibling
- "Agent effort defaults not overridable from parent" (Feature Requests, 2026-04-05)
  Ownership: upstream (them) · Workaround: none

### (g) Cross-side staleness: our entry the sibling may have shipped
- (none this run)

### (h) Reverse staleness: sibling tracks us but we may have shipped
- "vp-beads: new /sibling-sync skill" — v0.12.0 tag (2026-05-05) matches.
  Sibling should annotate _(Resolved 2026-05-05, vp-beads v0.12.0)_.
  → notify sibling maintainer; cannot write their file from here
```

### 4. Apply reciprocation batch

Opt-in mutation path. Only runs when the user supplies `--auto-reciprocate`
in their invocation, or explicitly confirms intent like "yes, apply all the
reciprocal gaps". Mirrors `/upstream-tracker` workflow 7 (Sync from Basic
Memory)'s per-entry confirmation pattern.

**Steps:**

1. Re-run workflow 2 (Sync sibling SYNERGY) finding (a) (reciprocal gaps)
   for each accessible sibling, applying the stricter matching rules from
   the Hard Limits section below: Pass 1 (deterministic) matches only;
   any Pass 2 (judgment) matches from workflow 2 are added back to the
   reciprocation queue with an extra disambiguation prompt rather than
   suppressed silently. These are the entries on this side that the
   sibling demonstrably lacks.
2. For each reciprocal gap, in order:
   1. Read the source entry from this project's `SYNERGY-<sibling>.md`
      (full entry text including title, date, structured fields).
   2. Determine the destination file at the sibling:
      `<resolved-local-path>/SYNERGY-<this-project>.md` (derive
      `<this-project>` per
      `skills/synergy-tracker/references/project-name-derivation.md`).
      If it does not exist yet, plan to `Write` a new file using the
      four-section template from
      `skills/synergy-tracker/references/synergy-entry-format.md`.
   3. Determine the destination section from the source entry's section
      (a Shared Pattern on this side becomes a Shared Pattern on the
      sibling, etc.).
   4. Show the user: source entry text + destination file path +
      destination section. Ask: "Write reciprocal entry to
      `<sibling-path>/SYNERGY-<this-project>.md` under `### <Section>`?
      \[y/n/skip-rest]".
   5. On `y`: append the entry under the destination section using `Edit`
      (or `Write` if the file is new). Replace any
      `_No entries yet._` placeholder in that section with the entry. Keep
      the entry text *as-is* from this side — do not rewrite to the
      sibling's voice; reciprocation IS the verification step (per
      `/synergy-tracker` workflow 1 (Log a synergy entry) bilateral
      mandate). The sibling will re-verify on their next reciprocation
      pass.
   6. On `n` or `skip-rest`: skip and continue (or stop the batch on
      `skip-rest`).
3. After the batch, report:
   - Entries written, with destination file paths
   - Entries skipped, with reason
   - **Verification reminder for the user**: run `git status` in the
     sibling repo, review the appended entries, commit on that side. /sibling-sync
     does not commit on the sibling's behalf. Also remind the user to file
     a beads follow-up on the sibling for re-verification next sprint, per
     `/synergy-tracker` workflow 1 (Log a synergy entry)'s reciprocation
     mandate.

**Hard limits on workflow 4 (Apply reciprocation batch):**

- Only mirrors entries from workflow 2 (Sync sibling SYNERGY) finding (a).
  Does NOT mirror UPSTREAM entries from workflow 3 (Sync sibling UPSTREAM)
  — `/upstream-tracker` workflow 7 (Sync from Basic Memory) is the right
  channel for cross-project UPSTREAM adoption (BM is the cross-project
  bridge for friction; SYNERGY is the cross-project bridge for patterns).
  This applies equally to Mode A findings (a)–(d) AND Mode B findings
  (e)–(h): finding (e) entries get filed natively on this side via
  `/upstream-tracker` workflow 1 (Log a new entry), not mirrored;
  finding (h) annotations get written by the sibling via their own
  `/upstream-tracker` workflow 3 (Resolve an entry), not by us.
- Never mirrors entries from `## They Have / We Don't`. The section is
  intrinsically asymmetric (entries here describe sibling capabilities
  WE lack; the sibling's same-named section describes the inverse
  asymmetry). Workflow 2 already excludes this section from finding (a),
  but this is restated here as a mutation-side guard: even if a future
  edit relaxes the workflow 2 exclusion, workflow 4 must never write a
  `They Have / We Don't` entry to the sibling.
- The reciprocal-gap list is computed using **Pass 1 matches only**.
  Entries that paired via Pass 2 (judgment) in workflow 2 are added back
  to the reciprocation queue and presented to the user with a flag:
  "This entry may already exist on the sibling as `<pass-2-matched-title>`
  — does that match? \[y=skip / n=write reciprocal anyway / skip-rest]".
  Defaulting to caution at the mutation boundary inverts the read-only
  cost asymmetry: under `--auto-reciprocate`, suppressing a write that
  should happen (false-positive Pass 2 match) is more expensive than
  proposing a duplicate the user can reject (false-negative).
- Never writes to `## Trend Reviews` sections on either side.
- Never writes to this project's side. Reciprocal entries go to the
  sibling only — logging on this side is `/synergy-tracker` workflow 1
  (Log a synergy entry)'s job.
- Never writes to Basic Memory (no BM edit tooling allowed in this skill).
  BM writes are `/synergy-tracker` workflow 5 (Promote to Basic Memory,
  planned) and `/upstream-tracker` workflow 6 (Promote to Basic Memory)'s
  territory.

## Sprint Workflow Integration

`/sibling-sync` runs as an optional parallel diagnostic alongside
`/synergy-tracker`'s review and trend-review workflows. Recommended cadences:

- **Before `/synergy-tracker` workflow 4 (Trend review (quarterly))** —
  every 4th sprint, run `/sibling-sync` first so the trend review has up-to-
  date drift findings to act on.
- **Before `/synergy-tracker` workflow 2 (Review open synergies)** —
  optional; surfaces drift the per-side review wouldn't catch.
- **After significant sibling activity** — when the user knows the sibling
  shipped a release or restructured a skill, run `/sibling-sync` to
  catch resulting drift early.

This skill is read-only in its default mode, so it's safe to run proactively
without commitment to any follow-up action.

## Guidelines

- **Read-only by default.** Default invocations only call workflows
  1 (Discover sibling(s)), 2 (Sync sibling SYNERGY), and
  3 (Sync sibling UPSTREAM), surfacing findings only. `Edit` and `Write`
  are in `allowed-tools` solely to support workflow 4 (Apply reciprocation
  batch). Never mutate without `--auto-reciprocate` (or equivalent
  explicit user intent).
- **Per-entry confirmation under `--auto-reciprocate`.** Even with the flag,
  every write requires explicit per-entry confirmation. Mirrors
  `/upstream-tracker` workflow 7 (Sync from Basic Memory)'s confirmation
  pattern.
- **Skip inaccessible siblings, don't error.** A missing local-path is
  informational, not fatal. Continue with what's available and report what
  was skipped so the user can correct via
  `.claude/synergy-registry.local.json`.
- **Title-keyed comparison runs in two explicit passes.** Entries on the
  two sides are written by different sessions and naturally drift in title
  formatting; deterministic matching catches the obvious wins, judgment
  ratifies the residual ambiguous cases. The two passes are separate so
  the deterministic rule stays testable and the judgment rule stays
  bounded.

  - **Pass 1 — deterministic lead-clause match.** For each title:
    lowercase, collapse whitespace runs to a single space, then take the
    **lead clause** = the substring before the first occurrence of `:`,
    ` — `, ` -- `, or ` (` (whichever is earliest; if none of those
    appears, the lead clause is the full normalized title). Two entries
    pair in pass 1 iff their normalized lead clauses are byte-identical.
    Examples that should pair here:
    - `wc -l portability guard` ↔ `wc -l portability guard (|| count=0 + tr -d ' ')`
    - `edit_note append-with-section gotcha: independently documented by both plugins` ↔ `edit_note append-with-section gotcha — independently documented`
    - `Frontmatter features` ↔ `Frontmatter features (skills, user-invocable, effort)`
  - **Pass 2 — judgment on residuals only.** For entries that did NOT
    pair in pass 1, scan the still-unmatched residuals on the other side
    once for qualifier-phrase reorderings or token rearrangements that
    clearly describe the same idea. Pair only when the subjects are
    unambiguously the same. Pass 2 examples:
    - `PreCompact hook retired in vp-knowledge v0.28.0` ↔ `PreCompact hook retired in v0.28.0` (qualifier prepositional phrase)
    - `Skill invocation layering: three levels vs two levels` ↔ `Skill invocation layering: two-level vs three-level` (token reordering after the colon)

    Pass 2 may NEVER override or relax pass 1: do not unmatch a pair pass
    1 produced, and do not collapse two pass-1-residual entries that have
    a shared *prefix* but materially different scopes (`Hook validation`
    vs `Hook validation regression test` → leave both as one-sided).
    Rationale for the cost asymmetry: in **default read-only mode**, a
    duplicate entry surviving on both sides outlives sprint cycles
    silently, while an over-merge surfaces immediately at workflow 4
    (Apply reciprocation batch)'s per-entry confirmation gate where the
    user can reject. Under `--auto-reciprocate` this asymmetry inverts —
    a false-positive pass-2 match can suppress a reciprocal entry that
    should be written. Therefore: workflow 4 re-runs pass 1 only and
    treats pass 2 matches as advisory candidates that REQUIRE the user's
    per-entry confirmation to count as matches (mirrors the existing
    write-confirmation gate; the spec defaults to caution at the mutation
    boundary).
- **Stale threshold is inline.** 8 sprints (≈ two trend-review cycles) for
  SYNERGY `Status: aligned` rows; 3 months for UPSTREAM entries; 6 months
  for the workflow 3 Mode B "shipped" look-back horizon (findings (g) and
  (h)). Canonical definitions for the 8-sprint and 3-month thresholds
  live in `/synergy-tracker` workflow 4 (Trend review (quarterly)) and
  `/upstream-tracker` workflow 4 (Trend review (quarterly)). The 6-month
  Mode B horizon is /sibling-sync's own choice — broader than the
  staleness flag because it requires cross-side evidence, not just age.
  When the canonical thresholds change, this skill must be updated to
  match — track via the validate-plugin convention check (vp-beads-9we,
  planned) once it ships.
- **Canonical project-name derivation.** Workflow 3 Mode B needs this
  project's own name to compute `UPSTREAM-<this-name>.md` at the sibling's
  root; workflow 4 (Apply reciprocation batch) needs it to name
  `SYNERGY-<this-project>.md` on the sibling. Derivation uses a four-tier
  precedence (sibling-registry back-pointer → plugin manifest → package
  manifest → directory basename), followed by normalization. Full
  algorithm, worked examples, and limitations:
  `skills/synergy-tracker/references/project-name-derivation.md`. The
  same algorithm computes `<sibling-name>` from this project's
  `synergy-registry.json` (tier 3 for the sibling subject). If derivation
  fails, see Error handling below.
- **No new SYNERGY/UPSTREAM sections.** /sibling-sync only writes entries
  into existing section schemas (`## Shared Patterns`, `## Divergences`, …).
  It does not introduce new section types. Schema evolution is
  `/synergy-tracker`'s job.
- **Companion to /vendor-sync.** vendor-sync handles upstream → project
  drift (subtree pulls, UPSTREAM auto-resolve). sibling-sync handles
  peer-to-peer drift along two axes: SYNERGY reciprocation/status
  divergence (workflow 2), and UPSTREAM friction tracked across both sides
  (workflow 3 — both shared-dependency Mode A and reciprocal-friction
  Mode B). Both skills default to reporting / read-only paths and gate
  mutations on explicit user intent.
- **Project tempo classification.** When a sibling has been dormant for
  more than 90 days (`git -C <sibling-path> rev-list --count --since="90 days ago"
  HEAD` returns 0), surface findings under that sibling with a
  "(dormant — drift expected)" note. Don't suppress findings — the user
  may still want to apply reciprocations to dormant siblings to keep them
  in lockstep — but contextualize them.

## Error handling

- **Registry not found** — tell the user this project has no
  `.claude/synergy-registry.json` and suggest creating one with at least one
  sibling entry. Stop.
- **All siblings inaccessible** — report which paths were tried and stop.
  Suggest `.claude/synergy-registry.local.json` for per-machine path
  overrides.
- **Sibling SYNERGY file missing** — treat as zero entries and proceed. The
  comparison will surface "Unreciprocated entries on sibling" findings if
  applicable.
- **Sibling UPSTREAM file present but malformed** — report the parse error
  with the file path and skip that file's findings. Continue with the rest
  of the sibling's UPSTREAM files.
- **`--auto-reciprocate` with zero reciprocal gaps** — report "no reciprocal
  gaps to apply" and exit cleanly without touching any file.
- **Project-name not derivable** — if both `.claude-plugin/plugin.json` is
  absent (or has no `name`) AND the project root directory basename is
  empty (e.g., the working directory is `/`), skip workflow 3 Mode B for
  every sibling and report the limitation in the workflow 3 output. Mode A
  still runs normally; SYNERGY workflow 2 is unaffected.
