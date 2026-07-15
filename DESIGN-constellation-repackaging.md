# The constellation repackaging — vp-beads dissolves onto the substrate axis (2026-07)

> **Lead motif** *(every claim in this document defers to this sentence; a proposal that
> contradicts it is wrong, not the sentence):*
>
> **`vp-beads` is the only package in the `vp-plugins` constellation organized by a PROCESS
> (the sprint); every sibling is organized by a SUBSTRATE. Put its skills back on the
> substrate axis and `vp-beads` does not "split into two" — it dissolves, and the fossil
> name retires with it.**

## Status and register

This records a design **concept** reached in conversation — the decisions already taken, grounded
in the real files, honest about the one thing still open. It is **not** an implementation plan.
Nothing here is built, committed, or scheduled; the repo is local-only and unpushed (per
`MEMORY.md` → *"The unreleased `feat/tracker-design-exploration` branch … is NOT pushed"*).

Two companion design docs are referenced but **not yet written** — `DESIGN-ledger-skill.md`
(the merged relationship-ledger skill) and `DESIGN-tracking-surfaces.md` (retrospective and
swarm-wave file-type dissolution). Where this doc says "detail lives in X", X is a placeholder
for a doc that must still be authored; treat the cross-reference as a promissory note, not a
citation.

One recorded decision already commits a piece of this: `.diarie/decisions/vp-beads-dep.md`
(*"Retire the sprint-review agent and the backlog-groomer skill"*) explicitly names its
**"Execution trigger: the vp-beads repackaging / diarie extraction"** — i.e. this document. And
one task row scopes the diarie-side skill work in detail: `vp-beads-ski` in
`.diarie/tasks/tasks-backlog.yml`. This doc is the frame those two already point at.

## The constellation, as it stands

Read from `../vp-claude/.claude-plugin/marketplace.json` — the `vp-plugins` marketplace lists four
plugins:

| Plugin        | Organized around                 | Shape (real, on disk)                                                                            |
| ------------- | -------------------------------- | ----------------------------------------------------------------------------------------------- |
| `vp-knowledge` | **substrate: Basic Memory (+ Raindrop/Readwise)** | 16 skills + 4 agents (`../vp-claude/skills/`, `../vp-claude/agents/`)                            |
| `vp-git`       | **substrate: git**               | 3 pure SKILL.md skills (`rebase-validate`, `stack-cascade`, `tag-audit`), runtime-neutral        |
| `vp-astgrep`   | **substrate: ast-grep**          | an LSP shim + rules                                                                              |
| `vp-beads`     | **process: the sprint**          | 9 skills + 1 agent + 3 hook event types + the `diarie/` npm workspace                            |

Every sibling wraps *one substrate* and its skills never have to reach outside it: `vp-git`'s three
skills touch nothing but git; `vp-knowledge`'s skills touch nothing but the knowledge graph and its
feeder services. Their marketplace descriptions read as a capability list *for one substrate*, and
their trigger phrases are sharp because the substrate is the topic.

`vp-beads` is the odd one out, and its own marketplace description betrays it: *"Sprint workflow
automation: backlog grooming, retrospectives, upstream vendor tracking, cross-project synergy
tracking, swarm wave orchestration, vendor sync, and bilateral sibling reconciliation"* — seven
unrelated verbs bound only by *"for projects using beads and Basic Memory"*. (That entry is also
stale twice over: still `0.18.0`, still *"beads"*, a tracker this repo retired — see `MEMORY.md`
→ *"An installed plugin is a FROZEN plugin"*.)

## The central insight: a category error in the organizing axis

A sprint is a *process*, and a process **spans every substrate**. So each `vp-beads` skill
necessarily reaches into someone else's substrate — this is visible directly in the `allowed-tools`
and `paths` frontmatter of `skills/*/SKILL.md`:

- `retrospective` reaches into **Basic Memory** — `allowed-tools` includes six `mcp__basic-memory__*`
  tools and it writes `engineering/*` notes.
- `backlog-groomer` / `swarm-wave` reach into the **tracker** — `paths: .diarie/tasks/**`.
- `vendor-sync` reaches into **git** — subtree pulls, the same substrate `vp-git` owns.
- `upstream-tracker` / `synergy-tracker` reach into **Basic Memory** section-ownership
  (`## Upstream Friction`, `## Cross-Project Synergy` — CLAUDE.md `### Basic Memory section ownership`).

