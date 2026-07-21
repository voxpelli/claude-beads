# `reconcile` — bilateral sibling drift (SYNERGY + UPSTREAM)

Bilateral reconciliation of `SYNERGY-*.md` and `UPSTREAM-*.md` files between this project
and its sibling vp-\* projects. **Read-only by default** — surfaces drift, reciprocal gaps,
stale-aligned rows, and status drift without mutating anything. The opt-in
`--auto-reciprocate` flag writes reciprocal entries to the *sibling's* SYNERGY file via
per-entry confirmation.

🚨 **This mode writes NOTHING to Basic Memory.** The `reconcile` layer owns nothing in BM.
Before the merge, this was enforced by *omitting* `mcp__basic-memory__edit_note` from the
skill's `allowed-tools`; the merged `ledger` skill carries that tool for `promote`, so the
boundary is now **prose-enforced**: `reconcile` must never call
`mcp__basic-memory__edit_note`. BM writes are `promote`'s territory. `reconcile` also owns
nothing on *this* project's side of the SYNERGY/UPSTREAM files — its action menu *delegates*
writes (see the protocol below).

## Cross-mode boundaries

- Does **not** write SYNERGY entries on this project's side — `log` (sibling) owns that.
- Does **not** pull upstream subtrees — `pull` owns that.
- Does **not** write `## Trend Reviews` entries — `review --trend` owns those. Even under
  `--auto-reciprocate`, `reconcile` mirrors only content entries into reciprocal sections.
- **Surfacing** reciprocal-friction findings is in scope; **acting** on them is not — filing
  work is `log` (upstream)'s job, annotating a sibling's entry resolved is `resolve`'s.

## Registry, paths, and private siblings

Sibling projects come from `.claude/synergy-registry.json` (+ `.local.json` override by
`name`, incl. the **private-add mode** — a `.local.json`-only entry whose `file` is
`PRIVATE-SYNERGY-<name>.md` is added as a private sibling; see `SKILL.md`). Resolve each
`local-path` (registry value, else `../<name>/`); if the path is missing, **report and skip
that sibling — never error**. Mode A additionally consumes the merged vendor registry to find
shared dependencies (the vendor registry has no private-add mode — private siblings are
synergy-only).

**Private sibling read-vs-write split** (keyed on the `PRIVATE-SYNERGY-*` `file` predicate):

