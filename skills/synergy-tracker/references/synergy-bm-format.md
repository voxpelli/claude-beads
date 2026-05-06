# Basic Memory Synergy Integration Reference

Reference material for synergy-tracker workflow 5 (Promote to Basic Memory).
Also consumed by workflow 4 (Trend review (quarterly)) for the BM
cross-reference step. See `SKILL.md` for the workflow steps that
reference this document.

This reference is the structural specification that makes workflow 5
(Promote to Basic Memory) implementable. The `## Cross-Project Synergy`
section described here is **owned by synergy-tracker workflow 5 (Promote to
Basic Memory)** and never overlaps with `## Upstream Friction`
(owned by upstream-tracker workflow 6 (Promote to Basic Memory)) or
`engineering/*` notes (owned by retrospective step 7).

## Target Type Routing

Synergy entries promote to **sibling-relationship notes** in Basic Memory
(canonically `engineering/agents/vp-plugins-<this-project>-and-<sibling>`)
— not to package or tool notes, and not to single-project entity notes.
A SYNERGY file tracks how *two projects relate to each other*, so the
target note describes the relationship, not the sibling-as-package.
The routing source is the `.claude/synergy-registry.json` `bm-entity`
field, which by convention points to the relationship note.

> **Fallback paths (`projects/`, `npm/`) are last-resort for unregistered
> siblings only** — they exist for backward compatibility with older
> registries. Registered siblings should always have `bm-entity` set to
> the canonical `engineering/agents/vp-plugins-<this-project>-and-<sibling>`
> form. Do not promote a synergy entry to a single-project entity note
> when a relationship note exists.

| SYNERGY target | BM search pattern | BM directory |
|---|---|---|
| Registered sibling with `bm-entity` | exact path from `bm-entity` field | as specified (canonically `engineering/agents/`) |
| Registered sibling with stale `bm-entity` (read_note returns not-found) | warn + fall through to `search_notes` by sibling `name` | `engineering/agents/` first, then `projects/` / `npm/` as fallback |
| Registered sibling without `bm-entity` | search by sibling `name` | `engineering/agents/` first, then `projects/` / `npm/` as fallback |
| Unregistered sibling (SYNERGY file only) | search by project name derived from filename | `engineering/agents/` first, then any directory matching the name |

**Fallback behavior when `bm-entity` is absent OR stale:** call
`mcp__basic-memory__search_notes` with the sibling project name. If a single
matching relationship note exists under `engineering/agents/`, use it.
If multiple match (or matches appear in `projects/` / `npm/` as legacy
single-project notes), surface the candidates to the user and ask which
note should receive the section. If no note exists, **flag for enrichment**
(e.g. via manual creation under `engineering/agents/`, or `/package-intel` /
`/tool-intel` for legacy single-project entity notes) instead of creating
a thin sibling note — never create a thin sibling note as a side effect of
synergy promotion.

This mirrors upstream-tracker's "no thin BM notes" policy: the BM graph stays
clean by refusing side-effect note creation.

## Target Section Structure

The `## Cross-Project Synergy` section in sibling-relationship notes
(canonically `engineering/agents/vp-plugins-<this-project>-and-<sibling>`)
uses the same four-subsection structure that mirrors the SYNERGY file layout:

```markdown
## Cross-Project Synergy

### Shared Patterns

- **Short title** — generalized description of the shared approach and why
  alignment matters. Status: aligned|drifting

### Divergences

- **Short title** — generalized description of how the two projects differ and
  the consumer-side impact. Convergence path: accept-difference|adopt-theirs|propose-shared

### Extraction Candidates

- **Short title** — generalized description of what could be extracted and why
  it is a candidate. Readiness: ready|needs-cleanup|proof-of-concept

### They Have / We Don't

- **Short title** — generalized description of the capability gap and why this
  side benefits from adoption. Priority: adopt-soon|consider|deferred

### Resolved

- **Short title** — extracted/adopted/converged. _(Resolved YYYY-MM-DD)_
```

The `### Resolved` subsection collects entries whose synergy outcome has
landed (e.g. an Extraction Candidate that became a shared package, a
Divergence that converged on one approach). Manual inline annotation precedes
a periodic prune pass (no dedicated Resolve workflow yet) — matching the
upstream-tracker convention where workflow 3 (Resolve) handles annotation.

## Promotion annotation

When workflow 5 (Promote to Basic Memory) successfully writes an entry to
the BM sibling note's `## Cross-Project Synergy` section, it annotates the
**local** SYNERGY entry by appending `_(Promoted YYYY-MM-DD)_` after the
entry body. This serves as the dedup signal:

