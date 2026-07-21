---
name: ledger
description: "Ledger of this project's relationships with code it does not own: upstream dependencies (npm/vendor/tool) and sibling projects. Modes: log (upstream friction - a bug, feature request, or contribution opportunity - or a cross-project pattern/divergence/extraction-candidate/gap with a sibling), resolve (close a fixed upstream entry), review (status, trend, retro, compare-with-sibling), pull (git-subtree vendor sync + auto-resolve), reconcile (bilateral SYNERGY/UPSTREAM sibling drift: reciprocation gaps, stale-aligned rows, status drift), promote (upstream friction / synergy to Basic Memory + sync-back). Triggers: upstream, track this, log this bug, vendor issue, contribution opportunity, review upstream, trend review, promote to memory, sync from memory, synergy, cross-project, sibling project, extraction candidate, shared pattern, divergence, compare with [project], sync vendor, pull upstream, sibling sync, reconcile siblings, auto-reciprocate. NOT for this-project task tracking (use diarie)."
user-invocable: true
argument-hint: "[log · resolve · review|trend|compare · pull · reconcile · promote|sync-back] (object)"
paths:
  - "UPSTREAM-*.md"
  - "SYNERGY-*.md"
  - "PRIVATE-SYNERGY-*.md"
  - ".claude/vendor-registry.json"
  - ".claude/synergy-registry.json"
  - "vendor/**"
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - Glob
  - AskUserQuestion
  - mcp__basic-memory__search_notes
  - mcp__basic-memory__read_note
  - mcp__basic-memory__edit_note
---

# Ledger

One skill for the project's **ledger of external relationships** — an OBJECT (an
upstream dependency · a sibling project) crossed with a VERB (log · resolve ·
review · pull · reconcile · promote). The shared file conventions, registries,
Basic-Memory section-ownership map, and staleness thresholds live here **once**,
and each mode's detail is loaded from `references/<mode>.md` only when it fires.

This skill tracks relationships with code this project does **not** own. It does
**not** track this project's own work — that is `diarie`'s job (see
`## Cross-skill boundaries`).

## The object × verb matrix

The grid is deliberately **sparse** — the empty cells are information, not gaps to fill.

|               | **upstream dependency**                          | **sibling project**                              |
| ------------- | ------------------------------------------------ | ------------------------------------------------ |
| **log**       | record friction (`UPSTREAM-*.md`)                | record a pattern/divergence (`SYNERGY-*.md`)     |
| **resolve**   | close a fixed entry                              | — (placeholder-restore only; no formal flow)     |
| **review**    | status / trend / retro-support                   | status / trend / compare-with-sibling            |
| **pull**      | subtree pull + auto-resolve on the diff          | — (no sibling subtree exists)                    |
| **reconcile** | shared-dep drift across two sibling repos (Mode A) | bilateral SYNERGY + reciprocal-friction drift  |
| **promote**   | `## Upstream Friction` ⇄ BM (+ `--sync-back`)    | `## Cross-Project Synergy` ⇄ BM                  |

## Commands

Route the request to a mode, then load that mode's reference file for the full workflow.

| Mode        | Object(s)          | Reference                    | What it does                                                                   |
| ----------- | ------------------ | ---------------------------- | ------------------------------------------------------------------------------ |
| `log`       | upstream, sibling  | `references/log.md`          | Record new friction (upstream) or a synergy entry (sibling).                   |
| `resolve`   | upstream           | `references/resolve.md`      | Close a fixed upstream entry; annotate BM.                                     |
| `review`    | upstream, sibling  | `references/review.md`       | Status, `--trend` (quarterly), retro-support, `--compare` (against a sibling). |
| `pull`      | upstream           | `references/pull.md`         | Bootstrap the vendor registry; pull subtrees; auto-resolve UPSTREAM on the diff. |
| `reconcile` | sibling (+shared-dep) | `references/reconcile.md` | Bilateral SYNERGY/UPSTREAM drift between sibling repos; `--auto-reciprocate`.  |
| `promote`   | upstream, sibling  | `references/promote.md`      | Local ⇄ Basic Memory. `--sync-back` is the inbound (BM → local) leg.           |

### Routing rules

- **Exact mode named** (`log`, `pull`, …) → load its `references/<mode>.md` and run it.
- **Object disambiguation.** Some modes serve both objects. Decide from context: an
  npm/vendor/tool package or a bug/feature/contribution → the **upstream** object; a
  peer vp-\* project, a shared pattern, a divergence, an extraction candidate → the
  **sibling** object. If genuinely ambiguous, ask.
