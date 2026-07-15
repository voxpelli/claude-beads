# Tracking Surfaces — a coherent home for everything the project must not forget (2026-07)

> **Lead motif** *(every disposition in this document defers to this sentence; a
> surface that doesn't resolve to one of the three homes below is a surface still
> pretending to be something it isn't):*
>
> **Everything the project must not forget is either WORK (`.diarie/`), a
> RELATIONSHIP (`.ledger/`), or a NARRATIVE (a doc). Work and relationships are
> structured state behind a tool; narrative is a doc you keep visible. The
> caps-locked case file was state pretending to be narrative.**

This is a *concept* document, not a runbook. It names a misclassification, proposes
a single organizing principle to fix it, and gives a per-surface disposition with an
honest ledger of the loose ends each disposition opens. It does not implement
anything, and the migration section at the end is a sketch, deliberately.

The companion piece is `DESIGN-ledger-skill.md` (the `ledger` skill/tool that reads
`.ledger/` and whose `review` mode replaces the screaming-caps visibility hack). At
time of writing that file **does not yet exist**; this document assumes it as a
sibling and defines the store it reads. If you are reading this and there is no
`DESIGN-ledger-skill.md`, that is the other half of this concept and still owed.

---

## The inventory (real, as it stands on disk)

Ground truth from the working tree, not from memory:

**Structured state read by a tool — `.diarie/`** (dotted, committed):

- `.diarie/tasks/tasks-*.yml` — `tasks-backlog.yml`, `tasks-migration.yml`. Typed
  rows (`id`/`title`/`status`/`type`/`priority`/`labels`/`parent`/`deps`/
  `acceptance_criteria`/`description`), a canonical schema (`diarie/lib/schema.js`,
  `VALID_TYPES`/`VALID_STATUSES`/`VALID_PRIORITIES`), an integrity gate
  (`diarie validate`), and a reader (`diarie ready`).
- `.diarie/decisions/*.md` — five ADR-style decision files (`vp-beads-bdm`, `-dcl`,
  `-dep`, `-etm`, `-tdo`). Prose the terse YAML row has no home for.
- `.diarie/_archive/` — the frozen `bd-final-export.jsonl` plus superseded
  Backlog.md dogfood task files, kept for provenance.

**Config — `.claude/*.json`**:

- `.claude/synergy-registry.json` (+ gitignored `.local.json` override) —
  `{name, file, remote, bm-entity, relationship, local-path}` sibling records.
- `.claude/vendor-registry.json` convention — `{prefix, remote, branch, package}`
  subtree records.

**Top-level SCREAMING-CASE `.md` files** (the subject of this document):

| File glob | Count on disk | Committed? | Structured? | Parsed by |
| --- | --- | --- | --- | --- |
| `UPSTREAM-*.md` | 5 | yes | **yes** — `## Bugs` / `## Feature Requests` / `## Upstream Opportunities`, per-entry date + severity + ownership + `[status]` | upstream-tracker, sibling-sync, vendor-sync, session-start |
| `SYNERGY-*.md` | 2 | yes | **yes** — `## Shared Patterns` / `## Divergences` / `## Extraction Candidates` / `## They Have / We Don't`, per-entry `Status:` / `Convergence path:` / `Last verified:` | synergy-tracker, sibling-sync, session-start |
| `PRIVATE-SYNERGY-*.md` | 0 | **no** (gitignored) | yes (same four sections) | synergy-tracker (local-only read), session-start (leak warning only) |
| `RETRO-*.md` | 16 | **no** (gitignored) | loosely | retrospective (writes), session-start (counts for trend trigger) |
| `SWARM-*.md` | 10 | **no** (gitignored) | run-state table (ephemeral) | swarm-wave (substrate-agnostic, Tier A) |
| `VISION.md` | 1 | yes | no — hand-written prose | nothing parses it |
| `ROADMAP.md` | 1 | yes | its own idiom | swarm-wave (read-only, never rewritten) |

Read one of each to confirm the "structured" column is not a guess:
`UPSTREAM-basic-memory.md` carries a dated, severity-tagged, ownership-attributed
bug entry with a `<details>`-wrapped drafted-but-unfiled GitHub issue;
`SYNERGY-vp-knowledge.md` carries ~30 entries each with `Status:` /
`Convergence path:` / `Last verified:` fields and a `## Shared Patterns` /
`## Divergences` / `## Extraction Candidates` / `## They Have / We Don't` schema.
These are not prose. They are records.

---

## The thesis: three KINDS, three homes

There are exactly **three kinds** of tracked thing in this project, and they want
three different homes. The whole design collapses to putting each kind where its
kind belongs.

1. **STATE** — structured, tool-parsed, schema'd, has a lifecycle (open → resolved),
   promoted to Basic Memory. Belongs in a **dotted store read by a tool**. `.diarie/`
   is the correct model: committed files, a schema, a reader, an integrity gate, and
   a session-start prime that surfaces it *from the tool* rather than from filesystem
   noise.
2. **CONFIG** — registries and settings that steer the tools. Belongs in
   **`.claude/*.json`**. Already correct; nothing here changes.
3. **OUTPUT / NARRATIVE** — hand-written prose meant to be read by a human, with no
   lifecycle a tool tracks. Belongs **top-level or in a docs dir, and stays visible**.

### The misclassification

`UPSTREAM-*.md` and `SYNERGY-*.md` are **STATE wearing NARRATIVE's clothes.** By
every operational test they are identical in *kind* to `.diarie/`:

- They have an **entry schema** — the section headings and per-entry fields above are
  as real a schema as `VALID_TYPES`. `skills/upstream-tracker/references/` and
  `skills/synergy-tracker/references/synergy-entry-format.md` document them the way
  `diarie/lib/schema.js` documents a task row.
- They are **parsed by tools** — three skills each (upstream-tracker,
  sibling-sync, vendor-sync for UPSTREAM; synergy-tracker, sibling-sync,
  session-start for SYNERGY), plus `hooks/session-start.sh`, which greps
  `UPSTREAM-*.md` basenames on the compact branch and counts both globs for the
  dormancy nudge.
- They have a **lifecycle** — entries open, get a `Status:` / severity, get annotated
  on resolution, and (for non-vendor UPSTREAM) get deleted when resolved.
- They have a **promote-to-Basic-Memory pipeline** — upstream-tracker workflow 6
  owns `## Upstream Friction` in entity notes; synergy-tracker workflow 5 owns
  `## Cross-Project Synergy` in relationship notes. That is a projection of
  structured state into the graph, exactly like a tracker.

That is structured state by every definition the project already uses for `.diarie/`.

### Why it screams

The files live top-level and SCREAM in caps for **one** reason: before there was a
tool to surface them, *filesystem-visibility was the only way to not forget a friction
point.* A caps-locked file at the repo root is impossible to miss in an `ls`; that
was the entire mechanism. It is the same hack `bd`'s scattered files were, and the
same hack `diarie ready` (and the session-start tracker prime) replaced for work
items.

The "obnoxious, in-your-face" quality the operator dislikes **is** the cost of that
pre-tooling visibility hack — and it has outlived its purpose. The evidence that the
project already knows how to move visibility off the filesystem and into a tool is
`hooks/session-start.sh`: the **tracker prime** reads `.diarie/` directly and prints
`Tracker: N ready · N blocked · N in progress · next ready: …` at every session
start. Nobody has to see the YAML to be reminded of the work; the tool reminds them.
A `ledger review` mode plus a session-start nudge does exactly this for
relationships — and once the tool is the visibility layer, the SCREAMING filename is
pure noise.

Note the asymmetry the same hook already encodes: the **dormancy nudge** and the
**compact-branch UPSTREAM summary** are *workarounds for the fact that the state
isn't behind a tool yet*. They exist to shout "you have untriaged UPSTREAM/SYNERGY
files" precisely because there is no `ledger` prime to do it cleanly. They are
scaffolding for the missing tool, and they retire when it arrives.

---

## The strategy: mirror the diarie model in `.ledger/`

Relationships become a **dotted store, `.ledger/`, a sibling of `.diarie/`** — not
folded into it.

**Why a sibling and not a subdir of `.diarie/`.** `diarie` is being built as a clean,
publishable npm package (`diarie/` workspace, `private: true`, held behind the
`diarie.dev` name gate; see `DESIGN-tracker-exploration.md` v3 block and decision
`vp-beads-dcl`). Its whole architecture is organized so `git subtree split --prefix=diarie`
is a no-op rather than an amputation — the tests live in `diarie/test/`, the gates
live in the workspace, the schema is self-contained. Folding relationship state into
`.diarie/` would pollute a general-purpose task tracker with vp-beads-specific
cross-project concepts (siblings, upstream friction, extraction candidates) that have
no business in a published backlog tool. `.ledger/` keeps the two stores structurally
independent: `diarie` tracks *this project's work*; `ledger` tracks *this project's
relationships to other things*. Two stores, two tools, one shared principle.

```
.diarie/          # WORK — the task tracker (extractable as `diarie`)
  tasks/          # typed rows
  decisions/      # ADR prose
  _archive/       # frozen provenance
.ledger/          # RELATIONSHIPS — the relationship store (read by `ledger`)
  upstream/       # dependency friction (was UPSTREAM-*.md)
  synergy/        # cross-project patterns/divergences (was SYNERGY-*.md)
  ...             # shape TBD in DESIGN-ledger-skill.md
.claude/*.json    # CONFIG — registries, settings (unchanged)
VISION.md         # NARRATIVE — direction, stays visible
ROADMAP.md        # NARRATIVE/work-plan — stays visible, read in its own idiom
```

The `ledger` tool reads `.ledger/` and its `review` mode is the visibility layer that
replaces the screaming caps — the same move the tracker prime already made for work.

---

## Per-surface disposition

The blunt question — *rebuild for all, or some?* — answered precisely, surface by
surface. Not everything screaming should be de-screamed; only the state was
screaming by mistake.

### UPSTREAM / SYNERGY → REBUILD into `.ledger/`

The strongest case, and the reason the whole concept exists. These are misclassified
state (argued above), and there is a second forcing function: the eventual
**skill-merge** (upstream-tracker + synergy-tracker + sibling-sync + vendor-sync all
operate on these files) wants a single coherent store to read, the way the diarie
skills all read one store through one CLI instead of each re-parsing YAML. A dotted,
schema'd `.ledger/` gives the merged `ledger` tool a `ready`-equivalent to compute
over (open friction, stale-aligned rows, unreciprocated entries) instead of six
skills each grepping caps-locked markdown.

**Privacy invariant to preserve.** `PRIVATE-SYNERGY-*.md`'s `PRIVATE-` prefix is
load-bearing: it keeps the file *outside* the `SYNERGY-*.md` glob, so every public
consumer (retrospective, sprint-review, session-start, promotion, reciprocation)
*structurally cannot* read it — the privacy is a filesystem fact, not a per-consumer
exclusion rule (CLAUDE.md `### Synergy tracking convention`; `session-start.sh`
even warns if any `PRIVATE-SYNERGY-*.md` is git-tracked). Any `.ledger/` move
**must reproduce this as a structural fact**, not a flag: e.g. a gitignored
`.ledger/private/` subtree (or a `private: true` frontmatter field that the public
read path filters *and* a gitignore glob that keeps the file off disk in a clone) —
whichever the ledger design picks, the test is the same one that governs today: a
public consumer must be *unable* to read a private entry, not merely *choosing* not
to. Registration of a fully-private sibling (today: `.local.json`-only, no committed
`SYNERGY-<name>.md`, no pointer) has the same no-commit-leak invariant and inherits
the same requirement.

### RETRO → DISSOLVES

`RETRO-*.md` is not rebuilt anywhere — the file *type ceases to exist.* The plan is
that `/retrospective` **merges into vp-knowledge's `session-reflect`**, whose output
is a **Basic Memory note**. Sprint reflection becomes graph notes — searchable via
`knowledge-ask`, linked to the packages/siblings/patterns they touch, and
cross-project — instead of 16 loose gitignored files that no tool reads back (only
`session-start.sh` even looks at them, and only to *count* them). This is the natural
end state of a surface whose content was already destined for the graph:
retrospective step 7 already writes generalizable learnings to `engineering/*` BM
notes; the `RETRO-NN.md` file was the staging area, and a graph note is a better
staging area.

**LOOSE END — the trend-review counter.** The "every 4th sprint is a trend-review
sprint" trigger is currently bound to **`RETRO-*.md` file count mod 4**
(CLAUDE.md `### Retrospective file convention`; `hooks/session-start.sh` lines
~409–420 compute `count=$(find … RETRO-*.md … | wc -l)` and fire when `count % 4`
is 3 or 0). **Killing the files kills the counter.** This mechanic needs rehoming, and
the options are:

- **A sprint-scoped counter** — a small piece of committed state (a single integer,
  or derivable from BM session-reflect note count with a `sprint` tag) that the
  session-start hook reads instead of globbing files. Cleanest if we still want the
  4-sprint cadence.
- **Drop the mechanic** — if trend review is better triggered by *condition* (backlog
  staleness, unreviewed-friction count) than by a modular *count*, the mod-4 heuristic
  was always a proxy. Dropping it is legitimate, but per plan-hygiene it needs a
  recorded trigger that would revive it, not a silent deletion.

This is a genuine open question, not a detail to hand-wave: the counter is the one
piece of RETRO's machinery that another surface (the hook) depends on, and
`### Doc-grep the VOCABULARY` history in this repo is a litany of exactly this kind of
cross-surface dependency surviving a "complete" removal.

### SWARM → DEMOTES to an optional fallback (does NOT dissolve into diarie)

This surface is **not** misclassified state, and it must not be folded into diarie.
The binding constraint is that **swarm-wave is substrate-agnostic** — it is **Tier A**
per CLAUDE.md `### Files-availability convention` (*"require-or-fallback"*): it sources
waves from `.diarie/`, from a `ROADMAP.md`, **or** from a manually supplied work list,
and there is no requirement to have diarie at all. `SWARM-15.md` itself is a run from
before diarie existed. Forcing SWARM run-state into diarie rows would break exactly
the trackerless paths the skill is designed to serve.

So `SWARM-*.md` **demotes to an OPTIONAL FALLBACK** rather than dissolving:

- **When diarie is PRESENT** — run-state can live in **diarie rows** (task rows carry
  `status`; wave membership is a label/field) and the `SWARM-NN.md` file is **not
  needed**. The SKILL already says so: when the tracker is available the
  `.diarie/tasks/*.yml` files are the source of truth and the Item Status table merely
  *mirrors* them (`skills/swarm-wave/SKILL.md` "## SWARM Files").
- **When diarie is ABSENT** (ROADMAP or manual source) — the **`SWARM-NN.md` Item
  Status table IS the run-state**, exactly as today. CLAUDE.md `## Work-tracking
  substrates` states this verbatim: *"a trackerless wave uses the `SWARM-NN.md` Item
  Status table as run-state"*, and the SKILL's "## SWARM Files" makes the orchestrator
  the owner of all writes to that table (`pending`/`claimed`/`done`/`carried`) in the
  trackerless path. The file cannot go away, because in this path it is the only place
  the run-state exists.

That is the difference from RETRO, and it is worth stating sharply: **RETRO dissolves
because `session-reflect`'s output is a Basic Memory note with no fallback need** —
there is a single, better home. **SWARM does not dissolve because its trackerless path
has no other home**; the file is genuine ephemeral OUTPUT/run-state that persists
*only* when there is no tracker to hold it. It is not state pretending to be
narrative; it is run-state that is honestly a file exactly when it has to be.

**diarie is an optional ACCELERANT here, never a requirement.** A `scope`/`files`
field on a diarie task can *speed* the file-disjoint partition when diarie is present
(the partition reads the scopes instead of re-deriving them). But when diarie is
absent, swarm computes the same partition from whatever source it has — the ROADMAP
interpretation or the manual file-scope prompt (workflow 4 (Map file contention)
already asks the user for file scopes in the trackerless path). The partition
capability does not depend on diarie; the field just makes it cheaper when the store
happens to be there.

**swarm-wave the SKILL stays independent and substrate-agnostic.** It is a candidate
standalone skill (`vp-swarm`), not a part of `diarie`. diarie is a task *store*;
swarm-wave is a multi-agent *orchestrator* that can read that store, or a roadmap, or
a list. Merging it into diarie would both force the dependency this correction
forbids and pollute the extractable tracker with orchestration concepts.

**PRESERVE — swarm-wave is not vestigial.** It has **10 real runs** on disk
(`SWARM-6`…`SWARM-15`). Whatever changes, its two real capabilities stay intact across
*all* substrates: the **file-disjoint partition** (its core safety mechanism — agents
in a wave own disjoint files, no worktrees) and the **two-reviewer post-wave gate**.

**LOOSE END — the optional `scope` field and scope-creep.** Adding a `scope`/`files`
field to the diarie schema is the one place this concept touches the tracker we want
clean and publishable. It is strictly optional (an accelerant, per above), and even
so, guard it:

- **The safe reading: diarie only STORES `scope`.** The field is data on a row; the
  *partition computation* (contention map + disjoint-set clustering) stays **skill-side**
  in swarm-wave, over `diarie ready --json` *or* the trackerless source. This keeps
  `diarie` a pure reader with one more optional string-list field, not a workflow
  engine — it does not know what a "wave" is, and a published `diarie` has no
  vp-beads-specific orchestration concept baked in.
- **The alternative, named as a deliberate scope decision, not a default:** a
  `diarie waves` subcommand that computes the partition inside the CLI. This is
  *more* convenient in the diarie-present path and *worse* for the extraction story —
  it teaches a general task tracker about multi-agent swarm orchestration, and it
  would only ever serve the diarie-present path (the trackerless path still needs the
  skill-side computation), so it *duplicates* rather than replaces. Reject by default.

A `scope` string-list is a small, honest, optional addition (it describes the row); a
`waves` command is a capability transplant into the wrong layer. The line between them
is the same `substrate-not-opinion` line the project draws everywhere else.

### Registries → STAY in `.claude/`

Correct as CONFIG. `synergy-registry.json` and the vendor-registry convention (plus
their gitignored `.local.json` overrides) steer the tools; they are settings, not
state with a lifecycle. Nothing here moves. (Note the natural pairing: once relationships
live in `.ledger/`, the synergy/vendor *registries* in `.claude/` become the CONFIG
that the `ledger` tool reads to know *which* relationships exist — exactly the
config/state split the diarie tool already has with, say, its slug files.)

### VISION / ROADMAP → STAY top-level, KEEP VISIBLE

This is the **one category where top-level "screaming" is correct.** `VISION.md` is
direction and voice; `ROADMAP.md` is a hand-written work plan swarm-wave reads *in its
own idiom and never rewrites* (the `substrate-not-opinion` principle;
`skills/swarm-wave/references/roadmap-interpretation.md`). Both are hand-written
NARRATIVE meant to be seen by a human, with no lifecycle a tool tracks entry-by-entry.
Their visibility is a feature, not a hack.

**The lesson is NOT "de-screaming is always right."** Only STATE was screaming by
mistake. Narrative that is meant to be read *should* be visible at the repo root. If
the concept were applied mechanically — "move everything caps-locked into a dotted
store" — it would bury the two files whose whole job is to be seen. The organizing
axis is *kind*, not *case*.

---

## The payoff, stated plainly

After the moves, the repo root stops being a bulletin board of caps-locked case
files and becomes legible by kind:

- **WORK** lives in `.diarie/` and is surfaced by the diarie prime.
- **RELATIONSHIPS** live in `.ledger/` and are surfaced by the `ledger review` mode +
  a session-start nudge — the same visibility move the tracker prime already proved.
- **CONFIG** lives in `.claude/*.json`.
- **NARRATIVE** — `VISION.md`, `ROADMAP.md`, and design docs like this one — stays
  visible top-level, because being seen is its job.
- **RETRO stops being a file type at all** — sprint reflection becomes graph notes.
  **SWARM demotes to an optional fallback** — its file is unneeded when diarie holds
  the run-state, but remains the run-state itself on the trackerless path, because
  swarm-wave stays substrate-agnostic and must never require diarie.

Two structured stores behind two tools, config in JSON, narrative in visible docs.
The caps-locked case file was state pretending to be narrative; giving it a tool is
what lets the filename stop shouting.

---

## Migration sketch (a sketch, not a runbook)

Ordering and shape only; each step is its own future design pass.

**UPSTREAM/SYNERGY → `.ledger/`:**

1. Fix the `.ledger/` entry schema in `DESIGN-ledger-skill.md` first (frontmatter
   fields mirroring today's per-entry fields: date, severity/status, ownership,
   `Last verified`, `Convergence path`). Naming: `UPSTREAM-<pkg>.md` →
   `.ledger/upstream/<pkg>.md` (or one file per section — a ledger-design choice);
   `SYNERGY-<project>.md` → `.ledger/synergy/<project>.md`. Preserve the existing
   normalization (slashes → `--`, drop leading `@`).
2. Build the read side (`ledger review` + the `--json` reader) *before* moving data,
   the way diarie shipped its reader before the bd data cutover — so the move can be
   dual-run against the old files.
3. Reproduce the privacy invariant structurally (gitignored private subtree or
   filtered-frontmatter + gitignore glob) and prove a public consumer *cannot* read a
   private entry.
4. Retarget the four skills (upstream-tracker, synergy-tracker, sibling-sync,
   vendor-sync) and `session-start.sh` off the globs and onto the `ledger` reader.
   Doc-grep the **vocabulary** (`UPSTREAM-`, `SYNERGY-`, the section headings, the
   `Status:` field names), not just the command names — the repo's own history
   (`### Doc-grep the VOCABULARY`) shows renames expand 3× through adjacent docs
   (CLAUDE.md conventions, README layout tree, the sprint-cycle diagram).
5. Freeze the old top-level files to an `_archive/` for provenance (the diarie
   pattern), don't delete outright.

**RETRO → dissolve:**

1. Merge `/retrospective` into vp-knowledge's `session-reflect` (cross-plugin;
   coordinate via SYNERGY/UPSTREAM with vp-knowledge — this is itself a relationship
   entry).
