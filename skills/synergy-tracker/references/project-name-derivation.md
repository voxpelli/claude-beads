# Project Name Derivation Reference

Reference material for the canonical algorithm used to derive a project's
short name when constructing `SYNERGY-*.md` filenames, `UPSTREAM-*.md`
filenames, and inverse-file lookups across sibling projects. See `SKILL.md`
in the consuming skill for the workflow steps that reference this document.

Two consumers cite this reference:

- **`/synergy-tracker`** — derives the **sibling**'s name when creating or
  resolving `SYNERGY-<project-name>.md` files. Subject is always the sibling.
- **`/sibling-sync`** — derives **this project's** name (workflow 3 (Sync
  sibling UPSTREAM) Mode B inverse-file lookup at the sibling; workflow 4
  (Apply reciprocation batch) SYNERGY destination on the sibling) AND the
  sibling's name (workflow 3 (Sync sibling UPSTREAM) Mode B local lookup;
  workflow 2 (Sync sibling SYNERGY) bidirectional comparison). Subject is
  both, depending on the workflow step.

The algorithm is a single four-tier precedence applied uniformly; the
**subject** (self vs sibling) determines which tiers are reachable in
practice.

## Subject Framing

There are three distinct identity domains across the vp-* plugin family.
Keep them disjoint — conflating them is the predictable failure mode:

| Domain | What it names | Authoritative source | Who uses it |
|---|---|---|---|
| **Sibling** | A peer project (e.g., another vp-* plugin) | `synergy-registry.json` `name` field on the asking side | `/synergy-tracker`, `/sibling-sync` |
| **Self** | This project, as the sibling sees us | The sibling's `synergy-registry.json` `name` field for our entry; falls back to our manifests | `/sibling-sync` only (workflow 3 (Sync sibling UPSTREAM) Mode B, workflow 4 (Apply reciprocation batch)) |
| **Vendor** | A third-party dependency (npm, brew, etc.) | `vendor-registry.json` `package` field | `/upstream-tracker`, `/vendor-sync` |

This document covers the **sibling** and **self** domains. Vendor names are
governed by the vendor-registry convention (see `CLAUDE.md` "Vendor registry
convention" section and `skills/upstream-tracker/SKILL.md` "File naming
convention"). Vendor and sibling identities use the same normalization
characters by coincidence; merging would falsely imply a single algorithm
governs both.

The **self** subject is unusual: this project's canonical name when viewed
from the sibling's perspective is whatever the sibling typed when registering
us — not necessarily what we'd derive from our own manifest. The sibling's
registry entry for us is the most authoritative external reference available;
falling back to our own manifests is a best-effort heuristic when the
sibling's registry is unavailable.

## Four-Tier Precedence

For each subject, walk the tiers in order. The first tier that yields a
non-empty raw name wins. Apply normalization (see below) to the winning
raw name to produce the final canonical name.

### Tier 1 — Sibling-registry back-pointer (self subject only)

Read the accessible sibling's `<resolved-local-path>/.claude/synergy-registry.json`
(merged with the gitignored `.local.json` companion per the registry section
in `skills/sibling-sync/SKILL.md`). Find the entry pointing back at this
project — match by `remote` field against this project's git origin URL
(`git remote get-url origin`, normalize trailing `.git`, lowercase host),
or by `local-path` resolving to this project's root directory. Use that
entry's `name` field as the raw name.

This tier honors the `synergy-entry-format.md:138` rule that the registry
`name` field is authoritative — the sibling already chose a canonical label
for us when they created their `UPSTREAM-<this-name>.md` or
`SYNERGY-<this-name>.md`. Accepting that label eliminates cross-side drift.

Skip this tier silently when:

- The sibling has no `.claude/synergy-registry.json`.
- The registry exists but contains no entry pointing back at this project.
- The sibling is not accessible on disk (network mount unavailable, fresh
  checkout, etc.).

A skip is not an error — fall through to tier 2.

### Tier 2 — Plugin manifest

Read `.claude-plugin/plugin.json` from this project's root (or the sibling's
root, when computing the sibling's name from a sibling-registry entry's
`local-path`). If the file exists and has a non-empty `name` string, use it.