- Workflow 5 (Promote to Basic Memory) step 1 (Scan for candidates) skips
  entries already carrying this annotation — preventing repeated promotion
  of the same row.
- Mirrors the `_(Resolved YYYY-MM-DD)_` annotation pattern from
  upstream-tracker workflow 3 (Resolve) (see
  `skills/upstream-tracker/references/basic-memory-friction-format.md`).
- Title-keyed dedup at the BM side is the **secondary** defense:
  workflow 5 (Promote to Basic Memory) must `read_note` the target
  sibling note and scan its existing `## Cross-Project Synergy` section
  before appending. If the entry's title
  already appears in the section, skip the write and report — never produce
  duplicate titles in BM.

## Generalization Transform Rules

When promoting SYNERGY entries to Basic Memory, apply these transforms:

- **Strip project-specific file paths** — replace
  `/Users/pelle/Sites/ai/vp-beads/skills/foo/SKILL.md` with generic descriptions
  like "skill file", "hook script", "validation script", or "registry file".
- **Drop dates from active entries** — SYNERGY files track aging via the
  `(YYYY-MM-DD)` suffix in entry titles; Basic Memory notes are evergreen.
  Keep dates only inside `_(Resolved YYYY-MM-DD)_` annotations.
- **Drop session-specific metadata** — sprint numbers, commit SHAs, bd issue
  IDs, and similar local context belong in the SYNERGY file, not the BM note.
- **Drop project-local triage fields** — `Last verified:`, `Action:`, `Note:`
  continuation lines and `Source:` paths are local triage metadata, not
  cross-project knowledge.
- **Keep cross-project signals** — these enum-valued fields carry meaning to
  any other project comparing against the same sibling, so preserve them
  verbatim:
  - `Status:` (`aligned`, `drifting`) — Shared Patterns
  - `Convergence path:` (`accept-difference`, `adopt-theirs`, `propose-shared`) — Divergences
  - `Readiness:` (`ready`, `needs-cleanup`, `proof-of-concept`) — Extraction Candidates
  - `Priority:` (`adopt-soon`, `consider`, `deferred`) — They Have / We Don't
- **Keep `Effort:`** (`trivial`, `moderate`, `significant`) where present —
  rough effort signal generalizes across consumers and helps any project
  prioritizing adoption.
- **Generalize `Source:`** if retained — replace project-specific paths with
  generic module descriptions ("validation script", "hook formatter",
  "subtree registry"). Often safe to drop entirely.
- **Rewrite from a neutral perspective** — SYNERGY entries are written from
  this project's POV ("we extracted X from their Y"); BM entries should read
  symmetrically so any sibling can find them ("X exists in project A; project B
  shares the pattern via …"). The sibling project note is the shared surface,
  not a one-way mirror.

## edit\_note Gotchas

These are confirmed gotchas from Basic Memory's `edit_note` tool that workflow
5 (Promote to Basic Memory) must account for. They apply identically to the
upstream-tracker promotion workflow:

- **Never use `append` with `section`** — it appends to END OF FILE, not to the
  end of the named section. This is a confirmed bug/behavior. Use `find_replace`
  or `insert_before_section` instead.
- Use `insert_before_section` on `Relations` for initial `## Cross-Project Synergy`
  section creation in sibling project notes that don't have one yet. **If the
  note has no `## Relations` section** (a valid state for notes created without
  one), `insert_before_section` will fail — fall back to `mcp__basic-memory__edit_note`
  with `operation="append"` (no `section` parameter) to place the new
  `## Cross-Project Synergy` section at the end of the note.
- Use `find_replace` anchored to include the next `###` heading for uniqueness
  when appending entries to a subsection. For `### They Have / We Don't`, the
  anchor is `### Resolved` (which always follows). For initial creation of
  `### Resolved` when it doesn't exist yet, append it as the trailing
  subsection so future anchors remain stable.
- Always call `mcp__basic-memory__read_note` before
  `mcp__basic-memory__edit_note` — construct match text from the note's actual
  content, never from memory. Note content drifts between sessions and stale
  match text silently no-ops.
- Use `expected_replacements=1` on all `find_replace` calls to prevent
  accidental multi-replacements when subsection headings or entry titles
  collide with content elsewhere in the note.
- `replace_section` auto-strips duplicate headers — useful for atomic section
  rewrites (e.g. periodic Resolved-pruning passes) but be aware of this
  behavior when constructing replacement text.
