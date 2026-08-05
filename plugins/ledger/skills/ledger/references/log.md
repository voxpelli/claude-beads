# `log` — record a new entry

Two objects share this mode. **Route first**, then follow that object's flow. Shared
conventions (file naming, lifecycle, bracket-escaping, the tempo classifier, registries)
live in `SKILL.md` `## Shared conventions` and are not restated here.

## Object routing (upstream vs sibling)

Decide what the observation is _about_:

* **A cross-project PATTERN** — a shared approach, a divergence, an extraction candidate,
  or a capability gap between this project and a sibling → **`log` (sibling)** below.
* **CONCRETE FRICTION in code this project doesn't own** — a bug, a missing feature, an
  awkward API, a cross-vendor inconsistency, or a contribution opportunity → **`log`
  (upstream)** below.

**The sibling-that-is-also-an-upstream-source case (do not conflate).** Under the
vp-plugins marketplace pattern, sibling projects (vp-beads, vp-knowledge, vp-git) _consume
each other's_ skills, hooks, and agents — so a sibling can be an upstream artifact source.
When the observation is a **concrete code request against a sibling's shipped artifact** (a
bug in their skill prose, a feature request for their hook, a contribution opportunity to
extract shared logic), that IS **`log` (upstream)** work — there is a real upstream artifact
to file against, named `UPSTREAM-<sibling-name>.md`. Only _patterns and divergences_ go to
`log` (sibling). The two are distinct: a request for concrete change ≠ an observation of a
shared/divergent pattern.

---

## `log` (upstream) — friction in a dependency or tool

Infer details from the current session — what code was being written, what error occurred,
what workaround was needed. Don't make the user re-explain what's already visible.

**Steps:**

1. **Identify the package/tool** from context. It can be a vendor package, a regular npm
   dependency, or a non-npm tool — use the prefix notation `brew:<name>`, `cask:<name>`,
   `action:<owner>/<repo>`, `docker:<image>`, `vscode:<ext>` (consistent with
   `/intel`). For a concrete request against a sibling's artifact, the target file is
   `UPSTREAM-<sibling-name>.md` (see object routing above).
   * **1a. Basic Memory pre-check.** If BM MCP tools are available, call
     `mcp__basic-memory__search_notes` with the package name. If a matching note has an
     `## Upstream Friction` section with related entries, surface them: "This friction is
     already tracked in Basic Memory from another project: \[summary]. Logging it locally
     as well so this project tracks it." Also surface any `### Upstream Opportunities`
     (another project may have attempted contributing). Informational, not a gate — proceed
     regardless. If BM tools are unavailable, skip silently.
2. If the package is a non-vendor dependency and no `UPSTREAM-<package>.md` exists, create
   it with the three-section template (`## Feature Requests`, `## Bugs`, `## Upstream
   Opportunities`, each `_No entries yet._`). Non-vendor files omit Cross-Vendor
   Inconsistencies / Trend Reviews unless multiple vendor packages share an API surface.