- **Read (allowed) — hybrid read-diff.** A private sibling's `PRIVATE-SYNERGY-<name>.md` **is**
  its registry `file`, so workflows 1/2/3-ModeA read it for **read-only diff findings** that
  appear in the **ephemeral terminal report only** — never written. (This is unlike a *public*
  sibling's glob-discovered `PRIVATE-SYNERGY-*.md` overlay, which `reconcile` never reads.)
- **Write (blocked) — every committed surface** for a `PRIVATE-SYNERGY-*`-filed sibling:
  reciprocation (workflow 4 (Apply reciprocation batch)) skips it entirely; the action menu suppresses task creation (a
  committed `.diarie/tasks/*.yml` naming the sibling would leak it); "log unreciprocated
  entry" follow-ups route to the gitignored `PRIVATE-SYNERGY-<name>.md`; BM promotion never
  (delegated to `promote`, which skips the prefix); UPSTREAM Mode B is out of scope (an
  `UPSTREAM-<name>.md` filename would leak the name — Mode A still runs).

## 1. Discover sibling(s)

1. Read `.claude/synergy-registry.json`. If absent, redirect: offer `log` (sibling) step 1b
   guided registry creation for the first named sibling (execute its instructions in-session —
   there is no real cross-skill invocation), then resume; otherwise stop and tell the user to
   set up the registry first.
2. Merge `.local.json` (incl. private siblings).
3. Filter to a named sibling if the user gave one; else all merged entries participate.
4. Resolve each `local-path` → `../<name>/` fallback; probe existence.
5. Build lists: **accessible** (proceed; mark private siblings `[private]`) and
   **inaccessible** (report the resolved path + the `.local.json` override hint).
6. Report the participation list before continuing. If none accessible, stop and report.

## 2. Sync sibling SYNERGY (report-only)

For each accessible sibling, compare the bidirectional SYNERGY files.

1. Read this side's file by the registry `file` value — `SYNERGY-<sibling>.md` (public) or
   `PRIVATE-SYNERGY-<sibling>.md` (private, the read-diff exception). For a *public* sibling
   never pull in a glob-discovered `PRIVATE-SYNERGY-*.md` overlay (the prefix keeps those
   outside the namespace). Absent → treat as zero entries.
2. Read the sibling's `<local-path>/SYNERGY-<this-project>.md`. Absent → zero entries.
3. Parse each side section-by-section; build a bidirectional map keyed by **title**
   (normalized per the two-pass rule below). **Matching is within-section.** A **section
   migration** (Shared Pattern here, Divergence on the sibling) surfaces as findings (a) on
   the origin section and (b) on the destination — NOT as (d) status drift; the migration is
   itself the signal. **`They Have / We Don't` is intrinsically asymmetric** (each side's
   section describes what the *other* has) — **exclude it from findings (a)/(b)**.
4. Classify each entry:
   - **(a) Reciprocal gaps** — here, no matching title on the sibling. Candidates for
     workflow 4 (Apply reciprocation batch) under `--auto-reciprocate`. (Excludes `They Have / We Don't`.)
   - **(b) Unreciprocated on sibling** — on the sibling, no match here. User may `log`
     (sibling) these. `reconcile` never writes this side automatically. (Excludes `They
     Have / We Don't`.)
   - **(c) Stale alignment claims** — `Status: aligned` with `Last verified:` >8 sprints
     (≈2 cycles; canonical threshold in `review --trend`). Treat 1 sprint ≈ 2 weeks; no
     `Last verified:` → fall back to the entry date stamp.
   - **(d) Status drift** — matched entries whose `Status:` differs across sides (Shared
     Patterns `aligned` vs `drifting`/`diverging`; Divergences `adopt-theirs`/`propose-shared`
     where one side moved to `adopted`/`converged`). Excludes `accept-difference`
     Divergences (intended-asymmetric).
5. Report grouped by sibling then finding category (title, both sides' differing values, a
   one-line action hint per category).

## 3. Sync sibling UPSTREAM (report-only)

Two pairing modes coexist; both can fire on one sibling.

- **Mode A — shared-dependency pairing.** Both sides have `UPSTREAM-<dep>.md` with the **same
  basename**. Findings (a)–(d).
- **Mode B — reciprocal sibling-friction.** This project has `UPSTREAM-<sibling-name>.md`
  and/or the sibling has `UPSTREAM-<this-name>.md`. **Owner-side semantics invert:**
  `Ownership: upstream` in the sibling's file *about us* means THIS project must act.
  Findings (e)–(h). **Skipped entirely for private siblings** (the filename would leak the name).

1. **Build Mode A pairs.** Glob both sides for `UPSTREAM-*.md`; intersect by basename.
2. **Detect Mode B pair.** Skip for private siblings. Derive `<this-name>` and `<sibling-name>`
   per `references/project-name-derivation.md`. **Stale `local-path` guard:** if the registry
   `local-path` is inaccessible, tier 1 (sibling back-pointer) falls through to tier 2 — warn
   the user that `<this-name>` may diverge from how the sibling registered us. Check for
   `<local-path>/UPSTREAM-<this-name>.md` and `UPSTREAM-<sibling-name>.md`; either present →
   a Mode B pair (basenames differ from any Mode A pair by construction).
3. **Process Mode A pairs.** Read both copies, parse entries (Bugs, Feature Requests, Upstream
   Opportunities, Resolved), match by title (two-pass rule). Classify: **(a) Duplicate
   friction** (same title both sides — sanity-check workarounds/dates/status align);
   **(b) Complementary workarounds** (same title, differing `Workaround:` — cross-pollinate);
   **(c) Stale entries** (>3 months, no Trend Review since — either side); **(d) Sibling-only
   entries** (friction the sibling tracks for a shared dep that we don't — potential adoption
   via `log` (upstream) or `promote --sync-back`; `reconcile` never writes here).
4. **Process Mode B pair.** Read whichever side(s) exist; match by title (two-pass). Classify:
   - **(e) Sibling's unresolved friction against us** — entries in
     `<sibling>/UPSTREAM-<this-name>.md` not `_(Resolved …)_` / not in a `## Resolved`
     section. `Ownership: upstream` = WE own the fix (we are upstream from their view).
     Surface ALL unresolved — each is a request directed at us. Hint: file tracker tasks here
     or address inline.
   - **(f) Our unresolved friction against the sibling** — entries in
     `UPSTREAM-<sibling-name>.md` unresolved on our side, no `_(Resolved …)_` either side.
     Informational — work blocked on the sibling. Hint: check their changelog for shipped fixes.
   - **(g) Cross-side staleness — our entry, sibling may have shipped.** Our unresolved entry
     where the sibling shows a "shipped" signal (6-month look-back). Hint: re-verify; annotate
     via `resolve` if confirmed.
   - **(h) Reverse cross-side staleness — sibling tracks us, we may have shipped.** The
     sibling's unresolved entry where *this* project shows a "shipped" signal. Read-only —
     `reconcile` cannot write the sibling's file. Hint: notify the sibling maintainer.
   - **What "shipped" means** (findings (g)/(h)): (1) a CHANGELOG or `_(Resolved …)_`
     annotation on the owner's side, OR (2) the fix referenced in a git tag message or commit
     subject within the window (`git -C <owner-path> log --oneline --since="6 months ago"` as
     a heuristic — string-match the entry title/lead clause; do not parse). A `Workaround:
     full` on the filing side is NOT sufficient (that's the filer's mitigation, not upstream
     resolution).
5. **Output.** Mode A findings first (by sibling → shared dependency → category), then Mode B
   (by sibling) under a separate header.
6. **Offer follow-up actions** — the dispatch point. After workflows 2 and 3 have both printed
   for this sibling, build a single `AskUserQuestion` combining the SYNERGY tier (from
   workflow 2 (Sync sibling SYNERGY)) with the UPSTREAM tier (below). See the Action-menu protocol.

## 4. Apply reciprocation batch (opt-in mutation)

Only runs under `--auto-reciprocate` or an explicit "yes, apply all the reciprocal gaps".
Per-entry confirmation always.

1. **Exclude private siblings first** — drop any `PRIVATE-SYNERGY-*`-filed sibling before
   anything else (writing `SYNERGY-<this-project>.md` on their side would expose the private
   relationship). Announce each exclusion. This guard runs before any read of the sibling file.
2. Re-run workflow 2 (Sync sibling SYNERGY) finding (a) for each remaining accessible sibling under the **stricter
   matching**: **Pass 1 (deterministic) matches only**; any Pass 2 (judgment) matches are
   added back to the queue with an extra disambiguation prompt (not silently suppressed).
3. For each reciprocal gap, in order: read the source entry from `SYNERGY-<sibling>.md`;
   determine the destination `<local-path>/SYNERGY-<this-project>.md` (derive `<this-project>`
   per `references/project-name-derivation.md`; `Write` a new file from the four-section
   template if absent); mirror the source section; show source text + destination path +
   section and ask "Write reciprocal entry to `<path>/SYNERGY-<this-project>.md` under
   `### <Section>`? \[y/n/skip-rest]". On `y`, append via `Edit` (or `Write` if new), replacing
   any `_No entries yet._`; **keep the entry text as-is — do not rewrite to the sibling's
   voice; reciprocation IS the verification step**. On `n`/`skip-rest`, skip/stop.
4. Report: entries written (with paths); skipped (with reason); a **verification reminder** —
   run `git status` in the sibling repo, review, commit there (`reconcile` does not commit on
   the sibling's behalf), and file a re-verification follow-up next sprint.

**Hard limits:** only mirrors workflow 2 (Sync sibling SYNERGY) finding (a) — never UPSTREAM entries (finding (e)
files natively via `log` (upstream); finding (h) is annotated by the sibling via their own
`resolve`). Never sources from a `PRIVATE-SYNERGY-*.md` overlay (structural — reads the
committed `SYNERGY-<project>.md` by exact name). Never reciprocates for a private sibling
(step 1). Never mirrors `They Have / We Don't` (asymmetric — restated as a mutation-side
guard). Reciprocal-gap list uses **Pass 1 matches only**; Pass 2 matches become
user-confirmed advisory candidates — **at the mutation boundary the read-only cost asymmetry
inverts**: suppressing a needed write (false-positive Pass 2 match) costs more than proposing
a duplicate the user can reject. Never writes `## Trend Reviews`, this project's side, or BM.

## Two-pass title matching (used by workflows 2, 3, and 4)

Entries on the two sides are written by different sessions and drift in title formatting. Two
explicit passes keep the deterministic rule testable and the judgment rule bounded.

- **Pass 1 — deterministic lead-clause.** Lowercase, collapse whitespace to single spaces,
  take the **lead clause** = the substring before the first `:`, `—`, `--`, or ` (` (earliest;
  none → the full normalized title). Two entries pair iff their normalized lead clauses are
  byte-identical. E.g. `wc -l portability guard` ↔ `wc -l portability guard (|| count=0 …)`.
- **Pass 2 — judgment on residuals only.** For unpaired residuals, scan once for
  qualifier-phrase reorderings/token rearrangements that clearly describe the same idea; pair
  only when subjects are unambiguously the same. E.g. `PreCompact hook retired in vp-knowledge
  v0.28.0` ↔ `PreCompact hook retired in v0.28.0`. **Pass 2 may NEVER override Pass 1** (don't
  unmatch a Pass-1 pair; don't collapse shared-prefix / different-scope entries like `Hook
  validation` vs `Hook validation regression test`). Cost asymmetry: in **read-only** mode a
  surviving duplicate is cheaper than an over-merge (which the user catches at the workflow-4
  confirmation gate); under **`--auto-reciprocate`** it inverts (see workflow 4 (Apply reciprocation batch) hard limits).

## Action-menu protocol

The menu is a navigation aid, not a write path. Because `log`, `promote`, and `resolve` are
sibling **modes of this same `ledger` skill**, "dispatch" here means **continue in that mode**
(a same-skill transition — no cross-skill call), or append a `.diarie/` task via `Edit`/`Write`.
Picking "None" for both tiers exits read-only. After workflows 2 (Sync sibling SYNERGY) and 3
(Sync sibling UPSTREAM) print, issue one `AskUserQuestion` with up to two single-select questions
per sibling (options listed only when their finding count is nonzero):

**Q1 — SYNERGY** (`header: "Synergy"`) — options, each listed only when its finding count > 0.
Option (1) *Apply reciprocal gaps (N)* — when finding (a) > 0, re-enter workflow 4 (Apply
reciprocation batch) in-skill. Option (2) *Log unreciprocated sibling entries (N)* — when finding
(b) > 0, continue in the `log` (sibling) mode for those entries. Option (0) *None*.

**Q2 — UPSTREAM** (`header: "Upstream"`) — options, each listed only when its finding count > 0.
Option (1) *Update our UPSTREAM (b/d, N)* — when finding (b) > 0 OR (d) > 0, continue in the `log`
(upstream) mode and/or `promote --sync-back`. Option (2) *File tracker tasks for sibling's
friction (N)* — when finding (e) > 0, `Edit`/`Write` a task entry to
`.diarie/tasks/tasks-<slug>.yml`. Option (3) *Resolve cross-stale entries (N)* — when finding
(g) > 0, continue in the `resolve` mode. Option (0) *None*. (Findings (a), (c), (f), (h) are
informational — not in the menu.)

If neither tier is actionable, skip the prompt. If only one is, issue a single-question call.

**Private-sibling guard (no-commit-leak).** For a `PRIVATE-SYNERGY-*`-filed sibling: Q2 option 2
(task creation) is suppressed (finding (e) doesn't arise anyway — Mode B is skipped); Q1
option 2 redirects its `log` (sibling) continuation to the gitignored `PRIVATE-SYNERGY-<name>.md`;
Q1 option 1 is absent (workflow 4 (Apply reciprocation batch) excludes private siblings). If nothing remains actionable,
present read-only findings.

**Task-entry shape** (Q2 option 2 — plain YAML, substrate-not-opinion): `id:` (fresh, per the
store convention), `title:` (sibling entry title), `status: pending`, `type: task`,
`priority:` (inherit or default), `description:` (entry body verbatim + a cross-reference line:
`Sibling <sibling-name> tracks this against us in their UPSTREAM-<this-name>.md. Source
section: <Bugs | Feature Requests | Upstream Opportunities>.`).

**`--auto-reciprocate` precedence:** flag set → skip the menu, run workflow 4 (Apply reciprocation batch) directly (with
its per-entry gate). No flag + Q1 option 1 → workflow 4 (Apply reciprocation batch) interactively. No flag + any "None" →
no writes. No flag + other non-"None" → continue in the chosen mode (which applies its own gate).

**Idempotency:** Q1 opt 1 closes (a); Q1 opt 2 closes (b); Q2 opt 1 closes (b)/(d); Q2 opt 3
annotates `_(Resolved …)_` so (g) suppresses thereafter. Only Q2 opt 2 (task for (e)) does not
self-resolve — (e) re-fires until the sibling annotates their side (expected; no
skip-already-filed cache).

**Failure modes:** if a chosen mode cannot proceed for one sibling → print the copy-paste hint
and continue (never abort the run). **Subagent context** (e.g. inside a swarm-wave research
agent): `AskUserQuestion` is unavailable — skip the menu, print the copy-paste hints, and let the
parent decide whether to re-invoke `ledger`. A malformed task entry (fails `diarie validate`) →
report and continue.

## Notes

- **Skip inaccessible siblings, don't error.** Continue with what's available; report skips.
- **No new SYNERGY/UPSTREAM sections** — `reconcile` writes only into existing schemas; schema
  evolution is `log`'s job.
- **Project tempo:** a sibling dormant >90 days
  (`git -C <path> rev-list --count --since="90 days ago" HEAD` = 0) → contextualize its
  findings "(dormant — drift expected)"; don't suppress them.
- **Project-name not derivable** (no `plugin.json` name AND empty basename) → skip Mode B for
  every sibling and report; Mode A and workflow 2 (Sync sibling SYNERGY) are unaffected.