Rationale: the plugin manifest is the canonical identity declaration for
Claude Code plugins. For vp-* plugins specifically, this is the most reliable
self-identity source.

In practice, tier 2 is the operative tier when:

- The self subject is being derived AND tier 1 is unavailable.
- The subject is a sibling AND we are reading the sibling's manifest as part
  of an explicit comparison pass (rare; not the normal sibling case).

For sibling-derivation in normal `/synergy-tracker` operation, tier 2 is
unreachable because synergy-tracker never reads the sibling's manifest —
the sibling's `name` comes from this project's `synergy-registry.json` (which
is itself a tier-3-style source for the sibling subject).

### Tier 3 — Package manifest / registry name

Two flavors depending on subject:

- **Self subject**: read `package.json` from this project's root. If the
  file exists and has a non-empty `name` string, use it. Handles npm-based
  projects without a `.claude-plugin/plugin.json`.
- **Sibling subject**: use the registry entry's `name` field directly from
  this project's `synergy-registry.json`. The registry name IS the
  authoritative source per `synergy-entry-format.md:138`.

Rationale: `package.json` is the next most common identity declaration after
`plugin.json` for the self subject. For the sibling subject, we already have
an authoritative source on this side (no need to read the sibling's
manifests).

### Tier 4 — Directory basename

Use the last path component of the project root directory (basename of
`pwd` for self; basename of resolved `local-path` for sibling). Fallback
when no manifest is readable and no registry entry exists.

Always succeeds (every directory has a basename), but the result may be
arbitrary in CI checkouts (`pr-123`, `build-xyz`) or non-standard layouts.
Tier 4 is the defense of last resort, not a preferred source.

## Normalization

The normalization rules are owned by
`skills/synergy-tracker/references/synergy-entry-format.md` "Naming convention"
section (see lines 130-154 of that file). Apply those rules to the raw name
produced by whichever tier fired:

1. Replace all `/` with `--`.
2. Drop any leading `@`.

Examples (from `synergy-entry-format.md`):

- `vp-knowledge` → `vp-knowledge` (no-op for clean short names)
- `voxpelli/vp-claude` → `voxpelli--vp-claude`
- `@scope/shared-utils` → `scope--shared-utils`

Tier 1 (sibling-registry back-pointer) yields a name that is already
normalized (the sibling stored it that way per the same convention), so
applying normalization again is a no-op safety pass.

## Worked Examples

### Self subject: vp-beads

This project is `vp-beads`. The sibling is `vp-knowledge` (registered in
`vp-beads/.claude/synergy-registry.json`, lives at `/Users/pelle/Sites/ai/vp-claude`).

- **Tier 1** — read `/Users/pelle/Sites/ai/vp-claude/.claude/synergy-registry.json`.
  Merged with `.local.json` if present. Find the entry pointing back at vp-beads
  via `remote: "https://github.com/voxpelli/claude-beads"` (or by
  `local-path` resolving to `/Users/pelle/Sites/ai/vp-beads`). Entry has
  `name: "vp-beads"`. Raw name = `vp-beads`. Normalize: `vp-beads`. **Win.**
- Tier 2 (would fire if tier 1 inaccessible): read
  `/Users/pelle/Sites/ai/vp-beads/.claude-plugin/plugin.json`. `name: "vp-beads"`.
  Same result.
- Tier 3 (would fire if no plugin.json): vp-beads has no published
  `package.json` `name` distinct from plugin.json. Falls through.
- Tier 4 (last resort): basename of project root = `vp-beads`. Same result.

All tiers agree. Mode B inverse-file lookup constructs `UPSTREAM-vp-beads.md`
at the sibling root → matches the real file.

### Sibling subject: vp-knowledge (asking from vp-beads)

The sibling is `vp-knowledge`. Asking-side context:
`/Users/pelle/Sites/ai/vp-beads`.