The cross-cutting is **not a flaw in the skills**. Each skill is coherent about *its* job. The
cross-cutting is a property of the **package's organizing axis**: a process-shaped package must, by
construction, borrow every substrate the process touches. That is why `vp-beads`'s skills feel like
they belong to other plugins — because, on the substrate axis, they do.

The corrective move is therefore not "clean up the coupling" and not "split vp-beads into two
smaller process-plugins". It is: **re-project the skills onto the substrate axis.** When you do, each
skill lands in the plugin that owns its substrate, and the thing left holding them — `vp-beads` —
has nothing of its own to hold. It dissolves. This is the whole thesis; everything below is the
accounting.

## The dissolution — where each of the 9 skills + 1 agent goes

Grounded in each `skills/*/SKILL.md` and the two governing artifacts (`vp-beads-dep`, `vp-beads-ski`).

### 1. The four relationship-ledger skills → one `ledger` skill

`upstream-tracker`, `synergy-tracker`, `vendor-sync`, `sibling-sync` are all about **relationships
to external entities** — an upstream package, a sibling project, a vendored subtree. They already
share a vocabulary (`UPSTREAM-*.md`, `SYNERGY-*.md`, registries in `.claude/*.json`) and cross-call
each other (sibling-sync's own description defers writes to `/synergy-tracker` and `/upstream-tracker`).
They collapse into **one multi-mode `ledger` skill**.

Its internal design is out of scope here — it gets its own companion doc, `DESIGN-ledger-skill.md`.
Its **home is decided**: its own focused repository, a substrate peer to `diarie` (`vp-beads-lgr`,
2026-07-15); see *"The `ledger` home"* below for the reasoning.

### 2. `retrospective` → merges into `vp-knowledge`'s `session-reflect`

They share a job: **turn what happened into a Basic Memory note.** `session-reflect`'s own
description (from the skills catalog) is *"Reviews the current conversation, extracts durable
insights … writes to Basic Memory after user approval."* `retrospective` is that same job,
**sprint-scoped**: it reads git history + `UPSTREAM-*.md` and writes `engineering/*` learnings
(step 7 owns those per CLAUDE.md `### Basic Memory section ownership`). A sprint retrospective *is*
a session-reflect over a wider window.

Consequence: the `RETRO-NN.md` file-type **dissolves** — its output becomes a BM note, which is what
a retrospective is really for. (There are 16 `RETRO-*.md` on disk today; they are the *record*, not
an argument for keeping the file convention once the output has a better home.) Detail —
what carries, what the merged skill's opening step looks like — belongs in
`DESIGN-tracking-surfaces.md` (to be written).

### 3. `swarm-wave` → stays independent as a standalone `vp-swarm` package

`swarm-wave` is **not** dissolved. It is the one `vp-beads` skill that is *already* substrate-agnostic
and must stay that way: CLAUDE.md `### Files-availability convention` makes it **Tier A —
require-or-fallback**, and its own SKILL.md description says it *"Works with or without a tracker:
sources waves from the flat-YAML tracker, from a ROADMAP.md, or from a manually supplied work list."*
Forcing diarie onto swarm users would be a **real capability regression** with no requirement behind
it today, so the axis re-projection here lands differently: swarm-wave's substrate is *orchestration
itself*, not any one work-source.

So it becomes a **standalone `vp-swarm` package — pure**: no agent, no hooks, no MCP, and **no diarie
dependency**. (This is consistent with `vp-beads-dep`'s *"vp-beads decomposes into vp-sync +
vp-swarm"* — `vp-swarm` is a real residual, not a collapsed one.)

diarie is an **optional accelerant when present**, never a requirement:

- **Run-state.** With diarie available, a wave's run-state can live in **diarie rows**; without it,
  the `SWARM-NN.md` Item Status table remains the trackerless run-state. The file therefore does
  **not** "dissolve into diarie" — it **demotes to an optional fallback**, used exactly when no
  tracker is present (10 `SWARM-*.md` on disk today are that path in action).
- **File-disjoint partition** (its defining trick) can be **sped** by an optional diarie `scope`
  field + a wave-partition query — an accelerant, not a precondition; the partition still works over a
  `ROADMAP.md` or a manual list with no tracker at all.
- **Orchestration method** (backpressure, the two-reviewer gate) is the skill's real content and
  travels with `vp-swarm`.

Detail on the run-state demotion belongs in `DESIGN-tracking-surfaces.md` (to be written).

### 4. `migrate-tracker` + `deintegrate-beads` → ship with **diarie** as the bd-adoption pair

These two are **one user journey**, not two skills — `deintegrate-beads`'s frontmatter literally
says *"Runs AFTER /migrate-tracker, once the flat-YAML store is trusted."* One creates the store,
the other disarms bd afterward. `vp-beads-ski`'s **KEEP TOGETHER** acceptance criterion is explicit:
*"Do NOT split one cutover across two packages, and do NOT 'generalize migrate off bd' — bd is
diarie's ONLY importer, so bd IS the framing."* They belong to whoever ships the store, and that is
**diarie**.

**Honest tension to flag:** `vp-beads-ski`'s default is *"BOTH stay in vp-beads until a non-bd import
source exists."* That default assumed `vp-beads` **persists** as a home. Under dissolution that
anchor is gone — there is no `vp-beads` to stay in — so the pair moves to diarie, which is the other
place the same task row contemplates. The move is consistent with the row's *intent* (keep the pair
together, framed by bd); it overrides only the row's assumption that a sprint plugin survives to
hold them. Whether they ship *inside* the diarie repo or as a diarie-adjacent skill bundle is a
sub-case of the packaging fork in `vp-beads-ski` **OPEN FORK (b)** — unresolved, and deliberately so.

### 5. `backlog-groomer` + `sprint-review` (the agent) → RETIRED

This is **already decided** — `.diarie/decisions/vp-beads-dep.md`. The reasoning, summarized from
that decision:

- **Decided from usage evidence + operator testimony, applying burden-of-proof** — for a gate the
  question is *"what evidence of the intended outcome?"*, and here there is almost none.
- **`sprint-review` (the plugin's only agent): never used.** The user has never seen its proactive
  end-of-sprint gate fire. A gate whose intended outcome has never been observed does not meet the
  burden to keep it.
- **`backlog-groomer`: barely used.** The user triages `.diarie/` by **editing the YAML directly** —
  the substrate-not-opinion way the tracker was built for. A 6-workflow triage skill is over-built
  against how the backlog is actually worked.
- **Corroborating artifact evidence** (the decision's own, dated 2026-07-15): the *used* skills leave
  heavy traces; these two leave none (see *"Usage evidence"* below).
- **The knock-on that matters:** retiring `sprint-review` removes the **only agent** — the main
  construct forcing a Claude-plugin packaging at all. With it gone, the only plugin-forcing
  constructs left are the hooks, and those split cleanly across substrates (tracker → diarie,
  BM → vp-knowledge, shfmt → dev tooling).

`vp-beads-dep` also records the salvage held in reserve (fold groomer's research/dedup into
swarm-wave's research-wave, fold sprint-review's gate idea into retrospective's opening step) — and
rejects it as the *default* because it re-homes capabilities with no demonstrated demand. The two
retirements are not blocked on this repackaging deciding anything new; they are its cleanest,
already-ratified step.

## The endgame

Walk the table and count what is left that is *uniquely* `vp-beads`:

- 4 relationship skills → one `ledger` skill (home open)
- `retrospective` → `vp-knowledge`
- `swarm-wave` → **standalone `vp-swarm` package** (pure; diarie optional)
- `migrate-tracker` + `deintegrate-beads` → diarie
- `backlog-groomer` + `sprint-review` → gone

The residue is **two things, not one: the `ledger` skill AND `vp-swarm`.** `vp-swarm` is settled — a
standalone, substrate-agnostic package with a sharp trigger, exactly the shape the siblings already
have. And `ledger`'s ending is now settled too:

- **`ledger` gets its own focused repository** (`vp-beads-lgr`, 2026-07-15) — a substrate peer to
  `diarie`, not a fold into `vp-knowledge`. So the constellation gains a fourth substrate-repo where
  `vp-beads` used to be. (`"ledger"` is the **working/concept name only** — the actual repo/tool name
  is undecided, a deferred sub-decision, the same name-gate `diarie` faced.)

**There is no residual sprint plugin** — `vp-swarm` is an orchestration package, not a
sprint-process package, and it forces nothing. The "sprint loop" that `vp-beads`'s CLAUDE.md
diagrams (`### Sprint workflow cycle`) was a *narrative* holding unrelated substrate-work together;
`vp-beads-dep` already calls it *"the fake coherence of vp-beads"*. Dissolution is what removing the
narrative looks like once you stop propping it up.

## The `ledger` home — DECIDED: its own focused repository (`vp-beads-lgr`, 2026-07-15)

**Resolved in favour of (a): `ledger` gets its own focused repository** — a substrate peer to
`diarie`, not a module inside `vp-knowledge`. The reasoning below is preserved as the rationale, not
as an open question.

The deciding frame: `diarie` extracted the *tracker* substrate into its own focused repo (a tool + a
store + a skill); `ledger` extracts the *relationships* substrate the same way (the `ledger` skill +
the `.ledger/` store + optionally, later, a small reader). That makes "cross-project relationships" a
first-class concern with its own home rather than a corner of the knowledge plugin — and a focused repo
is exactly what cleanly *owns* the shared store and conventions that hold the operation-fractured
cluster together (see the fracture table below). It also settles the size tension against folding into
an already-16-skill `vp-knowledge`. The **build shape is a diarie-style CLI + skills combo, but
SKILLS FIRST, CLI SECOND** (`vp-beads-lgr`) — the *inverse* of diarie's order, because diarie's value
is a computation (`ready`) while the ledger's is workflow discipline; the CLI is extracted from proven
skill usage, not designed against guessed queries. One sub-decision stays deferred to the extraction:
**the name** — "ledger" is generic and near-certainly taken on npm, the same name-gate `diarie` dodged
with a distinctive word.

The consequence: **there is no residual `vp-beads` package at all** — the two residuals (`ledger`,
`vp-swarm`) each become their own focused thing.

### The reasoning (preserved)

**(a) Its own package (topic-coherence). — CHOSEN.** *"Relationships between projects and their upstreams"* is a
distinct, nameable topic with a **sharp trigger** — the same property that makes `vp-git` and
`vp-astgrep` clean. The four skills already form a coherent cluster by subject (`UPSTREAM-*.md` +
`SYNERGY-*.md` + the registries), and a standalone package keeps that cluster *one unit* with one
trigger surface.

**(b) Fold into `vp-knowledge` (substrate-purity).** `upstream-tracker` is the **same shape** as
`vp-knowledge`'s `package-intel`: *capture facts about an external entity into the Basic Memory
graph.* `upstream-tracker` workflow 6 (Promote) writes `## Upstream Friction` into the **very same
`npm/*` / `brew/*` entity notes** that `package-intel` creates (CLAUDE.md `### Basic Memory section
ownership`). On the substrate axis, upstream friction is a knowledge-graph concern wearing a sprint
costume — which is the whole thesis of this doc applied to one skill.

**The tension is size, and it is real.** `vp-knowledge` is already 16 skills + 4 agents; absorbing
the ledger (even as one merged skill) is a **weight** question, not a purity question — a plugin can
be substrate-pure and still too heavy to reason about.

**And the cluster is coherent by TOPIC but fractures by OPERATION** — this is the sharpest thing
against a clean answer:

| Skill (mode)     | Topic     | Operation                                    | Substrate pull        |
| ---------------- | --------- | -------------------------------------------- | --------------------- |
| `upstream-tracker` | relationships | capture facts → knowledge graph          | **Basic Memory**      |
| `synergy-tracker`  | relationships | capture facts → knowledge graph          | **Basic Memory**      |
| `vendor-sync`      | relationships | git subtree mechanics                    | **git** (↔ `vp-git`)  |
| `sibling-sync`     | relationships | cross-repo reconciliation                | **constellation infra** |

Package **by topic** and it stays one unit (favours (a), or a single folded module in (b)). Package
**by substrate/operation** and it **scatters** — the trackers to `vp-knowledge`, `vendor-sync` toward
`vp-git`, `sibling-sync` to some constellation-infra home that does not yet exist. The `ledger`-skill
companion doc has to resolve this before its home can be chosen; it is the reason the home is *the*
open decision and not a footnote.

## Three repackaging studies (the alternatives considered)

The dissolution above is **Study A** taken to its conclusion. Two others were on the table; recording
them keeps the chosen path honest about what it trades away.

- **Study A — Purify (send each skill home to its substrate).** *The recommended / structural one.*
  Buys: every resulting package is substrate-coherent with a sharp trigger; `vp-beads` stops being a
  category error; extraction seams (`git subtree split`) fall on real boundaries. Costs: it is the
  most *moves* (four destinations); it surfaces the ledger-home decision rather than dodging it; and
  it requires `vp-knowledge` to absorb weight (or a new package to exist).

- **Study B — Merge (collapse duplicates into canonical mode-switching skills).** Keep `vp-beads`,
  but fold its overlapping skills into a few fat mode-switch skills (the `ledger` merge, generalized
  to the whole plugin). Buys: **fewest parts**; least disruption to the marketplace; no cross-plugin
  negotiation. Costs: **fatter skills with broad triggers** — the opposite of the sharp-trigger
  property that makes the siblings clean; and it preserves the process axis, so the category error
  survives, just with fewer files.

- **Study C — Split by runtime (mechanism, not domain).** Cleave on *how a component is delivered*:
  pure `SKILL.md` skills → the runtime-neutral skills.sh route; agent- and hook-backed components →
  a Claude plugin. Buys: aligns with the real distribution constraint (below); mirrors how `vp-git`
  already ships (*"as a Claude Code plugin or via … skills.sh"*). Costs: it splits by **mechanism,
  not domain** — `retrospective` (BM) and `swarm-wave` (substrate-agnostic orchestration) could land
  in the same runtime bucket despite sharing nothing, so it does not fix the organizing-axis problem,
  it re-cuts it on an axis orthogonal to meaning.

A and C are not exclusive: A decides *which package* a component joins; C constrains *what form* each
resulting package must take. The distribution note is what couples them.

## Distribution note — what forces a Claude plugin

A hard platform constraint shapes the possible package shapes:

- **Agents and hooks travel ONLY in Claude plugins.** Anything with an agent or a hook *must* be a
  Claude Code plugin.
- **Pure `SKILL.md` skills have two routes:** the **runtime-neutral skills.sh** bundle (the
  basic-memory-skills / `vp-git` model — *"Installable as a Claude Code plugin or via the cross-agent
  Agent Skills standard (skills.sh)"*, per its marketplace entry) **or** a Claude plugin (the
  ast-grep/claude-skill model that `vp-beads-ski` OPEN FORK (b) cites).

This is *why* retiring `sprint-review` matters beyond usage (per `vp-beads-dep`): it removes the only
agent, so the surviving components are hooks (which split by substrate) plus pure skills (which are
free to go runtime-neutral). `vp-beads-ski` **OPEN FORK (b)** leans neutral for the diarie skill —
*"basic-memory-style .claude/skills/, NO .mcp.json — diarie has no MCP server; the agent shells out
to the binary, the ast-grep model … diarie is open/published and should NOT route through
voxpelli-personal vp-plugins infra."* The same logic applies to `ledger` if it becomes standalone:
it is pure-skill, so it *can* be runtime-neutral — the choice is deliberate and **not cheaply
reversible** (it is a public install-API commitment), which is exactly how `vp-beads-ski` frames it.

## Design invariant: cross-project awareness is a substrate property

Splitting the skills across focused repos makes one thing a first-class contract that was implicit
while everything lived in one plugin: **a skill's cross-project awareness is inherited from its
substrate, and it must behave accordingly.** The substrate axis that organizes the packages also
tells each skill how far its reach is:

- **Local substrates — per-repo.** `diarie` (the store *is* the repo) and `git` are single-project. A
  skill operating here is aware of *this* repo only, and must not reach across repos. This is
  deliberate: it is what keeps `diarie` a clean, publishable tracker that knows nothing about
  siblings.
- **Cross-project substrates — constellation-shared.** The Basic-Memory graph, Raindrop, and the
  **`ledger`** are shared across every repo in the constellation. A skill that reads or writes here is
  cross-project **by default**, and owes four things:
  1. **Generalize what it writes.** No repo-local paths, table names, or project-specific detail in a
     shared store — the Basic-Memory note-quality rule (*"notes must be generalizable engineering
     knowledge — no project-specific file paths"*, CLAUDE.md `## Basic Memory`) is one instance of
     this invariant, not a BM-only quirk.
  2. **Discover siblings, don't assume one repo.** Sibling projects are declared in
     `.claude/synergy-registry.json` / `.claude/vendor-registry.json` (+ their `.local.json`
     overrides); a cross-project skill resolves them rather than hard-coding a single project.
  3. **Respect the privacy boundary.** A private relationship (`PRIVATE-SYNERGY-*`, a private sibling
     registered only in `.local.json`) must never leak into a committed or promoted shared surface.
     Cross-project reach and privacy are the same concern seen from two sides.
  4. **Know its writes are read elsewhere.** State promoted to the graph or the `ledger` is
     constellation-visible; a skill must write as if a *different* project will read it next, because
     one will.

The **`ledger` is the purest embodiment** — its entire subject is the relationships *between* repos —
which is another argument for its own focused repo (`vp-beads-lgr`): a package whose whole job is
cross-project awareness should not be a guest inside a single-substrate plugin. And the **corollary is
the boundary that keeps `diarie` clean**: cross-project state lives in the `ledger` and the graph,
**never in the tracker**. The tracker stays local; the ledger and the graph carry the constellation.

## Usage evidence (grounds the retirements and marks the load-bearing skills)

Measured from disk and git history in this repo, 2026-07-15:

| Component                         | Artifact trace                                                     | Read as        |
| --------------------------------- | ----------------------------------------------------------------- | -------------- |
| `upstream-tracker` + `synergy-tracker` | 5 `UPSTREAM-*.md` + 2 `SYNERGY-*.md`, across **23** + **11** commits | **workhorse**  |
| `retrospective`                   | **16** `RETRO-*.md` on disk                                        | heavily used   |
| `swarm-wave`                      | **10** `SWARM-*.md` on disk                                        | used           |
| `backlog-groomer`                 | no artifact trace                                                  | barely used    |
| `sprint-review` (agent)           | no artifact trace; operator confirms **never** fired              | unused         |

The five `UPSTREAM-*.md` are real and specific — `basic-memory`, `brew--beads`, `claude-code`,
`voxpelli--typed-utils`, `vp-knowledge` — and the two `SYNERGY-*.md` are `vp-git` and `vp-knowledge`.
The asymmetry is the whole argument of `vp-beads-dep`: the **relationship-ledger** work is the
load-bearing part of the plugin (which is why it survives, as `ledger`), and the two components with
**zero trace** are the ones retired. The heavily-used-but-re-homing pair (`retrospective`,
`swarm-wave`) is not retired — it *moves*, because its output belongs to another substrate, not
because it is unused.

## What is NOT decided — open seams and honest costs

- **The `ledger` home** — ~~its own package vs fold into `vp-knowledge`~~ **DECIDED (`vp-beads-lgr`,
  2026-07-15): its own focused repository**, a substrate peer to `diarie`; build shape is a
  **CLI + skills combo, skills-first**. What remains open is *downstream*: **the name** — `"ledger"`
  is a working name only; the real repo/tool name is undecided (generic + likely npm-taken, the
  diarie name-gate again).
- **`vendor-sync` toward `vp-git`.** If `ledger` scatters by operation, `vendor-sync` (git-subtree
  mechanics) is a closer fit to `vp-git` than to a relationships package. Whether it moves there, or
  stays a `ledger` mode, or becomes a `vp-git` skill that `ledger` *calls*, is unlit. It also touches
  the same substrate `vp-git` owns — a genuine two-plugin boundary, not a clean cut.
- **`sibling-sync`'s home has no obvious owner.** Cross-repo reconciliation is "constellation infra",
  a substrate no current package owns. It could force a new tiny package, or wedge into `ledger`, or
  stay unmoved — all three are live.
- **The `diarie`-side skill (`vp-beads-ski`) is gated on diarie shipping**, which is gated on the name
  (`MEMORY.md`: *"`diarie.dev` is BOUGHT; `npm view diarie` is still 404"*). Migrate/deintegrate and
  the usage skill cannot actually land in diarie until diarie is a published thing — so parts of this
  repackaging are **downstream of an unpushed, pre-1.0, name-gated CLI** and cannot be executed early
  without pinning a moving command surface. `vp-beads-ski` cut a full plan *to a task row* for exactly
  this reason.
- **The two companion docs do not exist yet.** `DESIGN-ledger-skill.md` and
  `DESIGN-tracking-surfaces.md` are load-bearing for the ledger-home decision and the file-type
  dissolutions respectively. Until written, those two areas are *sketched here, decided there*.
- **The rename is real work, not a footnote.** `vp-beads` → (new name) touches the marketplace entry
  (`../vp-claude/.claude-plugin/marketplace.json`), the repo name (`voxpelli/claude-beads`), the two
  siblings' `SYNERGY-vp-beads.md` back-pointers (present in `../vp-git/`), and every `vp-beads-*` id
  reference in prose. The id *prefix* is just this repo's namespace and need not change; the *plugin
  name* must. Per global CLAUDE.md's rename discipline, a `grep -rni` sweep is plan **input** here,
  not validation-after.

**Cost owned honestly:** dissolution is *more* coordination than a rename, not less. It negotiates
across three other repos (`vp-knowledge`, `vp-git`, and diarie's future home), it demands two docs
that do not exist, and it puts weight onto `vp-knowledge` that a size-conscious maintainer may not
want. The case for doing it anyway is not effort — it is that the alternative (Study B) keeps a
category error alive with fewer files, and the constellation's value is that *each package means one
thing*. `vp-beads` is the one that does not; the cheapest lasting fix is to stop it existing.
