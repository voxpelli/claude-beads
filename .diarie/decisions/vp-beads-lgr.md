---
id: vp-beads-lgr
title: The `ledger` gets its own focused repository (a substrate peer to diarie)
status: pending
type: decision
priority: medium
updated: '2026-07-18'
---

> **⚠️ SUPERSEDED IN PART by `vp-beads-cst` (2026-07-18).** The **own-repo verdict below is
> reversed**: `ledger` is now a **plugin in the `vp-skills` workspace-monorepo**, not its own repo
> (zero external users + solo bus-factor outweighed substrate-purity — see `vp-beads-cst`). Everything
> else here **remains in force and governs the ledger merge**: the four-tracker composition,
> skills-first build shape, the pure-functions-over-`.ledger/` hint, the CLI-later trigger, and the
> working-name caveat. Read "own focused repository" as "own focused **plugin**".

## Decision

The unified **`ledger`** — the one multi-mode skill merging `upstream-tracker` + `synergy-tracker` +
`vendor-sync` + `sibling-sync`, plus its `.ledger/` store — gets **its own focused repository**, a
substrate peer to `diarie`. It does **not** fold into `vp-knowledge`, and it is **not** a residual
`vp-beads` module.

This resolves the one open question the repackaging left (`DESIGN-constellation-repackaging.md`,
`DESIGN-ledger-skill.md`): the topic-vs-substrate tension is decided **in topic's favour**.

**`"ledger"` is a working/concept name only.** The actual repo/tool name is an **undecided
sub-decision** — "ledger" is generic and near-certainly npm-taken, the same name-gate `diarie` dodged
with a distinctive word. Do not treat "ledger" as committed.

## Rationale

- **It mirrors `diarie` exactly.** `diarie` extracted the *tracker* substrate into a focused repo (a
  tool + a store + a skill). `ledger` extracts the *relationships* substrate the same way (the skill +
  the `.ledger/` store + optionally, later, a small reader). The precedent is set and clean.
- **A focused repo is what OWNS the shared core.** The cluster is coherent by *topic* (relationships)
  but fractures by *operation* (the trackers are capture → knowledge; `vendor-sync` is git-mechanics;
  `sibling-sync` is cross-repo reconciliation). What holds it together is the shared store + the shared
  conventions (file naming, the two registries, the Basic-Memory section-ownership map, staleness
  thresholds) — and a focused repo is exactly the thing that owns those cleanly. Folding into
  `vp-knowledge` would scatter the operations and bury a distinct concern.
- **Size.** `vp-knowledge` is already ~16 skills + 4 agents; absorbing the ledger (even as one merged
  skill) is a weight it does not need.
- **First-class concern.** "Cross-project relationships" earns a home of its own rather than a corner
  of the knowledge plugin — a peer to the tracker, the knowledge graph, and git.

## Alternatives Considered

- **Fold into `vp-knowledge` (substrate-purity).** `upstream-tracker` is the same *shape* as
  `package-intel` (capture external-entity facts into the graph). Rejected: it scatters the
  operation-fractured cluster, buries a distinct topic, and bloats an already-large plugin.
- **Keep in `vp-beads`.** Moot — `vp-beads` dissolves; there is no residual sprint plugin.

## Affects

- **Completes the dissolution:** with `ledger` in its own repo and `vp-swarm` standalone, **there is
  no residual `vp-beads` package at all.** The constellation becomes: `diarie` (tracker + adoption),
  the ledger repo (relationships), `vp-swarm` (orchestration), `vp-knowledge` (absorbs
  `retrospective`), `vp-git`.
- **The build shape: a diarie-style CLI + skills combo, but SKILLS FIRST, CLI SECOND.** This is the
  *inverse* of diarie's order, for a principled reason: diarie was CLI-first because its value IS a
  computation (`ready`); the ledger's value is workflow discipline (capture/resolve/promote friction),
  so the skill ships first and the CLI is *extracted from proven usage* (which de-risks the CLI's
  read-side API — don't design it against guessed queries). Design hint: write the skill's
  read-computations (`review`, staleness, `reconcile` diff) as pure functions over `.ledger/`, so they
  lift into a later CLI's `doTheWork` (diarie's four-part shape). CLI trigger: those computations
  stabilise, or volume outgrows inline work. Detail in `DESIGN-ledger-skill.md`.
- **One deferred sub-decision: the name** (undecided — see above), downstream of the extraction.
- **Timing:** downstream of the diarie extraction; recorded now to resolve the open question so nobody
  re-litigates the home or quietly folds the ledger into `vp-knowledge`.
- Updates the resolved open-question sections in `DESIGN-constellation-repackaging.md` and
  `DESIGN-ledger-skill.md`.
