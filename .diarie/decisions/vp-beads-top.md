---
id: vp-beads-top
title: Topology — freeze claude-beads main, this branch becomes voxpelli/vp-skills
status: completed
type: decision
priority: high
updated: '2026-08-05'
---

## Decision

**`voxpelli/claude-beads` `main` is FROZEN at `119543a` (v0.18.0). This branch becomes a new
repository, `voxpelli/vp-skills`. Draft PR #16 is abandoned.**

There is no bridge release. Existing v0.18.0 installs do not upgrade in place; they migrate
through the `vp-plugins` marketplace.

## Why this was decided now rather than later

It stopped being deferrable. `vp-beads-rrp` turns the root manifest into a marketplace, and its
first acceptance criterion is _"NO self-entry — there is no root plugin left"_. A bridge release
requires the exact opposite: the single root `vp-beads` plugin surviving and gaining a parent-form
`skills` array so an existing user's `/plugin update` upgrades them with no action. One deletes the
root plugin; the other depends on it existing and growing a field.

That conflict was invisible until `vp-beads-sss` landed and the root stopped shipping hooks — at
which point the root plugin's only remaining content was `/retrospective`, and the question
"should it exist at all" became answerable.

## What the choice rests on

Measured, not assumed:

* **PR #16 has 1 comment (a bot) and 0 reviews.** Nothing is lost by abandoning it.
* **0 GitHub Releases exist**, though 26 tags are pushable. The in-place-upgrade path the bridge
  release would have preserved has no demonstrated population on it.
* **A rename leaves stale self-references.** `ast-grep/agent-skill` is live proof — it still
  declares `repository: ast-grep/claude-skill` in both its manifests after its own rename. A new
  repo starts correct instead of decaying from correct.
* `main` additionally carries 6 open Dependabot alerts (1 critical, 4 high) against the v0.18.0
  dependency tree. A freeze leaves them on an archived tag rather than merging into them.

## What follows, and what must NOT be inferred

* **`rrp` proceeds exactly as written.** The marketplace topology is the target, not a compromise.
* **Migration runs through `vp-plugins`, never a vp-skills marketplace.** A `renames` target must
  name a plugin listed in _that same marketplace's_ `plugins` array — validator-enforced. A
  vp-skills marketplace is **discovery**; only `vp-plugins` can perform the migration.
* **`renames: {"vp-beads": null}` is the documented tombstone** — it reports removal rather than
  `plugin-not-found`. Append-only, and it needs Claude Code ≥ 2.1.193; below that there is no
  mechanism at all.
* **Leave the `vp-plugins` entry for `claude-beads` UNPINNED.** Under a freeze `main` never moves,
  so pinning buys nothing and seals a door.
* **This decision does NOT authorise creating the repository.** Creating a GitHub repo is an
  outward-facing act under the user's identity and needs its own explicit, in-the-moment approval,
  exactly like opening a PR. The same applies to closing PR #16.

## The blocker this activates

`plugins/vp-dream/skills/vp-dream/references/native-autodream-contract.md` reconstructs Claude
Code's native `autoDream` behaviour. It has only ever existed in an unpublished branch. **Pushing
it to a NEW PUBLIC repository is a fresh act of publication**, which the bridge-release path would
not have been to the same degree. The IP / ToS / reverse-engineering question on that file was
recorded only inside the description of the already-**completed** `vp-beads-vpd`, where nothing
would ever surface it again; it now has its own open row. **Resolve it before any push to a new
remote.**

Supersedes nothing. Governed by `vp-beads-cst`, which set the two-repo target; this answers which
repo this half becomes.