3. **Classify** the entry: **Bug** (doesn't work as documented) · **Feature Request**
   (missing capability) · **Upstream Opportunity** (working local code that could be
   contributed back — distinct from a Feature Request: the code already exists) ·
   **Cross-Vendor Inconsistency** (one vendor package supports a pattern another doesn't).
4. Read the target file.
5. Compose the entry from the consuming app's perspective (impact, not internals).
6. Add it under the correct section, using today's date. Replace `_No entries yet._` on the
   first entry. Keep it 1–3 sentences; make the title scannable.

**Entry formats** (escape every bracket — see `SKILL.md`). The bullet is `*`, not `-`: these entries
land in a repo's `UPSTREAM-*.md`, and a project whose remark config pins the marker goes RED on `-`.
`remark --output` cannot reach inside a fence to correct it, so the marker here is what the agent
actually writes — keep it in sync with the surrounding project by hand.

```
Feature Request:
* **Short title** (YYYY-MM-DD) — Desired behavior and why it matters. \[upstream: <url>\]
  Ownership: upstream|us|shared · Workaround: none|partial|full — description

Bug:
* **Short title** (YYYY-MM-DD) \[blocking|degraded|minor\] — What happens, repro, expected. \[upstream: <url>\]
  Severity: blocking|degraded|minor · Ownership: upstream|us|shared · Workaround: none|partial|full — description

Upstream Opportunity:
* **Short title** (YYYY-MM-DD) — What was built, why valuable upstream, consumer motivation. \[upstream: <url>\]
  Source: <file-or-branch> · Merge readiness: direct|needs-redesign|proof-of-concept
  Ownership: us|shared · Workaround: full|partial — local solution

Cross-Vendor Inconsistency:
* **Short title** (YYYY-MM-DD) — What the sibling package does, what this one lacks, the friction.
  Ownership: upstream|us|shared · Workaround: none|partial|full — description
```

**Structured fields** (all optional; put on a continuation line, indented): `Severity:`
(`blocking`/`degraded`/`minor` — Bugs only), `Ownership:` (`upstream`/`us`/`shared` — who
must act), `Workaround:` (`none`/`partial`/`full` — description; `none` = more urgent),
`Source:` (Upstream Opportunities only — the local artifact), `Merge readiness:`
(`direct`/`needs-redesign`/`proof-of-concept` — Opportunities only). Omit fields that add
no signal (skip `Workaround: none` when severity already says `blocking`).

7. **Eager promotion check.** If BM tools are available, assess project tempo (see
   `SKILL.md` classifier). **Upstream table:**

   | Tempo    | Commits/90d | Behavior                                                                                                     |
   | -------- | ----------- | ------------------------------------------------------------------------------------------------------------ |
   | Dormant  | 0–4         | Offer inline promotion for any promotable entry (`Ownership: upstream`/`shared`, or any Opportunity)         |
   | Moderate | 5–14        | Offer only for high-urgency: blocking bugs `Ownership: upstream`, or Opportunities `Merge readiness: direct` |
   | Active   | 15+         | Skip — the normal sprint cadence handles it via `promote`                                                    |

   When offering, explain low commit frequency means entries sit unread for months. If the
   user agrees, apply `promote` (upstream) steps 3–4 scoped to this single entry. If they
   decline, BM is unavailable, or the project is active, skip silently. If the observation
   is generalizable and the check didn't fire, note that `promote` can share it at the next
   sprint boundary.

---

## `log` (sibling) — a synergy entry

When the user observes a shared pattern, a divergence, an extraction candidate, or a
capability gap between this project and a sibling.

**Steps:**

1. **Identify the sibling.** If the user named one, use it directly. Otherwise check
   `.claude/synergy-registry.json`, then glob `SYNERGY-*.md` as a fallback, then ask.
   * **1b. Guided registry creation** — only when `.claude/synergy-registry.json` is absent
     AND a sibling has been named. If the registry already exists, skip silently (append-to-
     existing is not supported; that falls back to manual editing — add a
     `{name, file, remote, bm-entity, relationship}` entry per
     `references/synergy-entry-format.md`, tracked as `vp-beads-bma`). Otherwise bootstrap:
     confirm the sibling name; derive `<this-project>`'s canonical name via
     `references/project-name-derivation.md` (self subject, tiers 1–4, sibling back-pointer
     first); auto-derive `name`, `file` (`SYNERGY-<sibling>.md`), `remote`
     (`git -C ../<sibling> remote get-url origin`), `bm-entity`
     (`engineering/agents/vp-plugins-<this-project>-and-<sibling>`); prompt only the
     residuals with ≤3 `AskUserQuestion` calls (`header: "Visibility"` public/private —
     **private switches to the private-sibling path**: write to
     `.claude/synergy-registry.local.json` only with `file: PRIVATE-SYNERGY-<sibling>.md`,
     omit `bm-entity`, create the gitignored `PRIVATE-SYNERGY-<sibling>.md`, verify both it
     and the `PRIVATE-SYNERGY-*.md` wildcard are gitignored, **never** add a per-name
     `.gitignore` line; `header: "Relationship"` — the seven-value `KNOWN_RELATIONSHIPS`
     vocabulary, surface the top four + auto "Other"; `header: "Local path"` only when
     `../<sibling>/` is inaccessible → `.local.json`). Preview both files (schema + worked
     substitution, annotate auto-derived fields with their source) before writing; on `yes`
     write, round-trip-verify the JSON, check `.local.json` is gitignored (`git check-ignore
     -q`; exit `0` ok, `1` warn to add `.claude/*.local.json`, `128` report+skip). Full
     schema: `references/synergy-entry-format.md`.
2. **Basic Memory pre-check.** If BM tools available, make two `search_notes` calls (sibling
   name; 2–4 topic keywords). Surface any matching synergy/engineering note: "This pattern
   is already tracked in Basic Memory: \[summary]. Logging it locally as well." Skip
   silently if unavailable.
3. If no `SYNERGY-<project>.md` exists, create it from the four-section template
   (`references/synergy-entry-format.md`).
4. **Classify** into one section: **Shared Pattern** (same approach both projects) ·
   **Divergence** (handled differently) · **Extraction Candidate** (worth extracting from
   this project) · **They Have / We Don't** (sibling has, we lack — apply the domain-fit
   test: "this project has the underlying need but lacks the implementation" _passes_; "the
   sibling has a capability in a different domain" _fails_ and is noise).
5. Read the target file. **If the entry is proprietary** (a private sibling's internal
   paths, client names, unreleased plans), target the gitignored
   `PRIVATE-SYNERGY-<project>.md` overlay instead — verify it is gitignored first
   (`git check-ignore -q`; exit 1 = stop, have the user add `PRIVATE-SYNERGY-*.md`). Then,
   **only for a public sibling with a committed `SYNERGY-<project>.md`**, add a one-line
   pointer to that committed file noting the overlay exists. **For a fully-private sibling**
   (registered only in `.local.json`), write **no** pointer — it would commit the private
   name. Otherwise target the committed `SYNERGY-<project>.md`.
6. Compose from this project's perspective (impact and adoption cost, not internals) using
   `references/synergy-entry-format.md`.
7. Add under the correct section with today's date; replace `_No entries yet._` on the first
   entry. **Entries written to a `PRIVATE-SYNERGY-*.md` overlay are never promoted to BM or
   reciprocated** (structural — the prefix keeps them outside the `SYNERGY-*.md` glob).

**Structured fields** (optional): `Status:` (`aligned`/`drifting` — Shared Patterns),
`Last verified:` (`YYYY-MM-DD` — Shared Patterns), `Convergence path:`
(`accept-difference`/`adopt-theirs`/`propose-shared` — Divergences), `Readiness:`
(`ready`/`needs-cleanup`/`proof-of-concept` — Extraction Candidates), `Priority:`
(`adopt-soon`/`consider`/`deferred` — They Have / We Don't), `Effort:`
(`trivial`/`moderate`/`significant`). Full templates: `references/synergy-entry-format.md`.

**Bilateral reciprocation mandate.** When the sibling has already written entries from their
side (resolve the sibling path via the registry-with-override pattern — `local-path`, else
`../<sibling>/` — and check `<path>/SYNERGY-<this-project>.md` if accessible), reciprocate:
re-verify each entry from this project's angle, record verification dates, note drift. **Do
not skip duplicates — reciprocation IS the verification step** (SYNERGY entries are two
parallel implementations that _happen_ to align; each side keeps its own record and
re-verifies at its own cadence). When an entry has no reciprocal yet on the sibling, prompt
the user to file it there (a follow-up task in the sibling repo).

8. **Eager promotion check.** If BM tools available, assess tempo (guard: skip if zero
   commits total; **also skip if this is the first entry in any SYNERGY file** — the user is
   still learning the workflow). **Synergy table:**

   | Tempo    | Commits/90d | Behavior                                                     |
   | -------- | ----------- | ------------------------------------------------------------ |
   | Dormant  | 0–4         | Offer inline promotion for any promotable entry              |
   | Moderate | 5–14        | Offer only for Extraction Candidates with `Readiness: ready` |
   | Active   | 15+         | Skip — the normal sprint cadence handles it                  |

   If the user agrees, defer to `promote` (sibling) for the actual write (single-entry
   path) — `log` only _offers_; `promote` _performs_, keeping `## Cross-Project Synergy`
   writes within `promote`'s sole-owner boundary. Decline / unavailable / active → skip.
