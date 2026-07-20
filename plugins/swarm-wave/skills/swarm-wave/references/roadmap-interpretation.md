# ROADMAP Interpretation

How swarm-wave reads a `ROADMAP.md` as a work source when the tracker is
unavailable (workflow 1 (Plan a swarm sprint), the "No tracker, `ROADMAP.md`
present" branch).

**The contract is adaptive, never prescriptive.** swarm-wave reads the ROADMAP
in *its own* idiom and vocabulary. It never reformats the file, never imposes a
canonical structure, and declines cleanly when the file is not a parallelizable
work plan. A ROADMAP is the project's earned wisdom about its own work; the
burden of proof is on the interpreter to show a wave is real and active, not on
the file to conform.

Grounded in a survey of real-world files: one repo with wave-structured ROADMAP
(HIGH — explicit `Wave N` sections), one with self-declared status vocabulary
(MEDIUM — active wave with prose scope), one feature-triage matrix (decline →
manual path), and one chore-list TODO (decline → manual path).

## Step 1 — Classify the shape first

Before extracting any work item, classify the document. Only a **wave-structured**
plan is a swarm candidate.

| Shape                  | Signals                                                                                      | Action                                                          |
| ---------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Wave-structured        | Headings matching `Wave\s+\d` (any of `##`/`###`, separators `—` `·` `:`), per-item bullets  | Candidate — proceed to step 2                                   |
| Milestone/release-plan | `## vN` / `## Pre-X polish` describing releases, prose contract, no per-item parallel work   | Direction only; swarm only the `Wave N` subsections it contains |
| Feature-triage matrix  | Feature/priority tables ("Needed", "Nice to Have", "Unnecessary") of flags/capabilities      | **Decline** → manual path                                       |
| Chore list             | Flat task bullets under topic headings; often titled `TODO`; may redirect "roadmap → VISION" | **Decline** → manual path                                       |
| Unrecognized           | None of the above match cleanly                                                              | **Needs user disambiguation** — ask                             |

A milestone plan may *contain* wave subsections (Repo A's `### Wave N` live
under `## v1.x — hardening`): the waves are the swarmable units, the milestone
headings are not. Declining is a first-class, expected outcome — two of the four
surveyed files decline. When declining, say which shape was detected and route
to the manual path.

## Step 2 — Completion detection (multi-shape)

A wave or item that is already done must be excluded. Recognize *any* of these
"done" signals — read each in the file's own vocabulary:

- **Heading-suffix status**: `(NEXT)`, `(DONE)`, `(concluded)`, `(shipped)`,
  `(in progress)` — read literally.
- **Italic status line after a heading**: `*Concluded YYYY-MM-DD …*`,
  `*Shipped …*`, `*Done …*`.
- **Status word in the heading**: `## v0 — closed`, `## … — concluded`.
- **Per-item marker**: a `DONE` / `Concluded` / `Shipped (…)` bullet, an inline
  `*(Concluded …)*`, or an explicit `**Open**` / `**Done**` prefix.

**Default rule:** a wave with a recognized *done* marker is excluded; a wave with
a recognized *active* marker (`(NEXT)`, no done-marker) is included; a wave whose
status string is **unrecognized** defaults to **needs user disambiguation** —
never assume it is active. (Repo A's seven waves all carry `*Concluded …*` →
all excluded → report "no active swarmable waves" and do **not** re-propose
shipped work.)

## Step 3 — Exclude PARKED / DROPPED / deferred — recursively and prose-aware

- Exclude any heading or item marked `PARKED`, `DROPPED`, `DEFERRED`, plus
  sections like `## Open decisions`, `## Deferred, with revival triggers`, and
  `## Tail (… not waved)`.
- **Recursive**: everything nested under an excluded heading is excluded.
- **Prose-aware**: an inline sentence can exclude an item — "deliberately
  **not** adopted", "was dropped", "weighed and rejected".
- **Never harvest file paths from excluded sections.** Backtick paths inside a
  DROPPED/PARKED item (e.g. `lib/core/embed/` in a rejected proposal) must not
  become an agent's file scope.

## Step 4 — Resolve file scopes per wave

swarm-wave's safety model requires an exhaustive, disjoint file scope per agent.
For each included wave, resolve scopes in this precedence:

1. **Declared in prose** — "Touches `a.js`, `b.js`", "Entirely within `dir/`",
   a trailing `(path/file.js)` on a bullet. Use it directly (Repo A declares
   scopes this way).
2. **Inferred** — run workflow 4 (Map file contention) grep/Glob over the entity
   names (functions, files, modules) named in the item text.
3. **Neither** — decline that wave or ask the user for its scope. Do not guess a
   scope you cannot ground.

## Step 5 — VISION.md is never a work source

`VISION.md` carries direction and voice, not a backlog. Never extract work items
from it (Repo D's `TODO.md` even redirects "Roadmap items live in `VISION.md`" —
that is direction, not swarmable work). Read it only for theme/voice when naming
waves.

## Step 6 — Per-wave provenance confirmation

Before any wave executes, present each proposed wave for confirmation showing:

- the **source heading** and its line range,
- the **items included**,
- **what was excluded and why** (concluded / PARKED / DROPPED / no resolvable
  scope),
- the **resolved file scopes** and how each was obtained (declared vs
  grep-inferred).

Then follow the normal workflow 1 (Plan a swarm sprint) clustering and approval
gate. Priority and dependency cues are read in the file's own idiom — wave order
as written, "depends on …", "sequenced after …". Task creation stays
tracker-only (swarm-wave never writes a ROADMAP); run-state for a tracker-less
wave lives in the `SWARM-NN.md` Item Status table (see `command-patterns.md`
"Tracker-less run-state equivalents").

## Validation against the surveyed idioms

- **Repo A** (`ROADMAP.md`) — wave-structured; all seven `### Wave N` carry an
  `*Concluded …*` line → all excluded → report no active swarmable waves; never
  re-propose shipped work.
- **Repo B** (`ROADMAP.md`) — wave-structured; `## Wave 1 · … (NEXT)` is
  active; scopes partly declared, rest grep-inferred; exclude `Open decisions`,
  PARKED, DROPPED; propose Wave 1 with provenance.
- **Repo C** (`ROADMAP.md`) — feature-triage matrix → decline → manual
  path.
- **Repo D** (`TODO.md`) — chore list → decline → manual path.
