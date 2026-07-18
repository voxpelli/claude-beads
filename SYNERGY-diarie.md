# SYNERGY-diarie

Tracking cross-project synergy with [diarie](https://github.com/voxpelli/diarie).

diarie is the flat-YAML tracker CLI extracted from this repo (2026-07-18, `git subtree split
--rejoin`). This project consumes it (its skills shell out to the `diarie` binary; `diarie/` is
carried as a vendored subtree snapshot until diarie publishes). Relationship: `dependency`.

## Shared Patterns

- **The `.diarie/` store contract** (2026-07-18) — the store schema, the `--root` / nearest-wins
  resolution, and the `ENOSTORE` "missing store is an error, not an empty backlog" contract are owned
  by diarie (`diarie/lib/schema.js`) and consumed by this project's skills. They must stay aligned:
  a skill that reads the store must speak diarie's current CLI + codes.
  Status: aligned · Last verified: 2026-07-18
- **THE WORKSPACE OWNS ITS GATES; THE ROOT DELEGATES** (2026-07-18) — the npm-workspace
  gate-delegation pattern diarie's extraction proved (`npm run check --workspaces --if-present`; a
  workspace's own gates travel the subtree split) is the same pattern the vp-skills monorepo
  generalises to N plugin-workspaces. Keep the delegation shape aligned across both repos.
  Status: aligned · Last verified: 2026-07-18

## Divergences

_No entries yet._

## Extraction Candidates

- **`diarie-adopt` co-location with diarie** (2026-07-18) — the bd→diarie adoption pair
  (migrate-tracker + deintegrate-beads) was routed to the vp-skills monorepo (`plugins/diarie-adopt`)
  to decouple it from diarie's publish timeline, overriding `DESIGN-constellation-repackaging.md` §4 /
  `vp-beads-ski` ("bd IS diarie's framing → ship with diarie"). If diarie publishes and wants to own
  its full adoption story, these could move to the diarie repo. Blocked on the cross-repo `bd-map`
  coupling (`diarie-adopt` needs `diarie/lib/migrate/bd-map.js` — see `handoffs/HANDOFF-diarie-publish.md`).
  Source: `plugins/diarie-adopt` (planned) · Readiness: needs-cleanup · Effort: moderate

## They Have / We Don't

_No entries yet._