2. Rehome the trend-review counter (sprint-scoped counter, or drop-with-trigger) —
   see the loose end above. **Do this in the same change**, or the mod-4 mechanic
   silently dies with the files.
3. Retire the `RETRO-*.md` count logic in `session-start.sh` and the
   `### Retrospective file convention` in CLAUDE.md.

**SWARM → demote (do NOT dissolve; keep the trackerless fallback):**

1. Add the *optional* `scope`/`files` field to `diarie/lib/schema.js` (store-only,
   skill-side partition) purely as an accelerant. Prove the partition + two-reviewer
   gate still work end-to-end on a real wave, in **both** the diarie-present and the
   trackerless (ROADMAP/manual) paths.
2. In the diarie-present path, let run-state live on diarie rows (wave membership as a
   label/field; `status` already exists) so the `SWARM-NN.md` file becomes optional.
3. **Keep the `SWARM-NN.md` Item Status table for the trackerless path** — it stays
   the run-state when there is no store. Keep the orchestration method as prose in
   `skills/swarm-wave/` (its future home as a standalone `vp-swarm` skill). Nothing is
   deleted; the file demotes from default artifact to fallback.

**Registries, VISION, ROADMAP:** no migration. They are already in the right home.

---

## Honest open questions (the ledger of loose ends)

