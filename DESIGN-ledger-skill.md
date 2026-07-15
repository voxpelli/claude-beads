# The `ledger` skill — merging four relationship-trackers into one multi-mode skill

> **Lead motif** *(every proposal in this document defers to this sentence; a
> mode or a boundary that doesn't serve it gets cut or deferred):*
>
> **One skill for the project's ledger of external relationships — an OBJECT
> (an upstream dependency · a sibling project) crossed with a VERB (log ·
> resolve · review · pull · reconcile · promote) — so the shared file
> conventions, registries, Basic-Memory section-ownership map, and staleness
> thresholds live in ONE place instead of being copied across four SKILL.md
> files that drift.**

## Status

**Concept, not committed.** This captures a design idea from conversation and
grounds it in the four skills as they ship today. Nothing here is built. The
companion storage-layout question (moving the top-level `UPSTREAM-*.md` /
`SYNERGY-*.md` files into a dotted `.ledger/` store) is deliberately **out of
scope** — that is `DESIGN-tracking-surfaces.md`'s subject (not yet written);
this doc governs the *skill shape*, that one governs the *file layout*. The two
are separable and should stay so.

## The problem: four skills, one domain, a duplicated core

Today four separate skills manage this project's relationships with code it does
not own. Each is its own `SKILL.md`:

- **`skills/upstream-tracker/SKILL.md`** — friction (bugs, feature requests,
  contribution opportunities, cross-vendor inconsistencies) in npm/vendor/tool
  dependencies. Owns `UPSTREAM-*.md` and the `## Upstream Friction` section of
  Basic-Memory entity notes. **7 workflows.**
- **`skills/synergy-tracker/SKILL.md`** — cross-project patterns, divergences,
  extraction candidates, and capability gaps against sibling projects. Owns
  `SYNERGY-*.md` (+ the `PRIVATE-SYNERGY-*.md` overlay) and the
  `## Cross-Project Synergy` section of sibling *relationship* notes.
  **5 workflows.**
- **`skills/vendor-sync/SKILL.md`** — pulls vendored git subtrees, auto-resolves
  `UPSTREAM-*.md` entries against the sync diff, annotates Basic Memory.
  **Workflow 0 (Bootstrap registry) + a 10-step pull pipeline.**
- **`skills/sibling-sync/SKILL.md`** — bilateral reconciliation of `SYNERGY-*.md`
  and `UPSTREAM-*.md` files *between* sibling repos (reciprocal gaps, stale
  alignment, status drift, cross-side "shipped" detection). **4 workflows.**

These are not four domains. They are four *verbs* over two *objects*. The tell
is how much identical prose each skill has to restate:

- **The registry-with-override merge** (`read base → merge `.local.json` on the
  stable key → fields in `.local.json` win → unmatched entries ignored`) is
  spelled out in `synergy-tracker` workflow 3 (Compare with sibling) step 1,
  `vendor-sync` "Local override file", and `sibling-sync` "Registry and path
  resolution" — three near-verbatim copies keyed on `name` / `package` / `name`.
- **The project-tempo classifier** — the exact command
  `git rev-list --count --since="90 days ago" HEAD 2>/dev/null` with the same
  0–4 / 5–14 / 15+ dormant/moderate/active bands — appears in `upstream-tracker`
  Guidelines *and* `synergy-tracker` Guidelines *and* `sibling-sync` "Project
  tempo classification".
- **The Basic-Memory "division of labor" paragraph** ("these three sections
  never overlap — upstream friction is package-specific, synergy entries are
  cross-project, learnings are domain-specific") is restated verbatim in
  `upstream-tracker` workflow 6 (Promote to Basic Memory), `synergy-tracker`
  workflow 5 (Promote to Basic Memory) *and* Guidelines, and `sibling-sync`
  "Cross-skill boundaries".
- **The staleness thresholds** (3 months for an entry; 8 sprints ≈ two
  trend-review cycles for a `Status: aligned` row; the quarterly trend cadence
  bound to every-4th-sprint) are duplicated across all four, and `sibling-sync`
  already flags the hazard: *"When the canonical thresholds change, this skill
  must be updated to match — the validate-plugin convention check (`vp-beads-9we`)
  catches bare workflow refs but not threshold drift."*

Four copies of one core is four things to keep in sync by hand. That is the
argument for the merge — not tidiness, but killing the copy-drift.

## The model: impeccable's one-skill-many-modes

`impeccable` (`~/.claude/plugins/cache/impeccable/impeccable/3.9.1/skills/impeccable/SKILL.md`)
is the proof that a single skill can carry ~20 verbs without becoming a
grab-bag. Its structure is the template to mirror exactly:

1. **A rich `description`** naming every verb it dispatches (so Claude picks it
   for any matching request).
2. **An `argument-hint` that groups verbs into FAMILIES** —
   `[craft|shape · audit|critique · animate|bolder|… · harden|optimize|polish · init|extract|live]` —
   so the surface reads as a small number of intents, not a flat list of 20.
3. **A `## Commands` table** routing each verb → a `reference/<mode>.md` file
   (progressive disclosure: the `SKILL.md` body stays lean; each mode's detail
   is loaded only when that mode fires).
4. **`### Routing rules`** for dispatch (exact match → load its reference;
   fuzzy intent → map to the closest mode; no argument → a context-aware menu).
5. **A shared guidance CORE** (`## Design guidance`, the general rules, the
   absolute bans) that every mode draws on and none restates.

`ledger` should be built the same way. The four `SKILL.md` bodies collapse into
one lean body (the shared core + the routing table) plus one
`reference/<mode>.md` per mode.

**One honest disanalogy, stated up front.** impeccable's ~20 verbs all act on
*one* object — a frontend surface. `ledger` has **two** objects (an upstream
dependency, a sibling project), and not every verb applies to both. So `ledger`
is a *sparse 2-D matrix*, where impeccable is a 1-D list. That extra dimension
is the source of every real cost below.

## The 2-D matrix — OBJECT × VERB

Proposed mode set (a starting point — refine as build reveals seams):
**`log · resolve · review · pull · reconcile · promote`.**

|                 | **upstream dependency**                              | **sibling project**                                    |
| --------------- | ---------------------------------------------------- | ------------------------------------------------------ |
| **log**         | ✓ record friction (`UPSTREAM-*.md`)                  | ✓ record a pattern/divergence (`SYNERGY-*.md`)         |
| **resolve**     | ✓ close a fixed entry                                | ~ placeholder-restore only (no formal workflow)        |
| **review**      | ✓ status / trend / retro-support                     | ✓ status / trend / compare-with-sibling                |
| **pull**        | ✓ subtree pull + auto-resolve on the diff            | — (no sibling subtree exists)                           |
| **reconcile**   | ~ shared-dep drift across two sibling repos (Mode A) | ✓ bilateral SYNERGY + reciprocal-friction drift        |
| **promote**     | ✓ `## Upstream Friction` ⇄ BM                        | ✓ `## Cross-Project Synergy` ⇄ BM                       |

The matrix is deliberately **sparse**: `pull` is upstream-only (nothing to pull
for a sibling), `resolve` is upstream-heavy (a synergy entry "resolves" only by
removal-and-placeholder-restore, per `synergy-tracker` "Lifecycle" — not a
workflow worth its own mode), and `reconcile` is peer-first (its upstream
touch is `sibling-sync` workflow 3 (Sync sibling UPSTREAM) **Mode A**, which
compares a *shared third-party dependency* as tracked by two sibling repos). Do
not pretend the grid is full; the empty cells are information.

### argument-hint, grouped into families (impeccable-style)

```
argument-hint: "[log · resolve · review|trend|compare · pull · reconcile · promote|sync-back] [object]"
```

- **Record** — `log`, `resolve`
- **Survey** — `review` (with `trend` and `compare` variants; `review` also
  feeds `/retrospective`'s upstream/synergy sections)
- **Refresh** — `pull` (upstream subtree), `reconcile` (peer↔peer). *These are
  the two verbs that used to be called "sync" — see the naming caution.*
- **Bridge** — `promote` (local → BM) and its inbound leg `sync-back`
  (BM → local discovery)

## Workflow → mode mapping (every current workflow, cited)

**`upstream-tracker` (7 workflows):**

| Current workflow                          | → mode              | Notes                                                                 |
| ----------------------------------------- | ------------------- | --------------------------------------------------------------------- |
| 1. Log a new entry                        | `log` [upstream]    | incl. the eager-promotion tempo check (step 6a)                       |
| 2. Review open items                      | `review` [upstream] |                                                                       |
| 3. Resolve an entry                       | `resolve` [upstream]| deletes locally, annotates BM `_(Resolved …)_`                        |
| 4. Trend review (quarterly)               | `review --trend`    | the quarterly variant                                                 |
| 5. Sprint retrospective support           | `review` (retro)    | drafts the retro's "Upstream observations" section                    |
| 6. Promote to Basic Memory                | `promote` [upstream]| owns `## Upstream Friction`                                           |
| 7. Sync from Basic Memory                 | `promote --sync-back`| the inbound leg — pulls known BM friction into local files           |

**`synergy-tracker` (5 workflows):**

| Current workflow                | → mode                | Notes                                                             |
| ------------------------------- | --------------------- | ---------------------------------------------------------------- |
| 1. Log a synergy entry          | `log` [sibling]       | incl. guided registry creation (step 1b) + private-sibling path  |
| 2. Review open synergies        | `review` [sibling]    | the one local-only read that also globs `PRIVATE-SYNERGY-*.md`   |
| 3. Compare with sibling         | `review --compare`    | diffs this repo vs a sibling's files/code → proposes `log` entries|
| 4. Trend review (quarterly)     | `review --trend`      | shared cadence with upstream workflow 4                           |
| 5. Promote to Basic Memory      | `promote` [sibling]   | owns `## Cross-Project Synergy`                                   |

**`vendor-sync` (bootstrap + 10-step pipeline):**

| Current workflow                          | → mode                   | Notes                                                        |
| ----------------------------------------- | ------------------------ | ----------------------------------------------------------- |
| 0. Bootstrap registry                     | shared registry helper   | derive-and-confirm `.claude/vendor-registry.json`           |
| 1–6. Determine scope → pull → conflicts → clean → re-link | `pull` [upstream] | the subtree-pull core                                |
| 7–8. Cross-reference changelog + code diff → auto-resolve  | `pull` → `resolve` | auto-resolution IS `resolve` applied on the diff     |
| 8b. Annotate BM friction entries          | `pull` (promote-adjacent)| **annotation-only** — never owns/prunes the section         |

**`sibling-sync` (4 workflows):**

| Current workflow                          | → mode                        | Notes                                                          |
| ----------------------------------------- | ----------------------------- | ------------------------------------------------------------- |
| 1. Discover sibling(s)                    | `reconcile` (setup)           | registry + path resolution, private-sibling participation     |
| 2. Sync sibling SYNERGY                   | `reconcile` [sibling, SYNERGY]| reciprocal gaps / stale-aligned / status drift — read-only    |
| 3. Sync sibling UPSTREAM                  | `reconcile` [Mode A + Mode B] | shared-dep drift (A) + reciprocal sibling-friction (B)        |
| 4. Apply reciprocation batch              | `reconcile --auto-reciprocate`| the only write path; per-entry confirmation; writes sibling side only |

## The shared CORE — what justifies one skill, not four in a trenchcoat

The merge is worthwhile only because the four skills already share one body of
convention. It lives (canonically) in the project `CLAUDE.md` and is *cited* —
not restated — by the merged skill:

- **`### Upstream tracking convention`** — `UPSTREAM-<pkg>.md` naming (slashes →
  `--`, drop leading `@`; tool prefixes `brew:`/`cask:`/`action:`/`docker:`/`vscode:`),
  vendor (permanent) vs non-vendor (ephemeral, delete-when-empty) lifecycle.
- **`### Synergy tracking convention`** — `SYNERGY-<project>.md` naming, the four
  sections (Shared Patterns · Divergences · Extraction Candidates · They Have /
  We Don't), the two registries, and the whole `PRIVATE-SYNERGY-*` /
  private-sibling machinery (the `PRIVATE-` prefix as the single structural
  marker keeping content outside the `SYNERGY-*.md` glob).
- **`### Basic Memory section ownership`** — the three-owner map that must
  survive the merge unchanged: `promote` [upstream] owns `## Upstream Friction`;
  `promote` [sibling] owns `## Cross-Project Synergy`; `/retrospective` step 7
  owns `engineering/*`. Annotation-only writers (`pull` step 8b, `resolve`) touch
  but never own.
- **`### Vendor registry convention`** — `.claude/vendor-registry.json`
  `{prefix, remote, branch, package}` + the `.local.json` override.

Plus two cross-cutting mechanisms currently copied verbatim, which become
single shared helpers:

- **Registry-with-override merge** (base + gitignored `.local.json`, per-entry
  merge by the stable key, `.local.json` wins) — one helper, consumed by every
  mode that reads a registry.
- **Project-tempo classifier** (`git rev-list --count --since="90 days ago"` →
  dormant/moderate/active) and the **staleness thresholds** (3-month entry
  staleness, 8-sprint `aligned` decay, quarterly trend cadence) — defined once,
  referenced by `log` (eager-promotion), `review --trend`, and `reconcile`.

Collapsing these deletes the four-way copy-drift `sibling-sync` already warns
about. That is the whole return on the merge.

## Naming caution — why `ledger`, not `sync`

"Sync" means **two different operations** in this constellation, and conflating
them would poison the mode names:

- **Reconcile** — what `vendor-sync` and `sibling-sync` do: compare two
  authoritative ledgers and surface/close drift. Bidirectional, both sides real,
  no single source of truth.
- **Refresh** — what vp-knowledge's `tag-sync` and `nudge-sync` do: rebuild a
  *derived cache* (`~/.claude/references/raindrop-tags.md`,
  `~/.claude/references/claude-code-nudge-tips.txt`) from one BM source of
  truth. Unidirectional projection; the target is disposable.

Same verb, opposite semantics. If the merged skill were called `sync` its modes
would collide with the sibling plugin's vocabulary and mislead on direction.
Naming it **`ledger`** names the *store/domain* (the project's book of external
relationships), and its refresh-family verbs are the specific, un-ambiguous
`pull` (upstream → here) and `reconcile` (peer ↔ peer) — never the bare word
"sync".

## Storage — a cross-reference, not a reproduction

`ledger`'s **store** is, today, a scatter of top-level files:
`UPSTREAM-*.md`, `SYNERGY-*.md`, `PRIVATE-SYNERGY-*.md`, plus the registries
under `.claude/`. (On disk right now: 7 real ledger files — five `UPSTREAM-*`,
two `SYNERGY-*`.) Redesigning that scatter into a dotted **`.ledger/`** store —
mirroring how the tracker moved to `.diarie/` — is the subject of the companion
**`DESIGN-tracking-surfaces.md`** (not yet written). This document does **not**
specify the layout; it only assumes the store exists and is readable. Keep the
two concerns apart: a skill-shape decision here should not wait on, or dictate,
a file-layout decision there. When `DESIGN-tracking-surfaces.md` lands, this
doc's "store" references resolve to whatever it defines.

## The bd-charter grounding — the ledger is the layer a tracker won't own

Both `sibling-sync` ("Design Rationale") and `synergy-tracker` (Guidelines,
"Design rationale: why cross-project tracking lives in Basic Memory, not bd")
cite the beads v1.0 Integration Charter
(`gastownhall/beads@5d524cf7:docs/INTEGRATION_CHARTER.md`): a tracker will
**never** grow a feature that routes a cross-project item from project A's
tracker to project B's tracker — "no cross-tracker orchestration." That rule is
load-bearing and must survive the merge verbatim.

The ledger **is** the layer the Charter punts to external tools: file-based
reconciliation between sibling repos, mediated by registries and confirmation
prompts rather than synchronous tracker calls. This is why `ledger` stays a
**separate skill over separate files**, deliberately *outside* the tracker.
`diarie` — the current flat-YAML tracker — inherits the same stance: it tracks
*this* project's work, and knows nothing of siblings or upstreams. `ledger`
fills exactly the gap the tracker refuses, and the boundary between them is a
feature, not an oversight. The one place `ledger` and `diarie` touch is
`reconcile`'s `sibling-sync` action-menu option that files a task row into
`.diarie/tasks/` for sibling-tracked friction — a hand-off, not orchestration.

## Open questions (present, don't force)

1. **Skill-only, or a small reader/CLI?** `review`, `reconcile`, and staleness
   all *compute* over the markdown (parse entries, match titles across sides,
   age-out `aligned` rows). At **~7 ledger files** the volume is trivially
   handled inline by the skill reading the files. **Lean skill-only to start**
   (YAGNI); promote to a tiny reader only if the file count or the reconcile
   diff-logic outgrows inline computation. If a reader is ever built, mirror
   `diarie`'s four-part command shape (`run` → `setupCommand` → `doTheWork`
   returns typed data → `formatWorkResult` is the only writer) so the work is
   assertable in-process — but that is a *later* trigger, not a v1 requirement.
2. **Is `sync-back` a mode or a leg of `promote`?** `upstream-tracker` workflow 7
   is BM → local discovery — the inverse of promote. Folding it into `promote`
   (a `--sync-back` direction) keeps the BM bridge in one place; splitting it out
   risks a `review`-shaped read that happens to write locally. Leaning: a leg of
   `promote`, since both directions share the section-ownership routing.
3. **Does `review --compare` (synergy workflow 3) belong under `review` or
   `reconcile`?** It reads a sibling's *code and conventions* and proposes new
   entries to `log` here — distinct from `reconcile`, which diffs the *ledger
   files* bilaterally. Kept under `review` above, but it straddles; the build may
   want it as its own family member.
4. **How wide can one `description` trigger surface get before it misfires?**
   (See costs.)

## Honest costs

- **Broad trigger surface — the real price of the merge.** The four skills
  today carry finely-tuned, non-overlapping trigger-phrase lists (upstream vs
  synergy vs vendor vs sibling). One `description` covering 2 objects × 6 verbs
  is genuinely harder to tune: too broad and Claude routes every
  relationship-ish request to `ledger`; too long and it dilutes. impeccable
  absorbs this because its ~20 verbs share *one* object — `ledger`'s two objects
  make the surface strictly harder than impeccable's. Mitigation is the
  impeccable playbook (families in `argument-hint` + `### Routing rules`), but
  the top-level `description` remains the hardest single artifact to get right,
  and is where a merge can regress discovery.
- **Progressive disclosure is the thing that makes it maintainable.** The lean
  body (shared core + routing table) with `reference/<mode>.md` per mode is not
  optional polish — without it the merged `SKILL.md` is just four files
  concatenated, and the trigger surface and the maintenance burden both get
  worse, not better.
- **The privacy machinery must migrate intact.** The `PRIVATE-SYNERGY-*` /
  private-sibling structural-privacy invariants (heavy in both `synergy-tracker`
  and `sibling-sync`, and validator-enforced) are load-bearing, not incidental.
  A careless merge that lets a boundary-crossing mode glob `PRIVATE-SYNERGY-*.md`
  is a proprietary↔public leak. This is the highest-risk part of the migration.
- **Every cross-reference changes.** The `"workflow N (Name)"` convention and
  `validate-plugin.mjs`'s tool-reference audit both key off the current
  structure; merging rewrites every internal cite as a mode-reference and every
  `allowed-tools` list must be re-unioned (the merged skill needs `Bash` +
  `git subtree` from vendor-sync *and* the BM edit tools from the promoters *and*
  `AskUserQuestion` + `Skill` from sibling-sync). A wider `allowed-tools` on one
  skill is a larger blast radius than four scoped ones — weigh it.
```
