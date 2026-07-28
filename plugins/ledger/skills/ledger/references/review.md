# `review` — status, trend, retro-support, compare

Read-only surveys of the ledger. Variants: plain `review` (status), `review --trend`
(quarterly cross-cut), `review --compare` (against a named sibling), and retro-support
(draft the retrospective's sections). Route by object (upstream vs sibling) and variant.

---

## `review` (upstream) — status

1. Glob all `UPSTREAM-*.md` files and read them.
2. Present a summary grouped by file: counts + open items per section.
3. Flag anything stale (older than \~3 months with no activity). Flag Upstream
   Opportunities with `Merge readiness: direct` and no `[upstream:]` URL as
   "contribution-ready, not yet submitted".

```
## Upstream Status
### <package-name>
- Feature Requests: N open · Bugs: N open · Upstream Opportunities: N open
- [each with title and date]
### Notes
- [stale items; contribution-ready opportunities]
```

If all files are empty, say so and suggest capturing any known friction.

## `review --trend` (upstream) — quarterly

Every 4th sprint, a cross-cutting analysis of all `UPSTREAM-*.md` files.

1. Glob and read all UPSTREAM files.
2. Analyze open items for common themes (recurring type-export issues, similar API gaps).
3. Look for cross-vendor inconsistencies (one vendor supports a pattern its siblings don't).
4. Evaluate continued validity — delete obsolete/addressed items (git preserves them).
5. Identify escalations using these empirical timelines:
   * **Bugs** resolve in 5–10 sprints; beyond 10 → escalate (PR, issue, or workaround acceptance).
   * **Feature requests** take 10–20 sprints; beyond 20 → permanent workaround or fork.
   * **Upstream Opportunities** with no `[upstream:]` URL after 5 sprints → escalate; with a
     PR but no merge after 10 → ping upstream or fork.
   * **Cross-vendor inconsistencies** often resolve only on a next major — low urgency
     unless actively blocking.
   * **Dormancy-aware scaling:** in repos with ≤4 commits/90d (see `SKILL.md` classifier),
     double the escalation thresholds — dormant repos age by calendar, not sprint cadence.
6. Add a Trend Review entry to each file's **Trend Reviews** section.
7. Delete non-vendor UPSTREAM files with no remaining entries.
8. Present findings.
9. **Promotion candidates.** Flag entries open across multiple trend reviews with
   `Ownership: upstream`/`shared`, and Upstream Opportunities with `Merge readiness: direct`
   (the cross-project signal is immediately actionable). Suggest `promote`.

Trend Review entries land in a repo's `UPSTREAM-*.md` / `SYNERGY-*.md`, so they must satisfy that
repo's markdown lint. Two things a fence cannot self-correct — `remark --output` never reaches inside
one, so both are hand-maintained here: the bullet is `*` (a pinned list marker rejects `-`), and every
placeholder bracket is escaped `\[like this\]` (a bare `[…]` reads as an undefined link reference).
The Status blocks further up are terminal OUTPUT, not file content, and need neither.

```
### Trend Review — YYYY-MM-DD (Sprint N)

* **Themes:** \[patterns across open items\]
* **Still valid:** \[confirmed relevant\]
* **Recommend closing:** \[obsolete or low-priority\]
* **Escalate:** \[past their window — include upstream URL if filed\]
```

## `review` (upstream) — retrospective support

Help draft the "Upstream observations" section of a sprint retrospective (`/retrospective`
assembles the file; this only drafts the section).

1. Read all `UPSTREAM-*.md` files.
2. Review the conversation for vendor friction encountered this session.
3. Log any untracked items from context (`log` (upstream)).
4. Draft the upstream observations section.
5. Note entries that look generalizable — the retro may chain into `promote`. List Upstream
   Opportunities and their submission status; flag `Merge readiness: direct` opportunities
   with no PR as sprint action items.

---

## `review` (sibling) — status

1. Glob all `SYNERGY-*.md` files and read them. **This is the one local-only review, so ALSO
   glob `PRIVATE-SYNERGY-*.md` overlays** and assemble the combined view: merge public +
   private entries per section and **label every private (`PRIVATE-SYNERGY`-sourced) row
   `[local]`**. On a shared title, show **both** (committed row `[committed, shadowed]`,
   private row `[local]`) so the promotable public twin stays visible. A `[local]` row is
   review-only — never offered as a reciprocation or BM-promotion candidate (those paths glob
   `SYNERGY-*.md`, structurally excluding the prefix).
2. Summary grouped by file: counts per section + each open entry with title and date.
3. Flag stale entries (older than 3 months; a Trend Review entry resets the file's clock).
4. Highlight actionable items: Extraction Candidates `Readiness: ready`; Divergences with
   `Convergence path: adopt-theirs`/`propose-shared`; They Have / We Don't `Priority: adopt-soon`.
5. **Inverse-file glob staleness detection (optional, best-effort).** For each sibling with a
   `SYNERGY-<sibling>.md` here, attempt to read the sibling's `SYNERGY-<this-project>.md`
   (registry-with-override path; `local-path` else `../<sibling>/`; `<this-project>` per
   `references/project-name-derivation.md`). **Degrade silently** on any missing registry,
   unresolved path, absent file, or read failure — never hard-fail. When accessible, surface
   two drift classes: **stale `aligned` rows** (this side `Status: aligned` but the sibling
   lists it under `## Divergences`, or carries `Status: drifting`, or annotated it
   resolved/retired) and **missing-this-side rows** (features the sibling tracks that no
   longer exist here). **Bilateral first:** when the user wants full reciprocation
   gaps / two-way status drift / auto-reciprocation, defer to `reconcile` — this step is
   only a single-side side-channel.

```
## Synergy Status
### <project-name>
- Shared Patterns: N (N drifting) · Divergences: N (N with active convergence path)
- Extraction Candidates: N (N ready) · They Have / We Don't: N (N adopt-soon)
- [each entry with title and date]
### Notes
- [stale; actionable; inverse-file findings]
```

## `review --compare` (sibling) — compare with a named sibling

Direct comparison between this project and a named sibling to surface _unlogged_ synergy
observations. (Kept under `review`, not `reconcile`: this reads a sibling's _code and
conventions_ and proposes new `log` (sibling) entries, distinct from `reconcile`, which
diffs the ledger _files_ bilaterally.)

1. **Load the registry with override merge** (base + `.local.json`, by `name`; a
   `.local.json`-only entry whose `file` is `PRIVATE-SYNERGY-<name>.md` is _added_ as a
   private sibling, else ignored). If none identified, ask; if no registry at all, offer
   `log` (sibling) step 1b registry creation first.
2. **Gather sibling context.** Resolve the sibling's local path (`local-path`, else
   `../<name>/`; if inaccessible, ask and suggest recording it in `.local.json`). Read the
   sibling's `package.json`, `CLAUDE.md`, `skills/**/SKILL.md`, `hooks/hooks.json`,
   `agents/*.md` if accessible. If neither local files, conversation, nor BM give
   substantive info, stop — do not generate speculative entries.
3. **Diff patterns** against this project's equivalents in the four categories (Shared
   Patterns / Divergences / Extraction Candidates / They Have / We Don't).
4. **Propose new entries.** Present each observation as a candidate with draft text
   (`references/synergy-entry-format.md`); ask "Log this as a \[category] entry for
   \[sibling]?" per candidate. **No mutations without approval.**
5. Log confirmed entries per `log` (sibling) steps 4–7. Skip the eager-promotion check for
   batch entries. Offer a single summary: "N entries logged. Run `review` (sibling) for the
   full picture." If the user skips all, report none logged.

## `review --trend` (sibling) — quarterly

Every 4th sprint, a cross-cutting analysis of all `SYNERGY-*.md` files (aligned with the
every-4th-sprint cadence shared with `/retrospective` and `review --trend` (upstream)).
**Boundary-crossing** — step 5 cross-references BM and step 8 recommends `promote` — so
private overlays are excluded structurally (the `SYNERGY-*.md` glob cannot match the prefix).

1. **Drift audit.** For every Shared Patterns entry `Status: aligned`, check whether
   `Last verified:` is more than \~8 sprints (two cycles) old — flag stale `aligned` rows
   (alignment claims decay).
2. **Reciprocation check.** For each shared-pattern entry, check whether the sibling has a
   corresponding entry in its `SYNERGY-<this-project>.md` (registry-with-override path).
   Asymmetric tracking silently misses drift.
3. **Status sweep on Extraction Candidates.** List `Readiness: ready` candidates unmoved for
   > 2 cycles (\~8 sprints) — stalled (escalate to a `diarie` task) or irrelevant (close).
4. **They Have / We Don't sweep.** List `Priority: adopt-soon` older than one cycle (\~4
   sprints) — adopt now or downgrade to `consider`/`deferred`.
5. **BM cross-reference.** Cross-reference each open entry against `## Cross-Project Synergy`
   in the sibling relationship note to spot already-promoted entries and promotion candidates.
6. **Dormancy-aware scaling.** In repos with ≤4 commits/90d, double the staleness thresholds.
7. Add a per-file Trend Review entry under a **Trend Reviews** section (create it if absent);
   this resets the file's staleness clock.
8. Present aggregate findings. Suggest follow-ups: open `diarie` tasks for stalled
   extractions, run `promote` for candidates, downgrade stale `adopt-soon` entries.

```
### Trend Review — YYYY-MM-DD (Sprint N)

* **Themes:** \[recurring drift, un-extracted shared infra\]
* **Still valid:** \[confirmed relevant\]
* **Recommend closing:** \[obsolete or dismissed\]
* **Escalate:** \[stalled Extraction Candidates; stale `aligned` rows; overdue `adopt-soon`\]
```

At trend-review boundaries, `/retrospective` chains into these per-file entries and includes
a "Synergy trend review" subsection.
