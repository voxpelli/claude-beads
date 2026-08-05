---
id: vp-beads-cst
title: The constellation topology — vp-skills workspace-monorepo + vp-knowledge + diarie (two repos, not many)
status: pending
type: decision
priority: high
updated: '2026-07-18'
---

## Decision

vp-beads dissolves into a **two-repo constellation** (plus `diarie`, already extracted):

* **`voxpelli/vp-skills`** — this repo (`claude-beads`) renamed. An **npm-workspaces monorepo** whose
  root owns **only shared lint + dev-tooling** and delegates each plugin's own gates via
  `npm run <script> --workspaces --if-present`. Each plugin (`plugins/<name>/`) is a **self-contained
  workspace** — own `package.json`, own version, own gates that travel with it, **zero references to
  sibling plugins**. Plugins: `ledger` (upstream+synergy+vendor+sibling merged), `swarm-wave`,
  `diarie-adopt` (migrate-tracker+deintegrate-beads), plus **`vp-git` + `vp-astgrep` brought in** from
  their retiring repos. Ships a `vp-skills` marketplace listing its plugins + cross-sourcing
  `vp-knowledge`.
* **`voxpelli/vp-knowledge`** — `vp-claude` renamed; its **own** repo + marketplace; absorbs
  `retrospective` into `session-reflect`.
* **`voxpelli/diarie`** — the tracker CLI, its own track.
* **Retired (archived, not deleted — archive preserves the GitHub 301):** `claude-git`,
  `claude-astgrep`. `sprint-review` agent + `backlog-groomer` skill retired (`vp-beads-dep`).

The staged runbook lives in the approved plan (`~/.claude/plans/eager-jingling-scone.md`) and its two
handoff files (`handoffs/HANDOFF-vp-knowledge.md`, `handoffs/HANDOFF-diarie-publish.md`).

## Rationale

**vp-skills is a dev-time MAINTENANCE monorepo, not a DISTRIBUTION coupling — that is what keeps it
aligned with the constellation goal.** The goal is composable, lock-in-resistant, substrate-aligned
bricks the operator can steward solo. The coupling here is confined to _maintenance_ (shared
lint/tooling, one place to work); _distribution stays decoupled_ — independent plugins, independent
versions, independently installable, zero cross-plugin references. The consumer-facing **exit property
is preserved**: adopt `ledger` without `swarm`. So this is a maintenance-vs-distribution separation,
not the grab-bag the dissolution exists to kill (Comnes's objection — the operator's own saved reading
— is to _publishing_ coupling + cross-boundary linking, neither present here).

**The forcing reasons:** zero external users + solo bus-factor (the voxpelli Doctrine's "sharpest
unresolved tension") outweigh maximal substrate-purity. Fewer repos to steward beats one-repo-per-
substrate when there is a single maintainer and no external consumers to serve an exit.

## Alternatives Considered

* **Many focused repos (the prior `vp-beads-lgr` verdict + the DESIGN docs).** ledger → own repo,
  swarm → standalone `vp-swarm`, vp-git/vp-astgrep stay separate. Maximal substrate-purity; **rejected**
  for the solo bus-factor cost with zero external users. This decision **supersedes `vp-beads-lgr`'s
  own-repo verdict** (see Affects).
* **Umbrella marketplace over decoupled plugins in separate repos.** A middle path (one marketplace
  index, many repos). Rejected: still N repos to steward; the operator chose one repo.
* **Coupled monorepo with cross-plugin sharing + one release.** Rejected: cross-plugin `../shared/`
  breaks on install (cache-copy), and it would be the distributed-monolith Comnes warns against. The
  chosen model shares _only tooling_, never plugin content.

## Affects

* **Supersedes `vp-beads-lgr`'s central verdict** — ledger is its own **plugin** in the vp-skills
  monorepo, **not its own repo**. `vp-beads-lgr`'s surviving guidance (skills-first build shape, the
  pure-functions-over-`.ledger/` hint, the CLI-later trigger, the working-name caveat) **carries
  forward** and governs the ledger merge; only the _location_ flips. `vp-beads-lgr` is annotated, not
  closed.
* **Overrides `DESIGN-constellation-repackaging.md` §4 and `vp-beads-ski`** on the bd-adoption pair:
  `migrate-tracker` + `deintegrate-beads` go to **vp-skills** (`diarie-adopt`), not with diarie —
  decoupling them from diarie's publish timeline. Trade: `diarie-adopt` then has a cross-repo `bd-map`
  dependency (traced in `handoffs/HANDOFF-diarie-publish.md`).
* **Specifies `vp-beads-dep`'s execution trigger** — its retirements execute during this repackaging's
  Phase 1; its dangling-edge decisions (research-wave post-`backlog-groomer`; `sprint-review` refs) are
  resolved in the plan's Phase 1.
* **The honest sharp edge, recorded not hidden:** `vp-git` + `vp-astgrep` are the **least
  substrate-aligned members** (they share nothing with sprint/ledger/tracker; consolidated purely for
  bus-factor). **Revival trigger:** if the project gains external users, or a plugin outgrows the
  shared repo, split it back out — the decoupled structure makes that cheap.
* **Portability stays a cheap default** (not abandoned): decoupled plugins keep per-plugin skills.sh/Pi
  portability achievable; `check:portability` + `check:pi-load` adopted as shared tooling. `claude-only`
  only where the payload needs plugin-runtime (`swarm-wave` Task fan-out, `vp-astgrep` LSP shim).