- **Tier 1** — not applicable (back-pointer is self-only).
- **Tier 2** — not applicable in normal operation (synergy-tracker does not
  read the sibling's manifest for name derivation).
- **Tier 3** — read `/Users/pelle/Sites/ai/vp-beads/.claude/synergy-registry.json`.
  Entry has `name: "vp-knowledge"`. Raw name = `vp-knowledge`. Normalize:
  `vp-knowledge`. **Win.**
- Tier 4 (would fire if no registry entry for the sibling): basename of
  `/Users/pelle/Sites/ai/vp-claude` = `vp-claude`. Different result —
  `vp-claude` ≠ `vp-knowledge`. This divergence is exactly why tier 3 is
  preferred: the registry name is what consumers actually agreed on, while
  the directory basename reflects whatever the user chose at clone time.

Tier 3 wins; SYNERGY filename is `SYNERGY-vp-knowledge.md`.

## Known Limitations

- **Non-npm ecosystems** (Cargo, Composer, pyproject.toml, go.mod, Gemfile)
  have no tier-2/3 manifest the algorithm reads. They fall through to tier 4
  (directory basename). Today no non-npm sibling project is registered in
  any vp-* synergy-registry, so this is a latent gap, not an active bug. See
  the YAGNI revival trigger below.
- **Monorepo subdirectory checkouts** — directory basename may include
  segments that aren't part of the canonical name (e.g., `packages/ui`).
  Normalization makes this `packages--ui`, which may or may not match the
  registry entry. The defense is tier 1/2/3 — they take precedence over
  tier 4. Confirm the sibling's registry uses the form you expect.
- **CI/fork checkout paths** — directory names like `pr-123` or `build-xyz`
  produce meaningless tier-4 results. The defenses are tier 1 (back-pointer)
  and tier 2 (plugin.json). If both are unavailable in CI (no sibling
  accessible, no manifest readable), Mode B and synergy file creation
  cannot run sensibly — this is expected and matches the "Project-name
  not derivable" case in `skills/sibling-sync/SKILL.md` Error handling.
- **YAGNI position on ecosystem expansion**: the algorithm deliberately
  does NOT probe `Cargo.toml`, `pyproject.toml`, `go.mod`, `Gemfile`, or
  `composer.json` in tier 3 today. The revival trigger is: when the second
  non-npm sibling project is added to ANY synergy-registry across the vp-*
  family, extend tier 3 to probe the relevant manifest. See the open bead
  with title "extend project-name-derivation tier 3 with non-npm manifest
  readers" for the concrete graduation steps.

## Consumer Summary

| Consumer | Subject | Tiers exercised in practice | Notes |
|---|---|---|---|
| `/synergy-tracker` workflow 1 (Log a synergy entry) | sibling | tier 3 (registry `name`), tier 4 (dir basename for unregistered siblings) | Auto-creates `SYNERGY-<sibling>.md` files when missing. Tiers 1/2 unreachable for the sibling subject in this workflow. |
| `/synergy-tracker` workflows 2 (Review open synergies), 3 (Compare with sibling), 4 (Trend review) | sibling | tier 3 only | Read existing files via registry; never auto-create. |
| `/sibling-sync` workflow 2 (Sync sibling SYNERGY) | sibling | tier 3 (this project's registry) | Bidirectional title comparison; same as synergy-tracker workflows 2 (Review open synergies), 3 (Compare with sibling), 4 (Trend review). |
| `/sibling-sync` workflow 3 (Sync sibling UPSTREAM) Mode B step 2 (Detect Mode B pair) | self + sibling | tiers 1–4 (self), tier 3 (sibling) | The self-subject use site that motivates tier 1 (sibling-registry back-pointer). |
| `/sibling-sync` workflow 4 (Apply reciprocation batch) step 2.2 (Determine destination file) | self | tiers 1–4 | Constructs `<sibling>/SYNERGY-<this-project>.md` for opt-in reciprocation writes. |

When in doubt, prefer the highest tier that yields a value. Tier 1 is
specifically for the cross-side case where the sibling's authoritative
view of us matters more than our self-view.
