# `promote` — local ⇄ Basic Memory

Bridge project-local ledger files and cross-project Basic Memory entity notes. Outbound
(`promote`) lifts generalizable entries into BM; the inbound leg (`promote --sync-back`)
discovers BM friction not yet tracked locally. Uses only this skill's BM tools
(`mcp__basic-memory__search_notes`, `read_note`, `edit_note`); if they are unavailable,
report that promotion is unavailable. See `SKILL.md` for the section-ownership map and
`edit_note` gotchas (always `read_note` first; never `append` with a `section`; anchor
`find_replace` to the next `###`; `expected_replacements=1`; defer, never loop, on zero
replacements). **`promote` is the only mode that writes BM — never `reconcile`.**

Private overlays are structurally excluded everywhere below: every scan globs `SYNERGY-*.md`
/ `UPSTREAM-*.md`, which cannot match `PRIVATE-SYNERGY-*.md` — private entries are never
promoted, and private names never reach BM.

---

## `promote` (upstream) — owns `## Upstream Friction`

1. **Scan candidates.** Glob and read all `UPSTREAM-*.md`. An entry is eligible when ALL
   hold: `Ownership:` is `upstream` or `shared` (skip `us` — integration choices, not package
   friction); the observation is about the package/tool itself, not this project's use of it;
   it has enough detail to stand alone. When ownership is absent, default to promoting unless
   clearly project-specific. **Upstream Opportunities override:** entries in
   `## Upstream Opportunities` are *always* eligible regardless of `Ownership:` (knowing a
   working solution exists is inherently cross-project useful).
2. **Present candidates** (per-entry; never auto-promote): package/tool name + target type
   (npm/brew/cask/action/docker/vscode); title + classification; a draft generalized version
   with project-specific paths stripped (for Opportunities, keep `Merge readiness:`, replace
   local `Source:` paths with generic descriptions); whether a BM note already exists. Let the
   user approve/edit/skip each.
3. **Route by target type.** Search BM for the entity note using the routing table in
   `references/basic-memory-friction-format.md`.
4. **Write or flag** (per approved candidate):
   - **Note exists, has `## Upstream Friction`** — `read_note` first, then `edit_note`
     `find_replace` to append under the correct subsection (`### Bugs`/`### Feature
     Requests`/`### Upstream Opportunities`), anchored to the next `###`,
     `expected_replacements=1`. Dedup by title first.
   - **Note exists, no `## Upstream Friction`** — `edit_note` `insert_before_section` on
     `Relations` to add the full section with the entry.
   - **No note exists** — do NOT create a thin note. Flag: "No Basic Memory note for
     `<package>`. Run `/package-intel <package>` (or `/tool-intel <tool>`), then re-run
     `promote`."
5. **Prune pass.** For BM entries annotated `_(Resolved …)_`, offer to move them to the
   `### Resolved` subsection (user confirms each). **This is the only path that moves entries
   to Resolved** — `resolve` and `pull` step 8b only annotate.
6. **Report** promoted / pruned / skipped / flagged-for-enrichment. Suggest
   `build_context("memory://npm/<package>")`.

Target structure, generalization transforms, and `edit_note` gotchas:
`references/basic-memory-friction-format.md`.

## `promote --sync-back` (upstream) — inbound (BM → local)

The inverse of `promote` (upstream): discover friction already known in BM for this project's
dependencies but not tracked locally. Pull-based, never automatic — invoke at sprint start,
on onboarding, or for cross-project awareness.

1. **Identify dependencies.** Read `package.json` (npm deps + workspaces) and
   `.claude/vendor-registry.json` (vendor packages) → a list to check.
2. **Query BM.** For each, `search_notes` the name; filter to notes with an
   `## Upstream Friction` section carrying active (non-resolved) entries.
