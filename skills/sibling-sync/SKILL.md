---
name: sibling-sync
description: "Bilateral SYNERGY/UPSTREAM reconciliation across sibling projects. Use when the user wants to sync sibling SYNERGY/UPSTREAM files, compare both sides to surface drift, find reciprocation gaps (entries here but not there, or vice versa), flag stale-aligned rows, detect divergence convergence-status drift, or apply a reciprocation batch with --auto-reciprocate. NOT for logging entries on this side (use /synergy-tracker workflow 1 (Log a synergy entry)) — sibling-sync compares both sides without writing by default. NOT for upstream → project drift (use /vendor-sync); sibling-sync handles peer-to-peer drift between sibling vp-* projects. Trigger phrases: 'sibling sync', 'compare siblings', 'sync sibling', 'reconcile siblings', 'reciprocation gap', 'sync drift', 'bilateral sync', 'sync SYNERGY', 'sync UPSTREAM both ways', 'auto-reciprocate', 'check sibling drift', 'peer-to-peer drift', 'cross-project drift', 'sibling reconciliation'."
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
drift, reciprocal gaps, stale-aligned rows, and convergence-status divergence
across both sides without mutating anything. The opt-in `--auto-reciprocate`
flag writes reciprocal entries to the sibling's SYNERGY file via per-entry
confirmation.

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
   bidirectional entry map keyed by **title** — case-insensitive,
   whitespace-normalized.
4. Walk the merged map and classify each entry into one of four findings:

   - **(a) Reciprocal gaps** — entries on this side with no matching title
     on the sibling. The sibling lacks the reciprocal entry. Candidates for
     workflow 4 (Apply reciprocation batch) under `--auto-reciprocate`.
   - **(b) Unreciprocated entries on sibling** — entries on the sibling
     with no matching title here. The user may want to invoke
     `/synergy-tracker` workflow 1 (Log a synergy entry) to log these on
     this side. /sibling-sync does NOT write to this side automatically.
   - **(c) Stale alignment claims** — entries with `Status: aligned` and
     `Last verified:` more than 8 sprints old (≈ two trend-review cycles).
     Inline threshold; canonical definition is `/synergy-tracker` workflow
     4 (Trend review (quarterly)). Treat 1 sprint ≈ 2 weeks if no other
     calibration is available; if the entry has no `Last verified:` field,
     fall back to the entry's date stamp.
   - **(d) Divergence convergence-status drift** — entries with
     `Convergence path: adopt-theirs` or `Convergence path: propose-shared`
     whose `Status:` value differs between the two sides. One side may
     have moved to "adopted" while the other still says "drifting", or
     similar.

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

### (d) Divergence convergence-status drift
- "BM section ownership scheme" (Divergences) — Convergence path:
  propose-shared. Status here: drifting. Status sibling: aligned.
```

### 3. Sync sibling UPSTREAM

For each accessible sibling, identify shared `UPSTREAM-*.md` dependencies and
compare friction tracking. Same report-only contract as workflow 2 (Sync
sibling SYNERGY).

**Steps:**

1. Glob this project for `UPSTREAM-*.md`. Glob the sibling's resolved
   `local-path` for `UPSTREAM-*.md`. Compute the intersection by basename —
   these are the shared upstream dependencies.
2. For each shared `UPSTREAM-<dep>.md`, read both copies and parse entries
   (Bugs, Feature Requests, Upstream Opportunities, Resolved). Build a
   bidirectional entry map by **title** (case-insensitive,
   whitespace-normalized).
3. Walk the merged map and classify each entry:

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
     (Log) to bring matching entries over here. /sibling-sync does NOT
     write here automatically.

4. Output a structured report grouped by sibling, then by shared dependency,
   then by finding category. Use the same output shape as workflow 2 (Sync
   sibling SYNERGY).

**Note on UPSTREAM coverage gaps:** if this project has an `UPSTREAM-<dep>.md`
that the sibling doesn't, that's not surfaced here — it's the sibling's
responsibility to discover via `/upstream-tracker` workflow 7 (Sync from
Basic Memory) on its own. /sibling-sync only addresses the symmetric case
of shared `UPSTREAM-*.md` files.

### 4. Apply reciprocation batch

Opt-in mutation path. Only runs when the user supplies `--auto-reciprocate`
in their invocation, or explicitly confirms intent like "yes, apply all the
reciprocal gaps". Mirrors `/upstream-tracker` workflow 7 (Sync from Basic
Memory)'s per-entry confirmation pattern.

**Steps:**

1. Re-run workflow 2 (Sync sibling SYNERGY) finding (a) (reciprocal gaps)
   for each accessible sibling. These are the entries on this side that
   the sibling lacks.
2. For each reciprocal gap, in order:
   1. Read the source entry from this project's `SYNERGY-<sibling>.md`
      (full entry text including title, date, structured fields).
   2. Determine the destination file at the sibling:
      `<resolved-local-path>/SYNERGY-<this-project>.md`. If it does not
      exist yet, plan to `Write` a new file using the four-section template
      from `/synergy-tracker` references/synergy-entry-format.md.
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
- **Title-keyed comparison, case-insensitive, whitespace-normalized.**
  Entries are matched on title for both SYNERGY and UPSTREAM comparisons.
  Be lenient on capitalization and whitespace; entries on the two sides are
  written by different sessions and naturally drift in formatting.
- **Stale threshold is inline.** 8 sprints (≈ two trend-review cycles) for
  SYNERGY `Status: aligned` rows; 3 months for UPSTREAM entries. Canonical
  definitions live in `/synergy-tracker` workflow 4 (Trend review
  (quarterly)) and `/upstream-tracker` workflow 4 (Trend review). When those
  thresholds change, this skill must be updated to match — track via the
  validate-plugin convention check (vp-beads-9we, planned) once it ships.
- **No new SYNERGY/UPSTREAM sections.** /sibling-sync only writes entries
  into existing section schemas (`## Shared Patterns`, `## Divergences`, …).
  It does not introduce new section types. Schema evolution is
  `/synergy-tracker`'s job.
- **Companion to /vendor-sync.** vendor-sync handles upstream → project
  drift (subtree pulls, UPSTREAM auto-resolve). sibling-sync handles
  peer-to-peer drift (reciprocation, status divergence). Both default to
  reporting / read-only paths and gate mutations on explicit user intent.
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