- **Fuzzy intent → nearest mode:** "track this bug" / "vendor issue" → `log` (upstream);
  "shared pattern" / "they have X we don't" → `log` (sibling); "resolved upstream" /
  "mark as fixed" → `resolve`; "review upstream" / "review synergies" / "what's open" →
  `review`; "trend review" → `review --trend`; "compare with \[project]" →
  `review --compare`; "sync vendor" / "pull upstream" / "update subtrees" → `pull`;
  "sibling sync" / "reconcile siblings" / "reciprocation gap" / "what does the sibling
  say about us" → `reconcile`; "promote to memory" → `promote`; "sync from memory" /
  "known friction" → `promote --sync-back`.
- **No argument → a context-aware menu.** Offer the modes whose object is present
  (UPSTREAM/vendor files → upstream modes; SYNERGY files / a sibling registry →
  sibling modes).
- **`sync-back` is a leg of `promote`, not its own mode** (both directions share the
  section-ownership routing). **`--compare` stays under `review`** (it reads a
  sibling's code/conventions and proposes `log` entries — distinct from `reconcile`,
  which diffs the ledger *files* bilaterally).

## Shared conventions (the CORE)

Every mode draws on these; none restates them. This shared core is the whole return
on the merge — collapsing four hand-synced copies into one.

### File conventions

- **UPSTREAM files** — `UPSTREAM-<package-name>.md`, slashes → `--`, drop leading `@`
  (`@voxpelli/typed-utils` → `UPSTREAM-voxpelli--typed-utils.md`). Non-npm tools carry a
  type prefix: `brew:`/`cask:`/`action:`/`docker:`/`vscode:`
  (`UPSTREAM-action--actions--checkout.md`). **Lifecycle:** vendor packages (declared in
  `.claude/vendor-registry.json`, or listed under `package.json` workspaces) get
  **permanent** files that persist even when empty (restore the `_No entries yet._`
  placeholder); non-vendor deps and tools get **ephemeral** files — `git rm` the whole
  file once all entries resolve.
- **SYNERGY files** — `SYNERGY-<project-name>.md`, same normalization. **Permanent**
  fixtures — never deleted, even when empty (restore `_No entries yet._`). Four sections:
  **Shared Patterns · Divergences · Extraction Candidates · They Have / We Don't**.
- **Bracket-escaping (build-breaking if dropped).** Every `[...]` in an entry body must
  be escaped (`\[degraded\]`, `\[upstream: <url>\]`). An unescaped `[text]` with no
  matching definition is a shortcut reference link; under remark-lint
  `no-undefined-references` (`remark-preset-lint-recommended`) with `--frail`, that fails
  the build. Applies to every bracket in an entry, not just the severity tag.
- **PRIVATE-SYNERGY overlay — structural privacy (highest-risk to preserve).** The
  `PRIVATE-` prefix on `PRIVATE-SYNERGY-<name>.md` is the **single structural marker**: it
  keeps the file OUTSIDE the `SYNERGY-*.md` glob namespace, so every boundary-crossing
  path (`promote`, `reconcile`, retrospective, `session-start.sh`) *structurally cannot
  read it*. **Invariant: private-overlay entries are NEVER promoted to Basic Memory and
  NEVER reciprocated/written to a sibling** — enforced by the fact that those paths glob
  `SYNERGY-*.md`, which cannot match the prefix. Only `review` (sibling)'s deliberate
  local-only pass additionally globs `PRIVATE-SYNERGY-*.md`. A merge or mode that lets any
  boundary-crossing path glob `PRIVATE-SYNERGY-*.md` is a proprietary↔public leak. Full
  machinery (private-*sibling* registration, same-title shadowing, the no-commit-leak
  invariant): CLAUDE.md `### Synergy tracking convention` and `references/reconcile.md`.

### Registries and the override merge

Two registries, same override mechanism, **two deliberately different tolerances** —
do not unify the stances:

- **`.claude/vendor-registry.json`** `{prefix, remote, branch, package}` — used by `pull`.
  **Registry-FIRST, refuse-to-guess:** `pull` *refuses to proceed* without it (offers to
  bootstrap one instead) — never guesses subtree prefixes.
- **`.claude/synergy-registry.json`** `{name, file, remote, bm-entity, relationship,
  local-path?}` — used by the sibling modes. **Optional, degrade-gracefully:** check it,
  then glob `SYNERGY-*.md` as a fallback, then ask.

**The override merge (one mechanism).** Each registry takes a gitignored
`.local.json` companion. Read the base, then merge `.local.json` on top **per-entry by
the stable key** (`package` for vendor, `name` for synergy); fields in `.local.json` win;
absent fields keep the base value. Entries in `.local.json` with no matching base key are
**ignored** — *except* the synergy **private-add mode**: a `.local.json`-only entry whose
`file` is `PRIVATE-SYNERGY-<name>.md` is **added** as a private sibling. Never commit a
`.local.json` (machine-specific paths, private names).

### Project-tempo classifier (shared command; per-object tables are NOT shared)

Measure activity once, the same way everywhere:

```bash
git rev-list --count --since="90 days ago" HEAD 2>/dev/null
```