3. **Cross-reference** each BM friction entry against local `UPSTREAM-*.md` files.
4. **Surface unknown friction & opportunities.** Present BM entries not tracked locally:
   "Basic Memory has known friction for `<package>` not tracked here: \[title — summary].
   Add it?" Also surface `### Upstream Opportunities`: "…a known contribution opportunity…
   \[title — merge readiness]."
5. **Flag missing notes.** For packages with local UPSTREAM entries but no BM note, suggest
   `/package-intel` / `/tool-intel` (enables future `promote`).
6. **User decides** per entry: add locally (via `log` (upstream) steps), skip, or dismiss.

---

## `promote` (sibling) — owns `## Cross-Project Synergy`

Promote generalizable synergy entries from `SYNERGY-*.md` into the sibling *relationship* note
(typically `engineering/agents/vp-plugins-<this-project>-and-<sibling>`).

1. **Scan candidates.** Glob and read all `SYNERGY-*.md` (structurally excludes every
   `PRIVATE-SYNERGY-*.md`). Eligible by section + fields: Extraction Candidates
   `Readiness: ready` (always); Shared Patterns `Status: aligned` (always) or `drifting` (flag
   the drift); Extraction Candidates `needs-cleanup`/`proof-of-concept` (lower priority —
   surface, mark); Divergences `Convergence path: adopt-theirs`/`propose-shared` (skip
   `accept-difference`); They Have / We Don't `Priority: adopt-soon` (skip `deferred`). **Skip
   any entry already annotated `_(Promoted YYYY-MM-DD)_`** — the dedup signal from step 4.
2. **Present candidates** (per-entry; never auto-promote): sibling name + target BM note path;
   section + title; a draft generalized version per `references/synergy-bm-format.md` (strip
   dates from titles, project-specific paths, sprint numbers, issue IDs; rewrite to a neutral
   symmetric POV; **keep `Status:`/`Convergence path:`/`Readiness:`/`Priority:`/`Effort:`
   verbatim** — they carry cross-project meaning); whether a BM note exists.
3. **Route by target.** Look up the sibling's `bm-entity` from the merged synergy registry. If
   present, use it. **Legacy `bm-entity` warning:** if it does NOT start with
   `engineering/agents/vp-plugins-`, warn (it may be a pre-v0.12.1 single-project note that
   scatters cross-project content) and ask whether to proceed/abort/migrate. **Stale
   `bm-entity` fallback:** if present but step 4's `read_note` returns not-found, warn and fall
   through to `search_notes` as an absent-`bm-entity` row does. Full routing/fallback order:
   `references/synergy-bm-format.md`.
4. **Write or flag:**
   - **Note exists, has `## Cross-Project Synergy` + target subsection** — `read_note` first,
     then `edit_note` `find_replace` anchored to the next `###`, `expected_replacements=1`.
     Dedup by title (case-insensitive, whitespace-trimmed). **On zero replacements** (note
     changed between `read_note` and `edit_note`): do NOT annotate the local entry — defer the
     candidate (increment a deferred-count) and continue; the report lists deferred entries
     ("re-run `promote` once BM writes settle"). Do NOT re-invoke `promote` automatically
     (persistent contention would loop).
   - **Note exists, no `## Cross-Project Synergy`** — `insert_before_section` on `Relations` to
     add the full section (all subsections per `references/synergy-bm-format.md`).
   - **No note exists** — do NOT create a thin note. Flag for enrichment (manual creation under
     `engineering/agents/`), then re-run `promote`.
   - **After a successful write,** annotate the local entry `_(Promoted YYYY-MM-DD)_` via
     `Edit` (the dedup signal step 1 consults).
5. **Prune pass.** For entries annotated `_(Resolved …)_` locally, offer to move the BM entry
   to the `### Resolved` subsection (user confirms each). Mirrors the upstream prune pass.
6. **Report** promoted / pruned / skipped (already-promoted) / flagged. Suggest
   `build_context("memory://engineering/agents/vp-plugins-<this-project>-and-<sibling>")`.

Target structure, generalization transforms, `edit_note` gotchas:
`references/synergy-bm-format.md`.