- **The trend-review counter** has no home once `RETRO-*.md` is gone. Rehome (sprint
  counter) or drop-with-trigger — undecided, and it is a real cross-surface
  dependency, not a detail.
- **The optional diarie `scope` field is scope-creep risk.** It is an accelerant, not
  a requirement (swarm-wave stays substrate-agnostic). Store-only is the safe reading;
  a `diarie waves` command is a capability transplant into a tool we want clean for
  extraction, and would only serve the diarie-present path. Named as a deliberate
  decision; defaulting to store-only, skill-side partition.
- **SWARM must keep its trackerless fallback.** The demotion (not dissolution) is
  load-bearing: swarm-wave is Tier A and must run from a ROADMAP or a manual list with
  no diarie present, where the `SWARM-NN.md` Item Status table is the only run-state
  home. Do not "finish the job" by folding SWARM into diarie.
- **`.ledger/` internal shape is unspecified here** — one file per package/project vs
  one file per section, frontmatter schema, how `review` computes "stale" and
  "unreciprocated". That is `DESIGN-ledger-skill.md`'s job, which **does not yet
  exist**.
- **The RETRO→session-reflect merge crosses a plugin boundary** (vp-beads →
  vp-knowledge). It is not a purely local change; it needs the sibling's buy-in and is
  itself a relationship to track.
