---
id: vp-beads-tdo
title: The ephemeral-todo ↔ diarie seam — lift the task-list ban; a todo is never the only home of a commitment
status: completed
type: decision
priority: medium
updated: '2026-07-22'
---

## Decision

**Claude Code's built-in task tracker (the ephemeral `TodoWrite` list) is NOT banned in this
repo — it complements `diarie`.** Lift the blanket "do not use the agent's own task list" ban
that this project's own bd-era `CLAUDE.md` carried, and replace it with a single constraint:

> **An ephemeral todo may never be the ONLY home of a commitment.** If it must outlive the
> session, it is a `diarie` row. The todo list is one claimed row's execution made visible —
> never a second backlog.

The two are **different time horizons, not rivals**: `diarie` is _durable_ (the store IS the
repo — it ships on `git push`); the built-in todo list is _ephemeral_ (it dies with the
session, by design). The working shape is therefore:
`diarie ready` → claim a row (`status: in_progress` + `agent:`) → expand it into built-in
todos → work → close the row (`status: completed`). The todo list makes one claimed row's
execution visible; it is not a place work is _stored_.

## Rationale

The ban was a **category error**. It conflated the thing that genuinely needs guarding —
durable commitment tracking, which a session-scoped list cannot provide — with the agent's
in-session scratchpad, which the ban actually forbade. The failure the ban groped at (a
commitment silently dying when the session ends) is prevented precisely by the "never the ONLY
home" rule, _without_ also forbidding the harmless, useful scratchpad.

This is the `substrate-not-opinion` tenet applied: name the invariant that must hold (every
commitment has a durable home) and enforce _that_, rather than banning a whole tool because one
misuse of it is dangerous. It also honours burden-of-proof — the ban asserted a harm ("todos
lose work") that the narrower rule already neutralises, so the broad prohibition earned no
keep.

## Alternatives Considered

* **Keep the blanket ban.** Rejected: it re-teaches the very anti-pattern a cutover is meant to
  end. A migration that retargets the _commands_ (`bd` → `diarie`) but leaves the ban in place
  renews the habit — **which is exactly what this project's own cutover commit did.** That
  self-inflicted repeat is why `migrate-tracker`'s second grep (for a task-list ban in the
  target's `CLAUDE.md`/`AGENTS.md`) exists at all.
* **No rule — let both float freely.** Rejected: without the "never the ONLY home" clause, a
  commitment captured only as a todo dies with the session and leaves no trace in the store.
  The constraint is the whole point; dropping it re-opens the gap the ban was clumsily trying
  to close.

## Execution

Codified **2026-07-11** in `6dd4795` (_"the ban on the agent's own task list was ours, and we
renewed it"_): the ban was removed from `CLAUDE.md` and the seam rule written into the
Issue-tracking section, tagged with this decision id. Formalised as this standalone record
**2026-07-22** (`vp-beads-tda`) — the id had been cited for weeks without a backing document.

Cited by: `CLAUDE.md` (`### Issue tracking (flat-YAML — post-bd)`), the `migrate-tracker` skill
(step 3 — offer the seam to bd-era projects that carry the ban), the `deintegrate-beads` skill
(de-colonisation step), and `MEMORY.md`.

## Affects

* **`migrate-tracker`** _offers_ this seam to a bd-era target project that still carries a
  task-list ban — it surfaces the matched lines and proposes the rule, but does **not** impose
  it. Whether to lift the ban is the target project's call.
* **`deintegrate-beads`** references the seam when de-colonising a migrated repo's `CLAUDE.md`.
* Within this repo, the built-in task tracker is now **expected** use (one claimed row's
  execution made visible), not a forbidden one — reversing the bd-era stance.