Bands: **dormant** 0–4 · **moderate** 5–14 · **active** 15+ (guard: skip if the repo has
zero commits total). Dormant/moderate repos get earlier promotion nudges at `log` time and
doubled staleness thresholds at `review --trend` time, because their sprint cadence is too
slow to surface entries cross-project. **The command and bands are shared; the per-object
promotion-eligibility tables are NOT** — upstream's moderate band offers promotion for
blocking `Ownership: upstream` bugs and `Merge readiness: direct` opportunities, while
synergy's offers only Extraction Candidates with `Readiness: ready` (plus a first-entry
skip). Keep the two tables distinct in their mode files.

### Staleness thresholds

- **3 months** — an individual UPSTREAM/SYNERGY entry is stale (a Trend Review entry
  resets the file's clock).
- **8 sprints (≈2 trend-review cycles)** — a `Status: aligned` SYNERGY row's `Last
  verified:` decays.
- **Quarterly / every-4th-sprint** — the trend-review cadence (shared with
  `/retrospective`).
- **6 months** — `reconcile` Mode B's "shipped" look-back horizon (its own, broader
  choice — cross-side evidence, not just age).

### Basic Memory section ownership (three owners, never overlapping)

- `promote` (upstream) **owns** `## Upstream Friction` in `npm/*`, `brew/*`, `cask/*`,
  `actions/*`, `docker/*`, `vscode/*` entity notes.
- `promote` (sibling) **owns** `## Cross-Project Synergy` in sibling *relationship* notes
  (canonically `engineering/agents/vp-plugins-<this-project>-and-<sibling>`).
- `/retrospective` step 7 **owns** `engineering/*` notes (patterns, conventions, lessons).
- **Annotation-only writers** (`pull` step 8b, `resolve`) *touch but never own* — they
  add `_(Resolved …)_` inline and never move an entry to `### Resolved` (only `promote`'s
  prune pass does).

🚨 **The reconcile layer writes NOTHING to Basic Memory — a prose-enforced invariant.**
Before this merge, `sibling-sync` structurally enforced "the reconcile layer owns nothing
in BM and cannot write it" by *omitting* `mcp__basic-memory__edit_note` from its
`allowed-tools`. The merged skill **must** carry `edit_note` (the `promote` modes and the
annotation-only writers need it), so the tool boundary no longer enforces this. **The
`reconcile` mode must never call `mcp__basic-memory__edit_note`** — it owns nothing in BM;
BM writes are `promote`'s territory (`## Cross-Project Synergy`, `## Upstream Friction`)
and `/retrospective`'s (`engineering/*`). This is now held in prose, not the allowlist —
honor it.

### `edit_note` gotchas (shared by both `promote` legs and the annotators)

Always `mcp__basic-memory__read_note` first and match against its exact text — never
construct match strings from memory. Never use `append` with a `section` (it appends to
end of file). Use `insert_before_section` on `Relations` to add a new section; anchor a
`find_replace` to the next `###` heading for uniqueness; pass `expected_replacements=1`. On
zero replacements (the note changed mid-write), do NOT annotate the local entry — defer the
candidate and report it; never loop.

### Why a ledger, not the tracker (the bd-charter grounding — preserve verbatim)

The beads v1.0 Integration Charter
(`gastownhall/beads@5d524cf7:docs/INTEGRATION_CHARTER.md`) establishes "no cross-tracker
orchestration": a tracker will **never** grow a feature that routes a cross-project item
from project A's tracker to project B's tracker. The ledger **is** the file-based layer the
Charter punts to external tools — reconciliation between sibling repos mediated by
registries and confirmation prompts, deliberately *outside* the tracker. `diarie` inherits
the same stance: it tracks *this* project's work and knows nothing of siblings or
upstreams. The one place ledger and diarie touch is `reconcile`'s action-menu option that
files a task row into `.diarie/tasks/` for sibling-tracked friction — a hand-off, not
orchestration.

## Cross-skill boundaries

- **`/retrospective`** owns `engineering/*` BM notes and generates `RETRO-NN.md`. Ledger's
  `review` (retro-support) *drafts* the upstream/synergy sections; retrospective assembles
  the file.
- **`diarie`** owns this project's own work tracking. Ledger owns relationships with code
  this project does not own. The boundary is a feature (the Charter above).
- **No auto-mutation.** Every logged entry, promotion, and reciprocal write requires
  explicit user approval. `reconcile` is read-only unless `--auto-reciprocate` is given
  (and even then, per-entry confirmation).

## Availability

Modes degrade cleanly when their inputs are absent: Basic Memory MCP tools missing → the
BM steps in `log`/`resolve`/`pull`/`promote` skip silently (or, for `promote`, report
unavailability); no vendor registry → `pull` offers to bootstrap one; no sibling registry
→ the sibling modes glob `SYNERGY-*.md` then ask. An inaccessible sibling is skipped and
reported, never fatal.