- **Preserving swarm's real capabilities** (file-disjoint partition + two-reviewer
  gate) through the fold is a correctness requirement, not a nice-to-have — 10 real
  runs depend on them.
- **Privacy invariant reproduction** in `.ledger/` must be *structural* (a filesystem
  fact) and proved with a can't-read test, not asserted. The `PRIVATE-` prefix works
  today precisely because it is a glob fact; the replacement must be equally
  structural.

---

## References (real files this document is grounded in)

- `DESIGN-tracker-exploration.md` — the `.diarie/` verdict (Option C, v3 block) this
  concept mirrors; the extraction/name-gate framing for keeping `diarie` clean.
- `DESIGN-ledger-skill.md` — companion (the `ledger` tool). **Not yet written.**
- `.diarie/tasks/tasks-backlog.yml`, `diarie/lib/schema.js` — the STATE model
  (`VALID_TYPES`, fields, no `scope` field today).
- `UPSTREAM-basic-memory.md`, `SYNERGY-vp-knowledge.md` — evidence the top-level
  files are structured state, not narrative.
- `hooks/session-start.sh` — the tracker prime (visibility moved into a tool) + the
  RETRO mod-4 trend counter + the UPSTREAM/SYNERGY dormancy nudge (scaffolding for the
  missing `ledger` tool) + the `PRIVATE-SYNERGY-*.md` leak warning.
- `skills/swarm-wave/SKILL.md` (+ `references/`) — SWARM run-state, the partition, and
  the orchestration method; the "ephemeral, not committed" self-description.
- `SWARM-15.md` — a concrete SWARM file confirming run-state is what diarie stores.
- CLAUDE.md `### Upstream tracking convention` / `### Synergy tracking convention` /
  `### Retrospective file convention` / `### Files-availability convention` /
  `### Doc-grep the VOCABULARY` — the schemas, the trend trigger, and the
  rename-expands-3× warning.
