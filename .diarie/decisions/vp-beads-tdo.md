---
id: vp-beads-tdo
title: diarie and Claude Code's built-in task tracker COMPLEMENT each other — lift the inherited ban
status: pending
type: decision
priority: medium
updated: '2026-07-11'
---

## Decision

**The built-in Claude Code task tracker is not banned.** It and `diarie` occupy different time
horizons and are used together:

| | `diarie` | the built-in tracker |
| --- | --- | --- |
| lifespan | durable — the store **is** the repo, committed to git | ephemeral — dies with the session, correctly |
| answers | "what is the state of this project's work?" | "what am I doing right now, in this turn?" |
| audience | you, future sessions, a PR reviewer | you, live, watching progress |
| carries | dependencies, types, acceptance criteria, an integrity gate | the ordered steps of one claimed thing |

**One boundary rule, and it is the whole decision:**

> **An ephemeral todo may never be the only home of a commitment.** If it must outlive the
> session, it is a `diarie` row. The todo list is a *projection of one claimed row's execution*
> — never a second backlog.

The natural shape: `diarie ready` → claim a row (`status: in_progress`) → expand it into
session todos → work → close the row. The todos evaporate; the row is the record.

## Rationale

**The ban was ours, and that is worse than if it had been bd's.** What the history actually
shows (measured, not assumed):

```
bd-era CLAUDE.md          "Do NOT use markdown TODOs or task lists."
Wave 1 (a02bcf7) rewrote  "Do NOT use markdown TODOs, ad-hoc task lists, or `bd`"
```

The clause **predates the migration**, and the cutover commit — whose stated job was to retarget
the operating instructions *off* bd — carried it forward and **broadened** it. An earlier draft
of this decision claimed it was "beads' own colonization language, inherited intact." **That is
unproven and probably false**: `git log -S 'BEADS INTEGRATION'` finds no managed block ever
written to this `CLAUDE.md`, and the repo's own notes record that `bd setup claude` installed
nothing here. Nobody colonized us. **We absorbed a bd-shaped convention on our own and never
re-examined it** — and then a commit explicitly about *removing* bd's influence renewed it
without noticing, which is exactly how an inherited assumption survives the thing it came from.

A plugin whose `/deintegrate-beads` skill exists to take one tool's hands off the wheel has no
business keeping its own there.

**It contradicts two of this project's stated tenets.**

- *Platform proximity* — "trust the platform, distrust layers on top". The built-in tracker
  **is** the platform. Banning it to privilege our own layer inverts the tenet exactly.
- *Substrate-not-opinion* — we do not force `diarie` on projects that track work elsewhere
  (the whole `### Files-availability convention`). Forcing it on *agents*, against a native
  affordance, is the same imposition wearing different clothes.

**The hazard the ban gropes at is real; the ban is the wrong instrument.** The danger is an
agent parking a *commitment* in the ephemeral list, where it evaporates at session end and
nobody learns it existed. That is a **boundary** problem. The boundary rule above prevents it
precisely; a blanket ban prevents it by also destroying a useful, orthogonal tool.

**Evidence, from the session that produced this decision (2026-07-11, `vp-beads-tst`).** The
harness prompted the agent eight times to use the built-in tracker. It declined every time,
because `CLAUDE.md` said to. The task ran ~10 distinct steps — four suite conversions, a
synthetic fixture, five config edits, a doc sweep, a mutation proof — and the human had **no
live view of where it was**. The ban cost visibility and bought nothing: the durable record was
in `.diarie/tasks/` the entire time, doing its job. A rule that fails on its own terms, observed
directly, is not a rule worth keeping.

## Alternatives Considered

- **Keep the blanket ban (beads' behaviour).** Declined. Single-substrate purity is not a
  benefit here; it is the vendor reflex the migration was fleeing. The one legitimate worry it
  encodes (commitments dying with the session) is fully covered by the boundary rule, at a
  fraction of the cost.
- **Ban nothing, say nothing.** Declined. Silence is what lets an agent drift into using the
  ephemeral list *as* a backlog — the one failure mode that actually matters. The seam has to be
  written down, or it is not a seam.
- **Mirror todos into `.diarie/` automatically.** Declined, and it is worth naming why: it would
  make every incidental step of an agent's reasoning a committed artifact, which is neither
  durable knowledge nor reviewable work. It also re-imports a CRUD/sync layer that
  substrate-not-opinion exists to refuse. The two horizons stay separate on purpose.

## Affects

- `CLAUDE.md` `### Issue tracking` — the ban is replaced by the seam.
- Agents working on this repo: `diarie ready` remains the source of work; the built-in tracker
  is now the sanctioned way to show progress *within* a claimed row.
- Any project adopting `vp-beads`: the same seam applies, and it is the reason we do not ship
  a `CLAUDE.md` managed block. (See `/deintegrate-beads`, which removes exactly that.)
